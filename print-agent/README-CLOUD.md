# Print Agent con SIGR Cloud

El agente continúa escuchando únicamente en `127.0.0.1:38475`. Para permitir que la PWA servida por el dominio cloud lo invoque, configura una lista explícita de orígenes:

```powershell
$env:SIGR_PRINT_ALLOWED_ORIGINS="https://app.ejemplo-sigr.com"
npm start
```

Se pueden indicar varios orígenes separados por coma. Los orígenes locales/LAN que ya aceptaba el agente se conservan. No uses `*` y no cambies el host del agente a `0.0.0.0`.

Antes de la instalación comercial se certificará en el navegador real de Caja el acceso HTTPS de SIGR Cloud al agente loopback y la impresión física.
