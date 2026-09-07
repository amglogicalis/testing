# Sphexn Rex — DevOps Automation Plan

## Destinatario
devops-alerts@terra-ecosystem.com

---

## Tarea: Check Node Runtime
- **Instrucciones**: Comprueba la version de Node.js instalada en el sistema (debe ser >= 18). Muestra un log informativo y finaliza con exito.
- **Continuar si falla**: false

## Tarea: Workspace Integrity Scan
- **Instrucciones**: Escanea el directorio raiz del proyecto y cuenta el numero de archivos JavaScript y TypeScript. Imprime el recuento total.
- **Depende de**: check-node-runtime
- **Continuar si falla**: true

## Tarea: Syntax & Health Verification
- **Instrucciones**: Comprueba que package.json sea un JSON valido y no contenga errores sintacticos.
- **Depende de**: workspace-integrity-scan
- **Continuar si falla**: false
