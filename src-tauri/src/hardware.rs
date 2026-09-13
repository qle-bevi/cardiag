use crate::service::Service;
use cardiag_j2534::{
    process::Client,
    registry::{self, Interface},
    Command, PROFILE,
};
use diagnostic_core::{DiagnosticError as Error, Operation, SessionSnapshot};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum HardwareAction {
    Connect { interface_id: String },
    Read,
    Disconnect,
    Clear,
}

#[tauri::command]
pub(crate) async fn list_hardware_interfaces() -> Result<Vec<Interface>, Error> {
    tauri::async_runtime::spawn_blocking(|| {
        registry::discover()
            .into_iter()
            .map(|i| i.interface)
            .collect()
    })
    .await
    .map_err(|_| Error::ServiceUnavailable)
}
#[tauri::command]
pub(crate) async fn run_hardware_action(
    app: tauri::AppHandle,
    action: HardwareAction,
    generation: u64,
) -> Result<SessionSnapshot, Error> {
    tauri::async_runtime::spawn_blocking(move || execute(&app, action, generation))
        .await
        .map_err(|_| Error::ServiceUnavailable)?
}
fn execute(
    app: &tauri::AppHandle,
    action: HardwareAction,
    generation: u64,
) -> Result<SessionSnapshot, Error> {
    let state: State<'_, Mutex<Service>> = app.state();
    let (id, mut client, command) = {
        let mut service = state.lock().map_err(|_| Error::ServiceUnavailable)?;
        validate_action(&service, &action, generation)?;
        if matches!(action, HardwareAction::Disconnect) {
            service.interrupt();
            return Ok(service.snapshot());
        }
        if !cfg!(windows) {
            return Err(Error::HardwareUnavailable);
        }
        if service.pending.is_some() {
            return Err(Error::Busy);
        }
        let (client, command) = match action {
            HardwareAction::Connect { interface_id } => {
                if service.real.connected {
                    return Err(Error::InvalidState);
                }
                let installed = registry::discover()
                    .into_iter()
                    .find(|i| i.interface.id == interface_id)
                    .ok_or(Error::DriverUnavailable)?;
                let filename = format!("cardiag-j2534-{}.exe", installed.interface.architecture);
                let resource = app
                    .path()
                    .resource_dir()
                    .map_err(|_| Error::HelperUnavailable)?
                    .join(&filename);
                let sibling = std::env::current_exe()
                    .map_err(|_| Error::HelperUnavailable)?
                    .with_file_name(&filename);
                let helper = if sibling.is_file() { sibling } else { resource };
                let log = app.path().app_log_dir().ok().and_then(|dir| {
                    std::fs::create_dir_all(&dir)
                        .ok()
                        .map(|()| dir.join("j2534-session.log"))
                });
                let client = Client::spawn(&helper, &installed.path, log.as_deref())?;
                service.control = Some(client.control());
                service.real.hardware.as_mut().unwrap().interface = Some(installed.interface.name);
                service.real.operation = Some(Operation::Connect);
                (client, Command::Connect {})
            }
            HardwareAction::Read => {
                if !service.real.connected {
                    return Err(Error::NotConnected);
                }
                let client = service.client.take().ok_or(Error::NotConnected)?;
                service.real.operation = Some(Operation::Read);
                (client, Command::Read {})
            }
            _ => unreachable!(),
        };
        service.real.reading = None;
        service.real.error = None;
        let info = service.real.hardware.as_mut().unwrap();
        info.partial = false;
        info.issues.clear();
        (service.begin()?, client, command)
    };
    let connecting = matches!(command, Command::Connect {});
    let result = client.call(command);
    if connecting && result.is_err() {
        let _ = client.call_with_timeout(Command::Close {}, std::time::Duration::from_millis(500));
    }
    let mut service = state.lock().map_err(|_| Error::ServiceUnavailable)?;
    if !service.is_current(generation, id) {
        return Err(Error::StaleOperation);
    }
    service.pending = None;
    service.real.operation = None;
    match result {
        Ok(report) => {
            service.real.connected = true;
            let info = service.real.hardware.as_mut().unwrap();
            info.profile = Some(PROFILE.into());
            info.partial = !report.issues.is_empty();
            info.issues = report.issues;
            if !connecting {
                service.real.reading = Some(report.codes);
            }
            service.client = Some(client);
        }
        Err(error) => {
            // Invalid responses terminate the helper; reconnect before another request.
            if connecting || matches!(error, Error::ConnectionInterrupted | Error::InvalidResponse)
            {
                service.real.connected = false;
                service.real.hardware.as_mut().unwrap().profile = None;
                service.control = None;
            } else {
                service.client = Some(client);
            }
            service.real.error = Some(error);
        }
    }
    Ok(service.snapshot())
}

fn validate_action(
    service: &Service,
    action: &HardwareAction,
    generation: u64,
) -> Result<(), Error> {
    service.validate(generation)?;
    if matches!(action, HardwareAction::Clear) {
        return Err(Error::OperationUnsupported);
    }
    if service.demo.snapshot().demo {
        return Err(Error::InvalidState);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use diagnostic_core::{Action, DemoSession};
    #[test]
    fn hardware_clear_is_rejected_by_backend_even_when_connected() {
        let mut service = Service::new(DemoSession::default());
        service.real.connected = true;
        assert_eq!(
            validate_action(&service, &HardwareAction::Clear, 0),
            Err(Error::OperationUnsupported)
        );
    }
    #[test]
    fn demo_cannot_dispatch_hardware_reads() {
        let mut demo = DemoSession::default();
        demo.begin(Action::Activate, 0).unwrap();
        let service = Service::new(demo);
        assert_eq!(
            validate_action(&service, &HardwareAction::Read, service.generation),
            Err(Error::InvalidState)
        );
    }
}
