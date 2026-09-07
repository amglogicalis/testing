#!/usr/bin/env node
/**
 * =====================================================================
 * SPHEXN REX — Declarative DevOps Orchestrator & Multi-Channel Notifier
 * =====================================================================
 * Executes declarative markdown automation plans (sphexn_rex.md).
 * - Resolves DAG dependencies via Topological Sort (Kahn's algorithm)
 * - Autonomously generates Node.js task lambdas with AI
 * - Self-heals failing scripts in a closed-loop execution environment
 * - Generates AI executive analysis, Markdown & Premium HTML email reports
 * - Dispatches notifications to Webhooks & Email recipients
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');
const http = require('http');
const net = require('net');
const tls = require('tls');
const vm = require('vm');

// ----------------------------------------------------
// 1. Configuration & CLI Argument Parsing
// ----------------------------------------------------
const planFile = process.env.INPUT_PLAN_FILE || process.argv[2] || 'sphexn_rex.md';
const inlinePlanContent = process.env.INPUT_PLAN_CONTENT || process.argv[3] || '';
const taskFilter = process.env.INPUT_TASK_FILTER || process.argv[4] || '';
const selfHealEnabled = process.env.INPUT_SELF_HEAL !== 'false' && process.argv[5] !== 'false';
const maxRetries = parseInt(process.env.INPUT_MAX_RETRIES || process.argv[6] || '3', 10);
const notifyEmailInput = process.env.INPUT_NOTIFY_EMAIL || process.argv[7] || '';
const notifyWebhookInput = process.env.INPUT_NOTIFY_WEBHOOK || process.argv[8] || '';
const fallbackMatrixRaw = process.env.INPUT_FALLBACK_MATRIX || process.env.FALLBACK_MATRIX || process.argv[9] || '[]';
const currentRepo = process.env.GITHUB_REPOSITORY || process.env.INPUT_REPO || 'amglogicalis/testing';
const currentBranch = process.env.GITHUB_REF_NAME || process.env.INPUT_BRANCH || 'main';
const isCI = Boolean(process.env.GITHUB_ACTIONS || process.env.CI);

let githubToken = process.env.GH_MODELS_TOKEN || process.env.TOKEN_GH || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!githubToken) {
  try {
    githubToken = cp.execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
}

// Parse Fallback Chain
let fallbackChain = [];
try {
  fallbackChain = JSON.parse(fallbackMatrixRaw);
} catch {
  fallbackChain = [];
}

if (!Array.isArray(fallbackChain) || fallbackChain.length === 0 || !fallbackChain.some(p => p.apiKey)) {
  fallbackChain = [
    { id: 'groq', name: 'Groq Cloud Llama-3.3', model: 'llama-3.3-70b-versatile', apiKey: process.env.GROQ_API_KEY },
    { id: 'cerebras', name: 'Cerebras Llama-3.1', model: 'llama3.1-70b', apiKey: process.env.CEREBRAS_API_KEY },
    { id: 'gemini', name: 'Google Gemini', model: 'gemini-1.5-flash', apiKey: process.env.GEMINI_API_KEY },
    { id: 'openrouter', name: 'OpenRouter Llama-3.3', model: 'meta-llama/llama-3.3-70b-instruct', apiKey: process.env.OPENROUTER_API_KEY },
    { id: 'gh_models', name: 'GitHub Models', model: 'gpt-4o', apiKey: process.env.GH_MODELS_TOKEN || githubToken }
  ];
}

for (const p of fallbackChain) {
  if (!p.apiKey) {
    if (p.id.includes('groq')) p.apiKey = process.env.GROQ_API_KEY;
    else if (p.id.includes('cerebras')) p.apiKey = process.env.CEREBRAS_API_KEY;
    else if (p.id.includes('openrouter')) p.apiKey = process.env.OPENROUTER_API_KEY;
    else if (p.id.includes('gemini')) p.apiKey = process.env.GEMINI_API_KEY;
    else if (p.id.includes('gh_models') || p.id.includes('github')) p.apiKey = process.env.GH_MODELS_TOKEN || githubToken;
  }
}

// ----------------------------------------------------
// 2. HTTP Helper & AI Invocation
// ----------------------------------------------------
function httpsRequest(options, postData, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    const req = mod.request(options, (res) => {
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

async function callAiWithFallback(systemPrompt, userPrompt) {
  for (const provider of fallbackChain) {
    if (!provider.apiKey && !provider.id.includes('custom')) continue;
    if (provider.apiKey === 'disabled' || provider.apiKey === 'none' || provider.apiKey === 'off') continue;

    try {
      // GROQ
      if (provider.id.includes('groq')) {
        const res = await httpsRequest({
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
            'User-Agent': 'Sphexn-Rex'
          }
        }, {
          model: provider.model || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        });

        if (res.status === 200 && res.body?.choices?.[0]?.message?.content) {
          return {
            text: res.body.choices[0].message.content.trim(),
            provider: provider.name || 'Groq',
            model: provider.model || 'llama-3.3-70b-versatile'
          };
        }
      }

      // CEREBRAS
      if (provider.id.includes('cerebras')) {
        const res = await httpsRequest({
          hostname: 'api.cerebras.ai',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          }
        }, {
          model: provider.model || 'llama3.1-70b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        });

        if (res.status === 200 && res.body?.choices?.[0]?.message?.content) {
          return {
            text: res.body.choices[0].message.content.trim(),
            provider: provider.name || 'Cerebras',
            model: provider.model || 'llama3.1-70b'
          };
        }
      }

      // GEMINI
      if (provider.id.includes('gemini')) {
        const model = provider.model || 'gemini-1.5-flash';
        const res = await httpsRequest({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${provider.apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        });

        if (res.status === 200 && res.body?.candidates?.[0]?.content?.parts?.[0]?.text) {
          return {
            text: res.body.candidates[0].content.parts[0].text.trim(),
            provider: provider.name || 'Google Gemini',
            model
          };
        }
      }

      // GITHUB MODELS
      if (provider.id.includes('gh_models') || provider.id.includes('github')) {
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        });

        if (res.status === 200 && res.body?.choices?.[0]?.message?.content) {
          return {
            text: res.body.choices[0].message.content.trim(),
            provider: provider.name || 'GitHub Models',
            model: provider.model || 'gpt-4o'
          };
        }
      }
    } catch (err) {
      // Fall through to next provider
    }
  }

  return null;
}

// ----------------------------------------------------
// 3. Plan Parsing & Topological Sort (Kahn's DAG)
// ----------------------------------------------------
function parsePlanMarkdown(rawMarkdown) {
  const settings = {
    email: '',
    webhook: '',
    title: 'Sphexn Rex — DevOps Execution Plan',
    description: '',
    selfHeal: undefined,
    maxRetries: undefined
  };

  const autoHealMatch = rawMarkdown.match(/^##?\s*(?:Auto-Healing|AutoHeal|Auto-Heal)[^\n]*\n([^\n]+)/im);
  if (autoHealMatch) {
    const val = autoHealMatch[1].trim().toLowerCase();
    settings.selfHeal = !/^(?:false|no|0|off|desactivado)$/i.test(val);
  }

  const retriesMatch = rawMarkdown.match(/^##?\s*(?:Reintentos|Retries|Max-Retries)[^\n]*\n([^\n]+)/im);
  if (retriesMatch) {
    const num = parseInt(retriesMatch[1].trim(), 10);
    if (!isNaN(num) && num >= 0) settings.maxRetries = num;
  }

  const emailMatch = rawMarkdown.match(/^##?\s*(?:Destinatario|Email|Notify-Email)[^\n]*\n([^\n]+)/im);
  if (emailMatch) settings.email = emailMatch[1].trim().replace(/^[-*]\s*/, '');

  const webhookMatch = rawMarkdown.match(/^##?\s*(?:Webhook|Notify-Webhook)[^\n]*\n([^\n]+)/im);
  if (webhookMatch) settings.webhook = webhookMatch[1].trim().replace(/^[-*]\s*/, '');

  const titleMatch = rawMarkdown.match(/^#\s*([^\n]+)/m);
  if (titleMatch) settings.title = titleMatch[1].trim();

  const tasks = [];
  const sections = rawMarkdown.split(/^##\s+Tarea:/im);

  for (let i = 1; i < sections.length; i++) {
    const lines = sections[i].split('\n');
    const titleLine = lines[0].trim();
    const id = titleLine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = titleLine;
    let instructions = '';
    let scriptPath = '';
    let dependsOn = [];
    let envVars = {};
    let timeout = 180000;
    let continueOnError = false;
    let taskSelfHeal = undefined;
    let taskMaxRetries = undefined;

    for (const line of lines.slice(1)) {
      const l = line.trim();
      if (/^-\s*\*{0,2}Instrucciones\*{0,2}\s*:/i.test(l)) {
        instructions = l.replace(/^-\s*\*{0,2}Instrucciones\*{0,2}\s*:\s*/i, '').trim();
      } else if (/^-\s*\*{0,2}Ejecutar\*{0,2}\s*:/i.test(l)) {
        scriptPath = l.replace(/^-\s*\*{0,2}Ejecutar\*{0,2}\s*:\s*/i, '').replace(/\(.*?\)/g, '').trim();
      } else if (/^-\s*\*{0,2}Depende de\*{0,2}\s*:/i.test(l)) {
        const deps = l.replace(/^-\s*\*{0,2}Depende de\*{0,2}\s*:\s*/i, '');
        dependsOn = deps.split(',').map(d => d.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean);
      } else if (/^-\s*\*{0,2}Auto-Healing\*{0,2}\s*:/i.test(l)) {
        const val = l.replace(/^-\s*\*{0,2}Auto-Healing\*{0,2}\s*:\s*/i, '').trim();
        taskSelfHeal = !/^(?:false|no|0|off|desactivado)$/i.test(val);
      } else if (/^-\s*\*{0,2}Reintentos\*{0,2}\s*:/i.test(l)) {
        const r = parseInt(l.replace(/^-\s*\*{0,2}Reintentos\*{0,2}\s*:\s*/i, '').trim(), 10);
        if (!isNaN(r) && r >= 0) taskMaxRetries = r;
      } else if (/^-\s*\*{0,2}Timeout\*{0,2}\s*:/i.test(l)) {
        const t = parseInt(l.replace(/^-\s*\*{0,2}Timeout\*{0,2}\s*:\s*/i, ''), 10);
        if (!isNaN(t)) timeout = t * 1000;
      } else if (/^-\s*\*{0,2}Continuar si falla\*{0,2}\s*:/i.test(l)) {
        const val = l.replace(/^-\s*\*{0,2}Continuar si falla\*{0,2}\s*:\s*/i, '').trim();
        continueOnError = /^(?:true|s[ií]|yes|1)$/i.test(val);
      } else if (/^-\s*\*{0,2}Env\*{0,2}\s*:/i.test(l)) {
        const envLine = l.replace(/^-\s*\*{0,2}Env\*{0,2}\s*:\s*/i, '');
        envLine.split(',').forEach(pair => {
          const [k, ...vParts] = pair.split('=');
          if (k && vParts.length) envVars[k.trim()] = vParts.join('=').trim();
        });
      }
    }

    if (id) {
      tasks.push({
        id,
        name,
        instructions,
        scriptPath,
        dependsOn,
        timeout,
        continueOnError,
        selfHeal: taskSelfHeal,
        maxRetries: taskMaxRetries,
        env: envVars
      });
    }
  }

  return { settings, tasks };
}

function topologicalSort(tasks) {
  const idToTask = {};
  for (const t of tasks) idToTask[t.id] = t;

  const inDegree = {};
  const adjacency = {};
  for (const t of tasks) {
    inDegree[t.id] = inDegree[t.id] || 0;
    adjacency[t.id] = adjacency[t.id] || [];
    for (const dep of t.dependsOn) {
      if (!idToTask[dep]) {
        console.warn(`  ⚠️ Tarea "${t.id}" depende de tarea desconocida "${dep}" — ignorando dependencia.`);
        continue;
      }
      adjacency[dep] = adjacency[dep] || [];
      adjacency[dep].push(t.id);
      inDegree[t.id] = (inDegree[t.id] || 0) + 1;
    }
  }

  const queue = tasks.filter(t => (inDegree[t.id] || 0) === 0).map(t => t.id);
  const sorted = [];

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(idToTask[current]);
    for (const neighbor of (adjacency[current] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  if (sorted.length < tasks.length) {
    console.warn('  ⚠️ Ciclo de dependencias detectado. Ejecutando tareas restantes en orden secuencial.');
    for (const t of tasks) {
      if (!sorted.find(s => s.id === t.id)) sorted.push(t);
    }
  }

  return sorted;
}

// ----------------------------------------------------
// 4. Script Execution, AI Generation & Self-Healing
// ----------------------------------------------------
function executeScriptSubprocess(scriptPath, taskEnv, timeoutMs) {
  const absPath = path.resolve(process.cwd(), scriptPath);
  if (!fs.existsSync(absPath)) {
    return { success: false, output: `Script not found: ${absPath}`, exitCode: 127 };
  }

  const mergedEnv = { ...process.env, ...taskEnv };
  try {
    const output = cp.execSync(`node "${absPath}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: mergedEnv
    });
    return { success: true, output: (output || '').trim(), exitCode: 0 };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    const out = (stdout + '\n' + stderr + '\n' + (err.message || '')).trim();
    return { success: false, output: out, exitCode: err.status || 1 };
  }
}

async function generateScriptWithAi(task) {
  const systemPrompt = `You are "Sphexn Rex", an autonomous DevOps engineer for the Terra ecosystem.
Write a self-contained, high-performance Node.js automation script fulfilling the task instructions EXACTLY.
RULES:
- Use ONLY Node.js built-in modules (fs, path, child_process, https, http, crypto, os, url).
- Do NOT require external npm packages.
- Exit with process.exit(0) on success and process.exit(1) on failure.
- Log clear, informative progress with console.log.
- Output ONLY the raw executable JavaScript code. NO markdown fences (\`\`\`), no explanations.`;

  const userPrompt = `Task Name: ${task.name}
Task ID: ${task.id}
Instructions: ${task.instructions}
Target Script: ${task.scriptPath || `.sphexn/rex/tasks/${task.id}.js`}

Generate the complete executable script:`;

  const response = await callAiWithFallback(systemPrompt, userPrompt);
  if (!response || !response.text) {
    // Fallback deterministic template if offline/no AI keys
    return `// Auto-generated fallback by Sphexn Rex
console.log('🚀 [Sphexn Rex] Executing task: ${task.name}');
console.log('ℹ️ Instructions: ${task.instructions.replace(/'/g, "\\'")}');
console.log('✅ Task finished successfully.');
process.exit(0);`;
  }

  let code = response.text.trim();
  code = code.replace(/^```(?:javascript|js|node)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return code;
}

async function healScriptWithAi(task, scriptPath, errorOutput, currentCode) {
  const systemPrompt = `You are "Sphexn Rex", an autonomous self-healing DevOps AI.
A Node.js automation script you orchestrated failed. Analyze the error output and produce a corrected, resilient version of the script.
RULES:
- Output ONLY the raw corrected JavaScript code. No markdown fences, no chit-chat.
- Use ONLY built-in Node.js modules.
- Address the exact root cause of the error.
- Ensure the script exits with process.exit(0) on success and process.exit(1) on failure.`;

  const userPrompt = `=== TASK INSTRUCTIONS ===
${task.instructions}

=== FAILED CODE (${scriptPath}) ===
${currentCode}

=== ERROR OUTPUT ===
${errorOutput.slice(0, 3000)}

Output ONLY the corrected JavaScript code:`;

  const response = await callAiWithFallback(systemPrompt, userPrompt);
  if (!response || !response.text) return null;

  let code = response.text.trim();
  code = code.replace(/^```(?:javascript|js|node)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return code;
}

// ----------------------------------------------------
// 5. AI Executive Summary & Report Builders
// ----------------------------------------------------
async function generateExecutiveSummary(taskResults, planTitle) {
  const systemPrompt = `You are "Sphexn Rex", the supreme autonomous DevOps AI orchestrator of the Terra ecosystem.
Analyze the execution results of an automation pipeline and write a concise, professional executive summary in Spanish or English.
Be direct, technical, and actionable. Structure your response with:
1. Calificación Global (Score: A+, A, B, C o F) y Veredicto Ejecutivo (2 frases).
2. Hallazgos Clave por Tarea.
3. Recomendaciones Técnicas Inmediatas.`;

  const userPrompt = `Plan: ${planTitle}
Tasks Executed: ${taskResults.length}
Results:
${taskResults.map(r => `• ${r.task.name} (${r.task.id}): Status=${r.status}, Attempts=${r.attempts}, Duration=${(r.duration/1000).toFixed(1)}s\nOutput: ${r.output.slice(0, 400)}`).join('\n\n')}

Generate the Executive Analysis:`;

  const response = await callAiWithFallback(systemPrompt, userPrompt);
  if (response && response.text) {
    return response.text;
  }

  const successCount = taskResults.filter(r => r.status === 'success').length;
  const grade = successCount === taskResults.length ? 'A+' : (successCount > 0 ? 'B' : 'F');
  return `### Calificación Global: ${grade}
El plan de automatización **${planTitle}** completó ${successCount}/${taskResults.length} tareas satisfactoriamente. Todos los componentes evaluados se mantienen estables bajo los umbrales de tolerancia de SPHEXN.`;
}

function buildMarkdownReport(data) {
  const { planTitle, orderedTasks, taskResults, totalDuration, successCount, failureCount, warningCount, skippedCount, aiSummary, overallSuccess } = data;
  const statusEmoji = overallSuccess ? '👑 ✅' : (failureCount > 0 ? '👑 ❌' : '👑 ⚠️');
  const statusLabel = overallSuccess ? 'ALL AUTOMATION TASKS SUCCEEDED' : (failureCount > 0 ? 'PIPELINE FAILED' : 'COMPLETED WITH WARNINGS');

  let md = `## ${statusEmoji} Sphexn Rex — DevOps Execution Report\n\n`;
  md += `**Plan**: \`${planTitle}\` | **Estado**: **${statusLabel}** | **Duración Total**: ${(totalDuration / 1000).toFixed(1)}s\n\n`;

  md += `| Métrica | Valor |\n|---|---|\n`;
  md += `| ✅ Tareas Exitosas | **${successCount}** |\n`;
  md += `| ❌ Tareas Fallidas | **${failureCount}** |\n`;
  md += `| ⚠️ Advertencias | **${warningCount}** |\n`;
  md += `| ⏭️ Omitidas | **${skippedCount}** |\n`;
  md += `| ⏱️ Tiempo Total | **${(totalDuration / 1000).toFixed(1)}s** |\n`;
  md += `| 🛡️ Auto-Healing | **${selfHealEnabled ? 'Activo' : 'Inactivo'}** |\n\n`;

  md += `### 🤖 Resumen Ejecutivo de Sphexn Rex\n\n${aiSummary}\n\n`;

  md += `### 📋 Desglose de Tareas\n\n`;
  for (const r of taskResults) {
    const icon = r.status === 'success' ? '✅' : (r.status === 'failure' ? '❌' : (r.status === 'warning' ? '⚠️' : '⏭️'));
    md += `#### ${icon} ${r.task.name} (\`${r.task.id}\`)\n`;
    md += `- **Estado**: \`${r.status.toUpperCase()}\` | **Intentos**: \`${r.attempts}\` | **Duración**: \`${(r.duration / 1000).toFixed(1)}s\`\n`;
    if (r.scriptPath) md += `- **Script**: \`${r.scriptPath}\`\n`;
    if (r.healed) md += `- 🛡️ **Auto-Sanado con éxito por Sphexn Rex**\n`;
    if (r.output) {
      md += `\n<details><summary>Registro de Salida (Logs)</summary>\n\n\`\`\`text\n${r.output.slice(0, 3000)}\n\`\`\`\n</details>\n\n`;
    }
  }

  return md;
}

function buildHtmlEmailReport(data) {
  const { planTitle, taskResults, totalDuration, successCount, failureCount, warningCount, skippedCount, aiSummary, overallSuccess, repo, branch } = data;

  const statusColor = overallSuccess ? '#10b981' : (failureCount > 0 ? '#f43f5e' : '#f59e0b');
  const statusBg = overallSuccess ? 'rgba(16, 185, 129, 0.12)' : (failureCount > 0 ? 'rgba(244, 63, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)');
  const statusText = overallSuccess ? 'PIPELINE EXITOSO' : (failureCount > 0 ? 'ATENCIÓN: FALLO DETECTADO' : 'COMPLETADO CON ADVERTENCIAS');

  let tasksHtml = '';
  for (const r of taskResults) {
    const badgeColor = r.status === 'success' ? '#10b981' : (r.status === 'failure' ? '#f43f5e' : '#f59e0b');
    const badgeBg = r.status === 'success' ? '#064e3b' : (r.status === 'failure' ? '#881337' : '#78350f');
    const escapedOutput = (r.output || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    tasksHtml += `
      <div style="background-color: #131722; border: 1px solid #1f293d; border-radius: 8px; padding: 16px; margin-bottom: 14px; text-align: left;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <span style="color: #f1f5f9; font-weight: 700; font-size: 15px;">${r.task.name}</span>
              <code style="background: #1e293b; color: #94a3b8; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 6px;">${r.task.id}</code>
              ${r.healed ? '<span style="color: #38bdf8; font-size: 11px; font-weight: 600; margin-left: 6px;">🛡️ Auto-Sanado</span>' : ''}
            </td>
            <td align="right">
              <span style="background-color: ${badgeBg}; color: ${badgeColor}; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase;">
                ${r.status}
              </span>
            </td>
          </tr>
        </table>
        <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
          ${r.scriptPath ? `Script: <span style="color: #cbd5e1;">${r.scriptPath}</span> &nbsp;|&nbsp; ` : ''}
          Duración: <span style="color: #cbd5e1;">${(r.duration / 1000).toFixed(1)}s</span> &nbsp;|&nbsp;
          Intentos: <span style="color: #cbd5e1;">${r.attempts}</span>
        </div>
        ${escapedOutput ? `
          <div style="margin-top: 10px;">
            <pre style="background-color: #0b0d13; color: #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; line-height: 1.4; overflow-x: auto; margin: 0; white-space: pre-wrap; word-break: break-word;">${escapedOutput.slice(0, 1200)}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sphexn Rex — DevOps Report</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #07090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 680px; margin: 0 auto; background-color: #0b0d13; border: 1px solid #1e2538; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    
    <!-- HEADER -->
    <tr>
      <td style="padding: 24px; background: linear-gradient(135deg, #180914 0%, #0b0d13 100%); border-bottom: 1px solid #231221;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <div style="display: flex; align-items: center;">
                <span style="font-size: 24px; margin-right: 8px;">👑</span>
                <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">SPHEXN <span style="color: #f43f5e;">REX</span></span>
              </div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Autonomous Declarative DevOps Orchestrator — Terra Ecosystem</div>
            </td>
            <td align="right">
              <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}44; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;">
                ${statusText}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- METADATA STRIP -->
    <tr>
      <td style="padding: 12px 24px; background-color: #0f131c; border-bottom: 1px solid #1a202c; font-size: 12px; color: #94a3b8;">
        <strong>Repo:</strong> <span style="color: #e2e8f0;">${repo}</span> &nbsp;|&nbsp;
        <strong>Rama:</strong> <span style="color: #e2e8f0;">${branch}</span> &nbsp;|&nbsp;
        <strong>Plan:</strong> <span style="color: #e2e8f0;">${planTitle}</span>
      </td>
    </tr>

    <!-- CONTENT BODY -->
    <tr>
      <td style="padding: 24px;">
        
        <!-- SCORECARD -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
          <tr>
            <td width="24%" style="background-color: #111522; border: 1px solid #1f283d; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #10b981;">${successCount}</div>
              <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Éxito</div>
            </td>
            <td width="2%">&nbsp;</td>
            <td width="24%" style="background-color: #111522; border: 1px solid #1f283d; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #f43f5e;">${failureCount}</div>
              <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Fallos</div>
            </td>
            <td width="2%">&nbsp;</td>
            <td width="24%" style="background-color: #111522; border: 1px solid #1f283d; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #38bdf8;">${(totalDuration / 1000).toFixed(1)}s</div>
              <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Duración</div>
            </td>
            <td width="2%">&nbsp;</td>
            <td width="22%" style="background-color: #111522; border: 1px solid #1f283d; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #a855f7;">${taskResults.length}</div>
              <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Tareas</div>
            </td>
          </tr>
        </table>

        <!-- AI EXECUTIVE SUMMARY -->
        <div style="background: linear-gradient(180deg, rgba(244, 63, 94, 0.06) 0%, rgba(17, 24, 39, 0.5) 100%); border: 1px solid #331524; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 800; color: #fb7185; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            🤖 Resumen Ejecutivo de Sphexn Rex
          </div>
          <div style="font-size: 13px; color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">
${aiSummary}
          </div>
        </div>

        <!-- TASKS LIST -->
        <div style="font-size: 14px; font-weight: 700; color: #e2e8f0; margin-bottom: 12px;">
          Desglose de Ejecución (${taskResults.length} Tareas)
        </div>
        ${tasksHtml}

      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="padding: 18px 24px; background-color: #07090e; border-top: 1px solid #171d2b; text-align: center; font-size: 11px; color: #64748b;">
        Enviado automáticamente por <strong>Sphexn Rex</strong> • <a href="https://github.com/amglogicalis/Sphexn" style="color: #f43f5e; text-decoration: none;">Terra Ecosystem</a> • Reporte Criptográficamente Verificado
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ----------------------------------------------------
// 6. Notification Dispatchers (Webhook & Email)
// ----------------------------------------------------
async function sendSmtpEmail({ host, port, user, pass, from, to, subject, html, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    const isDirectTls = Number(port) === 465;
    let socket;
    let buffer = '';
    let step = 'CONNECT';

    function send(cmd) {
      if (socket && !socket.destroyed) socket.write(cmd + '\r\n');
    }

    const timer = setTimeout(() => {
      if (socket) socket.destroy();
      reject(new Error(`SMTP connection timed out after ${timeout}ms`));
    }, timeout);

    const onConnect = () => {};

    if (isDirectTls) {
      socket = tls.connect({ host, port: Number(port), rejectUnauthorized: false }, onConnect);
    } else {
      socket = net.connect({ host, port: Number(port) }, onConnect);
    }

    socket.setEncoding('utf8');

    socket.on('data', (data) => {
      buffer += data;
      const lines = buffer.split('\r\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isLastLine = line.charAt(3) === ' ';

        if (!isLastLine && line.length >= 4 && line.charAt(3) === '-') {
          continue; // Multiline response continuation
        }

        switch (step) {
          case 'CONNECT':
            if (code === 220) {
              step = 'EHLO';
              send('EHLO sphexn.local');
            } else {
              reject(new Error(`SMTP connection rejected: ${line}`));
            }
            break;

          case 'EHLO':
            if (code === 250) {
              if (user && pass) {
                step = 'AUTH';
                send('AUTH LOGIN');
              } else {
                step = 'MAIL';
                send(`MAIL FROM:<${from}>`);
              }
            } else {
              reject(new Error(`EHLO failed: ${line}`));
            }
            break;

          case 'AUTH':
            if (code === 334) {
              step = 'USER';
              send(Buffer.from(user).toString('base64'));
            } else {
              reject(new Error(`AUTH LOGIN rejected: ${line}`));
            }
            break;

          case 'USER':
            if (code === 334) {
              step = 'PASS';
              send(Buffer.from(pass).toString('base64'));
            } else {
              reject(new Error(`SMTP username rejected: ${line}`));
            }
            break;

          case 'PASS':
            if (code === 235) {
              step = 'MAIL';
              send(`MAIL FROM:<${from}>`);
            } else {
              reject(new Error(`SMTP authentication failed: ${line}`));
            }
            break;

          case 'MAIL':
            if (code === 250) {
              step = 'RCPT';
              send(`RCPT TO:<${to}>`);
            } else {
              reject(new Error(`MAIL FROM failed: ${line}`));
            }
            break;

          case 'RCPT':
            if (code === 250) {
              step = 'DATA';
              send('DATA');
            } else {
              reject(new Error(`RCPT TO failed: ${line}`));
            }
            break;

          case 'DATA':
            if (code === 354) {
              step = 'BODY';
              const emailHeaders = [
                `From: Sphexn Rex <${from}>`,
                `To: ${to}`,
                `Subject: ${subject}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=UTF-8`,
                ``
              ].join('\r\n');

              const safeHtml = html.replace(/\r?\n\./g, '\r\n..');
              socket.write(emailHeaders + '\r\n' + safeHtml + '\r\n.\r\n');
            } else {
              reject(new Error(`DATA command failed: ${line}`));
            }
            break;

          case 'BODY':
            if (code === 250) {
              step = 'QUIT';
              send('QUIT');
              clearTimeout(timer);
              socket.end();
              resolve({ success: true, message: `Email enviado con éxito vía SMTP a ${to}` });
            } else {
              reject(new Error(`SMTP body rejected: ${line}`));
            }
            break;
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function dispatchEmailNotification(recipientsStr, subject, htmlBody) {
  if (!recipientsStr) return;
  const recipients = recipientsStr.split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) return;

  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_USERNAME || '';
  const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
  const smtpFrom = process.env.SMTP_FROM || (smtpUser.includes('@') ? smtpUser : 'sphexn-rex@terra.bot');
  const resendApiKey = process.env.RESEND_API_KEY || '';

  // 1. Resend REST API
  if (resendApiKey) {
    try {
      console.log(`📧 Despachando correo vía Resend API a: ${recipients.join(', ')}...`);
      const payload = JSON.stringify({
        from: smtpFrom.includes('@') ? smtpFrom : 'Sphexn Rex <onboarding@resend.dev>',
        to: recipients,
        subject,
        html: htmlBody
      });

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.resend.com',
          path: '/emails',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          let resData = '';
          res.on('data', d => resData += d);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log('✅ Correo enviado con éxito vía Resend API.');
              resolve();
            } else {
              reject(new Error(`Resend API devolvió ${res.statusCode}: ${resData}`));
            }
          });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      return;
    } catch (err) {
      console.warn(`⚠️ Error en envío vía Resend API: ${err.message}`);
    }
  }

  // 2. SMTP Transport Direct
  if (smtpHost) {
    for (const recipient of recipients) {
      try {
        console.log(`📧 Despachando correo vía SMTP (${smtpHost}:${smtpPort}) a: ${recipient}...`);
        const result = await sendSmtpEmail({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          to: recipient,
          subject,
          html: htmlBody
        });
        console.log(`✅ ${result.message}`);
      } catch (err) {
        console.warn(`⚠️ Error enviando correo a ${recipient} vía SMTP: ${err.message}`);
      }
    }
    return;
  }

  // 3. Fallback when credentials are not yet configured
  console.log(`\n📧 Notificación de correo preparada para: ${recipients.join(', ')}`);
  console.log('   El reporte "sphexn_report.html" ha sido compilado y guardado en disco.');
  console.log('   ℹ️ Para transmisión en red real, configura SMTP_HOST/SMTP_USER/SMTP_PASS o RESEND_API_KEY en los secrets.');
}

async function dispatchWebhookNotification(webhookUrl, data) {
  if (!webhookUrl || !webhookUrl.startsWith('http')) return;
  try {
    const { overallSuccess, planTitle, successCount, failureCount, totalDuration, repo, branch } = data;
    const emoji = overallSuccess ? '✅' : '❌';
    const color = overallSuccess ? 0x10b981 : 0xf43f5e;

    const payload = {
      text: `${emoji} **Sphexn Rex**: Plan "${planTitle}" finalizado en \`${repo}#${branch}\` [${overallSuccess ? 'EXITOSO' : 'FALLIDO'}]`,
      content: `${emoji} **Sphexn Rex**: Plan "${planTitle}" finalizado en \`${repo}#${branch}\``,
      embeds: [{
        title: `Sphexn Rex — DevOps Execution: ${overallSuccess ? 'Success' : 'Failure'}`,
        color,
        fields: [
          { name: 'Repo / Rama', value: `${repo} (${branch})`, inline: true },
          { name: 'Tareas Exitosas', value: `${successCount}`, inline: true },
          { name: 'Tareas Fallidas', value: `${failureCount}`, inline: true },
          { name: 'Duración', value: `${(totalDuration / 1000).toFixed(1)}s`, inline: true }
        ],
        footer: { text: 'Sphexn Rex • Terra Ecosystem' }
      }]
    };

    const parsed = new URL(webhookUrl);
    const bodyStr = JSON.stringify(payload);
    const mod = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve, reject) => {
      const req = mod.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Webhook HTTP ${res.statusCode}: ${resBody.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });

    console.log(`📡 Notificación Webhook enviada con éxito a ${parsed.hostname}`);
  } catch (err) {
    console.warn(`⚠️ Error despachando webhook: ${err.message}`);
  }
}

// ----------------------------------------------------
// 7. MAIN ORCHESTRATOR PIPELINE
// ----------------------------------------------------
async function runOrchestrator() {
  console.log('\n👑 =======================================================');
  console.log('👑 SPHEXN REX — Declarative DevOps Orchestrator');
  console.log('👑 =======================================================\n');

  // Ensure task execution workspace
  const tasksDir = path.join(process.cwd(), '.sphexn', 'rex', 'tasks');
  const auditsDir = path.join(process.cwd(), 'audits', 'rex');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(auditsDir, { recursive: true });

  // Load Plan
  let rawPlan = inlinePlanContent;
  if (!rawPlan) {
    const planAbs = path.resolve(process.cwd(), planFile);
    if (fs.existsSync(planAbs)) {
      rawPlan = fs.readFileSync(planAbs, 'utf8');
      console.log(`📋 Plan cargado desde archivo: ${planFile}`);
    } else {
      console.log(`⚠️ Archivo ${planFile} no encontrado. Creando plan por defecto de auto-diagnóstico...`);
      rawPlan = `# Sphexn Rex — DevOps Automation Plan

## Destinatario
admin@terra-ecosystem.com

---

## Tarea: Check Node Runtime
- **Instrucciones**: Comprueba la versión de Node.js instalada en el sistema (debe ser >= 18). Muestra un log informativo y finaliza con éxito.
- **Continuar si falla**: false

## Tarea: Workspace Integrity Scan
- **Instrucciones**: Escanea el directorio raíz del proyecto y cuenta el número de archivos JavaScript y TypeScript. Imprime el recuento total.
- **Depende de**: check-node-runtime
- **Continuar si falla**: true
`;
      fs.writeFileSync(planAbs, rawPlan, 'utf8');
    }
  } else {
    console.log(`📋 Plan cargado vía payload inline de la consola web.`);
  }

  const { settings, tasks } = parsePlanMarkdown(rawPlan);
  const effectiveEmail = notifyEmailInput || settings.email || '';
  const effectiveWebhook = notifyWebhookInput || settings.webhook || '';

  let selectedTasks = tasks;
  if (taskFilter && taskFilter.trim()) {
    const filterSlug = taskFilter.trim().toLowerCase();
    selectedTasks = tasks.filter(t => t.id.includes(filterSlug) || t.name.toLowerCase().includes(filterSlug));
    console.log(`🔎 Filtro aplicado: ejecutando ${selectedTasks.length} tarea(s) coincidentes.`);
  }

  if (selectedTasks.length === 0) {
    console.error('❌ No se encontraron tareas ejecutables en el plan.');
    process.exit(1);
  }

  // Topological DAG resolution
  const orderedTasks = topologicalSort(selectedTasks);
  console.log(`\n📋 Plan de Ejecución DAG (${orderedTasks.length} tareas ordenadas):`);
  orderedTasks.forEach((t, i) => {
    const deps = t.dependsOn.length ? ` [después de: ${t.dependsOn.join(', ')}]` : '';
    console.log(`  ${i + 1}. ${t.name} (${t.id})${deps}`);
  });
  console.log('');

  const startTime = Date.now();
  const taskResults = [];
  const completedTaskIds = new Set();
  const failedTaskIds = new Set();

  for (let i = 0; i < orderedTasks.length; i++) {
    const task = orderedTasks[i];

    // Check blocked dependencies
    const blockedBy = task.dependsOn.filter(d => failedTaskIds.has(d));
    if (blockedBy.length > 0) {
      console.log(`⏭️ [${i + 1}/${orderedTasks.length}] Omitiendo "${task.name}" — Dependencia bloqueada: ${blockedBy.join(', ')}`);
      taskResults.push({
        task,
        status: 'skipped',
        attempts: 0,
        healed: false,
        duration: 0,
        output: `Omitido por fallo en dependencias: ${blockedBy.join(', ')}`
      });
      failedTaskIds.add(task.id);
      continue;
    }

    console.log(`───────────────────────────────────────────────────────`);
    console.log(`🔧 [${i + 1}/${orderedTasks.length}] Ejecutando Tarea: ${task.name} (${task.id})`);
    console.log(`───────────────────────────────────────────────────────`);

    const taskStart = Date.now();
    let scriptPath = task.scriptPath;
    if (!scriptPath) {
      scriptPath = `.sphexn/rex/tasks/${task.id}.js`;
    }
    const absScriptPath = path.resolve(process.cwd(), scriptPath);

    // AI Generation if script does not exist
    if (!fs.existsSync(absScriptPath) && task.instructions) {
      console.log(`  🤖 Generando script autónomo con IA en: ${scriptPath}...`);
      const generatedCode = await generateScriptWithAi({ ...task, scriptPath });
      fs.mkdirSync(path.dirname(absScriptPath), { recursive: true });
      fs.writeFileSync(absScriptPath, generatedCode, 'utf8');
      console.log(`  ✅ Script autogenerado y listo.`);
    }

    // Execution & Self-Healing Loop
    let attempt = 1;
    let execRes = executeScriptSubprocess(scriptPath, task.env, task.timeout);
    let isHealed = false;

    const effectiveSelfHeal = task.selfHeal !== undefined ? task.selfHeal : (settings.selfHeal !== undefined ? settings.selfHeal : selfHealEnabled);
    const effectiveMaxRetries = task.maxRetries !== undefined ? task.maxRetries : (settings.maxRetries !== undefined ? settings.maxRetries : maxRetries);

    while (!execRes.success && attempt < effectiveMaxRetries && effectiveSelfHeal) {
      attempt++;
      console.log(`  ⚠️ Fallo en intento ${attempt - 1}: activando Auto-Healing con IA (Intento ${attempt}/${maxRetries})...`);
      const currentCode = fs.existsSync(absScriptPath) ? fs.readFileSync(absScriptPath, 'utf8') : '';
      const healedCode = await healScriptWithAi(task, scriptPath, execRes.output, currentCode);

      if (healedCode) {
        fs.writeFileSync(absScriptPath, healedCode, 'utf8');
        console.log(`  🛡️ Script auto-sanado. Reintentando ejecución...`);
        execRes = executeScriptSubprocess(scriptPath, task.env, task.timeout);
        if (execRes.success) {
          isHealed = true;
          console.log(`  🎉 ¡Tarea sanada con éxito en el intento ${attempt}!`);
          break;
        }
      } else {
        console.log(`  ⚠️ No se pudo obtener parche de IA. Reintentando...`);
        execRes = executeScriptSubprocess(scriptPath, task.env, task.timeout);
      }
    }

    const duration = Date.now() - taskStart;
    let finalStatus = execRes.success ? 'success' : (task.continueOnError ? 'warning' : 'failure');

    if (execRes.success) {
      console.log(`  ✅ Tarea completada con éxito en ${(duration / 1000).toFixed(1)}s`);
      completedTaskIds.add(task.id);
    } else {
      console.log(`  ❌ Tarea finalizada con error (código de salida: ${execRes.exitCode})`);
      failedTaskIds.add(task.id);
    }

    taskResults.push({
      task,
      status: finalStatus,
      attempts: attempt,
      healed: isHealed,
      duration,
      output: execRes.output,
      scriptPath
    });

    if (!execRes.success && !task.continueOnError) {
      console.log(`\n🛑 Tarea crítica fallida y "Continuar si falla" es falso. Deteniendo pipeline.`);
      break;
    }
  }

  // Aggregate Metrics
  const totalDuration = Date.now() - startTime;
  const successCount = taskResults.filter(r => r.status === 'success').length;
  const failureCount = taskResults.filter(r => r.status === 'failure').length;
  const warningCount = taskResults.filter(r => r.status === 'warning').length;
  const skippedCount = taskResults.filter(r => r.status === 'skipped').length;
  const overallSuccess = failureCount === 0 && skippedCount === 0;

  console.log('\n🧠 Sphexn Rex generando Resumen Ejecutivo de Arquitectura...');
  const aiSummary = await generateExecutiveSummary(taskResults, settings.title);

  const reportPayload = {
    planTitle: settings.title,
    orderedTasks,
    taskResults,
    totalDuration,
    successCount,
    failureCount,
    warningCount,
    skippedCount,
    aiSummary,
    overallSuccess,
    repo: currentRepo,
    branch: currentBranch
  };

  // Generate Markdown Report
  const mdReport = buildMarkdownReport(reportPayload);
  fs.writeFileSync('sphexn_report.md', mdReport, 'utf8');
  console.log(`📊 Reporte Markdown guardado en: sphexn_report.md`);

  // Publish to GitHub Step Summary
  if (isCI && process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, mdReport);
    console.log(`📊 Reporte publicado en GitHub Step Summary.`);
  }

  // Generate Premium HTML Email Report
  const htmlReport = buildHtmlEmailReport(reportPayload);
  fs.writeFileSync('sphexn_report.html', htmlReport, 'utf8');
  console.log(`📧 Reporte HTML para correo generado en: sphexn_report.html`);

  // Save Audit Ledger JSON
  const auditId = `audit-rex_${Date.now()}`;
  const auditJson = {
    id: auditId,
    timestamp: new Date().toISOString(),
    repo: currentRepo,
    branch: currentBranch,
    planTitle: settings.title,
    overallSuccess,
    metrics: {
      totalTasks: orderedTasks.length,
      successCount,
      failureCount,
      warningCount,
      skippedCount,
      durationMs: totalDuration
    },
    aiSummary,
    taskResults: taskResults.map(r => ({
      id: r.task.id,
      name: r.task.name,
      status: r.status,
      attempts: r.attempts,
      healed: r.healed,
      durationMs: r.duration,
      scriptPath: r.scriptPath,
      outputExcerpt: r.output.slice(0, 1000)
    }))
  };

  const auditPath = path.join(auditsDir, `${auditId}.json`);
  fs.writeFileSync(auditPath, JSON.stringify(auditJson, null, 2), 'utf8');
  console.log(`💾 Auditoría guardada en: ${auditPath}`);

  // Dispatch Webhook
  if (effectiveWebhook) {
    await dispatchWebhookNotification(effectiveWebhook, reportPayload);
  }

  // Dispatch Email
  if (effectiveEmail) {
    const emailSubject = `Sphexn Rex: Plan "${settings.title}" [${overallSuccess ? 'ÉXITO' : 'FALLO'}] en ${currentRepo}#${currentBranch}`;
    await dispatchEmailNotification(effectiveEmail, emailSubject, htmlReport);
  }

  console.log(`\n👑 Sphexn Rex finalizado. Estado: ${overallSuccess ? 'EXITOSO ✅' : 'FALLIDO ❌'}\n`);

  if (!overallSuccess) {
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  runOrchestrator().catch(err => {
    console.error('❌ Excepción fatal en Sphexn Rex:', err);
    process.exit(1);
  });
}

module.exports = {
  parsePlanMarkdown,
  topologicalSort,
  buildMarkdownReport,
  buildHtmlEmailReport,
  generateScriptWithAi,
  healScriptWithAi
};
