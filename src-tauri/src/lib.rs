use std::sync::Mutex;
use std::time::Duration;

use diagnostic_core::{Action, DemoSession, DiagnosticError, SessionSnapshot};
use tauri::State;

type Service = Mutex<DemoSession>;

#[tauri::command]
fn get_session(state: State<'_, Service>) -> Result<SessionSnapshot, DiagnosticError> {
    Ok(state
        .lock()
        .map_err(|_| DiagnosticError::ServiceUnavailable)?
        .snapshot())
}

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

pub fn run() {
    tauri::Builder::default()
        .manage(Service::default())
        .invoke_handler(tauri::generate_handler![get_session, run_demo_action])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Cardiag");
}
