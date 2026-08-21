# Sprint 21 — Contrato de sesión frontend

Se añadió `GET /auth/sesion`, protegido por JWT, para devolver el contexto recalculado por cada solicitud: rol, tenant, sucursal, permisos, capacidades y nombres de contexto. Esto permite que el frontend refleje cambios administrativos sin emitir un JWT nuevo.

El endpoint no recibe identificadores de tenant ni sucursal desde el cliente y conserva las validaciones de usuario, restaurante, sucursal y plan presentes en `JwtStrategy`.
