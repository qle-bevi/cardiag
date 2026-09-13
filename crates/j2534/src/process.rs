use crate::{Command, Report, Request, Response, VERSION};
use diagnostic_core::DiagnosticError as Error;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command as Process, Stdio},
    sync::{
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    time::Duration,
};

#[derive(Clone)]
pub struct Control(Arc<Mutex<Child>>);
impl Control {
    pub fn stop(&self) {
        if let Ok(mut child) = self.0.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
pub struct Client {
    control: Control,
    input: ChildStdin,
    output: Receiver<Result<Response, Error>>,
    next: u64,
    log: Option<std::fs::File>,
}
impl Client {
    pub fn spawn(executable: &Path, dll: &Path, log: Option<&Path>) -> Result<Self, Error> {
        let mut command = Process::new(executable);
        command
            .arg(dll)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        Self::spawn_configured(command, log)
    }
    /// Also used by integration tests to configure a test DLL in the child environment.
    pub fn spawn_configured(mut command: Process, log: Option<&Path>) -> Result<Self, Error> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = command.spawn().map_err(|_| Error::HelperUnavailable)?;
        let input = child.stdin.take().ok_or(Error::HelperUnavailable)?;
        let stdout = child.stdout.take().ok_or(Error::HelperUnavailable)?;
        let (tx, output) = mpsc::sync_channel(4);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                let result = match reader.by_ref().take(1_048_577).read_line(&mut line) {
                    Ok(0) | Err(_) => Err(Error::ConnectionInterrupted),
                    Ok(_) if line.len() > 1_048_576 => Err(Error::InvalidResponse),
                    Ok(_) => {
                        serde_json::from_str::<Response>(&line).map_err(|_| Error::InvalidResponse)
                    }
                };
                let failed = result.is_err();
                if tx.send(result).is_err() || failed {
                    break;
                }
            }
        });
        let log = log.and_then(|p| {
            std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(p)
                .ok()
        });
        Ok(Self {
            control: Control(Arc::new(Mutex::new(child))),
            input,
            output,
            next: 0,
            log,
        })
    }
    pub fn control(&self) -> Control {
        self.control.clone()
    }
    pub fn call(&mut self, command: Command) -> Result<Report, Error> {
        self.call_with_timeout(command, Duration::from_secs(15))
    }
    pub fn call_with_timeout(
        &mut self,
        command: Command,
        timeout: Duration,
    ) -> Result<Report, Error> {
        self.next += 1;
        let request = Request {
            version: VERSION,
            id: self.next,
            command,
        };
        self.trace(&request);
        let result = (|| {
            serde_json::to_writer(&mut self.input, &request)
                .map_err(|_| Error::ConnectionInterrupted)?;
            self.input
                .write_all(b"\n")
                .and_then(|()| self.input.flush())
                .map_err(|_| Error::ConnectionInterrupted)?;
            let response = self
                .output
                .recv_timeout(timeout)
                .map_err(|_| Error::ConnectionInterrupted)??;
            self.trace(&response);
            if response.version != VERSION || response.id != self.next {
                return Err(Error::InvalidResponse);
            }
            response.result
        })();
        if let Err(error) = &result {
            self.trace(&format!("{error:?}"));
        }
        if matches!(
            result,
            Err(Error::ConnectionInterrupted | Error::InvalidResponse)
        ) {
            self.control.stop();
        }
        result
    }
    fn trace(&mut self, value: &impl serde::Serialize) {
        if let Some(log) = &mut self.log {
            if log.metadata().map(|m| m.len() < 1_048_576).unwrap_or(false) {
                let time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                let _ = serde_json::to_writer(
                    &mut *log,
                    &serde_json::json!({"time_ms":time,"event":value}),
                );
                let _ = writeln!(log);
                let _ = log.flush();
            }
        }
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        self.control.stop();
    }
}
