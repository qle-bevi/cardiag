use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interface {
    pub id: String,
    pub name: String,
    pub architecture: String,
}
#[derive(Debug, Clone)]
pub struct Installed {
    pub interface: Interface,
    pub path: PathBuf,
}

pub fn discover() -> Vec<Installed> {
    #[cfg(windows)]
    {
        use winreg::{enums::*, RegKey};
        let root = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut found = Vec::new();
        for (flag, architecture) in [(KEY_WOW64_32KEY, "x86"), (KEY_WOW64_64KEY, "x64")] {
            let Ok(key) =
                root.open_subkey_with_flags("SOFTWARE\\PassThruSupport.04.04", KEY_READ | flag)
            else {
                continue;
            };
            for name in key.enum_keys().flatten() {
                let Ok(entry) = key.open_subkey_with_flags(&name, KEY_READ | flag) else {
                    continue;
                };
                let Ok(path) = entry.get_value::<String, _>("FunctionLibrary") else {
                    continue;
                };
                let path = PathBuf::from(path);
                if !path.is_absolute() {
                    continue;
                }
                let architecture = dll_architecture(&path).unwrap_or(architecture);
                let display = entry
                    .get_value::<String, _>("Name")
                    .unwrap_or_else(|_| name.clone());
                found.push(Installed {
                    interface: Interface {
                        id: format!("{architecture}:{name}"),
                        name: display,
                        architecture: architecture.into(),
                    },
                    path,
                });
            }
        }
        found.sort_by(|a, b| a.interface.id.cmp(&b.interface.id));
        found.dedup_by(|a, b| a.interface.id == b.interface.id);
        found
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Read the PE machine field; registry view alone does not guarantee DLL bitness.
#[cfg(any(windows, test))]
fn dll_architecture(path: &std::path::Path) -> Option<&'static str> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let mut dos = [0u8; 64];
    file.read_exact(&mut dos).ok()?;
    if &dos[..2] != b"MZ" {
        return None;
    }
    let offset = u32::from_le_bytes(dos[60..64].try_into().ok()?);
    file.seek(SeekFrom::Start(offset as u64)).ok()?;
    let mut pe = [0u8; 6];
    file.read_exact(&mut pe).ok()?;
    if &pe[..4] != b"PE\0\0" {
        return None;
    }
    match u16::from_le_bytes([pe[4], pe[5]]) {
        0x14c => Some("x86"),
        0x8664 => Some("x64"),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_pe_machine_independently_of_registry_view() {
        let path = std::env::temp_dir().join(format!("cardiag-pe-{}.dll", std::process::id()));
        for (machine, expected) in [
            (0x14cu16, Some("x86")),
            (0x8664, Some("x64")),
            (0xaa64, None),
        ] {
            let mut data = vec![0; 70];
            data[..2].copy_from_slice(b"MZ");
            data[60..64].copy_from_slice(&64u32.to_le_bytes());
            data[64..68].copy_from_slice(b"PE\0\0");
            data[68..70].copy_from_slice(&machine.to_le_bytes());
            std::fs::write(&path, data).unwrap();
            assert_eq!(dll_architecture(&path), expected);
        }
        std::fs::remove_file(path).unwrap();
    }
}
