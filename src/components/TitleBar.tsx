import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";

const resizeDirections = [
  "North",
  "South",
  "East",
  "West",
  "NorthEast",
  "NorthWest",
  "SouthEast",
  "SouthWest",
] as const;

export function TitleBar({
  demo,
  connected,
}: {
  demo: boolean;
  connected: boolean;
}) {
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const window = getCurrentWindow();
    const sync = async () => {
      try {
        const value = await window.isMaximized();
        if (!disposed) setMaximized(value);
      } catch {
        if (!disposed)
          setError("Impossible de consulter l’état de la fenêtre.");
      }
    };
    void sync();
    void window
      .onResized(() => void sync())
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        if (!disposed) setError("Impossible de suivre l’état de la fenêtre.");
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);
  const control = async (
    action: "minimize" | "toggleMaximize" | "close" | "startDragging",
  ) => {
    if (!desktop) return;
    try {
      setError(null);
      await getCurrentWindow()[action]();
    } catch {
      setError(
        "Commande de fenêtre indisponible. Réessayez ou utilisez les commandes du système.",
      );
    }
  };
  return (
    <>
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="car" />
          </span>
          cardiag<span className="brand-dot">.</span>
        </div>
        <div
          className="titlebar-drag"
          onMouseDown={(event) => {
            if (event.button === 0)
              void control(
                event.detail === 2 ? "toggleMaximize" : "startDragging",
              );
          }}
        >
          <span>ESPACE DIAGNOSTIC</span>
        </div>
        <div className="titlebar-status">
          <span className={`status-dot ${connected ? "online" : ""}`} />
          {connected ? "Connecté · simulé" : "Hors ligne"}
        </div>
        {demo && (
          <span
            className="demo-badge"
            title="Mode démo — toutes les données et opérations sont simulées"
          >
            Mode démo · Tout est simulé
          </span>
        )}
        {desktop && (
          <div className="window-controls">
            <button
              aria-label="Réduire la fenêtre"
              title="Réduire"
              onClick={() => void control("minimize")}
            >
              <Icon name="minus" />
            </button>
            <button
              aria-label={
                maximized ? "Restaurer la fenêtre" : "Agrandir la fenêtre"
              }
              title={maximized ? "Restaurer" : "Agrandir"}
              onClick={() => void control("toggleMaximize")}
            >
              <Icon name={maximized ? "restore" : "maximize"} />
            </button>
            <button
              className="window-close"
              aria-label="Fermer l’application"
              title="Fermer"
              onClick={() => void control("close")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
      </header>
      {desktop &&
        !maximized &&
        resizeDirections.map((direction) => (
          <div
            key={direction}
            className={`resize-handle resize-${direction}`}
            aria-hidden="true"
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              void getCurrentWindow()
                .startResizeDragging(direction)
                .catch(() => {
                  setError(
                    "Impossible de redimensionner la fenêtre. Réessayez.",
                  );
                });
            }}
          />
        ))}
      {error && (
        <div className="window-error" role="alert">
          {error}
          <button
            aria-label="Masquer l’erreur de fenêtre"
            onClick={() => setError(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
