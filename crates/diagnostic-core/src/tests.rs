use super::*;

fn perform(session: &mut DemoSession, action: Action) -> SessionSnapshot {
    if let Some(ticket) = session.begin(action, session.state.generation).unwrap() {
        session.finish(ticket).unwrap()
    } else {
        session.snapshot()
    }
}

fn connected() -> DemoSession {
    let mut session = DemoSession::default();
    perform(&mut session, Action::Activate);
    perform(&mut session, Action::Connect);
    session
}

#[test]
fn simulator_is_deterministic_and_requires_connection() {
    let mut simulator = Simulator::default();
    assert_eq!(simulator.read_codes(), Err(DiagnosticError::NotConnected));
    assert_eq!(simulator.clear_codes(), Err(DiagnosticError::NotConnected));
    simulator.connect().unwrap();
    let codes = simulator.read_codes().unwrap();
    assert_eq!(codes.len(), 3);
    assert!(codes.iter().all(|code| code.code.starts_with("DEMO-")));
    simulator.clear_codes().unwrap();
    simulator.disconnect();
    simulator.connect().unwrap();
    assert!(simulator.read_codes().unwrap().is_empty());
    let mut fresh = Simulator::default();
    fresh.connect().unwrap();
    assert_eq!(fresh.read_codes().unwrap(), codes);
}

#[test]
fn full_journey_requires_confirmation_and_a_new_reading() {
    let mut session = connected();
    assert_eq!(session.snapshot().reading, None);
    let initial = perform(&mut session, Action::Read).reading.unwrap();
    assert_eq!(
        session.begin(Action::Clear { confirmed: false }, session.state.generation),
        Err(DiagnosticError::ConfirmationRequired)
    );
    assert_eq!(perform(&mut session, Action::Read).reading, Some(initial));
    let cleared = perform(&mut session, Action::Clear { confirmed: true });
    assert!(cleared.cleared);
    assert_eq!(cleared.reading, None);
    assert_eq!(perform(&mut session, Action::Read).reading, Some(vec![]));
    perform(&mut session, Action::Disconnect);
    perform(&mut session, Action::Connect);
    assert_eq!(perform(&mut session, Action::Read).reading, Some(vec![]));
    let reset = perform(&mut session, Action::Reset);
    assert!(!reset.connected);
    assert_eq!(reset.reading, None);
    perform(&mut session, Action::Connect);
    assert_eq!(
        perform(&mut session, Action::Read).reading.unwrap().len(),
        3
    );
}

#[test]
fn hardware_and_invalid_transitions_are_rejected() {
    let mut session = DemoSession::default();
    for action in [
        Action::Connect,
        Action::Read,
        Action::Clear { confirmed: true },
        Action::Reset,
    ] {
        assert_eq!(
            session.begin(action, 0),
            Err(DiagnosticError::HardwareUnavailable)
        );
    }
    perform(&mut session, Action::Activate);
    assert_eq!(
        session.begin(Action::Read, 1),
        Err(DiagnosticError::NotConnected)
    );
    perform(&mut session, Action::Connect);
    assert_eq!(
        session.begin(Action::Connect, 1),
        Err(DiagnosticError::InvalidState)
    );
    assert_eq!(
        session.begin(Action::Clear { confirmed: true }, 1),
        Err(DiagnosticError::InvalidState)
    );
}

#[test]
fn only_one_operation_runs_and_tickets_cannot_be_reused() {
    let mut session = connected();
    let ticket = session.begin(Action::Read, 1).unwrap().unwrap();
    assert_eq!(session.snapshot().operation, Some(Operation::Read));
    for action in [
        Action::Read,
        Action::Clear { confirmed: true },
        Action::ArmIncident { incident: None },
    ] {
        assert_eq!(session.begin(action, 1), Err(DiagnosticError::Busy));
    }
    session.finish(ticket).unwrap();
    let next = session.begin(Action::Read, 1).unwrap().unwrap();
    assert_eq!(session.finish(ticket), Err(DiagnosticError::StaleOperation));
    assert_eq!(session.snapshot().operation, Some(Operation::Read));
    session.finish(next).unwrap();
}

#[test]
fn interruptions_invalidate_pending_reads_connections_and_clears() {
    for control in [Action::Disconnect, Action::Reset, Action::Deactivate] {
        for operation in [
            Action::Connect,
            Action::Read,
            Action::Clear { confirmed: true },
        ] {
            let mut session = connected();
            perform(&mut session, Action::Read);
            if matches!(operation, Action::Connect) {
                perform(&mut session, Action::Disconnect);
            }
            let generation = session.state.generation;
            let ticket = session.begin(operation, generation).unwrap().unwrap();
            let snapshot = perform(&mut session, control);
            assert_eq!(session.finish(ticket), Err(DiagnosticError::StaleOperation));
            assert_eq!(session.snapshot(), snapshot);
            // Even a request that reaches Rust after the interruption is rejected.
            assert_eq!(
                session.begin(operation, generation),
                Err(DiagnosticError::StaleOperation)
            );
            if !session.state.demo {
                perform(&mut session, Action::Activate);
            }
            perform(&mut session, Action::Connect);
            assert_eq!(
                perform(&mut session, Action::Read).reading.unwrap().len(),
                3
            );
        }
    }
}

