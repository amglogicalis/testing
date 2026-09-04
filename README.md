# Testing SandboxRepository for continuous testing and verification of Terra and Zenon ecosystem integrations.## OverviewThis repository contains utility modules and security middleware.## Security Middleware
Security verification modules for Sphexn precision testing.

Las siguientes variables de entorno son requeridas por el código:
* `ZENON_API_KEY`: Clave de API de Zenon
* `COHERE_API_KEY`: Clave de API de Cohere
* `SAMBA_API_KEY`: Clave de API de Samba
* `GEMINI_API_BASE_URL`: URL base de la API de Gemini## 📝 API & Exports Reference (Sincronizado por Sphexn Micans)### Funciones y Métodos Exportados| Función | Argumentos | Archivo Origen ||---|---|---|| `sanitizeInput` | `input` | `src/auth-middleware.js` || `validateBearerToken` | `authHeader` | `src/auth-middleware.js` || `scheduleSessionKeepAlive` | `refreshFn, intervalMs = 60000` | `src/auth-middleware.js` || `revokeExpiredSessions` | `sessionStore, maxAgeMs = 86400000` | `src/auth-middleware.js` || `generateSecureNonce` | `byteLength = 16` | `src/auth-middleware.js` |