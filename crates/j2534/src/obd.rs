use diagnostic_core::{DiagnosticError, TroubleCode};

/// Input is the ISO-TP payload, already reassembled by the J2534 driver.
/// ISO 15765 OBD responses carry a DTC count before the two-byte codes.
pub fn decode(
    service: u8,
    source: u32,
    payload: &[u8],
) -> Result<Vec<TroubleCode>, DiagnosticError> {
    if !matches!(service, 3 | 7) || payload.len() < 2 || payload[0] != service + 0x40 {
        return Err(DiagnosticError::InvalidResponse);
    }
    let count = payload[1] as usize;
    let end = 2 + count * 2;
    if payload.len() < end || payload[end..].iter().any(|b| *b != 0) {
        return Err(DiagnosticError::InvalidResponse);
    }
    let mut codes = Vec::new();
    for pair in payload[2..end].as_chunks::<2>().0 {
        if *pair == [0, 0] {
            return Err(DiagnosticError::InvalidResponse);
        }
        let letter = ['P', 'C', 'B', 'U'][(pair[0] >> 6) as usize];
        let code = format!(
            "{letter}{:01X}{:01X}{:02X}",
            (pair[0] >> 4) & 3,
            pair[0] & 15,
            pair[1]
        );
        let entry = TroubleCode {
            code,
            description: "Description non disponible".into(),
            status: Some(if service == 3 { "stored" } else { "pending" }.into()),
            source: Some(format!("0x{source:03X}")),
        };
        if !codes.contains(&entry) {
            codes.push(entry);
        }
    }
    Ok(codes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_status_source_and_all_code_families() {
        let codes = decode(
            3,
            0x7e8,
            &[0x43, 4, 0x01, 0x33, 0x52, 0x34, 0x81, 0x23, 0xc1, 0x00],
        )
        .unwrap();
        assert_eq!(
            codes.iter().map(|c| c.code.as_str()).collect::<Vec<_>>(),
            ["P0133", "C1234", "B0123", "U0100"]
        );
        assert_eq!(codes[0].source.as_deref(), Some("0x7E8"));
        assert_eq!(
            decode(7, 0x7e9, &[0x47, 1, 1, 0x33]).unwrap()[0]
                .status
                .as_deref(),
            Some("pending")
        );
    }
    #[test]
    fn validates_count_padding_and_service() {
        assert!(decode(3, 0x7e8, &[0x43, 0, 0, 0]).unwrap().is_empty());
        for payload in [
            vec![],
            vec![0x43],
            vec![0x43, 2, 1, 0x33],
            vec![0x43, 0, 1],
            vec![0x43, 1, 0, 0],
            vec![0x47, 0],
            vec![0x7f, 3, 0x11],
        ] {
            assert_eq!(
                decode(3, 0x7e8, &payload),
                Err(DiagnosticError::InvalidResponse)
            );
        }
    }
}
