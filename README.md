# Testing SandboxRepository for continuous testing and verification of Terra and Zenon ecosystem integrations.

## Overview
This repository contains utility modules and security middleware.

## Security Middleware
Security verification modules for Sphexn precision testing.

## ​​📝 API & Exports Reference (Sincronizado por Sphexn Micans)
### Variables de Entorno
Las siguientes variables de entorno son requeridas:
* `ZENON_API_KEY`
* `COHERE_API_KEY`
* `SAMBA_API_KEY`
* `GEMINI_API_BASE_URL`

### Funciones y Métodos Exportados
| Función | Argumentos | Archivo Origen |
|---|---|---|
| `sanitizeInput` | `input` | `src/auth-middleware.js` |
| `validateBearerToken` | `authHeader` | `src/auth-middleware.js` |
| `scheduleSessionKeepAlive` | `refreshFn, intervalMs` | `src/auth-middleware.js` |
| `revokeExpiredSessions` | `sessionStore, maxAgeMs` | `src/auth-middleware.js` |
| `generateSecureNonce` | `byteLength` | `src/auth-middleware.js` |
| `processTensorData` | `data` | `src/neural_processor.js` |