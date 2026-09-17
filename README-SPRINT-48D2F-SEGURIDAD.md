# Sprint 48D-2F — Usuarios y seguridad híbrida

Alcance:
- Usuario tenant EDGE <-> CLOUD por `globalId`.
- Rol de restaurante identificado por `clave` estable.
- Permisos de rol CLOUD -> EDGE usando códigos de permiso; el catálogo global de permisos no se replica.
- Hash bcrypt de contraseña sincronizado, nunca contraseña en texto plano.
- `activo=false` converge y el `JwtStrategy` existente vuelve inválida la sesión en la siguiente petición del nodo sincronizado.
- Conflicto de correo (mismo email con distinto `globalId`) se rechaza; no se pisa silenciosamente.
- Roles/permisos son CLOUD-authoritative en modo híbrido: un EDGE no puede editar permisos de rol durante una partición.
- Usuarios de alcance restaurante (`sucursalId=null`) se administran desde CLOUD; usuarios operativos de sucursal sí pueden nacer en EDGE y sincronizar.

No requiere migración Prisma.

Prueba:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-sync-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d2f.ps1
```

Cierre esperado: `SIGR SYNC 48D-2F OK`.
