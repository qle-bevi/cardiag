use cardiag_j2534::{process::Client, Command};
use diagnostic_core::DiagnosticError as Error;
use std::{
    path::PathBuf,
    process::Command as Process,
    time::{Duration, Instant},
};
fn make_client(scenario: &str) -> Client {
    let helper = PathBuf::from(env!("CARGO_BIN_EXE_cardiag-j2534"));
    let filename = if cfg!(windows) {
        "fake_j2534.dll"
    } else if cfg!(target_os = "macos") {
        "libfake_j2534.dylib"
    } else {
        "libfake_j2534.so"
    };
    let dll = helper.with_file_name(filename);
    assert!(
        dll.exists(),
        "Build fake-j2534 before running integration tests: {}",
        dll.display()
    );
    let trace = trace_path(scenario);
    let _ = std::fs::remove_file(&trace);
    let mut command = Process::new(helper);
    command.env("CARDIAG_FAKE_TRACE", trace);
    command.arg(dll).env("CARDIAG_FAKE_SCENARIO", scenario);
    Client::spawn_configured(command, None).unwrap()
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn real_process_and_ffi_read_multiple_ecus_without_clear() {
    let mut client = make_client("multiple");
    client.call(Command::Connect {}).unwrap();
    let report = client.call(Command::Read {}).unwrap();
    assert_eq!(report.codes.len(), 6);
    assert!(report.issues.is_empty());
    assert_eq!(report.codes[0].source.as_deref(), Some("0x7E8"));
    assert_eq!(report.codes[3].source.as_deref(), Some("0x7E9"));
    client.call(Command::Close {}).unwrap();
    let trace = std::fs::read_to_string(trace_path("multiple")).unwrap();
    assert_eq!(trace.lines().filter(|line| *line == "filter").count(), 8);
    assert_eq!(
        trace
            .lines()
            .filter(|line| line.starts_with("service:"))
            .collect::<Vec<_>>(),
        ["service:01", "service:03", "service:07"]
    );
    assert!(trace.ends_with("disconnect\nclose\n"));
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn partial_read_is_not_empty_success() {
    let mut client = make_client("partial");
    client.call(Command::Connect {}).unwrap();
    let report = client.call(Command::Read {}).unwrap();
    assert_eq!(report.codes.len(), 3);
    assert_eq!(report.issues.len(), 1);
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn empty_read_is_valid_and_not_a_timeout() {
    let mut client = make_client("empty");
    client.call(Command::Connect {}).unwrap();
    let report = client.call(Command::Read {}).unwrap();
    assert!(report.codes.is_empty());
    assert!(report.issues.is_empty());
    let mut silent = make_client("silent");
    assert!(matches!(
        silent.call(Command::Connect {}),
        Err(Error::NoResponse)
    ));
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn process_failure_and_blocking_are_bounded() {
    let mut crash = make_client("crash");
    assert!(matches!(
        crash.call(Command::Connect {}),
        Err(Error::ConnectionInterrupted)
    ));
    let mut hanging = make_client("hang");
    let start = Instant::now();
    assert!(matches!(
        hanging.call_with_timeout(Command::Connect {}, Duration::from_millis(200)),
        Err(Error::ConnectionInterrupted)
    ));
    assert!(start.elapsed() < Duration::from_secs(3));
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn driver_errors_and_disconnect_are_reported() {
    assert!(matches!(
        make_client("missing").call(Command::Connect {}),
        Err(Error::CableUnavailable)
    ));
    assert!(matches!(
        make_client("unsupported").call(Command::Connect {}),
        Err(Error::UnsupportedProfile)
    ));
    let mut disconnected = make_client("disconnect");
    disconnected.call(Command::Connect {}).unwrap();
    assert!(matches!(
        disconnected.call(Command::Read {}),
        Err(Error::ConnectionInterrupted)
    ));
}
#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn wire_contract_cannot_request_clear_or_raw_bytes() {
    for command in [
        r#"{"type":"clear"}"#,
        r#"{"type":"raw","data":[4]}"#,
        r#"{"type":"read","data":[4]}"#,
    ] {
        assert!(serde_json::from_str::<Command>(command).is_err());
    }
}

fn trace_path(scenario: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "cardiag-fake-{}-{scenario}.log",
        std::process::id()
    ))
}

#[test]
#[ignore = "requires cargo build -p fake-j2534; CI runs this suite explicitly"]
fn explicit_interrupt_stops_a_blocked_driver() {
    let mut client = make_client("hang");
    let control = client.control();
    let worker = std::thread::spawn(move || client.call(Command::Connect {}));
    std::thread::sleep(Duration::from_millis(100));
    let start = Instant::now();
    control.stop();
    assert!(matches!(
        worker.join().unwrap(),
        Err(Error::ConnectionInterrupted)
    ));
    assert!(start.elapsed() < Duration::from_secs(3));
}
