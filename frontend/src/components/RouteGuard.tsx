import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { hasAnyPermission } from "../lib/access";
import { useApp } from "../store/app";
import { EmptyState } from "./AsyncState";

export function RouteGuard({
  children,
  permission,
  anyPermissions,
  capability,
  branchRequired = false,
}: {
  children: ReactNode;
  permission?: string;
  anyPermissions?: readonly string[];
  capability?: string;
  branchRequired?: boolean;
}) {
  const location = useLocation();
  const { session, hasPermission, hasCapability, branchId, branchesLoading } = useApp();
  if (
    !hasPermission(permission) ||
    !hasAnyPermission(session?.user, anyPermissions) ||
    !hasCapability(capability)
  ) {
    return <Navigate to="/acceso-denegado" replace state={{ from: location.pathname }} />;
  }
  if (branchRequired && !branchId && !branchesLoading) {
    return <EmptyState title="Selecciona una sucursal" detail="Esta operación necesita una sucursal dentro de tu alcance." />;
  }
  return children;
}
