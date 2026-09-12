import { render, screen, fireEvent } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";
import connectionStatus from "../tests/fixtures/connection-status.json";
import App from "./App";

function expectDisabledActions() {
  expect(screen.getByRole("button", { name: "Lire les codes" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Effacer les codes" }),
  ).toBeDisabled();
}

describe("diagnostic home", () => {
  it("keeps actions disabled while waiting for the desktop service", () => {
    mockIPC(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Vérification de la connexion",
    );
    expectDisabledActions();
  });

  it("shows the Rust contract and never invokes a diagnostic action", async () => {
    const ipc = vi.fn((command: string) => {
      if (command !== "get_connection_status")
        throw new Error(`Unexpected command: ${command}`);
      return connectionStatus;
    });
    mockIPC(ipc);
    render(<App />);
    expect(await screen.findByText("Aucun véhicule connecté")).toBeVisible();
    expectDisabledActions();
    fireEvent.click(screen.getByRole("button", { name: "Lire les codes" }));
    fireEvent.click(screen.getByRole("button", { name: "Effacer les codes" }));
    expect(ipc).toHaveBeenCalledTimes(1);
    expect(ipc).toHaveBeenCalledWith("get_connection_status", {});
  });

  it("reports an unavailable service without pretending to have checked a vehicle", async () => {
    mockIPC(() => {
      throw new Error("IPC unavailable");
    });
    render(<App />);
    expect(
      await screen.findByText("État de connexion indisponible"),
    ).toBeVisible();
    expectDisabledActions();
    expect(
      screen.queryByText("Aucun véhicule connecté"),
    ).not.toBeInTheDocument();
  });
});
