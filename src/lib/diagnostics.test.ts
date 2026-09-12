import { describe, expect, it } from "vitest";
import fixtures from "../../tests/fixtures/demo-session.json";
import { mockIPC } from "@tauri-apps/api/mocks";
import { getDemoAvailable, parseSession } from "./diagnostics";

describe("contrat IPC Rust/TypeScript", () => {
  it("accepte les états produits par Rust", () => {
    for (const [name, value] of Object.entries(fixtures)) {
      if (name !== "clearAction") expect(parseSession(value)).toEqual(value);
    }
  });
  it.each([
    null,
    {},
    { ...fixtures.initial, generation: -1 },
    { ...fixtures.initial, operation: "drive" },
    { ...fixtures.initial, reading: [{}] },
    { ...fixtures.initial, error: "unknown" },
    { ...fixtures.initial, incident: "unknown" },
  ])("rejette une réponse malformée : %j", (value) => {
    expect(() => parseSession(value)).toThrow("Contrat de session invalide");
  });
});

describe("disponibilité native de la démo", () => {
  it.each([true, false])("accepte la politique %s", async (value) => {
    mockIPC(() => value);
    await expect(getDemoAvailable()).resolves.toBe(value);
  });
  it.each([null, "true", 1, {}])(
    "rejette une politique malformée : %j",
    async (value) => {
      mockIPC(() => value);
      await expect(getDemoAvailable()).rejects.toThrow(
        "Contrat de disponibilité invalide",
      );
    },
  );
});
