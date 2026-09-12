mod startup;

use std::sync::Mutex;
#[cfg(debug_assertions)]
use std::time::Duration;

use diagnostic_core::{Action, DemoSession, DiagnosticError, SessionSnapshot};
use tauri::State;

type Service = Mutex<DemoSession>;

#[tauri::command]
fn get_demo_available() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
fn get_session(state: State<'_, Service>) -> Result<SessionSnapshot, DiagnosticError> {
    Ok(state
        .lock()
        .map_err(|_| DiagnosticError::ServiceUnavailable)?
        .snapshot())
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
        let state = app.state::<Service>();
        let ticket = {
            let mut session = state
                .lock()
                .map_err(|_| DiagnosticError::ServiceUnavailable)?;
            match session.begin(action, generation)? {
                Some(ticket) => ticket,
                None => return Ok(session.snapshot()),
            }
        };
        std::thread::sleep(Duration::from_millis(ticket.delay_ms()));
        let mut session = state
            .lock()
            .map_err(|_| DiagnosticError::ServiceUnavailable)?;
        session.finish(ticket)
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
        .manage(Mutex::new(session))
        .invoke_handler(tauri::generate_handler![
            get_session,
            get_demo_available,
            run_demo_action
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Cardiag");
}
