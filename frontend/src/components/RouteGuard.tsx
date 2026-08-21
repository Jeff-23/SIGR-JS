import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../store/app";
import { EmptyState } from "./AsyncState";

export function RouteGuard({ children, permission, capability, branchRequired = false }: { children: ReactNode; permission?: string; capability?: string; branchRequired?: boolean }) {
  const location = useLocation();
  const { hasPermission, hasCapability, branchId, branchesLoading } = useApp();
  if (!hasPermission(permission) || !hasCapability(capability)) return <Navigate to="/acceso-denegado" replace state={{ from: location.pathname }} />;
  if (branchRequired && !branchId && !branchesLoading) return <EmptyState title="Selecciona una sucursal" detail="Esta operación necesita una sucursal dentro de tu alcance." />;
  return children;
}
