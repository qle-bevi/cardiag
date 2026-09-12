import { describe, expect, it } from "vitest";
import fixtures from "../../tests/fixtures/demo-session.json";
import { parseSession } from "./diagnostics";

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
