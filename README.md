# Testing Sandbox

Repository for continuous testing and verification of Terra and Zenon ecosystem integrations.

## Overview
This repository contains utility modules and security middleware.

## Security Middleware
## Variables de Entorno
Las siguientes variables de entorno son requeridas por el código:
* `ZENON_API_KEY`
* `COHERE_API_KEY`
* `SAMBA_API_KEY`
* `GEMINI_API_BASE_URL`
Security verification modules for Sphexn precision testing.


## 📝 API & Exports Reference (Sincronizado por Sphexn Micans)

### Funciones y Métodos Exportados
| Función | Argumentos | Archivo Origen |
|---|---|---|
| `sanitizeInput` | `input` | `src/auth-middleware.js` |
| `validateBearerToken` | `authHeader` | `src/auth-middleware.js` |
| `scheduleSessionKeepAlive` | `refreshFn, intervalMs = 60000` | `src/auth-middleware.js` |
| `revokeExpiredSessions` | `sessionStore, maxAgeMs = 86400000` | `src/auth-middleware.js` |
| `generateSecureNonce` | `byteLength = 16` | `src/auth-middleware.js` |

