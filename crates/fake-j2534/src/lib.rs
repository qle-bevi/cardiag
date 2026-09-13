//! Test-only J2534 DLL. Never bundled with the application.
#![allow(clippy::missing_safety_doc)]
use cardiag_j2534::driver::Message;
use std::{
    ffi::c_void,
    sync::{Mutex, OnceLock},
};
#[derive(Default)]
struct State {
    opened: bool,
    connected: bool,
    filters: usize,
    replies: Vec<Message>,
}
fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}
fn scenario() -> String {
    std::env::var("CARDIAG_FAKE_SCENARIO").unwrap_or_default()
}
fn trace(event: &str) {
    if let Ok(path) = std::env::var("CARDIAG_FAKE_TRACE") {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(f, "{event}");
        }
    }
}
#[no_mangle]
pub unsafe extern "system" fn PassThruOpen(_: *const c_void, id: *mut u32) -> u32 {
    trace("open");
    match scenario().as_str() {
        "crash" => std::process::abort(),
        "hang" => loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
        },
        "missing" => return 8,
        _ => {}
    }
    *state().lock().unwrap() = State {
        opened: true,
        ..State::default()
    };
    unsafe {
        *id = 1;
    }
    0
}
#[no_mangle]
pub unsafe extern "system" fn PassThruConnect(
    _: u32,
    protocol: u32,
    flags: u32,
    baud: u32,
    id: *mut u32,
) -> u32 {
    trace("connect");
    if protocol != 6 || flags != 0 || baud != 500000 || scenario() == "unsupported" {
        return 3;
    }
    state().lock().unwrap().connected = true;
    unsafe {
        *id = 2;
    }
    0
}
#[no_mangle]
pub unsafe extern "system" fn PassThruStartMsgFilter(
    _: u32,
    kind: u32,
    mask: *const Message,
    pattern: *const Message,
    flow: *const Message,
    id: *mut u32,
) -> u32 {
    trace("filter");
    let (mask, pattern, flow) = unsafe { (&*mask, &*pattern, &*flow) };
    if kind != 3
        || mask.data[..4] != 0x7ff_u32.to_be_bytes()
        || pattern.data_size != 4
        || flow.data_size != 4
    {
        return 3;
    }
    let p = u32::from_be_bytes(pattern.data[..4].try_into().unwrap());
    let f = u32::from_be_bytes(flow.data[..4].try_into().unwrap());
    if p != f + 8 {
        return 3;
    }
    let mut state = state().lock().unwrap();
    state.filters += 1;
    unsafe {
        *id = state.filters as u32;
    }
    0
}
#[no_mangle]
pub unsafe extern "system" fn PassThruWriteMsgs(
    _: u32,
    msg: *mut Message,
    count: *mut u32,
    _: u32,
) -> u32 {
    let msg = unsafe { &*msg };
    let mut state = state().lock().unwrap();
    if !state.opened || !state.connected || state.filters != 8 {
        return 2;
    }
    let service = msg.data[4];
    trace(&format!("service:{service:02X}"));
    if !matches!(service, 1 | 3 | 7) {
        return 1;
    }
    if scenario() == "disconnect" && service == 3 {
        return 8;
    }
    let payload = match service {
        1 => vec![0x41, 0, 0x80, 0, 0, 0],
        3 if scenario() == "malformed" => vec![0x43, 2, 1, 0x33],
        3 if scenario() == "empty" => vec![0x43, 0],
        3 => vec![0x43, 3, 1, 0x33, 3, 1, 0xc1, 0],
        _ => vec![0x47, 0],
    };
    if scenario() != "silent" && !(scenario() == "partial" && service == 7) {
        state.replies.push(Message::new(0x7e8, &payload));
        if scenario() == "multiple" {
            state.replies.push(Message::new(0x7e9, &payload));
        }
    }
    unsafe {
        *count = 1;
    }
    0
}
#[no_mangle]
pub unsafe extern "system" fn PassThruReadMsgs(
    _: u32,
    msg: *mut Message,
    count: *mut u32,
    timeout: u32,
) -> u32 {
    if let Some(reply) = state().lock().unwrap().replies.pop() {
        unsafe {
            *msg = reply;
            *count = 1;
        }
        return 0;
    }
    std::thread::sleep(std::time::Duration::from_millis(timeout as u64));
    unsafe {
        *count = 0;
    }
    0x10
}
#[no_mangle]
pub unsafe extern "system" fn PassThruIoctl(
    _: u32,
    id: u32,
    _: *const c_void,
    _: *mut c_void,
) -> u32 {
    if id != 8 {
        return 1;
    }
    state().lock().unwrap().replies.clear();
    0
}
#[no_mangle]
pub extern "system" fn PassThruDisconnect(_: u32) -> u32 {
    trace("disconnect");
    state().lock().unwrap().connected = false;
    0
}
#[no_mangle]
pub extern "system" fn PassThruClose(_: u32) -> u32 {
    trace("close");
    state().lock().unwrap().opened = false;
    0
}
