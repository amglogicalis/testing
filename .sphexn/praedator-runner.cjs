const fs = require('fs');
const path = require('path');
const https = require('https');
function extractJSON(str) {
  if (!str) return null;
  const clean = str.trim();
  try {
    return JSON.parse(clean);
  } catch (e) {}
  // Extract JSON from markdown block
  const jsonBlock = clean.match(/```(?:json)?s*([sS]*?)s*```/);
  if (jsonBlock && jsonBlock[1]) {
    try {
      return JSON.parse(jsonBlock[1].trim());
    } catch (e) {}
  }
  // Extract first { ... }
  const match = clean.match(/{[sS]*}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {}
  }
  return null;
}


const mode = process.argv[2] || 'diff';
const targetRepo = process.argv[3] || 'amglogicalis/pokemon-tcg-project';
const inputData = process.env.PRAEDATOR_DIFF || process.argv[4] || '';
const fallbackConfigRaw = process.argv[5] || '[]';
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_PAT || '';

let fallbackChain = [];
try {
  fallbackChain = JSON.parse(fallbackConfigRaw);
} catch (e) {
  fallbackChain = [];
}

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

// 1. High-Accuracy Secret Scanner
function scanSecrets(diffText) {
  const findings = [];
  const patterns = [
    { type: 'GitHub Personal Access Token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,255}/g, severity: 'CRITICAL' },
    { type: 'OpenAI / Anthropic API Key', regex: /(?:sk-[A-Za-z0-9-_]{32,64}|sk-ant-[A-Za-z0-9-_]{32,64})/g, severity: 'CRITICAL' },
    { type: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: 'CRITICAL' },
    { type: 'Generic Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL' },
    { type: 'JWT Token Secret', regex: /ey[A-Za-z0-9-_=]+\.ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+/g, severity: 'HIGH' },
    { type: 'Hardcoded Password / API Key', regex: /(?:password|passwd|pwd|secret|api_?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi, severity: 'HIGH' },
    { type: 'Database Connection URI with Credentials', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, severity: 'HIGH' }
  ];

  const lines = diffText.split('\n');
  let currentFile = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6).trim();
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.substring(1);
      for (const p of patterns) {
        let match;
        p.regex.lastIndex = 0;
        while ((match = p.regex.exec(addedContent)) !== null) {
          const secretSnippet = match[0];
          const redacted = secretSnippet.length > 8 
            ? secretSnippet.substring(0, 4) + '...' + secretSnippet.substring(secretSnippet.length - 4)
            : '****';
          findings.push({
            type: p.type,
            severity: p.severity,
            file: currentFile,
            line: i + 1,
            redactedSnippet: redacted
          });
        }
      }
    }
  }

  return findings;
}

