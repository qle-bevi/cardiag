mod hardware;
mod service;
mod startup;

use std::sync::Mutex;
#[cfg(debug_assertions)]
use std::time::Duration;

use diagnostic_core::{Action, DiagnosticError, SessionSnapshot};
use service::Service;

#[tauri::command]
fn get_demo_available() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
async fn get_session(app: tauri::AppHandle) -> Result<SessionSnapshot, DiagnosticError> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<Mutex<Service>>();
        let service = state
            .lock()
            .map_err(|_| DiagnosticError::ServiceUnavailable)?;
        Ok(service.snapshot())
    })
    .await
    .map_err(|_| DiagnosticError::ServiceUnavailable)?
}

#[cfg(debug_assertions)]
#[tauri::command]
async fn run_demo_action(
    app: tauri::AppHandle,
    action: Action,
    generation: u64,
) -> Result<SessionSnapshot, DiagnosticError> {
    // The bounded simulated wait runs on the blocking pool, never the UI thread.
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<Mutex<Service>>();
        let (ticket, expected_generation) = {
            let mut session = state
                .lock()
                .map_err(|_| DiagnosticError::ServiceUnavailable)?;
            session.validate(generation)?;
            if matches!(
                action,
                Action::Activate | Action::Deactivate | Action::Disconnect | Action::Reset
            ) {
                // Validate demo controls before interrupting any session.
                if matches!(action, Action::Activate) && session.demo.snapshot().demo {
                    return Err(DiagnosticError::InvalidState);
                }
                if !matches!(action, Action::Activate) && !session.demo.snapshot().demo {
                    return Err(DiagnosticError::HardwareUnavailable);
                }
                session.interrupt();
            }
            let demo_generation = session.demo.snapshot().generation;
            match session.demo.begin(action, demo_generation)? {
                Some(ticket) => (ticket, session.generation),
                None => return Ok(session.snapshot()),
            }
        };
        std::thread::sleep(Duration::from_millis(ticket.delay_ms()));
        let mut session = state
            .lock()
            .map_err(|_| DiagnosticError::ServiceUnavailable)?;
        session.validate(expected_generation)?;
        session.demo.finish(ticket)?;
        Ok(session.snapshot())
    })
    .await
    .map_err(|_| DiagnosticError::ServiceUnavailable)?
}

// No simulator operation can be dispatched in a release build, even via direct IPC.
#[cfg(not(debug_assertions))]
#[tauri::command]
async fn run_demo_action(
    action: Action,
    generation: u64,
) -> Result<SessionSnapshot, DiagnosticError> {
    let _ = (action, generation);
    Err(DiagnosticError::HardwareUnavailable)
}

#[cfg(all(test, not(debug_assertions)))]
mod release_tests {
    use super::*;

    #[test]
    fn every_demo_action_is_rejected() {
        assert!(!get_demo_available());
        for action in [
            Action::Activate,
            Action::Deactivate,
            Action::Connect,
            Action::Disconnect,
            Action::Read,
            Action::Clear { confirmed: true },
            Action::Reset,
            Action::ArmIncident { incident: None },
        ] {
            assert_eq!(
                tauri::async_runtime::block_on(run_demo_action(action, 0)),
                Err(DiagnosticError::HardwareUnavailable)
            );
        }
    }
}

pub fn run() {
    let session = startup::session(
        get_demo_available(),
        std::env::args_os().skip(1),
        std::env::var_os("CARDIAG_DEMO"),
    )
    .unwrap_or_else(|message| {
        eprintln!("Impossible de démarrer Cardiag : {message}");
        std::process::exit(2);
    });
    tauri::Builder::default()
        .manage(Mutex::new(Service::new(session)))
        .invoke_handler(tauri::generate_handler![
            get_session,
            get_demo_available,
            run_demo_action,
            hardware::list_hardware_interfaces,
            hardware::run_hardware_action
        ])
        .build(tauri::generate_context!())
        .expect("Impossible de démarrer Cardiag")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                if let Ok(mut service) = app.state::<Mutex<Service>>().lock() {
                    service.interrupt();
                }
            }
        });
}
