export type AccessContext = { permisos: string[]; capacidades: string[] } | null | undefined;

export function hasPermission(context: AccessContext, permission?: string | null) {
  return !permission || Boolean(context?.permisos.includes(permission));
}

export function hasAnyPermission(context: AccessContext, permissions?: readonly string[] | null) {
  return !permissions?.length || permissions.some((permission) => hasPermission(context, permission));
}

export function hasCapability(context: AccessContext, capability?: string | null) {
  return !capability || Boolean(context?.capacidades.includes(capability));
}

export function canAccess(
  context: AccessContext,
  permission?: string | null,
  capability?: string | null,
  anyPermissions?: readonly string[] | null,
) {
  return (
    hasPermission(context, permission) &&
    hasAnyPermission(context, anyPermissions) &&
    hasCapability(context, capability)
  );
}
