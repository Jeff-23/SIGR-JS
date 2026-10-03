import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";

type Turn = { id: number; nombre: string; orden: number };
type TurnState = { turnoOperativoActivoId: number | null; turnos: Turn[] };

export function OperationalTurnSelector({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [state, setState] = useState<TurnState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<TurnState>("/usuarios/me/turnos-operativos")
      .then(({ data }) => { if (active) setState(data); })
      .catch(() => { /* usuarios sin configuración siguen usando la carta de respaldo */ });
    return () => { active = false; };
  }, []);

  if (!state?.turnos.length) return null;
  const activeId = state.turnoOperativoActivoId ?? state.turnos[0]?.id ?? null;
  const current = state.turnos.find((turn) => turn.id === activeId) ?? state.turnos[0];

  if (state.turnos.length === 1) {
    return (
      <span className="inline-flex items-center rounded-full bg-denim/5 px-3 py-2 text-xs font-black uppercase tracking-wide">
        Turno activo: {current?.nombre}
      </span>
    );
  }

  return (
    <label className="flex min-w-[250px] flex-col gap-1 rounded-2xl border border-marigold/50 bg-marigold/10 px-3 py-2 text-sm font-bold shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-denim/55">Turno operativo</span>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-black">Turno activo</span>
        <select
          aria-label="Cambiar turno operativo activo"
          title="Puedes cambiar entre los turnos que el administrador te permitió"
          className="input h-9 min-w-32 flex-1 py-1"
        value={String(activeId ?? "")}
        disabled={busy}
          onChange={async (event) => {
            const turnoOperativoId = Number(event.target.value);
            setBusy(true);
            try {
              await api.patch("/usuarios/me/turno-operativo", { turnoOperativoId });
              setState((currentState) => currentState ? { ...currentState, turnoOperativoActivoId: turnoOperativoId } : currentState);
              await onChanged?.();
              toast.success(`Turno cambiado a ${state.turnos.find((turn) => turn.id === turnoOperativoId)?.nombre ?? "seleccionado"}`);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {state.turnos.map((turn) => <option key={turn.id} value={turn.id}>{turn.nombre}</option>)}
        </select>
      </div>
      <span className="text-[10px] font-semibold text-denim/45">Puedes cambiarlo sin ayuda del administrador.</span>
    </label>
  );
}
