import { useEffect, useRef, useState } from "react";
import {
  type Action,
  type Incident,
  type HardwareAction,
} from "./lib/diagnostics";
import { useDiagnosticSession } from "./lib/useDiagnosticSession";
import { systems, type Page } from "./lib/systems";
import { Icon } from "./components/Icon";
import { TitleBar } from "./components/TitleBar";
import { VehicleIllustration } from "./components/VehicleIllustration";
import { Diagnostics, ConfirmClear } from "./components/Diagnostics";
import "./App.css";
import { HardwareConnection } from "./components/HardwareConnection";

function App() {
  const { session, busy, error, available, demoAvailable, run } =
    useDiagnosticSession();
  const [page, setPage] = useState<Page>("overview");
  const [confirming, setConfirming] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const pageHeading = useRef<HTMLElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirming) {
      if (clearButton.current && !clearButton.current.disabled)
        clearButton.current.focus();
      else pageHeading.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);
  const demo = demoAvailable && (session?.demo ?? false);
  const hardwareAvailable = session?.hardware?.available ?? false;
  const visibleSystems = systems.map((item) =>
    item.id === "engine" && hardwareAvailable
      ? { ...item, availability: "hardware" as const }
      : demoAvailable
        ? item
        : { ...item, availability: "unavailable" as const },
  );
  const connected = session?.connected ?? false;
  const interruptible =
    available && (!busy || ["connect", "read", "clear"].includes(busy));
  const ready =
    available &&
    (demo || hardwareAvailable) &&
    connected &&
    !busy &&
    !session?.operation;
  const act = (action: Action | HardwareAction) => {
    setConfirming(false);
    void run(action);
  };
  const navigate = (next: Page) => {
    setPage(next);
    pageHeading.current?.scrollTo?.({ top: 0 });
    pageHeading.current?.focus();
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
          ? hardwareAvailable
            ? busy === "connect"
              ? "Connexion au véhicule en cours…"
              : connected
                ? "Véhicule connecté"
                : "Véhicule déconnecté"
            : "Connexion matérielle non disponible"
          : busy === "connect"
            ? "Connexion simulée en cours…"
            : connected
              ? "Véhicule fictif connecté"
              : "Véhicule fictif déconnecté";
  const reading = session?.reading;
  const readingSummary =
    busy === "read"
      ? "Lecture en cours…"
      : busy === "clear"
        ? "Effacement en cours…"
        : reading
          ? `${reading.length} défaut${reading.length > 1 ? "s" : ""}${demo ? ` simulé${reading.length > 1 ? "s" : ""}` : ""}${session?.hardware?.partial ? " · lecture partielle" : ""}`
          : session?.cleared
            ? "Relecture nécessaire"
            : "Aucune lecture effectuée";
  const system = systems.find((item) => item.id === page);
  const activate = demoAvailable && (
    <button
      className="button-primary"
      disabled={!available || (!!busy && !["connect", "read"].includes(busy))}
      onClick={() => act({ type: "activate" })}
    >
      <Icon name="flask" />
      Activer le mode démo
    </button>
  );

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <TitleBar demo={demo} connected={connected} />
      <div className="app-body">
        <nav className="sidebar" aria-label="Navigation principale">
          <div>
            <p className="nav-label">ESPACE DE TRAVAIL</p>
            <button
              className={`nav-item ${page === "overview" ? "active" : ""}`}
              aria-current={page === "overview" ? "page" : undefined}
              aria-label="Vue d’ensemble"
              title="Vue d’ensemble"
              onClick={() => navigate("overview")}
            >
              <Icon name="grid" />
              <span>Vue d’ensemble</span>
            </button>
            <p className="nav-label system-label">SYSTÈMES DU VÉHICULE</p>
            {visibleSystems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                aria-current={page === item.id ? "page" : undefined}
                aria-label={item.label}
                title={`${item.label}${item.availability === "unavailable" ? " · Non disponible" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.availability === "unavailable" ? (
                  <span className="nav-unavailable" aria-hidden="true">
                    —
                  </span>
                ) : (
                  <span className="nav-indicator" />
                )}
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            {demoAvailable && (
              <button
                className={`nav-item ${page === "demo" ? "active" : ""}`}
                aria-current={page === "demo" ? "page" : undefined}
                aria-label="Démonstration"
                title="Démonstration"
                onClick={() => navigate("demo")}
              >
                <Icon name="flask" />
                <span>Démonstration</span>
              </button>
            )}
            <div className="local-note">
              <Icon name="shield" />
              <div>
                Votre diagnostic, en local.
                <small>Sans compte. Sans télémétrie.</small>
              </div>
            </div>
            <div className="sidebar-version">
              <span>CARDIAG</span>
              <span>v0.1{demoAvailable ? " · Développement" : ""}</span>
            </div>
          </div>
        </nav>
        <div className="workspace">
          <section
            className="connection-strip"
            aria-label="Connexion au véhicule"
          >
            <span
              className={`connection-symbol ${connected ? "connected" : ""}`}
            >
              <Icon name="plug" />
            </span>
            <div className="connection-text">
              <span className="micro-label">
                {demo ? "SIMULATEUR LOCAL" : "CONNEXION AU VÉHICULE"}
              </span>
              <p role="status" aria-live="polite">
                {status}
              </p>
            </div>
            {demo ? (
              <div className="buttons">
                {(!connected || busy === "connect") && (
                  <button
                    className="button-secondary"
                    disabled={!available || !!busy || confirming}
                    onClick={() => act({ type: "connect" })}
                  >
                    Connecter le véhicule simulé
                    <Icon name="arrow" />
                  </button>
                )}
                {(connected || busy === "connect") && (
                  <button
                    className="button-secondary"
                    disabled={!interruptible}
                    onClick={() => act({ type: "disconnect" })}
                  >
                    Déconnecter
                  </button>
                )}
              </div>
            ) : hardwareAvailable && session ? (
              <HardwareConnection
                session={session}
                busy={busy}
                onAction={act}
              />
            ) : (
              <span className="connection-hint">
                Aucun matériel pris en charge pour le moment
              </span>
            )}
          </section>
          <main id="main" ref={pageHeading} tabIndex={-1}>
            {error && (
              <p className="error-message" role="alert">
                <Icon name="alert" />
                {error}
              </p>
            )}
            {page === "overview" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">VOTRE ESPACE DIAGNOSTIC</p>
                    <h1>
                      Vue d’ensemble<span className="heading-dot">.</span>
                    </h1>
                    <p className="lead">
                      Un regard précis sur les systèmes de votre véhicule.
                    </p>
                  </div>
                  <span className="tag">Application locale</span>
                </div>
                <section
                  className="vehicle-card"
                  aria-labelledby="vehicle-title"
                >
                  <div className="vehicle-copy">
                    <span className="tag">
                      <span className={`status-dot ${demo ? "online" : ""}`} />
                      {demo
                        ? "ENVIRONNEMENT SIMULÉ"
                        : "PRÊT POUR L’EXPLORATION"}
                    </span>
                    <h2 id="vehicle-title">
                      {demo
                        ? "Véhicule de démonstration"
                        : "Votre prochain diagnostic commence ici."}
                    </h2>
                    <p>
                      {demo
                        ? "Explorez le diagnostic moteur avec un véhicule fictif, sans câble ni matériel."
                        : "Retrouvez les systèmes du véhicule dans un espace pensé pour aller à l’essentiel."}
                    </p>
                    {demo ? (
                      <button
                        className="button-primary"
                        onClick={() => navigate("engine")}
                      >
                        Ouvrir le diagnostic moteur
                        <Icon name="arrow" />
                      </button>
                    ) : demoAvailable ? (
                      activate
                    ) : (
                      <button
                        className="button-primary"
                        onClick={() => navigate("engine")}
                      >
                        Ouvrir le diagnostic moteur
                        <Icon name="arrow" />
                      </button>
                    )}
                  </div>
                  <VehicleIllustration />
                  <span className="illustration-caption">
                    ILLUSTRATION · VÉHICULE GÉNÉRIQUE
                  </span>
                </section>
                <div className="overview-stats">
                  <div>
                    <span className="micro-label">SESSION</span>
                    <strong>
                      {demo
                        ? "Démonstration"
                        : connected
                          ? "Véhicule connecté"
                          : "Non démarrée"}
                    </strong>
                    <span>
                      {demo
                        ? "Toutes les opérations sont simulées"
                        : hardwareAvailable
                          ? "Lecture OBD/EOBD · GD101"
                          : demoAvailable
                            ? "Activez la démo pour explorer"
                            : "Aucun véhicule connecté"}
                    </span>
                  </div>
                  <div>
                    <span className="micro-label">DIAGNOSTIC MOTEUR</span>
                    <strong className={reading?.length ? "text-warning" : ""}>
                      {readingSummary}
                    </strong>
                    <span>
                      {reading
                        ? demo
                          ? "Résultat du simulateur"
                          : "Défauts OBD/EOBD · sources identifiées"
                        : "Aucun résultat matériel"}
                    </span>
                  </div>
                  <div>
                    <span className="micro-label">DISPONIBILITÉ</span>
                    <strong>
                      {hardwareAvailable
                        ? "Lecture moteur sous Windows"
                        : demoAvailable
                          ? "Moteur en démo"
                          : "Connexion matérielle à venir"}
                    </strong>
                    <span>Autres systèmes à venir</span>
                  </div>
                </div>
                <div className="section-heading">
                  <h2>Systèmes du véhicule</h2>
                  <span>Choisissez un système pour l’explorer</span>
                </div>
                <div className="system-grid">
                  {visibleSystems.map((item) => (
                    <button
                      key={item.id}
                      className={`system-card ${item.availability !== "unavailable" ? "supported" : ""}`}
                      onClick={() => navigate(item.id)}
                    >
                      <span className="system-icon">
                        <Icon name={item.icon} />
                      </span>
                      <span className="system-card-text">
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </span>
                      <span
                        className={`system-availability ${item.availability !== "unavailable" ? "text-cyan" : ""}`}
                      >
                        {item.availability === "hardware"
                          ? "Lecture OBD/EOBD"
                          : item.availability === "demo"
                            ? "Disponible en démo"
                            : "Non disponible"}
                      </span>
                      <Icon name="chevron" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {page === "engine" && demoAvailable && !demo && (
              <div className="engine-demo-prompt">
                <p>Explorez le diagnostic avec un véhicule fictif.</p>
                {activate}
              </div>
            )}
            {page === "engine" && (
              <Diagnostics
                demoAvailable={demoAvailable}
                session={session}
                busy={busy}
                ready={ready}
                confirming={confirming}
                onRead={() => act({ type: "read" })}
                onClear={() => setConfirming(true)}
                clearButton={clearButton}
              />
            )}
            {system?.availability === "unavailable" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">SYSTÈMES DU VÉHICULE</p>
                    <h1>
                      {system.label}
                      <span className="heading-dot">.</span>
                    </h1>
                    <p className="lead">{system.description}</p>
                  </div>
                  <span className="tag">Non disponible</span>
                </div>
                <section className="panel unavailable-state">
                  <span className="empty-icon">
                    <Icon name={system.icon} />
                  </span>
                  <h2>Système non pris en charge actuellement</h2>
                  <p>
                    La lecture et l’effacement des défauts de ce système ne sont
                    pas encore disponibles. Aucun diagnostic n’a été effectué.
                  </p>
                  <button
                    className="button-secondary"
                    onClick={() => navigate("engine")}
                  >
                    {demoAvailable
                      ? "Explorer le moteur en démo"
                      : "Ouvrir le diagnostic moteur"}
                    <Icon name="arrow" />
                  </button>
                </section>
              </>
            )}
            {demoAvailable && page === "demo" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">ENVIRONNEMENT DE TEST</p>
                    <h1>
                      Démonstration<span className="heading-dot">.</span>
                    </h1>
                    <p className="lead">
                      Prenez l’outil en main, sans connecter de véhicule.
                    </p>
                  </div>
                  <span className={`tag ${demo ? "text-cyan" : ""}`}>
                    {demo ? "Démo active" : "Démo inactive"}
                  </span>
                </div>
                <section className="panel demo-panel" aria-label="Mode démo">
                  <span className="empty-icon">
                    <Icon name="flask" />
                  </span>
                  <h2>
                    {demo
                      ? "Un espace pour tout essayer."
                      : "Découvrez le parcours de diagnostic."}
                  </h2>
                  <p className="demo-banner">
                    {demo
                      ? "Mode démo — toutes les données et opérations sont simulées"
                      : "Un véhicule fictif, trois défauts moteur et un parcours complet de lecture et d’effacement."}
                  </p>
                  <p className="muted">
                    Aucun lien avec votre Octavia. Aucun câble nécessaire. Le
                    scénario reste en mémoire jusqu’à la fermeture de
                    l’application.
                  </p>
                  {!demo ? (
                    activate
                  ) : (
                    <div className="buttons">
                      <button
                        className="button-primary"
                        onClick={() => navigate("engine")}
                      >
                        Ouvrir le diagnostic moteur
                        <Icon name="arrow" />
                      </button>
                      <button
                        className="button-secondary"
                        disabled={!interruptible}
                        onClick={() => act({ type: "deactivate" })}
                      >
                        Quitter le mode démo
                      </button>
                    </div>
                  )}
                </section>
                {demo && (
                  <section className="panel simulation-settings">
                    <div className="panel-heading">
                      <h2>Contrôles du simulateur</h2>
                      <Icon name="flask" />
                    </div>
                    <div className="setting-row">
                      <div>
                        <label htmlFor="incident">
                          Incident à la prochaine opération
                        </label>
                        <p>
                          Testez la gestion d’une absence de réponse ou d’une
                          déconnexion.
                        </p>
                      </div>
                      <select
                        id="incident"
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
                    </div>
                    <div className="setting-row">
                      <div>
                        <h3>Recommencer le scénario</h3>
                        <p>
                          Restaure les trois défauts fictifs et déconnecte le
                          simulateur.
                        </p>
                      </div>
                      <button
                        className="button-secondary"
                        disabled={!interruptible}
                        onClick={() => act({ type: "reset" })}
                      >
                        Réinitialiser le scénario
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
            <footer className="app-footer">
              <span>
                <span className="status-dot online" />
                Application locale · Sans compte
              </span>
              <span>
                {demo
                  ? "Données et opérations simulées"
                  : "Cardiag · Diagnostic automobile"}
              </span>
            </footer>
          </main>
        </div>
      </div>
      {confirming && (
        <ConfirmClear
          onCancel={cancelClear}
          onConfirm={() => act({ type: "clear", confirmed: true })}
        />
      )}
    </div>
  );
}
export default App;
