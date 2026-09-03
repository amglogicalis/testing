#!/usr/bin/env node

/**
 * Sphexn Praedator — Sovereign Pull Request & Git Diff Security Auditor
 * Powered by Terra ($0 Compute Architecture)
 * Supports Groq Cloud, OpenRouter, Google Gemini, GitHub Models, and Deterministic AST Heuristics.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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
    { id: 'groq', name: 'Groq Cloud', model: 'llama-3.3-70b-versatile', apiKey: process.env.GROQ_API_KEY },
    { id: 'openrouter', name: 'OpenRouter AI', model: 'meta-llama/llama-3.3-70b-instruct:free', apiKey: process.env.OPENROUTER_API_KEY },
    { id: 'gemini', name: 'Google Gemini', model: 'gemini-1.5-flash', apiKey: process.env.GEMINI_API_KEY },
    { id: 'gh_models', name: 'GitHub Models', model: 'gpt-4o', apiKey: process.env.GH_MODELS_TOKEN || process.env.TOKEN_GH || githubToken }
  ];
}

for (const p of fallbackChain) {
  if (!p.apiKey) {
    if (p.id.includes('groq')) p.apiKey = process.env.GROQ_API_KEY;
    else if (p.id.includes('openrouter')) p.apiKey = process.env.OPENROUTER_API_KEY;
    else if (p.id.includes('gemini')) p.apiKey = process.env.GEMINI_API_KEY;
    else if (p.id.includes('gh_models') || p.id.includes('github') || p.id.includes('azure')) {
      p.apiKey = process.env.GH_MODELS_TOKEN || process.env.TOKEN_GH || githubToken;
    }
  }
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

function extractJSON(str) {
  if (!str) return null;
  const clean = str.trim();
  try { return JSON.parse(clean); } catch (e) {}

  // Match ```json ... ``` block
  const blockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch && blockMatch[1]) {
    try { return JSON.parse(blockMatch[1].trim()); } catch (e) {}
  }

  // Match first outer { ... }
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (e) {}
  }
  return null;
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
        p.regex.lastIndex = 0;
        let match;
        while ((match = p.regex.exec(addedContent)) !== null) {
          const rawSecret = match[0];
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

// 2. OWASP Top 10 & Code Smells Scanner
function scanVulnerabilities(diffText) {
  const issues = [];
  const rules = [
    {
      type: 'SQL Injection Risk',
      regex: /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.*?\+\s*[a-zA-Z0-9_$.]+/gi,
      severity: 'HIGH',
      recommendation: 'Usar queries parametrizadas (Prepared Statements) en lugar de concatenar cadenas.'
    },
    {
      type: 'Arbitrary Code Execution (eval / Function)',
      regex: /\b(?:eval|setTimeout|setInterval)\s*\(\s*[a-zA-Z0-9_$.]+\s*\)/g,
      severity: 'CRITICAL',
      recommendation: 'Evitar el uso de eval() o strings dinámicos en temporizadores.'
    },
    {
      type: 'Cross-Site Scripting (dangerouslySetInnerHTML)',
      regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/g,
      severity: 'HIGH',
      recommendation: 'Sanitizar HTML con bibliotecas probadas como DOMPurify antes de renderizar.'
    },
    {
      type: 'Debug Logging in Production',
      regex: /console\.(?:log|debug|info)\s*\(/g,
      severity: 'LOW',
      recommendation: 'Eliminar console.log() antes de fusionar a ramas principales.'
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
      const content = line.substring(1);
      for (const r of rules) {
        r.regex.lastIndex = 0;
        if (r.regex.test(content)) {
          issues.push({
            type: r.type,
            file: currentFile,
            line: i + 1,
            severity: r.severity,
            recommendation: r.recommendation
          });
        }
      }
    }
  }

  return issues;
}

// 3. Real AI Fallback Query Engine
async function queryAIWithFallback(diffText, secrets, vulnerabilities, metrics) {
  const prompt = `Actúa como Sphexn Praedator, el auditor senior de seguridad de código y Pull Requests de la red soberana Terra.
Tu objetivo es proporcionar un análisis técnico riguroso, quirúrgico y de calidad enterprise para desarrolladores.

DIFF A AUDITAR:
--- BEGIN DIFF ---
${diffText.slice(0, 4000)}
--- END DIFF ---

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

  for (const provider of fallbackChain) {
    if (!provider.apiKey) continue;

    try {
      console.log(`📡 Consultando modelo con ${provider.name} (${provider.model || provider.id})...`);

      // GROQ CALL (with candidate models)
      if (provider.id === 'groq' || provider.id.includes('groq')) {
        const candidateModels = [provider.model || 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'];
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
              max_tokens: 800
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary,
                  verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
                  suggestions: parsed.suggestions || []
                };
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
              max_tokens: 800
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary,
                  verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
                  suggestions: parsed.suggestions || []
                };
              }
            } else {
              console.warn(`[Cerebras / ${candidate}] HTTP ${res.status}: ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`);
            }
          } catch (e) {}
        }
      }

      // OPENROUTER CALL (with candidate free/paid models)
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
              max_tokens: 800
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.summary) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary,
                  verdict: parsed.verdict || (secrets.length > 0 ? 'SECURITY_BLOCK' : 'APPROVED'),
                  suggestions: parsed.suggestions || []
                };
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
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
        } else {
          console.warn(`[Google Gemini] HTTP ${res.status}: ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`);
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
          max_tokens: 800
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
        } else {
          console.warn(`[GitHub Models] HTTP ${res.status}: ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`);
        }
      }
    } catch (e) {
      console.warn(`Proveedor ${provider.name} no pudo responder (${e.message}). Probando siguiente en cadena de fallback...`);
    }
  }

  // 4. Deterministic Fallback Heuristic Generator (Zero External Failure)
  return generateDeterministicAudit(diffText, secrets, vulnerabilities, metrics);
}

function generateDeterministicAudit(diffText, secrets, vulnerabilities, metrics) {
  const isSecurityBlock = secrets.length > 0;
  const isCriticalVuln = vulnerabilities.some(v => v.severity === 'CRITICAL');
  const verdict = isSecurityBlock ? 'SECURITY_BLOCK' : (isCriticalVuln ? 'CHANGES_REQUESTED' : (vulnerabilities.length > 1 ? 'CHANGES_REQUESTED' : 'APPROVED'));

  const autoSuggestions = [];
  if (secrets.length > 0) {
    autoSuggestions.push(`Revocar de inmediato los ${secrets.length} secreto(s) expuestos y moverlos a GitHub Actions Secrets o variables de entorno.`);
  }
  for (const v of vulnerabilities.slice(0, 3)) {
    autoSuggestions.push(`${v.file}:${v.line} — ${v.recommendation}`);
  }
  if (autoSuggestions.length === 0) {
    autoSuggestions.push('El diff respeta las pautas de seguridad estática de Terra. Proceder con testing de regresión.');
  }

  const summary = isSecurityBlock
    ? `Peligro inminente: Se detectaron ${secrets.length} credenciales o tokens en texto plano en los archivos modificados. La fusión debe bloquearse hasta su revocación.`
    : (isCriticalVuln
      ? `Revisión requerida: El diff introduce vulnerabilidades críticas de seguridad (${vulnerabilities.map(v => v.type).join(', ')}). Se requiere corrección antes de continuar.`
      : `Auditoría satisfactoria: El cambio modifica ${metrics.addedLines} líneas en ${metrics.filesCount} archivo(s) sin fugas de secretos ni vulnerabilidades bloqueantes.`);

  return {
    providerUsed: 'Motor Determinista Heurístico AST ($0 Compute)',
    summary,
    verdict,
    suggestions: autoSuggestions
  };
}

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

  const lines = diffContent.split('\n');
  let addedLines = 0;
  let deletedLines = 0;
  let filesModified = new Set();

  for (const l of lines) {
    if (l.startsWith('+++ b/')) filesModified.add(l.substring(6).trim());
    else if (l.startsWith('+') && !l.startsWith('+++')) addedLines++;
    else if (l.startsWith('-') && !l.startsWith('---')) deletedLines++;
  }

  const metrics = {
    addedLines,
    deletedLines,
    filesCount: filesModified.size || 1,
    filesModified: Array.from(filesModified)
  };

  const secrets = scanSecrets(diffContent);
  const vulnerabilities = scanVulnerabilities(diffContent);
  const aiAudit = await queryAIWithFallback(diffContent, secrets, vulnerabilities, metrics);

  let riskScore = 15;
  if (secrets.length > 0) riskScore += secrets.length * 35;
  if (vulnerabilities.some(v => v.severity === 'CRITICAL')) riskScore += 35;
  riskScore += vulnerabilities.filter(v => v.severity === 'HIGH').length * 15;
  riskScore += Math.min(20, Math.floor(addedLines / 40) * 5);
  riskScore = Math.min(100, Math.max(5, riskScore));

  const finalVerdict = secrets.length > 0 ? 'SECURITY_BLOCK' : (aiAudit.verdict || (riskScore > 65 ? 'CHANGES_REQUESTED' : 'APPROVED'));

  const auditReport = {
    id: 'praedator_' + Date.now(),
    mode,
    repo: mode === 'pr' ? targetRepo : 'Local Diff Workspace',
    prNumber: mode === 'pr' ? inputData : null,
    riskScore,
    verdict: finalVerdict,
    addedLines,
    deletedLines,
    filesCount: metrics.filesCount,
    filesModified: metrics.filesModified,
    secrets,
    vulnerabilities,
    providerUsed: aiAudit.providerUsed,
    summary: aiAudit.summary,
    suggestions: aiAudit.suggestions,
    diffPreview: diffContent.slice(0, 3000),
    timestamp: new Date().toISOString()
  };

  console.log('==============================================');
  console.log(`AUDITORÍA COMPLETADA`);
  console.log(`Risk Score: ${riskScore}/100`);
  console.log(`Veredicto: ${finalVerdict}`);
  console.log(`Secretos detectados: ${secrets.length}`);
  console.log(`Vulnerabilidades: ${vulnerabilities.length}`);
  console.log(`Proveedor IA: ${aiAudit.providerUsed}`);
  console.log('==============================================');

  // Post official Praedator review comment to GitHub PR
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
        `| **Exposed Secrets** | ` + secrets.length + ` | ` + (secrets.length > 0 ? '🛑 **SECURITY BLOCK**' : '✅ Clean') + ` |`,
        `| **OWASP Vulnerabilities** | ` + vulnerabilities.length + ` | ` + (vulnerabilities.length > 0 ? '⚠️ Findings' : '✅ Clean') + ` |`,
        `| **Code Changes** | +` + addedLines + ` / -` + deletedLines + ` | ` + metrics.filesCount + ` file(s) |`,
        ``,
        `### 📋 Executive Summary`,
        `>` + (aiAudit.summary ? aiAudit.summary.replace(/\n/g, ' ') : 'Auditoría completada satisfactoriamente.'),
        ``
      ];

      if (aiAudit.suggestions && aiAudit.suggestions.length > 0) {
        commentLines.push('### 💡 Surgical Remediation & Action Items');
        for (const s of aiAudit.suggestions) {
          commentLines.push('- ' + s);
        }
        commentLines.push('');
      }

      if (secrets.length > 0) {
        commentLines.push('### 🚨 Critical Security Warning: Plaintext Secrets Detected');
        commentLines.push('The following tokens were detected in the diff and must be invalidated immediately:');
        commentLines.push('```text');
        for (const sec of secrets) {
          commentLines.push('[' + sec.type + '] Line ' + sec.line + ': ' + sec.sanitizedSnippet);
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

  const outDir = path.join(process.cwd(), 'audits', 'praedator');
  fs.mkdirSync(outDir, { recursive: true });
  const auditFile = path.join(outDir, `audit-${Date.now()}.json`);
  fs.writeFileSync(auditFile, JSON.stringify(auditReport, null, 2));
  console.log(`✔ Audit saved to ${auditFile}`);
}

run();
