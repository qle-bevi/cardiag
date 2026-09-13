pub mod driver;
pub mod obd;
pub mod process;
pub mod registry;

use diagnostic_core::{DiagnosticError, TroubleCode};
use serde::{Deserialize, Serialize};

pub const PROFILE: &str = "ISO 15765 · CAN 11 bits · 500 kbit/s";
pub const VERSION: u32 = 1;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Connect {},
    Read {},
    Close {},
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub id: u64,
    pub command: Command,
}
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Report {
    pub codes: Vec<TroubleCode>,
    pub issues: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub trace: Vec<String>,
    pub version: u32,
    pub id: u64,
    pub result: Result<Report, DiagnosticError>,
}
