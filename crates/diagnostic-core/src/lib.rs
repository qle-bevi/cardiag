//! Portable diagnostic domain. No OS, Tauri, or cable-driver dependencies.

use serde::Serialize;

/// Only disconnection is supported until a real transport is implemented.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_connection_matches_the_ipc_contract() {
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/connection-status.json"
        ))
        .unwrap();
        assert_eq!(
            serde_json::to_value(ConnectionStatus::default()).unwrap(),
            expected
        );
    }
}
