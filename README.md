# Testing Sandbox

Repository for continuous testing and verification of Terra and Zenon ecosystem integrations.

## Overview
This repository contains utility modules and security middleware.

## Security Middleware
Security verification modules for Sphexn precision testing.


## 📝 API & Exports Reference (Sincronizado por Sphexn Micans)

### Funciones y Métodos Exportados
| Función | Argumentos | Archivo Origen |
|---|---|---|
| `sanitizeInput` | `input` | `src/auth-middleware.js` |
| `validateBearerToken` | `authHeader` | `src/auth-middleware.js` |
| `scheduleSessionKeepAlive` | `refreshFn, intervalMs = 60000` | `src/auth-middleware.js` |
| `revokeExpiredSessions` | `sessionStore, maxAgeMs = 86400000` | `src/auth-middleware.js` |

