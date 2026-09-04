# Testing SandboxRepository for continuous testing and verification of Terra and Zenon ecosystem integrations.

## Overview
This repository contains utility modules and security middleware.

## Security Middleware
Security verification modules for Sphexn precision testing.

## ​​📝 API & Exports Reference (Sincronizado por Sphexn Micans)
### Variables de Entorno
Las siguientes variables de entorno son requeridas:
* `ZENON_API_KEY`: Clave de API para Zenon.
* `COHERE_API_KEY`: Clave de API para Cohere.
* `SAMBA_API_KEY`: Clave de API para Samba.
* `GEMINI_API_BASE_URL`: URL base para la API de Gemini.

### Funciones y Métodos Exportados
| Función | Argumentos | Archivo Origen |
|---|---|---|
| `sanitizeInput` | `input` | `src/auth-middleware.js` |
| `validateBearerToken` | `authHeader` | `src/auth-middleware.js` |
| `scheduleSessionKeepAlive` | `refreshFn, intervalMs` | `src/auth-middleware.js` |
| `revokeExpiredSessions` | `sessionStore, maxAgeMs` | `src/auth-middleware.js` |
| `generateSecureNonce` | `byteLength` | `src/auth-middleware.js` |
| `add` | `a, b` | `src/calculator.js` |
| `subtract` | `a, b` | `src/calculator.js` |
| `multiply` | `a, b` | `src/calculator.js` |
| `divide` | `a, b` | `src/calculator.js` |