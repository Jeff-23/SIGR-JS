import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import type { Command } from "../features/kds/contracts";
export function OperationsNotice() {
  const { session, branchId, hasPermission, hasCapability } = useApp();
  if (
    !branchId ||
    session?.demo ||
    !hasPermission("COMANDAS_VER") ||
    !hasCapability("KDS")
  )
    return null;
  return <Notice key={`${session?.user.id}:${branchId}`} branch={branchId} />;
}
function Notice({ branch }: { branch: number }) {
  const query = useResource<Command[]>(
    `/comandas?sucursalId=${branch}`,
    [],
    15000,
  );
  const [sound, setSound] = useState(false);
  const seen = useRef("");
  const audio = useRef<AudioContext | null>(null);
  const ready = query.data.filter((c) => c.estado === "LISTA");
  const pending = query.data.filter((c) => c.estado === "PENDIENTE");
  const signature = ready
    .map((c) => c.id)
    .sort((a, b) => a - b)
    .join(",");
  useEffect(() => {
    if (sound && signature && signature !== seen.current) {
      const ctx = audio.current;
      if (ctx) {
        const tone = ctx.createOscillator();
        const gain = ctx.createGain();
        tone.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.04;
        tone.frequency.value = 880;
        tone.start();
        tone.stop(ctx.currentTime + 0.2);
      }
    }
    seen.current = signature;
  }, [signature, sound]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  return (
    <aside
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm"
      aria-live="polite"
    >
      <strong>
        {query.error
          ? "No se pudo actualizar preparación"
          : `${ready.length} comandas listas · ${pending.length} nuevas`}
      </strong>
      <Link className="underline" to="/cocina">
        Ver preparación
      </Link>
      <button
        onClick={() => {
          if (!sound) {
            audio.current ??= new AudioContext();
            void audio.current.resume();
          }
          setSound(!sound);
        }}
      >
        {sound ? "Silenciar avisos" : "Activar aviso sonoro"}
      </button>
      <span className="text-xs">Actualización cada 15 s</span>
    </aside>
  );
}
