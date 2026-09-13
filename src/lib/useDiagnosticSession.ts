import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSession,
  getDemoAvailable,
  runDemoAction,
  runHardwareAction,
  diagnosticErrorText,
  type HardwareAction,
  errorText,
  isDiagnosticError,
  type Action,
  type Session,
} from "./diagnostics";

export function useDiagnosticSession() {
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<string | null>("initial");
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const current = useRef<Session | null>(null);
  const pending = useRef<string | null>("initial");
  const version = useRef(0);

  const accept = useCallback((next: Session) => {
    current.current = next;
    setSession(next);
    setAvailable(true);
    setError(next.error ? diagnosticErrorText(next.error, next.demo) : null);
  }, []);

  useEffect(() => {
    const request = ++version.current;
    Promise.all([getSession(), getDemoAvailable()])
      .then(
        ([next, allowed]) => {
          if (request === version.current) {
            setDemoAvailable(allowed);
            accept(next);
          }
        },
        () => {
          if (request === version.current)
            setError(errorText.service_unavailable);
        },
      )
      .finally(() => {
        if (request === version.current) {
          pending.current = null;
          setBusy(null);
        }
      });
    return () => {
      version.current++;
    };
  }, [accept]);

  const run = async (action: Action | HardwareAction) => {
    const state = current.current;
    const interrupt = [
      "disconnect",
      "reset",
      "deactivate",
      "activate",
    ].includes(action.type);
    if (
      !state ||
      !available ||
      (state.demo && !demoAvailable) ||
      (pending.current &&
        !(interrupt && ["connect", "read", "clear"].includes(pending.current)))
    )
      return;
    const request = ++version.current;
    pending.current = action.type;
    setBusy(action.type);
    setError(null);
    if (interrupt)
      setSession({
        ...state,
        connected: false,
        reading: null,
        cleared: false,
        operation: null,
      });
    try {
      const demoAction = state.demo || action.type === "activate";
      if (demoAction && !demoAvailable) return;
      const next = demoAction
        ? await runDemoAction(action as Action, state.generation)
        : await runHardwareAction(action as HardwareAction, state.generation);
      if (request === version.current) accept(next);
    } catch (cause) {
      if (request !== version.current) return;
      // A rejected request may follow a service-side change. Reconcile before enabling actions.
      try {
        const next = await getSession();
        if (request === version.current) {
          accept(next);
          setError(
            isDiagnosticError(cause)
              ? diagnosticErrorText(cause, state.demo)
              : errorText.service_unavailable,
          );
        }
      } catch {
        if (request === version.current) {
          setSession({
            ...state,
            connected: false,
            reading: null,
            cleared: false,
            operation: null,
          });
          setAvailable(false);
          setError(errorText.service_unavailable);
        }
      }
    } finally {
      if (request === version.current) {
        pending.current = null;
        setBusy(null);
      }
    }
  };
  return { session, busy, error, available, demoAvailable, run };
}
