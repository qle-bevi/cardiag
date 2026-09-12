import { useEffect, useState } from "react";
import { getConnectionStatus } from "./lib/diagnostics";
import "./App.css";

type Status = "loading" | "disconnected" | "unavailable";

const statusText: Record<Status, string> = {
  loading: "Vérification de la connexion…",
  disconnected: "Aucun véhicule connecté",
  unavailable: "État de connexion indisponible",
};

function App() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    getConnectionStatus().then(
      (connection) => {
        if (active) setStatus(connection.state);
      },
      () => {
        if (active) setStatus("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, []);

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
        <span className="version-badge">Version de développement</span>
      </header>

      <main id="main">
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
              {statusText[status]}
            </h2>
            <p className="muted">
              {status === "unavailable"
                ? "Service de diagnostic inaccessible. Ouvrez ou relancez l’application de bureau."
                : "La prise en charge du câble sera ajoutée dans une prochaine étape."}
            </p>
          </div>
          <span className="status-pill">
            <span />
            Hors ligne
          </span>
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
            <span className="subtle-tag">Diagnostic non effectué</span>
          </div>
          <div className="empty-state">
            <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect x="9" y="6" width="30" height="36" rx="5" />
              <path d="M16 16H32M16 24H25M16 32H29" />
            </svg>
            <h3>Le diagnostic commence ici</h3>
            <p>
              Les codes relevés sur votre véhicule apparaîtront dans cet espace
              après une lecture.
            </p>
          </div>
          <div className="diagnostic-actions">
            <p id="actions-help">
              Lecture et effacement disponibles après l’intégration du câble.
            </p>
            <div className="buttons">
              <button
                className="button-primary"
                disabled
                aria-describedby="actions-help"
              >
                Lire les codes
              </button>
              <button
                className="button-secondary"
                disabled
                aria-describedby="actions-help"
              >
                Effacer les codes
              </button>
            </div>
          </div>
        </section>

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
