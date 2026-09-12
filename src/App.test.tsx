import { StrictMode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../tests/fixtures/demo-session.json";
import { parseSession, type Action, type Session } from "./lib/diagnostics";
import App from "./App";

const initial = parseSession(fixtures.initial);
const read = parseSession(fixtures.read);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// IPC harness: the Rust simulator is tested separately against the same fixtures.
function service() {
  let state = { ...initial };
  let erased = false;
  let next: Promise<Session> | null = null;
  const ipc = vi.fn((command: string, args: Record<string, unknown>) => {
    if (command === "get_session") return state;
    expect(command).toBe("run_demo_action");
    expect(args.generation).toBe(state.generation);
    const action = args.action as Action;
    if (["connect", "read", "clear"].includes(action.type) && next) {
      const response = next;
      next = null;
      return response;
    }
    switch (action.type) {
      case "activate":
        state = { ...initial, demo: true, generation: state.generation + 1 };
        erased = false;
        break;
      case "connect":
        state = { ...state, connected: true, error: null };
        break;
      case "read":
        state = {
          ...state,
          reading: erased ? [] : read.reading,
          cleared: false,
          error: null,
        };
        break;
      case "clear":
        expect(action.confirmed).toBe(true);
        erased = true;
        state = { ...state, reading: null, cleared: true };
        break;
      case "disconnect":
      case "reset":
      case "deactivate":
        state = {
          ...initial,
          demo: action.type !== "deactivate",
          generation: state.generation + 1,
        };
        if (action.type !== "disconnect") erased = false;
        break;
      case "arm_incident":
        state = { ...state, incident: action.incident };
        break;
    }
    return state;
  });
  mockIPC((command, args) => ipc(command, args as Record<string, unknown>));
  return {
    ipc,
    delay: (promise: Promise<Session>) => {
      next = promise;
    },
  };
}

function button(name: string) {
  return screen.getByRole("button", { name });
}
async function click(name: string) {
  await waitFor(() => expect(button(name)).toBeEnabled());
  fireEvent.click(button(name));
}
async function start() {
  await click("Activer le mode démo");
  await click("Connecter le véhicule simulé");
  await screen.findByText("Véhicule fictif connecté");
}
async function readCodes() {
  await click("Lire les codes");
  await screen.findByText("DEMO-001");
}

describe("parcours de diagnostic simulé", () => {
  it("reste honnête hors démo et attend le service avant toute action", async () => {
    const pending = deferred<Session>();
    const ipc = vi.fn(() => pending.promise);
    mockIPC(ipc);
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Vérification");
    expect(button("Activer le mode démo")).toBeDisabled();
    expect(button("Lire les codes")).toBeDisabled();
    await act(async () => pending.resolve(initial));
    expect(
      await screen.findByText("Connexion matérielle non disponible"),
    ).toBeVisible();
    expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
    expect(button("Effacer les codes")).toBeDisabled();
    expect(ipc).toHaveBeenCalledExactlyOnceWith("get_session", {});
  });

  it("active, connecte, lit, annule, confirme et relit après effacement", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    expect(screen.getByText(/Mode démo — toutes les données/)).toBeVisible();
    expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
    expect(button("Effacer les codes")).toBeDisabled();
    await readCodes();
    expect(screen.getAllByText("Défaut fictif")).toHaveLength(3);
    await click("Effacer les codes");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(button("Annuler")).toHaveFocus();
    await click("Annuler");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button("Effacer les codes")).toHaveFocus();
    expect(
      ipc.mock.calls.filter(
        ([, args]) => (args.action as Action)?.type === "clear",
      ),
    ).toHaveLength(0);
    await readCodes();
    await click("Effacer les codes");
    await click("Confirmer l’effacement simulé");
    expect(await screen.findByText(/Effacement simulé réussi/)).toBeVisible();
    expect(
      screen.queryByText("Aucun défaut relevé dans le véhicule simulé"),
    ).not.toBeInTheDocument();
    expect(ipc).toHaveBeenCalledWith("run_demo_action", {
      action: fixtures.clearAction,
      generation: 1,
    });
    await click("Lire les codes");
    expect(
      await screen.findByText("Aucun défaut relevé dans le véhicule simulé"),
    ).toBeVisible();
    await click("Déconnecter");
    await click("Connecter le véhicule simulé");
    await click("Lire les codes");
    expect(
      await screen.findByText("Aucun défaut relevé dans le véhicule simulé"),
    ).toBeVisible();
    await click("Réinitialiser le scénario");
    expect(await screen.findByText("Véhicule fictif déconnecté")).toBeVisible();
    await click("Connecter le véhicule simulé");
    await readCodes();
    await click("Quitter le mode démo");
    expect(
      await screen.findByText("Connexion matérielle non disponible"),
    ).toBeVisible();
    expect(screen.queryByText("DEMO-001")).not.toBeInTheDocument();
  });

  it("annule avec Échap sans commande d’effacement", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    await readCodes();
    await click("Effacer les codes");
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("DEMO-001")).toBeVisible();
    expect(
      ipc.mock.calls.some(
        ([, args]) => (args.action as Action)?.type === "clear",
      ),
    ).toBe(false);
  });

  it("bloque les doubles clics et les actions concurrentes pendant les chargements", async () => {
    const { delay, ipc } = service();
    render(<App />);
    await start();
    const pending = deferred<Session>();
    delay(pending.promise);
    await click("Lire les codes");
    expect(screen.getByText("Lecture des défauts simulés…")).toBeVisible();
    expect(button("Lire les codes")).toBeDisabled();
    expect(button("Effacer les codes")).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    fireEvent.click(button("Lire les codes"));
    expect(
      ipc.mock.calls.filter(
        ([, args]) => (args.action as Action)?.type === "read",
      ),
    ).toHaveLength(1);
    expect(button("Déconnecter")).toBeEnabled();
    expect(button("Réinitialiser le scénario")).toBeEnabled();
    await act(async () => pending.resolve(read));
    expect(screen.getByText("DEMO-001")).toBeVisible();
  });

  it.each(["no_response", "connection_interrupted"] as const)(
    "affiche l’incident %s sans faux résultat vide",
    async (incident) => {
      const { delay, ipc } = service();
      render(<App />);
      await start();
      await readCodes();
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: incident },
      });
      await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
      expect(ipc).toHaveBeenCalledWith("run_demo_action", {
        action: { type: "arm_incident", incident },
        generation: 1,
      });
      delay(
        Promise.resolve({
          ...read,
          reading: null,
          connected: incident === "no_response",
          error: incident,
          incident: null,
        }),
      );
      await click("Lire les codes");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        incident === "no_response"
          ? "Absence de réponse simulée"
          : "Connexion simulée interrompue",
      );
      expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
      expect(
        screen.queryByText("Aucun défaut relevé dans le véhicule simulé"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveValue("");
      if (incident === "connection_interrupted")
        await click("Connecter le véhicule simulé");
      await readCodes();
    },
  );

  it.each([
    ["Déconnecter", false],
    ["Réinitialiser le scénario", false],
    ["Quitter le mode démo", false],
    ["Déconnecter", true],
    ["Réinitialiser le scénario", true],
    ["Quitter le mode démo", true],
  ] as const)(
    "ignore une lecture obsolète après %s (rejet : %s)",
    async (control, reject) => {
      const { delay } = service();
      render(<App />);
      await start();
      const pending = deferred<Session>();
      delay(pending.promise);
      await click("Lire les codes");
      await click(control);
      await waitFor(() =>
        expect(
          button(
            control === "Quitter le mode démo"
              ? "Activer le mode démo"
              : "Connecter le véhicule simulé",
          ),
        ).toBeEnabled(),
      );
      await act(async () => {
        if (reject) pending.reject("no_response");
        else pending.resolve(read);
      });
      expect(screen.queryByText("DEMO-001")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Véhicule fictif connecté"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
    },
  );

  it("une ancienne réponse ne termine pas une nouvelle lecture", async () => {
    const { delay } = service();
    render(<App />);
    await start();
    const old = deferred<Session>();
    delay(old.promise);
    await click("Lire les codes");
    await click("Réinitialiser le scénario");
    await click("Connecter le véhicule simulé");
    const recent = deferred<Session>();
    delay(recent.promise);
    await click("Lire les codes");
    await act(async () => old.resolve(read));
    expect(screen.getByText("Lecture des défauts simulés…")).toBeVisible();
    expect(button("Lire les codes")).toBeDisabled();
    await act(async () => recent.resolve({ ...read, generation: 2 }));
    expect(screen.getByText("DEMO-001")).toBeVisible();
  });

  it("ignore une connexion annulée et un effacement après réinitialisation", async () => {
    const { delay } = service();
    render(<App />);
    await click("Activer le mode démo");
    const connection = deferred<Session>();
    delay(connection.promise);
    await click("Connecter le véhicule simulé");
    expect(screen.getByText("Connexion simulée en cours…")).toBeVisible();
    await click("Déconnecter");
    await act(async () => connection.resolve({ ...read, reading: null }));
    expect(
      screen.queryByText("Véhicule fictif connecté"),
    ).not.toBeInTheDocument();
    await click("Connecter le véhicule simulé");
    await readCodes();
    const clear = deferred<Session>();
    delay(clear.promise);
    await click("Effacer les codes");
    await click("Confirmer l’effacement simulé");
    expect(screen.getByText("Effacement simulé en cours…")).toBeVisible();
    await click("Réinitialiser le scénario");
    await act(async () => clear.resolve(parseSession(fixtures.cleared)));
    expect(
      screen.queryByText(/Effacement simulé réussi/),
    ).not.toBeInTheDocument();
    await click("Connecter le véhicule simulé");
    await readCodes();
  });

  it("garde la bannière démo si le service disparaît", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    ipc.mockImplementation(() => {
      throw new Error("IPC indisponible");
    });
    await click("Lire les codes");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service de diagnostic inaccessible",
    );
    expect(screen.getByText(/Mode démo — toutes les données/)).toBeVisible();
    expect(button("Lire les codes")).toBeDisabled();
  });

  it("signale le service absent dans un navigateur", async () => {
    mockIPC(() => {
      throw new Error("IPC indisponible");
    });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service de diagnostic inaccessible",
    );
    expect(button("Activer le mode démo")).toBeDisabled();
    expect(button("Lire les codes")).toBeDisabled();
  });

  it("supporte StrictMode et ignore les réponses après démontage", async () => {
    service();
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await start();
    view.unmount();
    const pending = deferred<Session>();
    mockIPC(() => pending.promise);
    const other = render(<App />);
    other.unmount();
    await act(async () => pending.resolve(read));
    expect(screen.queryByText("DEMO-001")).not.toBeInTheDocument();
  });
});
