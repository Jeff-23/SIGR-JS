# Agente de impresión de SIGR (piloto Windows)

Agente local para impresoras térmicas instaladas en Windows. Se enlaza únicamente a `127.0.0.1:38475` y permite a SIGR consultar impresoras y enviar una comanda de texto a la cola local.

## Arranque manual

```powershell
cd print-agent
npm start
```

## Inicio automático al iniciar sesión

Ejecutar PowerShell en el directorio `print-agent`:

```powershell
.\install-startup.ps1
```

Para retirar el inicio automático:

```powershell
.\uninstall-startup.ps1
```

## Alcance actual

- Windows 10/11.
- Impresoras instaladas en Windows (USB, red o serie si el driver crea una cola de impresión).
- Prevalidación de estado de la impresora.
- El trabajo sólo se reporta como completado cuando no queda retenido en la cola; si excede el tiempo límite, se cancela para evitar que salga tarde al encender la impresora.
- El agente no sustituye el backend de SIGR ni expone la impresora a Internet.

La selección de impresora se guarda localmente en el navegador del PC, por sucursal y estación, porque es configuración de hardware de ese puesto de trabajo.

## Codificación UTF-8

SIGR usa UTF-8 de extremo a extremo. Los archivos PowerShell (`.ps1`) se guardan como **UTF-8 con BOM** para que Windows PowerShell 5.1 interprete correctamente tildes, eñes y demás caracteres. El agente configura además entrada y salida de consola en UTF-8 y responde HTTP con `application/json; charset=utf-8`.

Antes de distribuir el agente:

```powershell
npm run check:utf8
```

Si VS Code muestra otra codificación, selecciona **Save with Encoding → UTF-8 with BOM** únicamente para archivos `.ps1`. El resto del proyecto se mantiene en UTF-8 normal.
