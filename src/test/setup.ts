import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  clearMocks();
});

// jsdom has no native modal implementation; the browser handles focus trapping/Escape.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
