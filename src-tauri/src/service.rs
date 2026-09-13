use cardiag_j2534::process::{Client, Control};
use diagnostic_core::{DemoSession, DiagnosticError, HardwareInfo, SessionSnapshot};

pub(crate) struct Service {
    pub demo: DemoSession,
    pub real: SessionSnapshot,
    pub generation: u64,
    pub pending: Option<u64>,
    pub next: u64,
    pub client: Option<Client>,
    pub control: Option<Control>,
}
impl Service {
    pub fn new(demo: DemoSession) -> Self {
        Self {
            generation: demo.snapshot().generation,
            demo,
            real: Self::empty_real(),
            pending: None,
            next: 0,
            client: None,
            control: None,
        }
    }
    fn empty_real() -> SessionSnapshot {
        SessionSnapshot {
            hardware: Some(HardwareInfo {
                available: cfg!(windows),
                ..Default::default()
            }),
            ..Default::default()
        }
    }
    pub fn snapshot(&self) -> SessionSnapshot {
        let mut snapshot = if self.demo.snapshot().demo {
            self.demo.snapshot()
        } else {
            self.real.clone()
        };
        snapshot.generation = self.generation;
        snapshot
    }
    pub fn validate(&self, generation: u64) -> Result<(), DiagnosticError> {
        if generation != self.generation {
            Err(DiagnosticError::StaleOperation)
        } else {
            Ok(())
        }
    }
    pub fn interrupt(&mut self) {
        self.generation += 1;
        self.pending = None;
        if let Some(mut client) = self.client.take() {
            let _ = client.call_with_timeout(
                cardiag_j2534::Command::Close {},
                std::time::Duration::from_millis(500),
            );
        }
        if let Some(control) = self.control.take() {
            control.stop();
        }
        self.client = None;
        self.real = Self::empty_real();
    }
    pub fn begin(&mut self) -> Result<u64, DiagnosticError> {
        if self.pending.is_some() {
            return Err(DiagnosticError::Busy);
        }
        self.next += 1;
        self.pending = Some(self.next);
        Ok(self.next)
    }
    pub fn is_current(&self, generation: u64, id: u64) -> bool {
        self.generation == generation && self.pending == Some(id) && !self.demo.snapshot().demo
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.interrupt();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupt_rejects_old_work_even_after_reconnect() {
        let mut service = Service::new(DemoSession::default());
        let id = service.begin().unwrap();
        let generation = service.generation;
        assert_eq!(service.begin(), Err(DiagnosticError::Busy));
        service.interrupt();
        let new_id = service.begin().unwrap();
        assert!(!service.is_current(generation, id));
        assert!(service.is_current(service.generation, new_id));
        assert_eq!(
            service.validate(generation),
            Err(DiagnosticError::StaleOperation)
        );
        assert!(service.real.reading.is_none());
    }
}
