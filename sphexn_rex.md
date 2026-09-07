# Sphexn Rex — Plan de Automatización Integral (Ejemplo Sintético)

## Destinatario
devops-alerts@terra-ecosystem.com, admin@empresa.com

## Webhook
https://discord.com/api/webhooks/123456789/sphexn-alerts

## Auto-Healing
activado

## Reintentos
3

---

## Tarea: Check Node Runtime
- **Instrucciones**: Comprueba la versión de Node.js instalada en el sistema (debe ser >= 18). Muestra un log informativo y finaliza con éxito.
- **Auto-Healing**: true
- **Reintentos**: 3
- **Continuar si falla**: false
- **Timeout**: 60
- **Env**: NODE_ENV=production, STRICT_MODE=true

## Tarea: Workspace Integrity Scan
- **Instrucciones**: Escanea el directorio raíz del proyecto y cuenta el número de archivos JavaScript y TypeScript. Imprime el recuento total.
- **Depende de**: check-node-runtime
- **Auto-Healing**: true
- **Reintentos**: 2
- **Continuar si falla**: true
- **Timeout**: 120

## Tarea: Syntax and Package Audit
- **Instrucciones**: Valida la sintaxis formal de package.json y comprueba que contenga los campos name, version y scripts sin errores de parseo.
- **Depende de**: workspace-integrity-scan
- **Auto-Healing**: true
- **Reintentos**: 3
- **Continuar si falla**: false
- **Timeout**: 90

## Tarea: Custom Automation Script
- **Instrucciones**: Ejecuta un script explícito de compilación o preparación si existe en disco.
- **Ejecutar**: .sphexn/rex/tasks/custom-step.js
- **Depende de**: syntax-and-package-audit
- **Auto-Healing**: false
- **Continuar si falla**: true
- **Timeout**: 180
- **Env**: DEPLOY_TARGET=staging, RELEASE_CHANNEL=canary
