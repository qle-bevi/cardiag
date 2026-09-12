import { useEffect, useRef, useState } from "react";
import { type Action, type Incident } from "./lib/diagnostics";
import { useDiagnosticSession } from "./lib/useDiagnosticSession";
import "./App.css";

function ConfirmClear({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">Effacer les défauts simulés ?</h2>
      <p id="confirm-description">
        Cette opération supprime uniquement les défauts du véhicule fictif.
        Toutes les données et opérations sont simulées. Une nouvelle lecture
        sera nécessaire pour vérifier le résultat.
      </p>
      <div className="buttons">
        <button ref={cancel} className="button-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button className="button-primary" onClick={onConfirm}>
          Confirmer l’effacement simulé
        </button>
      </div>
    </dialog>
  );
}

function App() {
  const { session, busy, error, available, run } = useDiagnosticSession();
  const [confirming, setConfirming] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming) clearButton.current?.focus();
  }, [confirming]);
  const demo = session?.demo ?? false;
  const connected = session?.connected ?? false;
  const interruptible =
    available && (!busy || ["connect", "read", "clear"].includes(busy));
  const ready = available && demo && connected && !busy && !session?.operation;
  const act = (action: Action) => {
    setConfirming(false);
    void run(action);
  };
  const cancelClear = () => {
    setConfirming(false);
  };
  const status =
    busy === "initial"
      ? "Vérification de la connexion…"
      : !available
        ? "État de connexion indisponible"
        : !demo
          ? "Connexion matérielle non disponible"
          : busy === "connect"
            ? "Connexion simulée en cours…"
            : connected
              ? "Véhicule fictif connecté"
              : "Véhicule fictif déconnecté";

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#main" aria-label="Cardiag, accueil">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M5 21V15L8 8H24L27 15V21M5 15H27M9 21H23M9 21V25M23 21V25" />
            <path d="M9 18H12M20 18H23" />
          </svg>
          cardiag<span className="brand-dot">.</span>
        </a>
        <span className="version-badge">
          {demo ? "Mode démo · Tout est simulé" : "Version de développement"}
        </span>
      </header>

      <main id="main">
        <section className="demo-panel" aria-label="Mode démo">
          {demo ? (
            <>
              <strong className="demo-banner">
                Mode démo — toutes les données et opérations sont simulées
              </strong>
              <p>
                Véhicule fictif de démonstration · Aucun lien avec votre
                Octavia.
              </p>
              <div className="demo-controls">
                <button
                  disabled={!interruptible}
                  onClick={() => act({ type: "deactivate" })}
                >
                  Quitter le mode démo
                </button>
                <button
                  disabled={!interruptible}
                  onClick={() => act({ type: "reset" })}
                >
                  Réinitialiser le scénario
                </button>
                <label>
                  Incident à la prochaine opération
                  <select
                    disabled={!available || !!busy || confirming}
                    value={session?.incident ?? ""}
                    onChange={(event) =>
                      act({
                        type: "arm_incident",
                        incident: (event.target.value ||
                          null) as Incident | null,
                      })
                    }
                  >
                    <option value="">Aucun incident</option>
                    <option value="no_response">Absence de réponse</option>
                    <option value="connection_interrupted">
                      Connexion interrompue
                    </option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <p>Testez le parcours avec un véhicule fictif, sans câble.</p>
              <button
                className="button-primary"
                disabled={!available || !!busy}
                onClick={() => act({ type: "activate" })}
              >
                Activer le mode démo
              </button>
            </>
          )}
        </section>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="page-heading">
          <p className="eyebrow">VOTRE ESPACE DIAGNOSTIC</p>
          <h1>Comprendre votre véhicule.</h1>
          <p className="lead">
            Un point de départ pour lire et comprendre les défauts moteur.
          </p>
        </div>

        <section className="connection-card" aria-labelledby="connection-title">
          <div className="connection-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M8 3V7M16 3V7M6 7H18V11A6 6 0 0 1 6 11V7ZM12 17V22" />
            </svg>
          </div>
          <div>
            <p className="card-label" id="connection-title">
              Connexion au véhicule
            </p>
            <h2 role="status" aria-live="polite">
              {status}
            </h2>
            <p className="muted">
              {demo
                ? "Véhicule fictif de démonstration — connexion simulée."
                : "La prise en charge du câble sera ajoutée dans une prochaine étape."}
            </p>
          </div>
          <span className="status-pill">
            <span />
            {connected ? "En ligne · simulé" : "Hors ligne"}
          </span>
          {demo && (
            <div className="buttons">
              <button
                className="button-primary"
                disabled={!available || !!busy || connected || confirming}
                onClick={() => act({ type: "connect" })}
              >
                Connecter le véhicule simulé
              </button>
              <button
                className="button-secondary"
                disabled={!interruptible || (!connected && busy !== "connect")}
                onClick={() => act({ type: "disconnect" })}
              >
                Déconnecter
              </button>
            </div>
          )}
        </section>

        <section
          className="diagnostics-card"
          aria-labelledby="diagnostics-title"
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">OBD-II / EOBD</p>
              <h2 id="diagnostics-title">Codes de défaut moteur</h2>
            </div>
            <span className="subtle-tag">
              {session?.reading !== null && session?.reading !== undefined
                ? "Lecture simulée effectuée"
                : "Diagnostic non effectué"}
            </span>
          </div>
          <div
            className="results"
            aria-live="polite"
            aria-busy={busy === "read" || busy === "clear"}
          >
            {busy === "read" ? (
              <p>Lecture des défauts simulés…</p>
            ) : busy === "clear" ? (
              <p>Effacement simulé en cours…</p>
            ) : session?.reading ? (
              session.reading.length ? (
                <ul className="code-list">
                  {session.reading.map((code) => (
                    <li key={code.code}>
                      <strong>{code.code}</strong>
                      <span>{code.description}</span>
                      <small>Défaut fictif</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <h3>Aucun défaut relevé dans le véhicule simulé</h3>
              )
            ) : (
              <div className="empty-state">
                <h3>
                  {session?.cleared
                    ? "Effacement simulé réussi — relisez les codes pour vérifier"
                    : "Aucune lecture effectuée"}
                </h3>
                <p>
                  {demo
                    ? "Les défauts fictifs apparaîtront ici après une lecture réussie."
                    : "Activez le mode démo pour tester le parcours. La connexion matérielle n’est pas encore disponible."}
                </p>
              </div>
            )}
          </div>
          <div className="diagnostic-actions">
            <p id="actions-help">
              {demo
                ? "Toutes les lectures et tous les effacements sont simulés."
                : "Lecture et effacement matériels non disponibles."}
            </p>
            <div className="buttons">
              <button
                className="button-primary"
                disabled={!ready || confirming}
                aria-describedby="actions-help"
                onClick={() => act({ type: "read" })}
              >
                Lire les codes
              </button>
              <button
                className="button-secondary"
                ref={clearButton}
                onClick={() => setConfirming(true)}
                disabled={!ready || confirming || !session?.reading?.length}
                aria-describedby="actions-help"
              >
                Effacer les codes
              </button>
            </div>
          </div>
        </section>

        {confirming && (
          <ConfirmClear
            onCancel={cancelClear}
            onConfirm={() => act({ type: "clear", confirmed: true })}
          />
        )}
        <footer className="app-footer">
          <span>
            <span className="footer-dot" />
            Application locale · Sans compte
          </span>
          <span>Cardiag · Diagnostic automobile</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
