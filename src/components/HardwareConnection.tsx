import { useEffect, useState, useRef } from "react";
import {
  listHardwareInterfaces,
  type HardwareInterface,
  type HardwareAction,
  type Session,
} from "../lib/diagnostics";

export function HardwareConnection({
  session,
  busy,
  onAction,
}: {
  session: Session;
  busy: string | null;
  onAction: (action: HardwareAction) => void;
}) {
  const [interfaces, setInterfaces] = useState<HardwareInterface[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = async () => {
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listHardwareInterfaces();
      if (request !== version.current) return;
      setInterfaces(next);
      setSelected((previous) =>
        next.some((i) => i.id === previous)
          ? previous
          : next.length === 1
            ? next[0].id
            : "",
      );
    } catch {
      if (request === version.current)
        setError("Impossible de rechercher les interfaces J2534.");
    } finally {
      if (request === version.current) setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    return () => {
      version.current++;
    };
  }, []);
  if (session.connected || busy === "connect" || busy === "read")
    return (
      <div className="hardware-controls">
        <span>
          {session.hardware?.interface}
          {session.hardware?.profile && (
            <small>{session.hardware.profile}</small>
          )}
        </span>
        <button
          className="button-secondary"
          onClick={() => onAction({ type: "disconnect" })}
        >
          Déconnecter
        </button>
      </div>
    );
  return (
    <div className="hardware-controls">
      <label htmlFor="hardware-interface">Interface J2534</label>
      <select
        id="hardware-interface"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={loading || !!busy}
      >
        <option value="">
          {loading
            ? "Recherche…"
            : interfaces.length
              ? "Choisir une interface"
              : "Aucun pilote installé"}
        </option>
        {interfaces.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.architecture})
          </option>
        ))}
      </select>
      <button
        className="button-secondary"
        disabled={loading || !!busy}
        onClick={() => void refresh()}
      >
        Actualiser
      </button>
      <button
        className="button-primary"
        disabled={!selected || loading || !!busy}
        onClick={() => onAction({ type: "connect", interface_id: selected })}
      >
        Connecter le véhicule
      </button>
      {error && <span role="alert">{error}</span>}
      {!loading && !interfaces.length && !error && (
        <small>
          Installez le pilote J2534 fourni par Godiag, puis actualisez.
        </small>
      )}
    </div>
  );
}
