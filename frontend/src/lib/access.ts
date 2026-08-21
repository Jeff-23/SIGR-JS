export type AccessContext = { permisos: string[]; capacidades: string[] } | null | undefined;
export function hasPermission(context: AccessContext, permission?: string | null) { return !permission || Boolean(context?.permisos.includes(permission)); }
export function hasCapability(context: AccessContext, capability?: string | null) { return !capability || Boolean(context?.capacidades.includes(capability)); }
export function canAccess(context: AccessContext, permission?: string | null, capability?: string | null) { return hasPermission(context, permission) && hasCapability(context, capability); }
