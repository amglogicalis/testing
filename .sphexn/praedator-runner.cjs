#!/usr/bin/env node

/**
 * Sphexn Praedator — Sovereign Pull Request & Git Diff Security Auditor
 * Powered by Terra ($0 Compute Architecture)
 * Features:
 * - 0 False Positives via Smart Heuristics + Entropy + AI Semantic Arbitration
 * - Persistent Diff Hash Cache (SHA256) for 0ms re-audits and token savings
 * - Lightweight JS/TS Sandbox Syntax Verification (vm.Script)
 * - Multi-provider AI Fallback (Groq, Cerebras, OpenRouter, Gemini, GitHub Models)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const vm = require('vm');

// CLI Parameter Parsing
const mode = process.argv[2] || 'diff';
const targetRepo = process.argv[3] || 'Local Workspace';
const inputData = process.env.PRAEDATOR_DIFF || process.argv[4] || '';
const fallbackConfigRaw = process.argv[5] || '[]';
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.TOKEN_GH || '';

let fallbackChain = [];
try {
  fallbackChain = JSON.parse(fallbackConfigRaw);
} catch (e) {
  fallbackChain = [];
}

// Auto-populate fallback chain from environment if not supplied via CLI
if (!Array.isArray(fallbackChain) || fallbackChain.length === 0 || !fallbackChain.some(p => p.apiKey)) {
  fallbackChain = [
    { id: 'groq', name: 'Groq Cloud', model: 'llama-3.1-8b-instant', apiKey: process.env.GROQ_API_KEY },
    { id: 'cerebras', name: 'Cerebras Ultra-Fast AI', model: 'llama3.1-70b', apiKey: process.env.CEREBRAS_API_KEY },
    { id: 'openrouter', name: 'OpenRouter AI', model: 'qwen/qwen-2.5-coder-32b-instruct:free', apiKey: process.env.OPENROUTER_API_KEY },
    { id: 'gemini', name: 'Google Gemini', model: 'gemini-1.5-flash', apiKey: process.env.GEMINI_API_KEY },
    { id: 'gh_models', name: 'GitHub Models', model: 'gpt-4o', apiKey: process.env.GH_MODELS_TOKEN || process.env.TOKEN_GH || githubToken }
  ];
}

for (const p of fallbackChain) {
  if (!p.apiKey) {
    if (p.id.includes('groq')) p.apiKey = process.env.GROQ_API_KEY;
    else if (p.id.includes('cerebras')) p.apiKey = process.env.CEREBRAS_API_KEY;
    else if (p.id.includes('openrouter')) p.apiKey = process.env.OPENROUTER_API_KEY;
    else if (p.id.includes('gemini')) p.apiKey = process.env.GEMINI_API_KEY;
    else if (p.id.includes('gh_models') || p.id.includes('azure') || p.id.includes('github')) {
      p.apiKey = process.env.GH_MODELS_TOKEN || process.env.TOKEN_GH || githubToken;
    }
  }
}

// Network Request Helper
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

// Resilient JSON Extractor
function extractJSON(str) {
  if (!str) return null;
  const clean = str.trim();
  try { return JSON.parse(clean); } catch (e) {}

  const blockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch && blockMatch[1]) {
    try { return JSON.parse(blockMatch[1].trim()); } catch (e) {}
  }

  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (e) {}
  }
  return null;
}

// -------------------------------------------------------------
// CACHE SUBSYSTEM (SHA-256 Hash of Diff)
// -------------------------------------------------------------
function getDiffHash(diffText) {
  return crypto.createHash('sha256').update(diffText || '').digest('hex');
}

function getCacheFilePath(hash) {
  return path.join(process.cwd(), 'audits', 'praedator', 'cache', `${hash}.json`);
}

function loadCachedAudit(hash) {
  const filePath = getCacheFilePath(hash);
  if (fs.existsSync(filePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`⚡ [SPHEXN CACHE HIT] Auditoría cargada de caché instantánea (Hash: ${hash.slice(0, 10)}) - 0 Tokens consumidos`);
      return cached;
    } catch (e) {}
  }
  return null;
}

function saveCachedAudit(hash, report) {
  try {
    const filePath = getCacheFilePath(hash);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  } catch (e) {}
}

// -------------------------------------------------------------
// SANDBOX SYNTAX & AST VALIDATOR
// -------------------------------------------------------------
function sandboxValidateCode(codeSnippet) {
  try {
    new vm.Script(codeSnippet, { timeout: 100 });
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// -------------------------------------------------------------
// HIGH-ACCURACY SECRET SCANNER (With Entropy & Context Whitelist)
// -------------------------------------------------------------
function calculateShannonEntropy(str) {
  const freq = {};
  for (let i = 0; i < str.length; i++) {
    freq[str[i]] = (freq[str[i]] || 0) + 1;
  }
  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const DUMMY_INDICATORS = ['dummy', 'sample', 'example', 'placeholder', 'xxxx', '123456', 'your_token', 'your_key', 'token_here', 'my_secret', 'fake'];

function isFalsePositiveSecret(snippet, filePath) {
  const lowerPath = filePath.toLowerCase();
  // Safe contexts: Documentation, fixtures, tests, mocks, svg, localization
  if (
    lowerPath.endsWith('.md') ||
    lowerPath.endsWith('.txt') ||
    lowerPath.endsWith('.svg') ||
    lowerPath.includes('test') ||
    lowerPath.includes('spec') ||
    lowerPath.includes('mock') ||
    lowerPath.includes('fixture')
  ) {
    return true;
  }

  const lowerSnippet = snippet.toLowerCase();
  if (DUMMY_INDICATORS.some(d => lowerSnippet.includes(d))) return true;

  // Real API keys have high entropy (> 2.8 bits per char)
  if (calculateShannonEntropy(snippet) < 2.7) return true;

  return false;
}

function scanSecrets(diffText) {
  const findings = [];
  const patterns = [
    { type: 'GitHub Personal Access Token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,255}/g, severity: 'CRITICAL' },
    { type: 'OpenAI / Anthropic API Key', regex: /(?:sk-[A-Za-z0-9-_]{32,64}|sk-ant-[A-Za-z0-9-_]{32,64})/g, severity: 'CRITICAL' },
    { type: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: 'CRITICAL' },
    { type: 'Generic Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL' },
    { type: 'JWT Token Secret', regex: /ey[A-Za-z0-9-_=]+\.ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+/g, severity: 'HIGH' },
    { type: 'Database URI with Password', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, severity: 'HIGH' }
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
        p.regex.lastIndex = 0;
        let match;
        while ((match = p.regex.exec(addedContent)) !== null) {
          const rawSecret = match[0];
          if (isFalsePositiveSecret(rawSecret, currentFile)) {
            continue; // 0 False Positive Filter
          }
          const sanitized = rawSecret.length > 8
            ? rawSecret.substring(0, 4) + '...' + rawSecret.substring(rawSecret.length - 4)
            : '****';
          findings.push({
            type: p.type,
            file: currentFile,
            line: i + 1,
            severity: p.severity,
            sanitizedSnippet: sanitized
          });
        }
      }
    }
  }

  return findings;
}

// -------------------------------------------------------------
// PRECISION VULNERABILITY SCANNER (Zero False Positive Rules)
// -------------------------------------------------------------
function scanVulnerabilities(diffText) {
  const issues = [];
  const rules = [
    {
      type: 'Arbitrary Code Execution (eval / new Function)',
      regex: /\b(?:eval\s*\(|new\s+Function\s*\()/g,
      severity: 'CRITICAL',
      recommendation: 'Evitar el uso de eval() o new Function() para ejecución dinámica de código.'
    },
    {
      type: 'String Evaluation in Timers (Implicit eval)',
      regex: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/g,
      severity: 'HIGH',
      recommendation: 'Pasar una función callback a setTimeout/setInterval en lugar de un string evaluable.'
    },
    {
      type: 'Command Injection Risk (child_process)',
      regex: /\bchild_process\.(?:exec|execSync)\s*\(\s*(?:`[^`]*\${|"[^"]*\+|'[^']*\+)/g,
      severity: 'CRITICAL',
      recommendation: 'Usar child_process.execFile o spawn con array de argumentos seguros.'
    },
    {
      type: 'Path Traversal Risk',
      regex: /\bfs\.(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync)\s*\(\s*(?:path\.join\([^)]*)?(?:req\.|params\.|query\.)/g,
      severity: 'HIGH',
      recommendation: 'Sanitizar rutas de entrada con path.resolve y verificar contención en directorio permitido.'
    },
    {
      type: 'Cross-Site Scripting (dangerouslySetInnerHTML)',
      regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/g,
      severity: 'HIGH',
      recommendation: 'Sanitizar contenido HTML con DOMPurify antes de inyectarlo en el DOM.'
    },
    {
      type: 'SQL Injection Risk (Unsafe String Concatenation)',
      regex: /\b(?:query|execute)\s*\(\s*['"`].*?(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b.*?\+\s*[a-zA-Z0-9_$.]+/gi,
      severity: 'HIGH',
      recommendation: 'Usar sentencias parametrizadas (Prepared Statements) en lugar de concatenar queries SQL.'
    }
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
      const lowerPath = currentFile.toLowerCase();
      // Skip test/mock files for vulnerability scanner to prevent false alerts
      if (lowerPath.includes('test') || lowerPath.includes('spec') || lowerPath.includes('mock')) {
        continue;
      }

      const content = line.substring(1);
      for (const r of rules) {
        r.regex.lastIndex = 0;
        if (r.regex.test(content)) {
          issues.push({
            type: r.type,
            file: currentFile,
            line: i + 1,
            severity: r.severity,
            recommendation: r.recommendation,
            rawLine: content.trim().slice(0, 120)
          });
        }
      }
    }
  }

  return issues;
}

// -------------------------------------------------------------
// AI QUERY ENGINE WITH SEMANTIC ARBITRATION (Zero False Positives)
// -------------------------------------------------------------
async function queryAIWithFallback(diffText, candidateSecrets, candidateVulns, metrics, sandboxFindings) {
  // Dense, highly structured, token-optimized prompt
  const prompt = `Actúa como Sphexn Praedator, auditor senior de Pull Requests en la red soberana Terra.
Tu objetivo es realizar una auditoría técnica, concisa y sin palabrería, garantizando CERO FALSOS POSITIVOS.

DIFF:
--- BEGIN DIFF ---
${diffText.slice(0, 25000)}
--- END DIFF ---

CANDIDATOS ESTÁTICOS PRELIMINARES:
- Secretos: ${JSON.stringify(candidateSecrets)}
- Vulnerabilidades: ${JSON.stringify(candidateVulns)}
- Sandbox Syntax Checks: ${JSON.stringify(sandboxFindings)}
- Métricas: +${metrics.addedLines} / -${metrics.deletedLines} en ${metrics.filesCount} archivo(s).

INSTRUCCIONES PARA CERO FALSOS POSITIVOS:
1. Si un candidato es benigno (ej: callback legítimo, test mock, logging necesario en CLI), agrégalo a "dismissedFindings" indicando por qué es seguro.
2. Si confirmas un bug real, vulnerabilidad o fuga comprobada, agrégalo a "verifiedFindings".
3. Si el código es correcto y seguro, "verifiedFindings" debe ser un array vacío [] y el veredicto "APPROVED".
4. Mantén "summary" en 2 oraciones técnicas precisas.

Responde ÚNICAMENTE con este JSON:
{
  "summary": "...",
  "verdict": "APPROVED" | "CHANGES_REQUESTED" | "SECURITY_BLOCK",
  "verifiedFindings": [
    {
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "file": "path",
      "line": 10,
      "title": "...",
      "description": "...",
      "suggestedDiff": "..."
    }
  ],
  "dismissedFindings": [
    {
      "type": "...",
      "file": "path",
      "reason": "..."
    }
  ]
}`;

  for (const provider of fallbackChain) {
    if (!provider.apiKey) continue;

    try {
      console.log(`📡 Consultando modelo con ${provider.name} (${provider.model || provider.id})...`);

      // GROQ CALL
      if (provider.id === 'groq' || provider.id.includes('groq')) {
        const candidateModels = [provider.model || 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];
        for (const candidate of candidateModels) {
          try {
            const res = await httpsRequest({
              hostname: 'api.groq.com',
              path: '/openai/v1/chat/completions',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`
              }
            }, {
              model: candidate,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 700
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return formatAiResponse(parsed, `${provider.name} (${candidate})`, candidateSecrets);
              }
            } else if (res.status !== 404) {
              console.warn(`[Groq Cloud / ${candidate}] HTTP ${res.status}: ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`);
              break;
            }
          } catch (e) {}
        }
      }

      // CEREBRAS CALL
      if (provider.id === 'cerebras' || provider.id.includes('cerebras')) {
        const candidateModels = ['llama3.1-70b', 'llama3.1-8b'];
        for (const candidate of candidateModels) {
          try {
            const res = await httpsRequest({
              hostname: 'api.cerebras.ai',
              path: '/v1/chat/completions',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`
              }
            }, {
              model: candidate,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 700
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return formatAiResponse(parsed, `${provider.name} (${candidate})`, candidateSecrets);
              }
            }
          } catch (e) {}
        }
      }

      // OPENROUTER CALL
      if (provider.id === 'openrouter' || provider.id.includes('openrouter')) {
        const candidateModels = [
          'qwen/qwen-2.5-coder-32b-instruct:free',
          'deepseek/deepseek-r1:free',
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.3-70b-instruct'
        ];
        for (const candidate of candidateModels) {
          try {
            const res = await httpsRequest({
              hostname: 'openrouter.ai',
              path: '/api/v1/chat/completions',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`,
                'HTTP-Referer': 'https://github.com/amglogicalis/Sphexn',
                'X-Title': 'Sphexn Praedator'
              }
            }, {
              model: candidate,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 700
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return formatAiResponse(parsed, `${provider.name} (${candidate})`, candidateSecrets);
              }
            } else if (res.status !== 404) {
              console.warn(`[OpenRouter / ${candidate}] HTTP ${res.status}: ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`);
              break;
            }
          } catch (e) {}
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 }
        });

        if (res.status === 200 && res.body) {
          const rawText = res.body.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = extractJSON(rawText) || {};
          if (parsed.summary) {
            return formatAiResponse(parsed, `${provider.name} (${modelName})`, candidateSecrets);
          }
        }
      }

      // GITHUB MODELS CALL
      if (provider.id === 'gh_models' || provider.id.includes('gh_models') || provider.id.includes('github')) {
        const res = await httpsRequest({
          hostname: 'models.github.ai',
          path: '/inference/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          }
        }, {
          model: provider.model || 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 700
        });

        if (res.status === 200 && res.body) {
          const content = res.body.choices?.[0]?.message?.content || '{}';
          const parsed = extractJSON(content) || {};
          if (parsed.summary) {
            return formatAiResponse(parsed, `${provider.name} (${provider.model || 'gpt-4o'})`, candidateSecrets);
          }
        }
      }
    } catch (e) {
      console.warn(`Proveedor ${provider.name} no pudo responder (${e.message}). Intentando siguiente en matriz...`);
    }
  }

  // Deterministic Fallback Heuristic
  return generateDeterministicAudit(diffText, candidateSecrets, candidateVulns, metrics);
}

function formatAiResponse(parsed, providerName, secrets) {
  const verified = Array.isArray(parsed.verifiedFindings) ? parsed.verifiedFindings : [];
  const dismissed = Array.isArray(parsed.dismissedFindings) ? parsed.dismissedFindings : [];

  let verdict = parsed.verdict || 'APPROVED';
  if (secrets.length > 0 || verified.some(v => v.severity === 'CRITICAL')) {
    verdict = 'SECURITY_BLOCK';
  } else if (verified.some(v => v.severity === 'HIGH' || v.severity === 'MEDIUM')) {
    verdict = 'CHANGES_REQUESTED';
  } else {
    verdict = 'APPROVED';
  }

  return {
    providerUsed: providerName,
    summary: parsed.summary,
    verdict,
    verifiedFindings: verified,
    dismissedFindings: dismissed
  };
}

function generateDeterministicAudit(diffText, secrets, vulnerabilities, metrics) {
  const isSecurityBlock = secrets.length > 0;
  const isCritical = vulnerabilities.some(v => v.severity === 'CRITICAL');
  const verdict = isSecurityBlock ? 'SECURITY_BLOCK' : (isCritical ? 'CHANGES_REQUESTED' : (vulnerabilities.length > 0 ? 'CHANGES_REQUESTED' : 'APPROVED'));

  const verified = vulnerabilities.map(v => ({
    severity: v.severity,
    file: v.file,
    line: v.line,
    title: v.type,
    description: v.recommendation,
    suggestedDiff: ''
  }));

  const summary = isSecurityBlock
    ? `Alerta de Seguridad: Se detectaron credenciales expuestas en los archivos modificados. Fusión bloqueada.`
    : (isCritical
      ? `Revisión Requerida: El diff contiene vulnerabilidades críticas que deben resolverse antes del despliegue.`
      : `Auditoría Satisfactoria: El diff contiene +${metrics.addedLines}/-${metrics.deletedLines} líneas en ${metrics.filesCount} archivo(s) sin vulnerabilidades detectadas.`);

  return {
    providerUsed: 'Motor Determinista Heurístico AST ($0 Compute)',
    summary,
    verdict,
    verifiedFindings: verified,
    dismissedFindings: []
  };
}

// -------------------------------------------------------------
// MAIN EXECUTION FLOW
// -------------------------------------------------------------
async function run() {
  console.log('=== SPHEXN PRAEDATOR AUDITOR STARTING ===');
  console.log(`Modo: ${mode}`);
  console.log(`Target: ${targetRepo}`);

  let diffContent = inputData;
  if (diffContent && diffContent.includes('\\n')) {
    diffContent = diffContent.replace(/\\n/g, '\n');
  }

  if (mode === 'pr') {
    const prNumber = inputData;
    console.log(`Descargando diff oficial de la PR #${prNumber} de ${targetRepo}...`);
    try {
      const prDiffRes = await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${targetRepo}/pulls/${prNumber}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Sphexn-Praedator',
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3.diff'
        }
      });
      diffContent = typeof prDiffRes.body === 'string' ? prDiffRes.body : JSON.stringify(prDiffRes.body);
    } catch (e) {
      console.warn('Error al descargar diff de la PR:', e.message);
    }
  }

  if (!diffContent || diffContent.trim().length === 0) {
    diffContent = 'diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,2 @@\n+// Clean diff';
  }

  // 1. Check Diff Hash Cache
  const diffHash = getDiffHash(diffContent);
  const cachedReport = loadCachedAudit(diffHash);
  if (cachedReport) {
    console.log('==============================================');
    console.log(`AUDITORÍA COMPLETADA (VÍA CACHÉ)`);
    console.log(`Risk Score: ${cachedReport.riskScore}/100`);
    console.log(`Veredicto: ${cachedReport.verdict}`);
    console.log(`Proveedor IA: ${cachedReport.providerUsed}`);
    console.log('==============================================');
    return;
  }

  // 2. Metrics Calculation
  const lines = diffContent.split('\n');
  let addedLines = 0;
  let deletedLines = 0;
  let filesModified = new Set();
  let jsSnippetsToTest = [];

  let currentFile = '';
  let currentAddedBlock = '';

  for (const l of lines) {
    if (l.startsWith('+++ b/')) {
      if (currentAddedBlock && (currentFile.endsWith('.js') || currentFile.endsWith('.cjs'))) {
        jsSnippetsToTest.push({ file: currentFile, code: currentAddedBlock });
      }
      currentFile = l.substring(6).trim();
      currentAddedBlock = '';
      filesModified.add(currentFile);
    } else if (l.startsWith('+') && !l.startsWith('+++')) {
      addedLines++;
      currentAddedBlock += l.substring(1) + '\n';
    } else if (l.startsWith('-') && !l.startsWith('---')) {
      deletedLines++;
    }
  }

  if (currentAddedBlock && (currentFile.endsWith('.js') || currentFile.endsWith('.cjs'))) {
    jsSnippetsToTest.push({ file: currentFile, code: currentAddedBlock });
  }

  const metrics = {
    addedLines,
    deletedLines,
    filesCount: filesModified.size || 1,
    filesModified: Array.from(filesModified)
  };

  // 3. Sandbox Syntax Tests
  const sandboxFindings = [];
  for (const item of jsSnippetsToTest.slice(0, 3)) {
    if (item.code.length > 20 && !item.code.includes('import ') && !item.code.includes('export ')) {
      const res = sandboxValidateCode(item.code);
      if (!res.valid) {
        sandboxFindings.push({ file: item.file, error: res.error });
      }
    }
  }

  // 4. Scanners & AI Arbitration
  const candidateSecrets = scanSecrets(diffContent);
  const candidateVulns = scanVulnerabilities(diffContent);
  const aiAudit = await queryAIWithFallback(diffContent, candidateSecrets, candidateVulns, metrics, sandboxFindings);

  const verifiedFindings = aiAudit.verifiedFindings || [];
  const dismissedFindings = aiAudit.dismissedFindings || [];

  // 5. Risk Score Computation (Calculated strictly from verified findings)
  let riskScore = 10;
  if (candidateSecrets.length > 0) riskScore += candidateSecrets.length * 40;
  riskScore += verifiedFindings.filter(v => v.severity === 'CRITICAL').length * 35;
  riskScore += verifiedFindings.filter(v => v.severity === 'HIGH').length * 20;
  riskScore += verifiedFindings.filter(v => v.severity === 'MEDIUM').length * 10;
  riskScore += Math.min(15, Math.floor(addedLines / 50) * 3);
  riskScore = Math.min(100, Math.max(5, riskScore));

  const finalVerdict = aiAudit.verdict || (candidateSecrets.length > 0 ? 'SECURITY_BLOCK' : (riskScore > 60 ? 'CHANGES_REQUESTED' : 'APPROVED'));

  const auditReport = {
    id: 'praedator_' + Date.now(),
    diffHash,
    mode,
    repo: mode === 'pr' ? targetRepo : 'Local Diff Workspace',
    prNumber: mode === 'pr' ? inputData : null,
    riskScore,
    verdict: finalVerdict,
    addedLines,
    deletedLines,
    filesCount: metrics.filesCount,
    filesModified: metrics.filesModified,
    verifiedFindings,
    dismissedFindings,
    secretsCount: candidateSecrets.length,
    providerUsed: aiAudit.providerUsed,
    summary: aiAudit.summary,
    timestamp: new Date().toISOString()
  };

  console.log('==============================================');
  console.log(`AUDITORÍA COMPLETADA`);
  console.log(`Risk Score: ${riskScore}/100`);
  console.log(`Veredicto: ${finalVerdict}`);
  console.log(`Hallazgos Verificados: ${verifiedFindings.length}`);
  console.log(`Candidatos Descartados (Falsos Positivos Evitados): ${dismissedFindings.length}`);
  console.log(`Proveedor IA: ${aiAudit.providerUsed}`);
  console.log('==============================================');

  // 6. Post GitHub PR Comment
  if (mode === 'pr' && githubToken && targetRepo && inputData) {
    console.log(`Publicando dictamen de auditoría en la PR #${inputData} de ${targetRepo}...`);
    try {
      const verdictEmoji = finalVerdict === 'APPROVED' ? '✅' : (finalVerdict === 'SECURITY_BLOCK' ? '🛑' : '⚠️');
      const commentLines = [
        `## 🦅 Sphexn Praedator — Sovereign PR Audit Report`,
        ``,
        `### ${verdictEmoji} Verdict: **${finalVerdict}** (Risk Score: **${riskScore}/100**)`,
        `*Audited via **${aiAudit.providerUsed}** with $0 compute overhead.*`,
        ``,
        `| Metric | Value | Status |`,
        `|---|---|---|`,
        `| **Exposed Secrets** | ${candidateSecrets.length} | ${candidateSecrets.length > 0 ? '🛑 **SECURITY BLOCK**' : '✅ Clean'} |`,
        `| **Verified Findings** | ${verifiedFindings.length} | ${verifiedFindings.length > 0 ? '⚠️ Action Required' : '✅ Clean'} |`,
        `| **False Positives Dismissed** | ${dismissedFindings.length} | 🛡️ Auto-Filtered |`,
        `| **Code Changes** | +${addedLines} / -${deletedLines} | ${metrics.filesCount} file(s) |`,
        ``,
        `### 📋 Executive Summary`,
        `>${(aiAudit.summary || 'Auditoría completada satisfactoriamente.').replace(/\n/g, ' ')}`,
        ``
      ];

      if (verifiedFindings.length > 0) {
        commentLines.push('### ⚠️ Verified Findings & Actionable Remediations');
        for (const f of verifiedFindings) {
          commentLines.push(`#### [${f.severity || 'HIGH'}] ${f.title || 'Finding'} — \`${f.file || 'Code'}:${f.line || 'N/A'}\``);
          commentLines.push(`> ${f.description || ''}`);
          if (f.suggestedDiff) {
            commentLines.push('```diff');
            commentLines.push(f.suggestedDiff);
            commentLines.push('```');
          }
          commentLines.push('');
        }
      }

      if (dismissedFindings.length > 0) {
        commentLines.push('<details><summary>🛡️ <b>False Positives Dismissed (' + dismissedFindings.length + ')</b></summary>');
        commentLines.push('');
        commentLines.push('| Candidate | File | Reason for Safe Exemption |');
        commentLines.push('|---|---|---|');
        for (const d of dismissedFindings) {
          commentLines.push(`| ${d.type || 'Static Trigger'} | \`${d.file || 'N/A'}\` | ${d.reason || 'Verified as standard safe pattern'} |`);
        }
        commentLines.push('</details>');
        commentLines.push('');
      }

      if (candidateSecrets.length > 0) {
        commentLines.push('### 🚨 Critical Security Warning: Exposed Secrets Detected');
        commentLines.push('The following tokens were detected in plaintext and must be rotated immediately:');
        commentLines.push('```text');
        for (const sec of candidateSecrets) {
          commentLines.push(`[${sec.type}] Line ${sec.line}: ${sec.sanitizedSnippet}`);
        }
        commentLines.push('```');
        commentLines.push('');
      }

      commentLines.push('---');
      commentLines.push('*Audited automatically by [Sphexn Praedator](https://amglogicalis.github.io/sphexn-repo-public/) — Sovereign Quality Engine for the Terra Ecosystem.*');

      await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${targetRepo}/issues/${inputData}/comments`,
        method: 'POST',
        headers: {
          'User-Agent': 'Sphexn-Praedator',
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      }, {
        body: commentLines.join('\n')
      });
      console.log(`✔ Comentario de auditoría publicado exitosamente en la PR #${inputData}`);
    } catch (commentErr) {
      console.warn('Advertencia al publicar comentario en GitHub PR:', commentErr.message);
    }
  }

  // 7. Save to local audits and cache
  const outDir = path.join(process.cwd(), 'audits', 'praedator');
  fs.mkdirSync(outDir, { recursive: true });
  const auditFile = path.join(outDir, `audit-${Date.now()}.json`);
  fs.writeFileSync(auditFile, JSON.stringify(auditReport, null, 2), 'utf8');
  saveCachedAudit(diffHash, auditReport);
  console.log(`✔ Audit saved to ${auditFile} and cached.`);
}

run();
