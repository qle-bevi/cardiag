//! Portable diagnostic session and deterministic simulator, with no OS or IPC dependencies.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TroubleCode {
    pub code: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Hardware transports can implement this boundary in a separate crate.
pub trait DiagnosticTransport {
    fn connect(&mut self) -> Result<(), DiagnosticError>;
    fn disconnect(&mut self);
    fn read_codes(&mut self) -> Result<Vec<TroubleCode>, DiagnosticError>;
    fn clear_codes(&mut self) -> Result<(), DiagnosticError>;
}

#[derive(Debug)]
pub struct Simulator {
    connected: bool,
    codes: Vec<TroubleCode>,
}

impl Default for Simulator {
    fn default() -> Self {
        Self {
            connected: false,
            codes: [
                (
                    "DEMO-001",
                    "Capteur de température fictif : signal incohérent",
                ),
                ("DEMO-002", "Circuit d’admission fictif : débit insuffisant"),
                ("DEMO-003", "Alimentation fictive : tension trop faible"),
            ]
            .into_iter()
            .map(|(code, description)| TroubleCode {
                code: code.into(),
                description: description.into(),
                status: None,
                source: None,
            })
            .collect(),
        }
    }
}

impl DiagnosticTransport for Simulator {
    fn connect(&mut self) -> Result<(), DiagnosticError> {
        self.connected = true;
        Ok(())
    }

    fn disconnect(&mut self) {
        self.connected = false;
    }

    fn read_codes(&mut self) -> Result<Vec<TroubleCode>, DiagnosticError> {
        if !self.connected {
            return Err(DiagnosticError::NotConnected);
        }
        Ok(self.codes.clone())
    }

    fn clear_codes(&mut self) -> Result<(), DiagnosticError> {
        if !self.connected {
            return Err(DiagnosticError::NotConnected);
        }
        self.codes.clear();
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticError {
    HardwareUnavailable,
    DriverUnavailable,
    CableUnavailable,
    UnsupportedProfile,
    InvalidResponse,
    OperationUnsupported,
    HelperUnavailable,
    NotConnected,
    Busy,
    InvalidState,
    ConfirmationRequired,
    NoResponse,
    ConnectionInterrupted,
    StaleOperation,
    ServiceUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Connect,
    Read,
    Clear,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Incident {
    NoResponse,
    ConnectionInterrupted,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Activate,
    Deactivate,
    Disconnect,
    Reset,
    ArmIncident { incident: Option<Incident> },
    Connect,
    Read,
    Clear { confirmed: bool },
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct SessionSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware: Option<HardwareInfo>,
    pub generation: u64,
    pub demo: bool,
    pub connected: bool,
    pub operation: Option<Operation>,
    pub reading: Option<Vec<TroubleCode>>,
    pub cleared: bool,
    pub incident: Option<Incident>,
    pub error: Option<DiagnosticError>,
}

/// A ticket is only completed if it still belongs to the current session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ticket {
    generation: u64,
    id: u64,
    operation: Operation,
    incident: Option<Incident>,
}

impl Ticket {
    pub fn delay_ms(&self) -> u64 {
        if self.incident == Some(Incident::NoResponse) {
            1500
        } else {
            500
        }
    }
}

#[derive(Debug, Default)]
pub struct DemoSession {
    simulator: Simulator,
    state: SessionSnapshot,
    pending: Option<Ticket>,
    next_id: u64,
}

impl DemoSession {
    pub fn snapshot(&self) -> SessionSnapshot {
        self.state.clone()
    }

    fn invalidate(&mut self) {
        self.simulator.disconnect();
        self.pending = None;
        self.state = SessionSnapshot {
            generation: self.state.generation + 1,
            demo: self.state.demo,
            ..SessionSnapshot::default()
        };
    }

    /// Immediate controls invalidate pending work; diagnostic operations return a ticket.
    pub fn begin(
        &mut self,
        action: Action,
        generation: u64,
    ) -> Result<Option<Ticket>, DiagnosticError> {
        if generation != self.state.generation {
            return Err(DiagnosticError::StaleOperation);
        }
        if matches!(action, Action::Activate) {
            if self.state.demo {
                return Err(DiagnosticError::InvalidState);
            }
            self.invalidate();
            self.state.demo = true;
            self.simulator = Simulator::default();
            return Ok(None);
        }
        if !self.state.demo {
            return Err(DiagnosticError::HardwareUnavailable);
        }
        match action {
            Action::Deactivate | Action::Disconnect | Action::Reset => {
                self.invalidate();
                if matches!(action, Action::Reset | Action::Deactivate) {
                    self.simulator = Simulator::default();
                }
                if matches!(action, Action::Deactivate) {
                    self.state.demo = false;
                }
                return Ok(None);
            }
            _ => {}
        }
        if self.pending.is_some() {
            return Err(DiagnosticError::Busy);
        }
        let operation = match action {
            Action::ArmIncident { incident } => {
                self.state.incident = incident;
                return Ok(None);
            }
            Action::Connect => {
                if self.state.connected {
                    return Err(DiagnosticError::InvalidState);
                }
                Operation::Connect
            }
            Action::Read | Action::Clear { .. } => {
                if !self.state.connected {
                    return Err(DiagnosticError::NotConnected);
                }
                if let Action::Clear { confirmed } = action {
                    if !confirmed {
                        return Err(DiagnosticError::ConfirmationRequired);
                    }
                    if self.state.reading.as_ref().is_none_or(Vec::is_empty) {
                        return Err(DiagnosticError::InvalidState);
                    }
                    Operation::Clear
                } else {
                    Operation::Read
                }
            }
            _ => unreachable!("controls handled above"),
        };
        self.next_id += 1;
        let ticket = Ticket {
            generation,
            id: self.next_id,
            operation,
            incident: self.state.incident.take(),
        };
        self.pending = Some(ticket);
        self.state.operation = Some(operation);
        self.state.error = None;
        self.state.reading = None;
        self.state.cleared = false;
        Ok(Some(ticket))
    }

    /// Commit under the session lock, after the adapter's delay, never before it.
    pub fn finish(&mut self, ticket: Ticket) -> Result<SessionSnapshot, DiagnosticError> {
        if self.pending != Some(ticket) || self.state.generation != ticket.generation {
            return Err(DiagnosticError::StaleOperation);
        }
        self.pending = None;
        self.state.operation = None;
        match ticket.incident {
            Some(Incident::NoResponse) => self.state.error = Some(DiagnosticError::NoResponse),
            Some(Incident::ConnectionInterrupted) => {
                self.invalidate();
                self.state.error = Some(DiagnosticError::ConnectionInterrupted);
            }
            None => {
                let result = match ticket.operation {
                    Operation::Connect => self
                        .simulator
                        .connect()
                        .map(|()| self.state.connected = true),
                    Operation::Read => self
                        .simulator
                        .read_codes()
                        .map(|codes| self.state.reading = Some(codes)),
                    Operation::Clear => self
                        .simulator
                        .clear_codes()
                        .map(|()| self.state.cleared = true),
                };
                self.state.error = result.err();
            }
        }
        Ok(self.snapshot())
    }
}

#[cfg(test)]
mod tests;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub available: bool,
    pub interface: Option<String>,
    pub profile: Option<String>,
    pub partial: bool,
    pub issues: Vec<String>,
}
