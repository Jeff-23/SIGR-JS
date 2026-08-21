import { useEffect } from "react";
import { api } from "../lib/api";
import { useApp } from "../store/app";

type DynamicSession = { rol: string; restauranteId: number | null; sucursalId: number | null; permisos: string[]; capacidades: string[]; restauranteNombre?: string; sucursalNombre?: string };

export function useSessionContext() {
  const session = useApp((state) => state.session);
  const setSession = useApp((state) => state.setSession);
  const token = session?.token;
  const demo = session?.demo;
  useEffect(() => {
    if (!token || demo) return;
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get<DynamicSession>("/auth/sesion");
        if (!active) return;
        const current = useApp.getState().session;
        if (!current || current.demo) return;
        const unchanged = current.user.rol === data.rol && current.user.restauranteId === data.restauranteId && current.user.sucursalId === data.sucursalId && current.user.restauranteNombre === data.restauranteNombre && current.user.sucursalNombre === data.sucursalNombre && current.user.permisos.join("|") === data.permisos.join("|") && current.user.capacidades.join("|") === data.capacidades.join("|");
        if (unchanged) return;
        setSession({ ...current, user: { ...current.user, rol: data.rol, restauranteId: data.restauranteId, sucursalId: data.sucursalId, permisos: data.permisos, capacidades: data.capacidades, restauranteNombre: data.restauranteNombre, sucursalNombre: data.sucursalNombre } });
      } catch { /* El interceptor gestiona expiración y disponibilidad. */ }
    };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", visibility); void refresh();
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [demo, setSession, token]);
}
