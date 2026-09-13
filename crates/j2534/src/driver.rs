//! J2534 04.04 ABI. All foreign calls are owned by one helper process/thread.
use crate::{obd, Report};
use diagnostic_core::DiagnosticError as Error;
use libloading::Library;
use std::{
    ffi::c_void,
    path::Path,
    time::{Duration, Instant},
};

#[repr(C)]
#[derive(Clone)]
pub struct Message {
    pub protocol: u32,
    pub rx_status: u32,
    pub tx_flags: u32,
    pub timestamp: u32,
    pub data_size: u32,
    pub extra_data_index: u32,
    pub data: [u8; 4128],
}
impl Default for Message {
    fn default() -> Self {
        Self {
            protocol: 6,
            rx_status: 0,
            tx_flags: 0,
            timestamp: 0,
            data_size: 0,
            extra_data_index: 0,
            data: [0; 4128],
        }
    }
}
impl Message {
    pub fn new(address: u32, payload: &[u8]) -> Self {
        let mut msg = Self::default();
        msg.data[..4].copy_from_slice(&address.to_be_bytes());
        msg.data[4..4 + payload.len()].copy_from_slice(payload);
        msg.data_size = (4 + payload.len()) as u32;
        msg.tx_flags = 0x40; // ISO15765_FRAME_PAD
        msg
    }
}
type Open = unsafe extern "system" fn(*const c_void, *mut u32) -> u32;
type Connect = unsafe extern "system" fn(u32, u32, u32, u32, *mut u32) -> u32;
type Close = unsafe extern "system" fn(u32) -> u32;
type Messages = unsafe extern "system" fn(u32, *mut Message, *mut u32, u32) -> u32;
type Filter = unsafe extern "system" fn(
    u32,
    u32,
    *const Message,
    *const Message,
    *const Message,
    *mut u32,
) -> u32;
type Ioctl = unsafe extern "system" fn(u32, u32, *const c_void, *mut c_void) -> u32;

