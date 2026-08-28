import type { Session } from "../types";

export type OperationScope = {
  actorId: number;
  tenantId: number | null;
  apiUrl: string;
};
export function operationScope(
  session: Session | null,
  apiUrl: string,
): OperationScope | null {
  return session && !session.demo
    ? { actorId: session.user.id, tenantId: session.user.restauranteId, apiUrl }
    : null;
}
export function sameScope(
  left: OperationScope | undefined | null,
  right: OperationScope | null,
) {
  return Boolean(
    left &&
    right &&
    left.actorId === right.actorId &&
    left.tenantId === right.tenantId &&
    left.apiUrl === right.apiUrl,
  );
}
// Only endpoints with server-side replay protection may be queued automatically.
export function mayQueue(method: string, path: string) {
  return method === "POST" && path === "/pedidos";
}
