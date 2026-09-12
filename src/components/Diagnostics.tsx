import { useEffect, useRef, useState } from "react";
import type { Session, TroubleCode } from "../lib/diagnostics";
import { Icon } from "./Icon";

// A future transport can supply an individual action only when it supports it.
// Selection alone must never narrow the scope of the current global clear command.
export type CodeAction = {
  label: string;
  disabled: boolean;
  onInvoke: () => void;
};
export function CodeDetail({
  code,
  action,
}: {
  code: TroubleCode | null;
  action?: CodeAction;
}) {
  return (
    <aside
      className={`code-detail ${code ? "has-selection" : ""}`}
      aria-label="Détail du défaut"
    >
      <div className="detail-heading">
        <Icon name="scan" />
        <span>DÉTAIL DU DÉFAUT</span>
      </div>
      {code ? (
        <>
          <span className="tag warning">Défaut simulé</span>
          <h2 className="detail-code">{code.code}</h2>
          <p className="detail-description">{code.description}</p>
          <dl>
            <div>
              <dt>Système</dt>
              <dd>Moteur</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Simulateur local</dd>
            </div>
            <div>
              <dt>Nature du code</dt>
              <dd>Fictif · non normalisé</dd>
            </div>
          </dl>
          <div className="detail-note">
            <Icon name="shield" />
            <p>
              Ce défaut appartient au véhicule fictif. Il ne constitue pas un
              diagnostic de votre véhicule.
            </p>
          </div>
          {action && (
            <button
              className="button-danger"
              disabled={action.disabled}
              onClick={action.onInvoke}
            >
              {action.label}
            </button>
          )}
        </>
      ) : (
        <div className="detail-empty">
          <Icon name="scan" />
          <h3>Chaque défaut, en détail.</h3>
          <p>
            Sélectionnez un code pour consulter les informations disponibles.
          </p>
        </div>
      )}
    </aside>
  );
}

export function Diagnostics({
  demoAvailable,
  session,
  busy,
  ready,
  confirming,
  onRead,
  onClear,
  clearButton,
}: {
  demoAvailable: boolean;
  session: Session | null;
  busy: string | null;
  ready: boolean;
  confirming: boolean;
  onRead: () => void;
  onClear: () => void;
  clearButton: React.RefObject<HTMLButtonElement | null>;
}) {
  const [selection, setSelection] = useState<{
    code: string;
    reading: TroubleCode[];
  } | null>(null);
  const reading = session?.reading;
  const selected =
    selection?.reading === reading
      ? (reading?.find((code) => code.code === selection?.code) ?? null)
      : null;
  const working = busy === "read" || busy === "clear";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYSTÈMES DU VÉHICULE / OBD-II · EOBD</p>
          <h1>
            Diagnostic moteur<span className="heading-dot">.</span>
          </h1>
          <p className="lead">Lisez les défauts. Comprenez chaque code.</p>
        </div>
      </div>
      <div className="diagnostic-toolbar">
        <span className="tag">
          <span className={`status-dot ${reading ? "online" : ""}`} />
          {reading ? "Lecture simulée effectuée" : "Diagnostic non effectué"}
        </span>
        <div className="buttons">
          <button
            className="button-danger"
            ref={clearButton}
            disabled={!ready || confirming || !reading?.length}
            onClick={onClear}
          >
            <Icon name="trash" />
            Effacer tous les codes moteur
          </button>
          <button
            className="button-primary"
            disabled={!ready || confirming}
            onClick={onRead}
          >
            <Icon name="scan" />
            Lire les codes
          </button>
        </div>
      </div>
      <div className="diagnostic-workspace">
        <section className="panel fault-panel" aria-labelledby="fault-title">
          <div className="panel-heading">
            <h2 id="fault-title">Codes de défaut</h2>
            <span className="count-badge">
              {working || !reading ? "—" : reading.length}
            </span>
          </div>
          <div className="results" aria-live="polite" aria-busy={working}>
            {working ? (
              <div className="empty-state">
                <span className="scanner">
                  <Icon name="scan" />
                </span>
                <h3>
                  {busy === "read"
                    ? "Lecture des défauts simulés…"
                    : "Effacement simulé en cours…"}
                </h3>
                <p>Communication avec le simulateur local.</p>
              </div>
            ) : reading?.length ? (
              <>
                <div className="list-labels">
                  <span>CODE / DESCRIPTION</span>
                  <span>ORIGINE</span>
                </div>
                <ul className="code-list">
                  {reading.map((code) => (
                    <li key={code.code}>
                      <button
                        className={`code-row ${selected?.code === code.code ? "selected" : ""}`}
                        aria-pressed={selected?.code === code.code}
                        onClick={() =>
                          setSelection({ code: code.code, reading })
                        }
                      >
                        <span className="fault-icon">
                          <Icon name="alert" />
                        </span>
                        <span className="code-summary">
                          <strong>{code.code}</strong>
                          <span>{code.description}</span>
                        </span>
                        <small>Défaut fictif</small>
                        <Icon name="chevron" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="empty-state">
                <span className={`empty-icon ${reading ? "success" : ""}`}>
                  <Icon name={reading ? "check" : "scan"} />
                </span>
                <h3>
                  {reading
                    ? "Aucun défaut relevé dans le véhicule simulé"
                    : session?.cleared
                      ? "Effacement simulé réussi — relisez les codes pour vérifier"
                      : "Aucune lecture effectuée"}
                </h3>
                <p>
                  {reading
                    ? "La dernière lecture du simulateur ne contient aucun code."
                    : session?.demo
                      ? "Les défauts fictifs apparaîtront ici après une lecture réussie."
                      : demoAvailable
                        ? "Activez le mode démo pour tester le parcours. La connexion matérielle n’est pas encore disponible."
                        : "La connexion matérielle n’est pas encore disponible."}
                </p>
              </div>
            )}
          </div>
          <div className="panel-footnote">
            <Icon name="shield" />
            {session?.demo
              ? "Toutes les lectures et tous les effacements sont simulés."
              : "Lecture et effacement matériels non disponibles."}
          </div>
        </section>
        <CodeDetail code={working ? null : selected} />
      </div>
      <p className="scope-note">
        L’effacement actuel concerne tous les codes moteur. L’effacement
        individuel dépendra des capacités du transport et du calculateur.
      </p>
    </>
  );
}

export function ConfirmClear({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && document.activeElement === cancel.current) {
          event.preventDefault();
          confirm.current?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === confirm.current
        ) {
          event.preventDefault();
          cancel.current?.focus();
        }
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <span className="empty-icon danger">
        <Icon name="trash" />
      </span>
      <p className="eyebrow">EFFACEMENT GLOBAL · SIMULATION</p>
      <h2 id="confirm-title">Effacer tous les codes moteur ?</h2>
      <p id="confirm-description">
        Cette opération supprime tous les défauts moteur du véhicule fictif, y
        compris ceux qui ne sont pas sélectionnés. Toutes les données et
        opérations sont simulées. Une nouvelle lecture sera nécessaire pour
        vérifier le résultat.
      </p>
      <div className="buttons">
        <button ref={cancel} className="button-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button
          ref={confirm}
          className="button-danger filled"
          onClick={onConfirm}
        >
          Confirmer l’effacement simulé
        </button>
      </div>
    </dialog>
  );
}
