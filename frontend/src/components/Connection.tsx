import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useApp } from "../store/app";
export function Connection() {
  const { online, pendingCount } = useApp();
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-900"}`}
    >
      {online ? <Wifi size={14} /> : <CloudOff size={14} />}
      {online ? (
        pendingCount ? (
          <>
            <RefreshCw size={13} className="animate-spin" /> Sincronizando{" "}
            {pendingCount}
          </>
        ) : (
          "En línea"
        )
      ) : (
        `Modo local · ${pendingCount} pendientes`
      )}
    </div>
  );
}
