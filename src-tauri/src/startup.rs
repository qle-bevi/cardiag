use std::ffi::OsString;

use diagnostic_core::{Action, DemoSession};

/// Resolve runtime settings before exposing the session to the interface.
/// Explicit flags take precedence over the environment; the last flag wins.
pub(super) fn session(
    demo_available: bool,
    args: impl IntoIterator<Item = OsString>,
    env_demo: Option<OsString>,
) -> Result<DemoSession, &'static str> {
    if !demo_available {
        return Ok(DemoSession::default());
    }
    let flag = args
        .into_iter()
        .take_while(|arg| arg != "--")
        .filter_map(|arg| match arg.to_str() {
            Some("--demo") => Some(true),
            Some("--no-demo") => Some(false),
            _ => None,
        })
        .last();
    let enabled = match (flag, env_demo) {
        (Some(value), _) => value,
        (None, None) => false,
        (None, Some(value)) => match value.to_str().map(str::trim) {
            Some("1") => true,
            Some("0") => false,
            Some(value) if value.eq_ignore_ascii_case("true") => true,
            Some(value) if value.eq_ignore_ascii_case("false") => false,
            _ => return Err("CARDIAG_DEMO doit valoir 1, 0, true ou false."),
        },
    };
    let mut session = DemoSession::default();
    if enabled {
        session
            .begin(Action::Activate, 0)
            .expect("Une session neuve doit permettre l’activation de la démo");
    }
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve(args: &[&str], value: Option<&str>) -> Result<DemoSession, &'static str> {
        session(
            true,
            args.iter().map(OsString::from),
            value.map(OsString::from),
        )
    }

    #[test]
    fn release_ignores_all_demo_startup_settings() {
        for args in [
            vec![],
            vec![OsString::from("--demo")],
            vec![OsString::from("--no-demo")],
        ] {
            for value in [None, Some("1"), Some("true"), Some("invalid")] {
                let snapshot = session(false, args.clone(), value.map(OsString::from))
                    .unwrap()
                    .snapshot();
                assert!(!snapshot.demo);
                assert!(!snapshot.connected);
                assert_eq!(snapshot.generation, 0);
            }
        }
    }

    #[test]
    fn compiled_build_policy_controls_startup() {
        let snapshot = session(
            super::super::get_demo_available(),
            [OsString::from("--demo")],
            None,
        )
        .unwrap()
        .snapshot();
        assert_eq!(snapshot.demo, cfg!(debug_assertions));
    }

    #[test]
    fn defaults_to_demo_off() {
        let snapshot = resolve(&[], None).unwrap().snapshot();
        assert!(!snapshot.demo);
        assert_eq!(snapshot.generation, 0);
    }

    #[test]
    fn accepts_boolean_environment_values() {
        for value in ["1", "true", " TRUE "] {
            assert!(resolve(&[], Some(value)).unwrap().snapshot().demo);
        }
        for value in ["0", "false", " False "] {
            assert!(!resolve(&[], Some(value)).unwrap().snapshot().demo);
        }
        for value in ["", "yes", "2", "tru"] {
            assert!(resolve(&[], Some(value)).is_err());
        }
    }

    #[test]
    fn flags_override_environment_including_invalid_values() {
        for value in [None, Some("0"), Some("1"), Some("invalid")] {
            assert!(resolve(&["--demo"], value).unwrap().snapshot().demo);
            assert!(!resolve(&["--no-demo"], value).unwrap().snapshot().demo);
        }
    }

    #[test]
    fn last_flag_wins_and_argument_separator_is_respected() {
        assert!(
            !resolve(&["--demo", "--no-demo"], None)
                .unwrap()
                .snapshot()
                .demo
        );
        assert!(
            resolve(&["--no-demo", "--demo"], None)
                .unwrap()
                .snapshot()
                .demo
        );
        assert!(!resolve(&["--", "--demo"], None).unwrap().snapshot().demo);
        assert!(!resolve(&["--unrelated"], None).unwrap().snapshot().demo);
    }

    #[test]
    fn activated_session_stays_disconnected_and_can_be_toggled_from_the_ui() {
        let mut session = resolve(&["--demo"], None).unwrap();
        let snapshot = session.snapshot();
        assert!(snapshot.demo);
        assert_eq!(snapshot.generation, 1);
        assert!(!snapshot.connected);
        assert!(snapshot.reading.is_none());
        assert!(snapshot.operation.is_none());
        assert!(!snapshot.cleared);
        session
            .begin(Action::Deactivate, snapshot.generation)
            .unwrap();
        assert!(!session.snapshot().demo);
        session
            .begin(Action::Activate, session.snapshot().generation)
            .unwrap();
        assert!(session.snapshot().demo);
    }
}
