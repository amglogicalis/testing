# Testing SandboxRepository for continuous testing and verification of Terra and Zenon ecosystem integrations.

## Overview
This repository contains utility modules and security middleware.

## Security Middleware
Security verification modules for Sphexn precision testing.

## ​​📝 API & Exports Reference (Sincronizado por Sphexn Micans)
### Variables de Entorno
Las siguientes variables de entorno son requeridas por el código:
* `API_KEY`: Clave de API necesaria para la autenticación.
* `ZENON_API_KEY`: Clave de API de Zenon necesaria para la integración.
* `COHERE_API_KEY`: Clave de API de Cohere necesaria para el procesamiento de lenguaje natural.
* `SAMBA_API_KEY`: Clave de API de Samba necesaria para la integración.
* `GEMINI_API_BASE_URL`: URL base de la API de Gemini necesaria para la integración.

### Funciones y Métodos Exportados
| Función | Argumentos | Archivo Origen |
|---|---|---|
| `sanitizeInput` | `input` | `src/auth-middleware.js` |
| `validateBearerToken` | `authHeader` | `src/auth-middleware.js` |
| `scheduleSessionKeepAlive` | `refreshFn, intervalMs` | `src/auth-middleware.js` |
| `revokeExpiredSessions` | `sessionStore, maxAgeMs` | `src/auth-middleware.js` |
| `generateSecureNonce` | `byteLength` | `src/auth-middleware.js` |
| `processTensorData` | `data` | `src/neural_processor.js` |