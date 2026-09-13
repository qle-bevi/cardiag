import { invoke } from "@tauri-apps/api/core";

export type Operation = "connect" | "read" | "clear";
export type Incident = "no_response" | "connection_interrupted";
export const errorText = {
  driver_unavailable:
    "Pilote J2534 absent ou impossible à charger. Installez le pilote du fabricant.",
  cable_unavailable:
    "Câble inaccessible. Vérifiez son branchement USB et au véhicule.",
  unsupported_profile: "Le pilote refuse le profil CAN proposé.",
  invalid_response:
    "Réponse OBD invalide. Reconnectez le véhicule avant de réessayer.",
  operation_unsupported:
    "Cette opération matérielle n’est pas prise en charge.",
  helper_unavailable:
    "Le service J2534 auxiliaire est absent ou ne peut pas démarrer.",
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
export type TroubleCode = {
  code: string;
  description: string;
  status?: "stored" | "pending";
  source?: string;
};
export type HardwareInfo = {
  available: boolean;
  interface: string | null;
  profile: string | null;
  partial: boolean;
  issues: string[];
};
export type HardwareInterface = {
  id: string;
  name: string;
  architecture: "x86" | "x64";
};
export type HardwareAction =
  { type: "connect"; interface_id: string } | { type: "read" | "disconnect" };
export type Session = {
  hardware?: HardwareInfo;
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
    !(
      value.hardware === undefined ||
      (record(value.hardware) &&
        typeof value.hardware.available === "boolean" &&
        [value.hardware.interface, value.hardware.profile].every(
          (v) => v === null || typeof v === "string",
        ) &&
        typeof value.hardware.partial === "boolean" &&
        Array.isArray(value.hardware.issues) &&
        value.hardware.issues.every((v) => typeof v === "string"))
    ) ||
    !(value.error === null || isDiagnosticError(value.error)) ||
    !(
      value.reading === null ||
      (Array.isArray(value.reading) &&
        value.reading.every(
          (code) =>
            record(code) &&
            typeof code.code === "string" &&
            typeof code.description === "string" &&
            (code.status === undefined ||
              code.status === "stored" ||
              code.status === "pending") &&
            (code.source === undefined || typeof code.source === "string"),
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

export async function listHardwareInterfaces(): Promise<HardwareInterface[]> {
  const value: unknown = await invoke("list_hardware_interfaces");
  if (
    !Array.isArray(value) ||
    !value.every(
      (v) =>
        record(v) &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        ["x86", "x64"].includes(v.architecture as string),
    )
  )
    throw new Error("Contrat des interfaces invalide");
  return value as HardwareInterface[];
}
export async function runHardwareAction(
  action: HardwareAction,
  generation: number,
): Promise<Session> {
  return parseSession(
    await invoke("run_hardware_action", { action, generation }),
  );
}
export function diagnosticErrorText(
  error: DiagnosticError,
  demo: boolean,
): string {
  if (demo) return errorText[error];
  const hardwareText: Partial<Record<DiagnosticError, string>> = {
    not_connected: "Connectez le véhicule avant cette opération.",
    no_response:
      "Aucune réponse OBD reçue. Vérifiez le branchement et le contact ; le profil proposé reste à confirmer.",
    connection_interrupted:
      "Communication interrompue ou délai dépassé. Reconnectez le véhicule.",
    confirmation_required: "L’effacement matériel n’est pas disponible.",
  };
  return hardwareText[error] ?? errorText[error];
}
