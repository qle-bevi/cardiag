use diagnostic_core::ConnectionStatus;

#[tauri::command]
fn get_connection_status() -> ConnectionStatus {
    ConnectionStatus::default()
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_connection_status])
        .run(tauri::generate_context!())
        .expect("failed to run Cardiag");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_command_matches_the_frontend_contract() {
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/connection-status.json"))
                .unwrap();
        assert_eq!(
            serde_json::to_value(get_connection_status()).unwrap(),
            expected
        );
    }
}
