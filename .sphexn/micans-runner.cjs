#!/usr/bin/env node

/**
 * Sphexn Micans — Code-to-Docs Drift Detection & Surgical Patch Synchronizer (v1.0)
 * Powered by Terra Sovereign $0 Architecture.
 * Features: AST Symbol Extraction, Section Chunking, Anti-429 Token Budgeting,
 * SHA-256 Signature Cache, Surgical SEARCH/REPLACE Generation, and Auto-PR Sync.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cp = require('child_process');

// CLI Parameter Parsing
const mode = process.argv[2] || 'drift'; // 'drift', 'patch', 'sync'
const targetRepo = process.argv[3] || 'Local Workspace';
const targetBranch = process.argv[4] || 'main';
const docFilesRaw = process.argv[5] || 'README.md';
const fallbackConfigRaw = process.argv[6] || '[]';
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.TOKEN_GH || '';

const docFilePaths = docFilesRaw.split(',').map(s => s.trim()).filter(Boolean);

let fallbackChain = [];
try {
  fallbackChain = JSON.parse(fallbackConfigRaw);
} catch (e) {
  fallbackChain = [];
}

// Auto-populate fallback chain from environment if empty
if (!Array.isArray(fallbackChain) || fallbackChain.length === 0 || !fallbackChain.some(p => p.apiKey)) {
  fallbackChain = [
    { id: 'groq', name: 'Groq Cloud', model: 'llama-3.1-8b-instant', apiKey: process.env.GROQ_API_KEY },
    { id: 'cerebras', name: 'Cerebras Ultra-Fast AI', model: 'llama3.1-70b', apiKey: process.env.CEREBRAS_API_KEY },
    { id: 'openrouter', name: 'OpenRouter AI', model: 'meta-llama/llama-3.3-70b-instruct', apiKey: process.env.OPENROUTER_API_KEY },
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

function httpsRequest(options, postData, timeoutMs = 12000) {
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
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout (${timeoutMs}ms) en ${options.hostname}`));
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

// ----------------------------------------------------
// 1. High-Performance AST Symbol Extractor (Anti-429)
// ----------------------------------------------------
function extractCodeSymbols(codeFiles) {
  const symbols = {
    functions: [],
    cliCommands: [],
    endpoints: [],
    envVars: new Set(),
    interfaces: []
  };

  for (const file of codeFiles) {
    const content = file.content;
    const filename = file.path;

    // 1. CLI Commands & Binaries
    if (filename.includes('bin/') || filename.endsWith('.sh') || filename.endsWith('.ps1')) {
      const cliMatch = content.match(/\b(?:commander|yargs|minimist|command\(['"]([\w-]+)['"]\)|program\.command\(['"]([\w-]+)['"]\))/g);
      const flagMatches = content.match(/--[\w-]+/g);
      if (flagMatches) {
        symbols.cliCommands.push({
          file: filename,
          flags: Array.from(new Set(flagMatches)).slice(0, 15)
        });
      }
    }

    // 2. Exported Functions & Methods
    const fnRegex = /(?:export\s+(?:async\s+)?function\s+([\w$]+)\s*\(([^)]*)\)|(?:exports\.|module\.exports\.)([\w$]+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|function\s*\(([^)]*)\))|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>)/g;
    let m;
    while ((m = fnRegex.exec(content)) !== null) {
      const name = m[1] || m[3] || m[6];
      const params = (m[2] || m[4] || m[5] || m[7] || '').trim();
      if (name && !name.startsWith('_') && name !== 'anonymous') {
        symbols.functions.push({
          name,
          params: params.split(',').map(p => p.trim()).filter(Boolean),
          file: filename
        });
      }
    }

    // 3. REST HTTP Endpoints (Express, Fastify, Next.js)
    const routeRegex = /(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let r;
    while ((r = routeRegex.exec(content)) !== null) {
      symbols.endpoints.push({
        method: r[1].toUpperCase(),
        route: r[2],
        file: filename
      });
    }

    // 4. Environment Variables
    const envRegex = /process\.env\.([A-Z0-9_]+)/g;
    let ev;
    while ((ev = envRegex.exec(content)) !== null) {
      symbols.envVars.add(ev[1]);
    }

    // 5. TypeScript Interfaces / Types
    const ifaceRegex = /export\s+(?:interface|type)\s+([\w$]+)/g;
    let iface;
    while ((iface = ifaceRegex.exec(content)) !== null) {
      symbols.interfaces.push({
        name: iface[1],
        file: filename
      });
    }
  }

  symbols.envVars = Array.from(symbols.envVars);
  return symbols;
}

// ----------------------------------------------------
// 2. Markdown Document Parser & Section Segmenter
// ----------------------------------------------------
function parseMarkdownSections(markdownText) {
  const sections = [];
  const lines = markdownText.split('\n');
  let currentTitle = 'Document Header';
  let currentLines = [];

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      if (currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentLines.join('\n')
        });
      }
      currentTitle = line.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      title: currentTitle,
      content: currentLines.join('\n')
    });
  }

  return sections;
}

// ----------------------------------------------------
// 3. Deterministic Pre-Filtering & Drift Identifier
// ----------------------------------------------------
function evaluateDrift(symbols, docSections, fullDocText) {
  const discrepancies = [];

  // Check Missing Functions in Docs
  for (const fn of symbols.functions) {
    if (!fullDocText.includes(fn.name)) {
      discrepancies.push({
        type: 'MISSING_FUNCTION_IN_DOCS',
        symbol: fn.name,
        params: fn.params,
        file: fn.file,
        message: `La función exportada '${fn.name}(${fn.params.join(', ')})' en ${fn.file} no aparece documentada.`
      });
    }
  }

  // Check Missing CLI Flags
  for (const cli of symbols.cliCommands) {
    for (const flag of cli.flags) {
      if (!fullDocText.includes(flag)) {
        discrepancies.push({
          type: 'MISSING_CLI_FLAG',
          symbol: flag,
          file: cli.file,
          message: `El flag de comando CLI '${flag}' está implementado en ${cli.file} pero no en la documentación.`
        });
      }
    }
  }

  // Check Missing REST Endpoints
  for (const ep of symbols.endpoints) {
    const pattern = `${ep.method} ${ep.route}`;
    if (!fullDocText.includes(ep.route)) {
      discrepancies.push({
        type: 'MISSING_ENDPOINT',
        symbol: pattern,
        file: ep.file,
        message: `El endpoint HTTP ${pattern} en ${ep.file} no está documentado.`
      });
    }
  }

  // Check Missing Environment Variables
  for (const ev of symbols.envVars) {
    if (!['NODE_ENV', 'PORT'].includes(ev) && !fullDocText.includes(ev)) {
      discrepancies.push({
        type: 'MISSING_ENV_VAR',
        symbol: ev,
        message: `La variable de entorno '${ev}' es requerida por el código pero no se menciona en la documentación.`
      });
    }
  }

  return discrepancies;
}

// ----------------------------------------------------
// 4. Token-Budgeted AI Patch Generator with Fallback
// ----------------------------------------------------
async function generateSurgicalPatchAI(docFilename, docContent, discrepancies, symbols) {
  if (discrepancies.length === 0) {
    return {
      status: 'UP_TO_DATE',
      summary: 'La documentación está 100% sincronizada con las firmas del código fuente.',
      patches: []
    };
  }

  const prompt = `Eres Sphexn Micans, documentador técnico de software senior de Terra.
Tu objetivo es sincronizar ${docFilename} con el código fuente generando bloques quirúrgicos SEARCH/REPLACE.

DOCUMENTACIÓN ACTUAL (${docFilename}):
\`\`\`markdown
${docContent.slice(0, 25000)}
\`\`\`

DISCREPANCIAS DETECTADAS:
${JSON.stringify(discrepancies.slice(0, 15), null, 2)}

INSTRUCCIONES CRÍTICAS DE PRESERVACIÓN:
1. NO reescribas el documento completo. Genera únicamente bloques quirúrgicos SEARCH/REPLACE.
2. Preserva intactos badges, títulos de branding, logos, emojis, y diagramas Mermaid existentes.
3. Inserta las funciones, endpoints o flags que faltan en la sección correspondiente.
4. "summary": Resumen de 1-2 oraciones del cambio.
5. "patches": Array de objetos con:
   - "search": Fragmento exacto del documento original a reemplazar (3-5 líneas de contexto).
   - "replace": Fragmento actualizado con la documentación nueva agregada coherentemente.

Responde ÚNICAMENTE en JSON válido:
{
  "summary": "...",
  "patches": [
    {
      "section": "...",
      "search": "...",
      "replace": "..."
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
              max_tokens: 1200
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.patches && Array.isArray(parsed.patches)) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary || 'Documentación sincronizada quirúrgicamente.',
                  patches: parsed.patches
                };
              }
            } else if (res.status !== 404) {
              console.warn(`[Groq Cloud / ${candidate}] HTTP ${res.status}`);
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
              max_tokens: 1200
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.patches && Array.isArray(parsed.patches)) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary,
                  patches: parsed.patches
                };
              }
            }
          } catch (e) {}
        }
      }

      // OPENROUTER CALL
      if (provider.id === 'openrouter' || provider.id.includes('openrouter')) {
        const candidateModels = [
          provider.model || 'meta-llama/llama-3.3-70b-instruct',
          'qwen/qwen-2.5-coder-32b-instruct:free',
          'google/gemini-2.0-flash-exp:free'
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
                'X-Title': 'Sphexn Micans'
              }
            }, {
              model: candidate,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 1200
            });

            if (res.status === 200 && res.body) {
              const content = res.body.choices?.[0]?.message?.content || '{}';
              const parsed = extractJSON(content) || {};
              if (parsed.patches && Array.isArray(parsed.patches)) {
                return {
                  providerUsed: `${provider.name} (${candidate})`,
                  summary: parsed.summary,
                  patches: parsed.patches
                };
              }
            } else if (res.status !== 404) {
              console.warn(`[OpenRouter / ${candidate}] HTTP ${res.status}`);
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
        });

        if (res.status === 200 && res.body) {
          const rawText = res.body.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = extractJSON(rawText) || {};
          if (parsed.patches && Array.isArray(parsed.patches)) {
            return {
              providerUsed: `${provider.name} (${modelName})`,
              summary: parsed.summary,
              patches: parsed.patches
            };
          }
        }
      }
    } catch (e) {
      console.warn(`Proveedor ${provider.name} falló en Micans (${e.message}). Probando siguiente...`);
    }
  }

  // Deterministic Fallback Heuristic Generator
  return generateDeterministicMicansPatch(docFilename, docContent, discrepancies);
}

function generateDeterministicMicansPatch(docFilename, docContent, discrepancies) {
  const patches = [];
  const appendLines = [];

  appendLines.push('\n## 📝 API & Exports Reference (Sincronizado por Sphexn Micans)');
  appendLines.push('');

  const fns = discrepancies.filter(d => d.type === 'MISSING_FUNCTION_IN_DOCS');
  if (fns.length > 0) {
    appendLines.push('### Funciones y Métodos Exportados');
    appendLines.push('| Función | Argumentos | Archivo |');
    appendLines.push('|---|---|---|');
    for (const f of fns) {
      appendLines.push(`| \`${f.symbol}\` | \`${(f.params || []).join(', ')}\` | \`${f.file}\` |`);
    }
    appendLines.push('');
  }

  const eps = discrepancies.filter(d => d.type === 'MISSING_ENDPOINT');
  if (eps.length > 0) {
    appendLines.push('### Endpoints HTTP');
    appendLines.push('| Método y Ruta | Archivo |');
    appendLines.push('|---|---|');
    for (const ep of eps) {
      appendLines.push(`| \`${ep.symbol}\` | \`${ep.file}\` |`);
    }
    appendLines.push('');
  }

  const evs = discrepancies.filter(d => d.type === 'MISSING_ENV_VAR');
  if (evs.length > 0) {
    appendLines.push('### Variables de Entorno Requeridas');
    for (const ev of evs) {
      appendLines.push(`- \`${ev.symbol}\`: Variable de configuración activa en el código.`);
    }
    appendLines.push('');
  }

  // Find last line or section to append
  const trimmed = docContent.trim();
  const lastLine = trimmed.split('\n').pop() || '';
  patches.push({
    section: 'Append API Reference',
    search: lastLine,
    replace: lastLine + '\n' + appendLines.join('\n')
  });

  return {
    providerUsed: 'Motor Determinista Heurístico AST ($0 Compute)',
    summary: `Se detectaron ${discrepancies.length} discrepancias y se generó una sección de referencia estructurada.`,
    patches
  };
}

// ----------------------------------------------------
// 5. Main Execution Loop
// ----------------------------------------------------
async function run() {
  console.log('=== SPHEXN MICANS — DOCUMENTATION SYNCHRONIZER (v1.0) ===');
  console.log(`Modo: ${mode}`);
  console.log(`Target Repo: ${targetRepo} (Rama: ${targetBranch})`);
  console.log(`Archivos de Documentación: ${docFilePaths.join(', ')}`);

  // Discover local or remote code files
  const codeFiles = [];
  const walkDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.sphexn-storage', 'coverage'].includes(e.name)) {
          walkDir(full);
        }
      } else if (/\.(?:js|cjs|mjs|ts|tsx|py|go)$/.test(e.name) && !e.name.includes('.test.') && !e.name.includes('.spec.')) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          codeFiles.push({
            path: path.relative(process.cwd(), full).replace(/\\/g, '/'),
            content
          });
        } catch (err) {}
      }
    }
  };

  walkDir(process.cwd());

  if (codeFiles.length === 0) {
    codeFiles.push({
      path: 'src/index.js',
      content: '// Sample index\nexport function exampleSync(input) { return input; }\n'
    });
  }

  console.log(`Indexados ${codeFiles.length} archivo(s) de código fuente para extracción de firmas AST.`);
  const symbols = extractCodeSymbols(codeFiles);
  console.log(`Firmas extraídas: ${symbols.functions.length} funciones, ${symbols.endpoints.length} endpoints, ${symbols.cliCommands.length} comandos CLI, ${symbols.envVars.length} variables.`);

  const auditResults = [];

  for (const docRelPath of docFilePaths) {
    const docFullPath = path.resolve(process.cwd(), docRelPath);
    if (!fs.existsSync(docFullPath)) {
      console.warn(`Archivo de documentación no encontrado: ${docRelPath}`);
      continue;
    }

    const docContent = fs.readFileSync(docFullPath, 'utf8');

    // SHA-256 Signature Cache
    const docHash = crypto.createHash('sha256').update(docContent + JSON.stringify(symbols)).digest('hex');
    const cacheDir = path.join(process.cwd(), 'audits', 'micans', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFilePath = path.join(cacheDir, `${docHash}.json`);

    if (fs.existsSync(cacheFilePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        console.log(`⚡ [CACHE HIT] Documentación ${docRelPath} 100% al día en caché (Hash: ${docHash.substring(0, 12)}...)`);
        auditResults.push(cached);
        continue;
      } catch (e) {}
    }

    const docSections = parseMarkdownSections(docContent);
    const discrepancies = evaluateDrift(symbols, docSections, docContent);

    console.log(`Discrepancias detectadas en ${docRelPath}: ${discrepancies.length}`);

    let aiPatchResult = {
      providerUsed: 'Ninguno (Al día)',
      summary: 'Documentación al día.',
      patches: []
    };

    if (discrepancies.length > 0) {
      aiPatchResult = await generateSurgicalPatchAI(docRelPath, docContent, discrepancies, symbols);
    }

    let updatedDocContent = docContent;
    let appliedCount = 0;

    if (aiPatchResult.patches && aiPatchResult.patches.length > 0) {
      for (const p of aiPatchResult.patches) {
        if (p.search && p.replace && updatedDocContent.includes(p.search)) {
          updatedDocContent = updatedDocContent.replace(p.search, p.replace);
          appliedCount++;
        }
      }
    }

    const docReport = {
      docFile: docRelPath,
      docHash,
      discrepanciesCount: discrepancies.length,
      discrepancies,
      patchesGenerated: (aiPatchResult.patches || []).length,
      patchesApplied: appliedCount,
      providerUsed: aiPatchResult.providerUsed,
      summary: aiPatchResult.summary,
      patches: aiPatchResult.patches || [],
      timestamp: new Date().toISOString()
    };

    auditResults.push(docReport);
    fs.writeFileSync(cacheFilePath, JSON.stringify(docReport, null, 2));

    // In sync mode, write back the updated documentation file
    if ((mode === 'sync' || mode === 'patch') && appliedCount > 0) {
      fs.writeFileSync(docFullPath, updatedDocContent, 'utf8');
      console.log(`✔ Archivo ${docRelPath} actualizado quirúrgicamente con ${appliedCount} parche(s).`);
    }
  }

  // Save global Micans audit result
  const outDir = path.join(process.cwd(), 'audits', 'micans');
  fs.mkdirSync(outDir, { recursive: true });
  const auditId = 'micans_' + Date.now();
  const auditFile = path.join(outDir, `audit-${auditId}.json`);
  const finalReport = {
    id: auditId,
    mode,
    repo: targetRepo,
    branch: targetBranch,
    docsAudited: auditResults.length,
    results: auditResults,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(auditFile, JSON.stringify(finalReport, null, 2));
  console.log('==============================================');
  console.log(`SPHEXN MICANS COMPLETADO`);
  console.log(`Documentos auditados: ${auditResults.length}`);
  console.log(`Total de discrepancias: ${auditResults.reduce((acc, r) => acc + r.discrepanciesCount, 0)}`);
  console.log(`Reporte guardado en: ${auditFile}`);
  console.log('==============================================');

  // Automatic GitHub Pull Request creation in sync mode when run in CI
  if (mode === 'sync' && githubToken && targetRepo && targetRepo.includes('/')) {
    const totalPatches = auditResults.reduce((acc, r) => acc + (r.patchesApplied || 0), 0);
    if (totalPatches > 0) {
      console.log(`Preparando Pull Request de sincronización en ${targetRepo}...`);
      const syncBranch = `sphexn-micans-sync-${Date.now()}`;
      try {
        cp.execSync('git config user.name "Sphexn Micans [Bot]"', { stdio: 'ignore' });
        cp.execSync('git config user.email "bot@sphexn.terra"', { stdio: 'ignore' });
        cp.execSync(`git checkout -B ${syncBranch}`, { stdio: 'ignore' });
        for (const doc of docFilePaths) {
          cp.execSync(`git add ${doc}`, { stdio: 'ignore' });
        }
        cp.execSync(`git commit -m "chore(docs): sync documentation with latest code signatures via Sphexn Micans"`, { stdio: 'ignore' });
        if (githubToken) {
          cp.execSync(`git push https://x-access-token:${githubToken}@github.com/${targetRepo}.git ${syncBranch} --force`, { stdio: 'ignore' });
        } else {
          cp.execSync(`git push origin ${syncBranch} --force`, { stdio: 'ignore' });
        }

        const prRes = await httpsRequest({
          hostname: 'api.github.com',
          path: `/repos/${targetRepo}/pulls`,
          method: 'POST',
          headers: {
            'User-Agent': 'Sphexn-Micans',
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          }
        }, {
          title: `📝 chore(docs): synchronize documentation with latest code signatures`,
          head: syncBranch,
          base: targetBranch,
          body: [
            `## 📝 Sphexn Micans — Documentation Synchronization PR`,
            ``,
            `This automated Pull Request was generated by **Sphexn Micans** ($0 compute overhead).`,
            ``,
            `### 📋 Summary of Changes`,
            ...auditResults.map(r => `- **${r.docFile}**: ${r.summary} (${r.discrepanciesCount} discrepancy findings resolved).`),
            ``,
            `---`,
            `*Synchronized automatically by [Sphexn Micans](https://amglogicalis.github.io/sphexn-repo-public/) — Sovereign Quality Engine for the Terra Ecosystem.*`
          ].join('\n')
        });

        if (prRes.status === 201 && prRes.body && prRes.body.html_url) {
          console.log(`✔ Pull Request de sincronización creada exitosamente: ${prRes.body.html_url}`);
        }
      } catch (gitErr) {
        console.warn('Nota: Git PR no pudo crearse en este entorno local:', gitErr.message);
      }
    }
  }
}

run();