// 2. OWASP & Code Smells Scanner
function scanVulnerabilities(diffText) {
  const issues = [];
  const rules = [
    { type: 'Inyección SQL Potencial', regex: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*(?:\+|`|\$\{).*(?:req\.|params\.|body\.|query\.)/gi, severity: 'CRITICAL', recommendation: 'Usa consultas parametrizadas o un ORM en lugar de concatenar entradas de usuario.' },
    { type: 'Ejecución Dinámica Insegura (eval)', regex: /\beval\s*\(/g, severity: 'HIGH', recommendation: 'Remueve eval(); permite inyección arbitraria y Remote Code Execution (RCE).' },
    { type: 'Riesgo XSS (dangerouslySetInnerHTML)', regex: /dangerouslySetInnerHTML/g, severity: 'HIGH', recommendation: 'Sanitiza el contenido HTML con librerías como DOMPurify antes de insertarlo.' },
    { type: 'Validación SSL Desactivada', regex: /rejectUnauthorized\s*:\s*false/g, severity: 'HIGH', recommendation: 'Nunca deshabilites rejectUnauthorized; expone la conexión a ataques Man-in-the-Middle.' },
    { type: 'Consola de Depuración Olvidada', regex: /console\.(?:log|debug|trace)\s*\(/g, severity: 'LOW', recommendation: 'Elimina llamadas a console.log antes de fusionar para no ensuciar logs de producción.' }
  ];

  const lines = diffText.split('\n');
  let currentFile = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6).trim();
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const added = line.substring(1);
      for (const r of rules) {
        r.regex.lastIndex = 0;
        if (r.regex.test(added)) {
          issues.push({
            type: r.type,
            severity: r.severity,
            file: currentFile,
            line: i + 1,
            recommendation: r.recommendation
          });
        }
      }
    }
  }

  return issues;
}

// 3. Real Provider AI Fallback Query Engine
async function queryAIWithFallback(diffText, secrets, vulnerabilities, metrics) {
  // Auto-build fallback chain from env if empty or missing keys
  let activeChain = (Array.isArray(fallbackChain) && fallbackChain.length > 0)
    ? fallbackChain.slice()
    : [
        { id: 'groq', name: 'Groq Cloud', model: 'llama-3.3-70b-versatile', apiKey: process.env.GROQ_API_KEY },
        { id: 'gemini', name: 'Google Gemini', model: 'gemini-1.5-flash', apiKey: process.env.GEMINI_API_KEY },
        { id: 'gh_models', name: 'GitHub Models', model: 'gpt-4o', apiKey: process.env.GH_MODELS_TOKEN || process.env.GITHUB_TOKEN }
      ];

  for (const p of activeChain) {
    if (!p.apiKey) {
      if (p.id.includes('groq')) p.apiKey = process.env.GROQ_API_KEY;
      else if (p.id.includes('gemini')) p.apiKey = process.env.GEMINI_API_KEY;
      else if (p.id.includes('gh_models') || p.id.includes('azure')) p.apiKey = process.env.GH_MODELS_TOKEN || process.env.GITHUB_TOKEN;
    }
  }

  const prompt = `Actúa como Sphexn Praedator, el auditor senior de seguridad de código y Pull Requests de la red soberana Terra.
Tu objetivo es proporcionar un análisis técnico riguroso, quirúrgico y de calidad enterprise para desarrolladores.

DIFF A AUDITAR:
```diff
${diffText.slice(0, 4000)}
```

HALLAZGOS ESTÁTICOS PRELIMINARES:
- Secretos: ${JSON.stringify(secrets)}
- Vulnerabilidades/Smells: ${JSON.stringify(vulnerabilities)}
- Métricas: +${metrics.addedLines} / -${metrics.deletedLines} líneas en ${metrics.filesCount} archivo(s) (${metrics.filesModified.join(', ')}).

INSTRUCCIONES DE AUDITORÍA:
1. "summary": Evaluación técnica precisa de 2-3 oraciones sobre el propósito real del cambio, arquitectura y seguridad.
2. "verdict": Elige estrictamente entre "APPROVED" (código limpio), "CHANGES_REQUESTED" (smells o mejoras de robustez) o "SECURITY_BLOCK" (vulnerabilidades críticas o fugas).
3. "suggestions": Lista de 2 a 4 recomendaciones técnicas hiper-específicas referenciando archivos y líneas de ser aplicable.

Responde ÚNICAMENTE con un objeto JSON válido con este esquema:
{
  "summary": "...",
  "verdict": "APPROVED" | "CHANGES_REQUESTED" | "SECURITY_BLOCK",
  "suggestions": [
    "...",
    "..."
  ]
}`;

  for (const provider of activeChain) {
    if (!provider.apiKey) continue;

    try {
      console.log(`📡 Consultando modelo con ${provider.name} (${provider.model || provider.id})...`);

      // GROQ CALL
      if (provider.id === 'groq' || provider.id.includes('groq')) {
        const res = await httpsRequest({
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          }
        }, {
          model: provider.model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 600
        });

        if (res.status === 200 && res.body) {
          const content = res.body.choices?.[0]?.message?.content || '{}';
          const parsed = extractJSON(content) || {};
          if (parsed.summary) {
            return {
              providerUsed: `${provider.name} (${provider.model || 'llama-3.3-70b'})`,
              summary: parsed.summary,
              verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
              suggestions: parsed.suggestions || []
            };
          }
        }
      }

      // GOOGLE GEMINI CALL
      if (provider.id === 'gemini' || provider.id.includes('gemini')) {
        const modelName = provider.model || 'gemini-1.5-flash';
        const res = await httpsRequest({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${modelName}:generateContent?key=${provider.apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
        });

        if (res.status === 200 && res.body) {
          const rawText = res.body.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = extractJSON(rawText) || {};
          if (parsed.summary) {
            return {
              providerUsed: `${provider.name} (${modelName})`,
              summary: parsed.summary,
              verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
              suggestions: parsed.suggestions || []
            };
          }
        }
      }

      // GITHUB MODELS CALL
      if (provider.id === 'gh_models' || provider.id.includes('gh_models')) {
        const res = await httpsRequest({
          hostname: 'models.inference.ai.azure.com',
          path: '/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          }
        }, {
          model: provider.model || 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 600
        });

        if (res.status === 200 && res.body) {
          const content = res.body.choices?.[0]?.message?.content || '{}';
          const parsed = extractJSON(content) || {};
          if (parsed.summary) {
            return {
              providerUsed: `${provider.name} (${provider.model || 'gpt-4o'})`,
              summary: parsed.summary,
              verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
              suggestions: parsed.suggestions || []
            };
          }
        }
      }
    } catch (err) {
      console.warn(`Fallo en llamada a ${provider.name}: ${err.message}. Intentando siguiente en matriz...`);
    }
  }

  console.log('⚠️ Proveedores de IA no disponibles o agotados. Ejecutando Motor Determinista Heurístico AST...');
  return generateDeterministicAudit(diffText, secrets, vulnerabilities, metrics);
}


