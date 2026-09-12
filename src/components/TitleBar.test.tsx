import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "./TitleBar";

const mocks = vi.hoisted(() => ({
  desktop: true,
  resize: undefined as (() => void) | undefined,
  stop: vi.fn(),
  window: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
    startResizeDragging: vi.fn(),
    isMaximized: vi.fn(),
    onResized: vi.fn(),
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mocks.desktop }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.window,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.desktop = true;
  mocks.window.isMaximized.mockResolvedValue(false);
  mocks.window.startResizeDragging.mockResolvedValue(undefined);
  mocks.window.onResized.mockImplementation(async (callback: () => void) => {
    mocks.resize = callback;
    return mocks.stop;
  });
});
describe("commandes de fenêtre", () => {
  it("masque les commandes natives dans le navigateur", () => {
    mocks.desktop = false;
    render(<TitleBar demo={false} connected={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocks.window.isMaximized).not.toHaveBeenCalled();
  });
  it("réduit, agrandit et ferme via Tauri sans démarrer de déplacement", async () => {
    render(<TitleBar demo connected />);
    fireEvent.click(screen.getByRole("button", { name: "Réduire la fenêtre" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Agrandir la fenêtre" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Fermer l’application" }),
    );
    await waitFor(() => expect(mocks.window.close).toHaveBeenCalledOnce());
    expect(mocks.window.minimize).toHaveBeenCalledOnce();
    expect(mocks.window.toggleMaximize).toHaveBeenCalledOnce();
    expect(mocks.window.startDragging).not.toHaveBeenCalled();
  });
  it("déplace uniquement depuis la zone dédiée et agrandit au double-clic", async () => {
    render(<TitleBar demo={false} connected={false} />);
    const region = screen.getByText("ESPACE DIAGNOSTIC").parentElement!;
    fireEvent.mouseDown(region, { button: 2, detail: 1 });
    expect(mocks.window.startDragging).not.toHaveBeenCalled();
    fireEvent.mouseDown(region, { button: 0, detail: 1 });
    fireEvent.mouseDown(region, { button: 0, detail: 2 });
    await waitFor(() =>
      expect(mocks.window.toggleMaximize).toHaveBeenCalledOnce(),
    );
    expect(mocks.window.startDragging).toHaveBeenCalledOnce();
  });
  it("synchronise le bouton restaurer et libère l’écoute au démontage", async () => {
    const view = render(<TitleBar demo={false} connected={false} />);
    await waitFor(() => expect(mocks.window.onResized).toHaveBeenCalledOnce());
    mocks.window.isMaximized.mockResolvedValue(true);
    await act(async () => mocks.resize?.());
    expect(
      screen.getByRole("button", { name: "Restaurer la fenêtre" }),
    ).toBeVisible();
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("redimensionne par les bords et retire les poignées en mode agrandi", async () => {
    const view = render(<TitleBar demo={false} connected={false} />);
    const edge = view.container.querySelector(".resize-SouthEast")!;
    fireEvent.mouseDown(edge, { button: 2 });
    expect(mocks.window.startResizeDragging).not.toHaveBeenCalled();
    fireEvent.mouseDown(edge, { button: 0 });
    expect(mocks.window.startResizeDragging).toHaveBeenCalledWith("SouthEast");
    mocks.window.isMaximized.mockResolvedValue(true);
    await act(async () => mocks.resize?.());
    expect(
      view.container.querySelector(".resize-handle"),
    ).not.toBeInTheDocument();
  });
  it("rend visible un échec de commande", async () => {
    mocks.window.close.mockRejectedValue(new Error("denied"));
    render(<TitleBar demo={false} connected={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Fermer l’application" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Commande de fenêtre indisponible",
    );
  });
});
