import { invoke } from "@tauri-apps/api/core";

/** Mirrors diagnostic_core::ConnectionStatus; verified with a shared fixture. */
export type ConnectionStatus = { state: "disconnected" };

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const status = await invoke<ConnectionStatus>("get_connection_status");
  if (!status || status.state !== "disconnected") {
    throw new Error("Unsupported connection status");
  }
  return status;
}
