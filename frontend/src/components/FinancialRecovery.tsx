import { useEffect, useState } from "react";
import { confirmedPost, readAttempt } from "../lib/confirmed-operation";
import { errorMessage } from "../lib/api";

export function FinancialRecovery({
  scope,
  onRecovered,
}: {
  scope: string;
  onRecovered: (result: unknown) => Promise<void>;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    window.addEventListener("sigr:financial-attempt", update);
    return () => window.removeEventListener("sigr:financial-attempt", update);
  }, []);
  void revision;
  let attempt;
  try {
    attempt = readAttempt(scope);
  } catch {
    return (
      <p role="alert">
        Hay un intento local ilegible. No repitas operaciones financieras hasta
        revisarlo.
      </p>
    );
  }
  if (!attempt) return null;
  return (
    <section
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <h2 className="font-bold">Operación pendiente de confirmación</h2>
      <p>
        No la registres de nuevo. Recuperaremos el resultado usando su misma
        clave, sin duplicarla.
      </p>
      <p className="text-sm">
        {attempt.path} · Referencia {attempt.id}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="secondary mt-3 w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await confirmedPost(scope);
            await onRecovered(result);
          } catch (failure) {
            setError(errorMessage(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirmar resultado pendiente
      </button>
    </section>
  );
}