pub struct Driver {
    _library: Library,
    open: Open,
    connect_fn: Connect,
    close: Close,
    disconnect: Close,
    read: Messages,
    write: Messages,
    filter: Filter,
    ioctl: Ioctl,
    device: Option<u32>,
    channel: Option<u32>,
    responders: Vec<u32>,
    trace: Vec<String>,
}
impl Driver {
    pub fn load(path: &Path) -> Result<Self, Error> {
        // The backend supplies a registered absolute DLL path, never frontend bytes.
        unsafe {
            #[cfg(windows)]
            let library: Library = libloading::os::windows::Library::load_with_flags(path, 0x1100)
                .map_err(|_| Error::DriverUnavailable)?
                .into(); // DLL directory + default safe search directories
            #[cfg(not(windows))]
            let library = Library::new(path).map_err(|_| Error::DriverUnavailable)?;
            Ok(Self {
                open: *library
                    .get(b"PassThruOpen\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                connect_fn: *library
                    .get(b"PassThruConnect\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                close: *library
                    .get(b"PassThruClose\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                disconnect: *library
                    .get(b"PassThruDisconnect\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                read: *library
                    .get(b"PassThruReadMsgs\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                write: *library
                    .get(b"PassThruWriteMsgs\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                filter: *library
                    .get(b"PassThruStartMsgFilter\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                ioctl: *library
                    .get(b"PassThruIoctl\0")
                    .map_err(|_| Error::DriverUnavailable)?,
                _library: library,
                device: None,
                channel: None,
                responders: Vec::new(),
                trace: Vec::new(),
            })
        }
    }
    pub fn connect(&mut self) -> Result<(), Error> {
        if self.device.is_some() {
            return Err(Error::InvalidState);
        }
        let mut device = 0;
        if unsafe { (self.open)(std::ptr::null(), &mut device) } != 0 {
            return Err(Error::CableUnavailable);
        }
        self.device = Some(device);
        let mut channel = 0;
        check(unsafe { (self.connect_fn)(device, 6, 0, 500_000, &mut channel) })?;
        self.channel = Some(channel);
        for address in 0x7e8..=0x7ef {
            let mask = Message::new(0x7ff, &[]);
            let pattern = Message::new(address, &[]);
            let flow = Message::new(address - 8, &[]);
            let mut id = 0;
            check(unsafe { (self.filter)(channel, 3, &mask, &pattern, &flow, &mut id) })?;
        }
        let responses = self.exchange(0x7df, &[1, 0])?;
        if responses.is_empty() {
            return Err(Error::NoResponse);
        }
        for (address, payload) in responses {
            if payload.len() < 6
                || payload[..2] != [0x41, 0]
                || payload[6..].iter().any(|b| *b != 0)
            {
                return Err(Error::InvalidResponse);
            }
            if !self.responders.contains(&address) {
                self.responders.push(address);
            }
        }
        self.responders.sort_unstable();
        Ok(())
    }
    pub fn read_codes(&mut self) -> Result<Report, Error> {
        if self.responders.is_empty() {
            return Err(Error::NotConnected);
        }
        let mut report = Report::default();
        let mut successes = 0;
        let mut invalid = false;
        // One functional request per service bounds reading to two response windows.
        for service in [3, 7] {
            let responses = match self.exchange(0x7df, &[service]) {
                Ok(responses) => responses,
                Err(Error::NoResponse) => {
                    report
                        .issues
                        .push(format!("Service {service:02X} : aucune réponse"));
                    continue;
                }
                Err(error) => return Err(error),
            };
            for source in &self.responders {
                let replies: Vec<_> = responses.iter().filter(|(id, _)| id == source).collect();
                if replies.len() != 1 {
                    invalid |= replies.len() > 1;
                    report.issues.push(format!("Calculateur 0x{source:03X}, service {service:02X} : réponse absente ou multiple"));
                    continue;
                }
                match obd::decode(service, *source, &replies[0].1) {
                    Ok(codes) => {
                        successes += 1;
                        report.codes.extend(codes);
                    }
                    Err(_) => {
                        invalid = true;
                        report.issues.push(format!("Calculateur 0x{source:03X}, service {service:02X} : réponse invalide ou service refusé"));
                    }
                }
            }
            for (source, _) in responses
                .iter()
                .filter(|(id, _)| !self.responders.contains(id))
            {
                invalid = true;
                report
                    .issues
                    .push(format!("Réponse inattendue du calculateur 0x{source:03X}"));
            }
        }
        if successes == 0 {
            return Err(if invalid {
                Error::InvalidResponse
            } else {
                Error::NoResponse
            });
        }
        Ok(report)
    }
    fn exchange(&mut self, address: u32, payload: &[u8]) -> Result<Vec<(u32, Vec<u8>)>, Error> {
        let channel = self.channel.ok_or(Error::NotConnected)?;
        check(unsafe { (self.ioctl)(channel, 8, std::ptr::null(), std::ptr::null_mut()) })?; // CLEAR_RX_BUFFER
        self.record(format!("TX 0x{address:03X} {payload:02X?}"));
        let mut request = Message::new(address, payload);
        let mut count = 1;
        check(unsafe { (self.write)(channel, &mut request, &mut count, 500) })?;
        if count != 1 {
            return Err(Error::NoResponse);
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut responses = Vec::new();
        while Instant::now() < deadline {
            let mut msg = Message::default();
            let mut count = 1;
            let status = unsafe { (self.read)(channel, &mut msg, &mut count, 100) };
            if status == 9 || status == 0x10 {
                continue;
            } // timeout / buffer empty
            if status != 0 {
                self.record(format!("PassThruReadMsgs status=0x{status:X}"));
            }
            check(status)?;
            if count == 0 {
                continue;
            }
            if count != 1 {
                return Err(Error::InvalidResponse);
            }
            // TX confirmations and ISO-TP first-frame notifications contain no complete response.
            if msg.rx_status & (1 | 2 | 8) != 0 {
                continue;
            }
            if msg.protocol != 6
                || msg.data_size < 5
                || msg.data_size as usize > msg.data.len()
                || msg.rx_status & 0x10 != 0
            {
                return Err(Error::InvalidResponse);
            }
            self.record(format!(
                "RX {:02X?}",
                &msg.data[..(msg.data_size as usize).min(256)]
            ));
            let source = u32::from_be_bytes(msg.data[..4].try_into().unwrap());
            if !(0x7e8..=0x7ef).contains(&source) {
                continue;
            }
            if responses.len() >= 64 {
                return Err(Error::InvalidResponse);
            }
            responses.push((source, msg.data[4..msg.data_size as usize].to_vec()));
        }
        Ok(responses)
    }
    fn record(&mut self, event: String) {
        if self.trace.len() < 128 {
            self.trace.push(event);
        }
    }
    pub fn take_trace(&mut self) -> Vec<String> {
        std::mem::take(&mut self.trace)
    }
    pub fn shutdown(&mut self) {
        if let Some(channel) = self.channel.take() {
            unsafe {
                (self.disconnect)(channel);
            }
        }
        if let Some(device) = self.device.take() {
            unsafe {
                (self.close)(device);
            }
        }
        self.responders.clear();
    }
}
impl Drop for Driver {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn check(status: u32) -> Result<(), Error> {
    match status {
        0 => Ok(()),
        1 | 3 | 6 | 0x19 => Err(Error::UnsupportedProfile),
        9 | 0x10 => Err(Error::NoResponse),
        _ => Err(Error::ConnectionInterrupted),
    }
}
