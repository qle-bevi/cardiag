use cardiag_j2534::{driver::Driver, Command, Report, Request, Response, VERSION};
use diagnostic_core::DiagnosticError;
use std::io::{self, BufRead, Read, Write};
fn main() {
    let Some(path) = std::env::args_os().nth(1) else {
        std::process::exit(2);
    };
    let mut driver = Driver::load(std::path::Path::new(&path));
    let input = io::stdin();
    let mut reader = input.lock();
    loop {
        let mut line = String::new();
        // Bound requests; an invalid protocol closes the helper.
        if reader
            .by_ref()
            .take(65537)
            .read_line(&mut line)
            .unwrap_or(0)
            == 0
        {
            break;
        }
        if line.len() > 65536 {
            break;
        }
        let Ok(request) = serde_json::from_str::<Request>(&line) else {
            break;
        };
        if request.version != VERSION {
            break;
        }
        let closing = matches!(request.command, Command::Close {});
        let result = match driver.as_mut() {
            Err(error) => Err(*error),
            Ok(driver) => match request.command {
                Command::Connect {} => driver.connect().map(|()| Report::default()),
                Command::Read {} => driver.read_codes(),
                Command::Close {} => {
                    driver.shutdown();
                    Ok(Report::default())
                }
            },
        };
        let trace = driver.as_mut().map(|d| d.take_trace()).unwrap_or_default();
        let response = Response {
            trace,
            version: VERSION,
            id: request.id,
            result,
        };
        if serde_json::to_writer(io::stdout().lock(), &response).is_err() {
            break;
        }
        if writeln!(io::stdout())
            .and_then(|()| io::stdout().flush())
            .is_err()
        {
            break;
        }
        if closing || matches!(response.result, Err(DiagnosticError::ConnectionInterrupted)) {
            break;
        }
    }
}
