import { StrictMode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
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
function service(demoAvailable = true) {
  let state = { ...initial };
  let erased = false;
  let next: Promise<Session> | null = null;
  const ipc = vi.fn((command: string, args: Record<string, unknown>) => {
    if (command === "get_demo_available") return demoAvailable;
    if (command === "get_session") return structuredClone(state);
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
    return structuredClone(state);
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
async function navigate(name: string) {
  fireEvent.click(
    within(screen.getByRole("navigation")).getByRole("button", { name }),
  );
}
async function click(name: string) {
  const demoControl = [
    "Réinitialiser le scénario",
    "Quitter le mode démo",
  ].includes(name);
  if (demoControl) await navigate("Démonstration");
  const target = await screen.findByRole("button", { name });
  await waitFor(() => expect(target).toBeEnabled());
  await act(async () => {
    fireEvent.click(target);
  });
  if (demoControl) await navigate("Moteur");
}
async function start() {
  await click("Activer le mode démo");
  await click("Connecter le véhicule simulé");
  await screen.findByText("Véhicule fictif connecté");
  await navigate("Moteur");
}
async function readCodes() {
  await navigate("Moteur");
  await click("Lire les codes");
  await screen.findByRole("button", { name: /DEMO-001/ });
}

describe("parcours de diagnostic simulé", () => {
  it("reste honnête hors démo et attend le service avant toute action", async () => {
    const pending = deferred<Session>();
    const ipc = vi.fn((command: string) =>
      command === "get_demo_available" ? true : pending.promise,
    );
    mockIPC(ipc);
    render(<App />);
    await navigate("Moteur");
    expect(screen.getByRole("status")).toHaveTextContent("Vérification");
    expect(
      screen.queryByRole("button", { name: "Activer le mode démo" }),
    ).not.toBeInTheDocument();
    expect(button("Lire les codes")).toBeDisabled();
    await act(async () => pending.resolve(initial));
    expect(
      await screen.findByText("Connexion matérielle non disponible"),
    ).toBeVisible();
    expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Effacer tous les codes moteur" }),
    ).not.toBeInTheDocument();
    expect(ipc).toHaveBeenCalledTimes(2);
    expect(ipc).toHaveBeenCalledWith("get_session", {});
    expect(ipc).toHaveBeenCalledWith("get_demo_available", {});
    expect(button("Activer le mode démo")).toBeEnabled();
  });

  it("active, connecte, lit, annule, confirme et relit après effacement", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    expect(screen.getByText("Mode démo · Tout est simulé")).toBeVisible();
    expect(screen.getByText("Aucune lecture effectuée")).toBeVisible();
    expect(button("Effacer tous les codes moteur")).toBeDisabled();
    await readCodes();
    expect(screen.getAllByText("Défaut fictif")).toHaveLength(3);
    await click("Effacer tous les codes moteur");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(button("Annuler")).toHaveFocus();
    fireEvent.keyDown(button("Annuler"), { key: "Tab", shiftKey: true });
    expect(button("Confirmer l’effacement simulé")).toHaveFocus();
    fireEvent.keyDown(button("Confirmer l’effacement simulé"), { key: "Tab" });
    expect(button("Annuler")).toHaveFocus();
    await click("Annuler");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button("Effacer tous les codes moteur")).toHaveFocus();
    expect(
      ipc.mock.calls.filter(
        ([, args]) => (args.action as Action)?.type === "clear",
      ),
    ).toHaveLength(0);
    await readCodes();
    await click("Effacer tous les codes moteur");
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
  }, 15_000);

  it("annule avec Échap sans commande d’effacement", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    await readCodes();
    await click("Effacer tous les codes moteur");
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
    expect(button("Effacer tous les codes moteur")).toBeDisabled();
    await navigate("Démonstration");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(button("Réinitialiser le scénario")).toBeEnabled();
    await navigate("Moteur");
    fireEvent.click(button("Lire les codes"));
    expect(
      ipc.mock.calls.filter(
        ([, args]) => (args.action as Action)?.type === "read",
      ),
    ).toHaveLength(1);
    expect(button("Déconnecter")).toBeEnabled();
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
      await navigate("Démonstration");
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
      await navigate("Moteur");
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
      await navigate("Démonstration");
      expect(screen.getByRole("combobox")).toHaveValue("");
      await navigate("Moteur");
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
    await click("Effacer tous les codes moteur");
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
    expect(screen.getByText("Mode démo · Tout est simulé")).toBeVisible();
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
    expect(
      screen.queryByRole("button", { name: "Activer le mode démo" }),
    ).not.toBeInTheDocument();
    await navigate("Moteur");
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

describe("navigation et détail des défauts", () => {
  it("ouvre les systèmes indisponibles sans diagnostic inventé ni perte de session", async () => {
    const { ipc } = service();
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Vue d’ensemble" }),
    ).toHaveAttribute("aria-current", "page");
    await start();
    await readCodes();
    const calls = ipc.mock.calls.length;
    for (const name of [
      "ABS / freinage",
      "Airbags",
      "Transmission",
      "Carrosserie",
    ]) {
      await navigate(name);
      expect(
        screen.getByText("Système non pris en charge actuellement"),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Lire les codes" }),
      ).not.toBeInTheDocument();
    }
    await navigate("Vue d’ensemble");
    expect(screen.getByText("3 défauts simulés")).toBeVisible();
    await navigate("Moteur");
    expect(screen.getByText("DEMO-001")).toBeVisible();
    expect(screen.getByText("Véhicule fictif connecté")).toBeVisible();
    expect(ipc.mock.calls).toHaveLength(calls);
  });
  it("affiche le détail sélectionné sans proposer d’effacement individuel", async () => {
    const { ipc } = service();
    render(<App />);
    await start();
    await readCodes();
    const code = screen.getByRole("button", { name: /DEMO-002/ });
    fireEvent.click(code);
    expect(code).toHaveAttribute("aria-pressed", "true");
    const detail = within(
      screen.getByRole("complementary", { name: "Détail du défaut" }),
    );
    expect(detail.getByRole("heading", { name: "DEMO-002" })).toBeVisible();
    expect(detail.queryByRole("button")).not.toBeInTheDocument();
    await click("Effacer tous les codes moteur");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "y compris ceux qui ne sont pas sélectionnés",
    );
    await click("Confirmer l’effacement simulé");
    await screen.findByText(/Effacement simulé réussi/);
    expect(detail.queryByText("DEMO-002")).not.toBeInTheDocument();
    expect(ipc).toHaveBeenCalledWith("run_demo_action", {
      action: fixtures.clearAction,
      generation: 1,
    });
  });
  it("retire le détail dès qu’une nouvelle lecture ou une déconnexion invalide sa source", async () => {
    service();
    render(<App />);
    await start();
    await readCodes();
    fireEvent.click(screen.getByRole("button", { name: /DEMO-001/ }));
    await readCodes();
    expect(
      screen.queryByRole("heading", { name: "DEMO-001" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /DEMO-001/ }));
    await click("Déconnecter");
    await screen.findByText("Véhicule fictif déconnecté");
    expect(
      screen.queryByRole("heading", { name: "DEMO-001" }),
    ).not.toBeInTheDocument();
  });
});

describe("interface de release", () => {
  it("masque tous les accès et mentions de démo dans chaque page", async () => {
    const { ipc } = service(false);
    render(<App />);
    expect(
      screen.queryByRole("button", { name: "Démonstration" }),
    ).not.toBeInTheDocument();
    await screen.findByText("Connexion matérielle non disponible");
    for (const name of [
      "Vue d’ensemble",
      "Moteur",
      "ABS / freinage",
      "Airbags",
      "Transmission",
      "Carrosserie",
    ]) {
      await navigate(name);
      expect(document.body).not.toHaveTextContent(
        /démo|démonstration|simulat|fictif|développement/i,
      );
      expect(
        screen.queryByRole("button", { name: "Activer le mode démo" }),
      ).not.toBeInTheDocument();
    }
    await navigate("Moteur");
    expect(button("Lire les codes")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Effacer tous les codes moteur" }),
    ).not.toBeInTheDocument();
    expect(
      ipc.mock.calls.some(([command]) => command === "run_demo_action"),
    ).toBe(false);
  });

  it("ne montre pas brièvement la démo pendant la lecture de la politique native", async () => {
    const policy = deferred<boolean>();
    mockIPC((command) =>
      command === "get_demo_available" ? policy.promise : initial,
    );
    render(<App />);
    expect(
      screen.queryByRole("button", { name: "Démonstration" }),
    ).not.toBeInTheDocument();
    await act(async () => policy.resolve(false));
    expect(
      screen.queryByRole("button", { name: "Démonstration" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/démo|démonstration/i);
  });
});
