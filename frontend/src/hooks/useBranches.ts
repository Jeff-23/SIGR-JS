import { useEffect } from "react";
import { api } from "../lib/api";
import { useApp } from "../store/app";

type ApiBranch = { id: number; nombre: string; direccion?: string | null; ciudad?: string | null; estado?: boolean };

export function useBranches() {
  const { session, setBranches, setBranchesLoading } = useApp();
  useEffect(() => {
    if (!session || session.demo) return;
    if (!session.user.permisos.includes("SUCURSALES_VER")) {
      if (session.user.sucursalId) setBranches([{ id: session.user.sucursalId, name: session.user.sucursalNombre ?? `Sucursal ${session.user.sucursalId}`, location: "Sucursal asignada", active: true }]);
      return;
    }
    let active = true;
    setBranchesLoading(true);
    api.get<ApiBranch[]>("/sucursales").then(({ data }) => {
      if (active) setBranches(data.map((branch) => ({ id: branch.id, name: branch.nombre, location: [branch.ciudad, branch.direccion].filter(Boolean).join(" · ") || "Sin ubicación", active: branch.estado })));
    }).catch(() => { if (active && session.user.sucursalId) setBranches([{ id: session.user.sucursalId, name: session.user.sucursalNombre ?? `Sucursal ${session.user.sucursalId}`, location: "Sucursal asignada" }]); })
      .finally(() => { if (active) setBranchesLoading(false); });
    return () => { active = false; };
  }, [session, setBranches, setBranchesLoading]);
}