#[test]
fn incidents_are_one_shot_and_never_erase_codes() {
    for incident in [Incident::NoResponse, Incident::ConnectionInterrupted] {
        for action in [
            Action::Connect,
            Action::Read,
            Action::Clear { confirmed: true },
        ] {
            let mut session = connected();
            perform(&mut session, Action::Read);
            if matches!(action, Action::Connect) {
                perform(&mut session, Action::Disconnect);
            }
            let was_connected = session.state.connected;
            perform(
                &mut session,
                Action::ArmIncident {
                    incident: Some(incident),
                },
            );
            let ticket = session
                .begin(action, session.state.generation)
                .unwrap()
                .unwrap();
            assert_eq!(
                ticket.delay_ms(),
                if incident == Incident::NoResponse {
                    1500
                } else {
                    500
                }
            );
            let failed = session.finish(ticket).unwrap();
            assert_eq!(failed.incident, None);
            assert_eq!(failed.reading, None);
            assert!(!failed.cleared);
            assert_eq!(
                failed.connected,
                was_connected && incident == Incident::NoResponse
            );
            assert_eq!(
                failed.error,
                Some(if incident == Incident::NoResponse {
                    DiagnosticError::NoResponse
                } else {
                    DiagnosticError::ConnectionInterrupted
                })
            );
            if !failed.connected {
                perform(&mut session, Action::Connect);
            }
            assert_eq!(
                perform(&mut session, Action::Read).reading.unwrap().len(),
                3
            );
        }
    }
}

#[test]
fn reset_and_reactivation_restore_the_initial_scenario() {
    let mut session = connected();
    perform(&mut session, Action::Read);
    perform(&mut session, Action::Clear { confirmed: true });
    perform(
        &mut session,
        Action::ArmIncident {
            incident: Some(Incident::NoResponse),
        },
    );
    let reset = perform(&mut session, Action::Reset);
    assert_eq!(reset.incident, None);
    perform(&mut session, Action::Connect);
    perform(&mut session, Action::Read);
    perform(&mut session, Action::Clear { confirmed: true });
    assert!(!perform(&mut session, Action::Deactivate).demo);
    perform(&mut session, Action::Activate);
    perform(&mut session, Action::Connect);
    assert_eq!(
        perform(&mut session, Action::Read).reading.unwrap().len(),
        3
    );
}

#[test]
fn snapshots_match_shared_ipc_fixtures() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/demo-session.json")).unwrap();
    let mut session = DemoSession::default();
    assert_eq!(
        serde_json::to_value(session.snapshot()).unwrap(),
        fixtures["initial"]
    );
    perform(&mut session, Action::Activate);
    perform(&mut session, Action::Connect);
    assert_eq!(
        serde_json::to_value(perform(&mut session, Action::Read)).unwrap(),
        fixtures["read"]
    );
    perform(&mut session, Action::Clear { confirmed: true });
    assert_eq!(
        serde_json::to_value(session.snapshot()).unwrap(),
        fixtures["cleared"]
    );
    assert_eq!(
        serde_json::to_value(perform(&mut session, Action::Read)).unwrap(),
        fixtures["empty"]
    );
    perform(
        &mut session,
        Action::ArmIncident {
            incident: Some(Incident::ConnectionInterrupted),
        },
    );
    assert_eq!(
        serde_json::to_value(perform(&mut session, Action::Read)).unwrap(),
        fixtures["interrupted"]
    );
    let action: Action = serde_json::from_value(fixtures["clearAction"].clone()).unwrap();
    assert!(matches!(action, Action::Clear { confirmed: true }));
}

#[test]
fn hardware_snapshot_matches_shared_contract() {
    let snapshot = SessionSnapshot {
        connected: true,
        hardware: Some(HardwareInfo {
            available: true,
            interface: Some("Godiag GD101".into()),
            profile: Some("ISO 15765 · CAN 11 bits · 500 kbit/s".into()),
            partial: true,
            issues: vec!["Calculateur 0x7E8, service 07 : réponse absente ou multiple".into()],
        }),
        reading: Some(vec![TroubleCode {
            code: "P0133".into(),
            description: "Description non disponible".into(),
            status: Some("stored".into()),
            source: Some("0x7E8".into()),
        }]),
        ..Default::default()
    };
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/hardware-session.json"
    ))
    .unwrap();
    assert_eq!(serde_json::to_value(snapshot).unwrap(), fixture);
}
