import { invoke } from "@tauri-apps/api/core";

export type Operation = "connect" | "read" | "clear";
export type Incident = "no_response" | "connection_interrupted";
export const errorText = {
  hardware_unavailable: "La connexion matérielle n’est pas encore disponible.",
  not_connected: "Connectez le véhicule simulé avant cette opération.",
  busy: "Une opération est déjà en cours.",
  invalid_state: "Cette opération n’est pas disponible dans cet état.",
  confirmation_required: "L’effacement simulé nécessite une confirmation.",
  no_response: "Absence de réponse simulée. Vous pouvez réessayer.",
  connection_interrupted:
    "Connexion simulée interrompue. Reconnectez le véhicule fictif.",
  stale_operation: "La session a changé. Actualisez son état.",
  service_unavailable:
    "Service de diagnostic inaccessible. Ouvrez ou relancez l’application de bureau.",
} as const;
export type DiagnosticError = keyof typeof errorText;
export type TroubleCode = { code: string; description: string };
export type Session = {
  generation: number;
  demo: boolean;
  connected: boolean;
  operation: Operation | null;
  reading: TroubleCode[] | null;
  cleared: boolean;
  incident: Incident | null;
  error: DiagnosticError | null;
};
export type Action =
  | {
      type:
        "activate" | "deactivate" | "connect" | "disconnect" | "read" | "reset";
    }
  | { type: "clear"; confirmed: boolean }
  | { type: "arm_incident"; incident: Incident | null };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function isDiagnosticError(value: unknown): value is DiagnosticError {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(errorText, value)
  );
}
export function parseSession(value: unknown): Session {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 0 ||
    typeof value.demo !== "boolean" ||
    typeof value.connected !== "boolean" ||
    typeof value.cleared !== "boolean" ||
    ![null, "connect", "read", "clear"].some(
      (option) => option === value.operation,
    ) ||
    ![null, "no_response", "connection_interrupted"].some(
      (option) => option === value.incident,
    ) ||
    !(value.error === null || isDiagnosticError(value.error)) ||
    !(
      value.reading === null ||
      (Array.isArray(value.reading) &&
        value.reading.every(
          (code) =>
            record(code) &&
            typeof code.code === "string" &&
            typeof code.description === "string",
        ))
    )
  )
    throw new Error("Contrat de session invalide");
  return value as Session;
}
export async function getSession(): Promise<Session> {
  return parseSession(await invoke<unknown>("get_session"));
}
export async function runDemoAction(
  action: Action,
  generation: number,
): Promise<Session> {
  return parseSession(
    await invoke<unknown>("run_demo_action", { action, generation }),
  );
}

// The native build is authoritative: a Tauri debug build may use production Vite assets.
export async function getDemoAvailable(): Promise<boolean> {
  const value = await invoke<unknown>("get_demo_available");
  if (typeof value !== "boolean")
    throw new Error("Contrat de disponibilité invalide");
  return value;
}
