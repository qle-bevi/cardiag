import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import fixtures from "../tests/fixtures/demo-session.json";
import {
  parseSession,
  type Session,
  type HardwareAction,
} from "./lib/diagnostics";
const initial: Session = {
  ...parseSession(fixtures.initial),
  hardware: {
    available: true,
    interface: null,
    profile: null,
    partial: false,
    issues: [],
  },
};
function harness(
  options: {
    partial?: boolean;
    empty?: boolean;
    missing?: boolean;
    error?: string;
  } = {},
) {
  let state = structuredClone(initial);
  let late: Promise<Session> | undefined;
  const ipc = vi.fn((command: string, args: Record<string, unknown>) => {
    if (command === "get_session") return structuredClone(state);
    if (command === "get_demo_available") return true;
    if (command === "list_hardware_interfaces")
      return options.missing
        ? []
        : [{ id: "x86:GD101", name: "Godiag GD101", architecture: "x86" }];
    if (command === "run_demo_action") {
      state = {
        ...parseSession(fixtures.initial),
        demo: true,
        generation: state.generation + 1,
      };
      return structuredClone(state);
    }
    expect(command).toBe("run_hardware_action");
    expect(args.generation).toBe(state.generation);
    const action = args.action as HardwareAction;
    if (action.type === "connect") {
      expect(action.interface_id).toBe("x86:GD101");
      state = {
        ...state,
        connected: true,
        hardware: {
          ...initial.hardware!,
          interface: "Godiag GD101",
          profile: "ISO 15765",
        },
      };
    }
    if (action.type === "read") {
      if (late) return late;
      if (options.error) {
        state = {
          ...state,
          connected: false,
          error: options.error as Session["error"],
        };
        return structuredClone(state);
      }
      state = {
        ...state,
        reading: options.empty
          ? []
          : [
              {
                code: "P0133",
                description: "Description non disponible",
                source: "0x7E8",
                status: "stored",
              },
              {
                code: "P0133",
                description: "Description non disponible",
                source: "0x7E9",
                status: "pending",
              },
            ],
        hardware: {
          ...state.hardware!,
          partial: !!options.partial,
          issues: options.partial ? ["Service 07 sans réponse"] : [],
        },
      };
    }
    if (action.type === "disconnect")
      state = { ...structuredClone(initial), generation: state.generation + 1 };
    return structuredClone(state);
  });
  mockIPC((command, args) => ipc(command, args as Record<string, unknown>));
  return {
    ipc,
    delay: (promise: Promise<Session>) => {
      late = promise;
    },
  };
}
async function connect() {
  await waitFor(
    () =>
      expect(
        screen.getByRole("button", { name: "Connecter le véhicule" }),
      ).toBeEnabled(),
    { timeout: 3000 },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connecter le véhicule" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Véhicule connecté"),
  );
  fireEvent.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "Moteur",
    }),
  );
}
async function read() {
  fireEvent.click(screen.getByRole("button", { name: "Lire les codes" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Lire les codes" }),
    ).toBeEnabled(),
  );
}
describe("lecture matérielle", () => {
  vi.setConfig({ testTimeout: 10000 });
  it("découvre le pilote et conserve la source et le statut de chaque défaut", async () => {
    const service = harness();
    render(<App />);
    await connect();
    await read();
    const rows = screen.getAllByRole("button", { name: /P0133/ });
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(rows[0]).toHaveAttribute("aria-pressed", "false");
    expect(rows[1]).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("complementary")).getByText("Calculateur 0x7E9"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Défaut simulé")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Effacer/ }),
    ).not.toBeInTheDocument();
    expect(
      service.ipc.mock.calls
        .filter((c) => c[0] === "run_hardware_action")
        .map((c) => (c[1].action as HardwareAction).type),
    ).toEqual(["connect", "read"]);
  });
  it("explique l’absence de pilote sans permettre la connexion", async () => {
    harness({ missing: true });
    render(<App />);
    await screen.findByText(/Installez le pilote J2534/);
    expect(
      screen.getByRole("button", { name: "Connecter le véhicule" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await screen.findByText(/Installez le pilote J2534/);
  });
  it.each([true, false])(
    "distingue une lecture vide partielle (%s) d’un résultat complet",
    async (partial) => {
      harness({ partial, empty: true });
      render(<App />);
      await connect();
      await read();
      expect(
        screen.getByText(
          partial
            ? "Lecture incomplète — absence de défaut non confirmée"
            : "Aucun défaut OBD relevé",
        ),
      ).toBeInTheDocument();
      if (partial)
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Service 07 sans réponse",
        );
    },
  );
  it("affiche une interruption réelle sans message de simulation", async () => {
    harness({ error: "connection_interrupted" });
    render(<App />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Lire les codes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Communication interrompue",
    );
    expect(
      screen.queryByText("Aucun défaut OBD relevé"),
    ).not.toBeInTheDocument();
  });
  it.each(["disconnect", "activate"])(
    "rejette une réponse tardive après %s",
    async (action) => {
      const service = harness();
      let resolve!: (value: Session) => void;
      service.delay(
        new Promise((r) => {
          resolve = r;
        }),
      );
      render(<App />);
      await connect();
      fireEvent.click(screen.getByRole("button", { name: "Lire les codes" }));
      expect(
        screen.getByRole("button", { name: "Lire les codes" }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", {
          name:
            action === "disconnect" ? "Déconnecter" : "Activer le mode démo",
        }),
      );
      await screen.findByText(
        action === "disconnect"
          ? "Véhicule déconnecté"
          : "Véhicule fictif déconnecté",
      );
      await act(async () =>
        resolve({
          ...initial,
          connected: true,
          reading: [
            {
              code: "P0999",
              description: "Tardif",
              source: "0x7E8",
              status: "stored",
            },
          ],
        }),
      );
      expect(screen.queryByText("P0999")).not.toBeInTheDocument();
    },
  );
});
