const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

// =============================================================================
// Configuración dinámica de URLs de logos (para portabilidad en forks y branches)
// =============================================================================
const GITHUB_REPO = process.env.GITHUB_REPOSITORY || 'amglogicalis/Zenon'; //test comment
const GITHUB_REF = process.env.GITHUB_REF_NAME || 'main';
const LOGO_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/assets/logos`;


// =============================================================================
// PASO 2: Autoentrenamiento y Aprendizaje Contextual (Caché & Grounding)
// =============================================================================
const CACHE_FILE = path.join(process.cwd(), '.zenon_cache.json');

// Calcula una firma SHA-256 del estado actual del repositorio
function computeFingerprint(files) {
  const fileData = files.map(file => {
    try {
      const stats = fs.statSync(file);
      return `${file}:${stats.size}:${stats.mtimeMs}`;
    } catch (e) {
      return `${file}:0:0`;
    }
  }).sort().join('|');

  return crypto.createHash('sha256').update(fileData).digest('hex');
}

// Asegura que .zenon_cache.json esté registrado en el .gitignore local
function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }
    if (!content.includes('.zenon_cache.json')) {
      const separator = content.endsWith('\n') || content === '' ? '' : '\n';
      fs.appendFileSync(gitignorePath, `${separator}.zenon_cache.json\n`, 'utf8');
      console.log('ℹ️  Agregado .zenon_cache.json al archivo .gitignore');
    }
  } catch (e) {
    // Continuar en silencio si no se puede modificar
  }
}

// =============================================================================
// PASO 3: Evolución y Multi-proveedor (Selector Inteligente y APIs externas)
// =============================================================================
// maxInputChars = límite máximo de caracteres en el prompt de usuario (≈ tokens × 4).
// Se usa para truncar automáticamente el codebase antes de enviarlo al modelo.
// Esto previene errores 413 (Groq) y 422 (Cohere) por exceso de tokens.
const PROVIDERS = {
  gemini: {
    keyName: 'ZENON_API_KEY',
    alternateKeyName: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.5-flash',        maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemini-flash-lite-latest', maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemini-3.1-flash-lite',   maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemma-4-31b-it',          maxInputChars: 1000000 }  // 256K tokens (1M chars)
    ]
  },
  groq: {
    keyName: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile',                   maxInputChars: 28000 }, // Groq RPM safety limit (~7K tokens)
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', maxInputChars: 240000 }, // Groq limits to 60K tokens (240K chars)
      { id: 'qwen/qwen3.6-27b',                          maxInputChars: 240000 }, // Groq limits to 60K tokens (240K chars)
      { id: 'llama-3.1-8b-instant',                      maxInputChars: 24000 }  // Groq RPM safety limit (~6K tokens)
    ]
  },
  cohere: {
    keyName: 'COHERE_API_KEY',
    models: [
      { id: 'command-a-plus-05-2026', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'command-r-plus-08-2024', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'command-a-03-2025',      maxInputChars: 1000000 }, // 256K tokens (1M chars)
      { id: 'command-r-08-2024',      maxInputChars: 500000 }  // 128K tokens (500K chars)
    ]
  },
  openrouter: {
    keyName: 'OPENROUTER_API_KEY',
    models: [
      { id: 'cohere/north-mini-code:free',            maxInputChars: 500000 }, // 256K tokens, conservative 500K chars for free tier
      { id: 'qwen/qwen3-coder:free',                  maxInputChars: 300000 }, // Free tier rate safety
      { id: 'google/gemma-4-31b-it:free',             maxInputChars: 300000 }, // Free tier rate safety
      { id: 'meta-llama/llama-3.3-70b-instruct:free', maxInputChars: 300000 }, // Free tier rate safety
      { id: 'google/gemini-3.1-flash-lite',           maxInputChars: 400000 }  // Free tier rate safety
    ]
  },
  // ===========================================================================
  // PASO 6: Nuevos Proveedores — SambaNova, Cerebras, GitHub Models
  // ===========================================================================
  samba: {
    keyName: 'SAMBA_API_KEY',
    models: [
      { id: 'DeepSeek-V3.2',               maxInputChars: 500000 }, // 128K tokens typical (500K chars)
      { id: 'gpt-oss-120b',                maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.3-70B-Instruct', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'gemma-4-31B-it',              maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'MiniMax-M2.7',                maxInputChars: 500000 }  // 128K tokens typical (500K chars)
    ]
  },
  cerebras: {
    keyName: 'CEREBRAS_API_KEY',
    // max_completion_tokens OBLIGATORIO en Cerebras para evitar rate-limit por token-bucketing
    models: [
      { id: 'gpt-oss-120b', maxInputChars: 500000, max_completion_tokens: 2048 }, // 128K tokens (500K chars)
      { id: 'zai-glm-4.7',  maxInputChars: 500000, max_completion_tokens: 2048 }  // 131K tokens (500K chars)
    ]
  },
  github_models: {
    keyName: 'GH_MODELS_TOKEN',
    models: [
      { id: 'gpt-4o',                       maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.1-405B-Instruct', maxInputChars:  28000 }, // Llama 405B (strict 8k tokens free tier limit)
      { id: 'gpt-4o-mini',                  maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.1-8B-Instruct',  maxInputChars:  28000 }  // Llama 8B (strict 8k tokens free tier limit)
    ]
  }
};

// Backoff base en ms para errores 429 (se duplica en cada reintento de la cadena)
const BACKOFF_BASE_MS = 2000;

// Resuelve y agrupa las API keys configuradas en el entorno
function getAvailableKeys(cliArgs) {
  return {
    gemini:        cliArgs.zenonApiKey       || process.env.INPUT_ZENON_API_KEY       || process.env.ZENON_API_KEY   || process.env.GEMINI_API_KEY,
    groq:          cliArgs.groqApiKey        || process.env.INPUT_GROQ_API_KEY        || process.env.GROQ_API_KEY,
    cohere:        cliArgs.cohereApiKey      || process.env.INPUT_COHERE_API_KEY      || process.env.COHERE_API_KEY,
    openrouter:    cliArgs.openrouterApiKey  || process.env.INPUT_OPENROUTER_API_KEY  || process.env.OPENROUTER_API_KEY,
    samba:         cliArgs.sambaApiKey       || process.env.INPUT_SAMBA_API_KEY       || process.env.SAMBA_API_KEY,
    cerebras:      cliArgs.cerebrasApiKey    || process.env.INPUT_CEREBRAS_API_KEY    || process.env.CEREBRAS_API_KEY,
    github_models: cliArgs.ghModelsToken     || cliArgs.githubModelsToken             || process.env.INPUT_TOKEN_GH || process.env.TOKEN_GH || process.env.INPUT_GH_MODELS_TOKEN || process.env.GH_MODELS_TOKEN || process.env.INPUT_GITHUB_MODELS_TOKEN || process.env.GITHUB_MODELS_TOKEN
  };
}

// Analiza los tipos de archivos en el repositorio para inferir el stack tecnológico dominante
function analyzeRepositoryStack(files) {
  let javascript = 0;
  let python = 0;
  let go = 0;
  let devops = 0;

  for (const file of files) {
    const ext = file.split('.').pop().toLowerCase();
    const base = path.basename(file).toLowerCase();

    if (['js', 'ts', 'jsx', 'tsx', 'json'].includes(ext) || base === 'package.json') {
      javascript++;
    } else if (['py', 'ipynb'].includes(ext) || ['requirements.txt', 'pipfile', 'pyproject.toml'].includes(base)) {
      python++;
    } else if (ext === 'go' || base === 'go.mod') {
      go++;
    } else if (['yml', 'yaml', 'dockerfile'].includes(ext) || base.includes('docker-compose') || file.includes('.github/workflows')) {
      devops++;
    }
  }

  const scores = { javascript, python, go, devops };
  let dominant = 'javascript';
  let maxScore = -1;
  for (const [key, val] of Object.entries(scores)) {
    if (val > maxScore) {
      maxScore = val;
      dominant = key;
    }
  }

  return { dominant, scores };
}

// =============================================================================
// PASO 6: Selector Inteligente de Modelos con BBDD (zenon_models.json)
// =============================================================================

/**
 * Carga el catalogo de modelos desde zenon_models.json.
 * Devuelve array vacio si el archivo falta o esta corrupto.
 */
function loadModelCatalog() {
  const catalogPath = path.join(__dirname, 'zenon_models.json');
  try {
    if (fs.existsSync(catalogPath)) {
      return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    }
  } catch (e) {
    console.warn('  Warning: No se pudo leer zenon_models.json. Usando cadena por defecto.');
  }
  return [];
}

/**
 * Cadena determinista de fallback — usada cuando el selector IA no esta disponible.
 * Cubre todos los proveedores en orden de prioridad y capacidad.
 */
function buildDefaultChain(keys) {
  const chain = [];
  const addModel = (provider, modelObj) => {
    if (keys[provider] && modelObj) {
      chain.push({
        provider,
        model:                 modelObj.id,
        maxInputChars:         modelObj.maxInputChars,
        max_completion_tokens: modelObj.max_completion_tokens,
        apiKey:                keys[provider]
      });
    }
  };
  const getAt = (provider, index) => PROVIDERS[provider] && PROVIDERS[provider].models[index];

  // Fase 1: Insignia — los mejores modelos de cada proveedor disponible
  addModel('gemini',        getAt('gemini', 0));        // gemini-2.5-flash (1M ctx)
  addModel('samba',         getAt('samba', 0));         // DeepSeek-V3.2
  addModel('cerebras',      getAt('cerebras', 0));      // gpt-oss-120b ultra-rapido
  addModel('github_models', getAt('github_models', 0)); // gpt-4o
  addModel('cohere',        getAt('cohere', 0));        // command-a-plus-05-2026
  addModel('groq',          getAt('groq', 0));          // llama-3.3-70b-versatile

  // Fase 2: Fallbacks de Nivel Medio
  addModel('gemini',        getAt('gemini', 1));        // gemini-flash-lite-latest
  addModel('samba',         getAt('samba', 1));         // gpt-oss-120b (samba)
  addModel('github_models', getAt('github_models', 1)); // Meta-Llama-3.1-405B
  addModel('cohere',        getAt('cohere', 1));        // command-r-plus-08-2024
  addModel('groq',          getAt('groq', 1));          // llama-4-scout
  addModel('openrouter',    getAt('openrouter', 0));    // cohere/north-mini-code:free
  addModel('openrouter',    getAt('openrouter', 1));    // qwen3-coder:free

  // Fase 3: Ultimo Recurso
  addModel('gemini',        getAt('gemini', 2));        // gemini-3.1-flash-lite
  addModel('samba',         getAt('samba', 2));         // Meta-Llama-3.3-70B (samba)
  addModel('cerebras',      getAt('cerebras', 1));      // zai-glm-4.7
  addModel('github_models', getAt('github_models', 2)); // gpt-4o-mini
  addModel('github_models', getAt('github_models', 3)); // Meta-Llama-3.1-8B
  addModel('cohere',        getAt('cohere', 2));        // command-a-03-2025
  addModel('cohere',        getAt('cohere', 3));        // command-r-08-2024
  addModel('groq',          getAt('groq', 2));          // qwen3.6-27b
  addModel('groq',          getAt('groq', 3));          // llama-3.1-8b-instant
  addModel('openrouter',    getAt('openrouter', 2));    // gemma-4-31b-it:free
  addModel('openrouter',    getAt('openrouter', 3));    // llama-3.3-70b-instruct:free
  addModel('openrouter',    getAt('openrouter', 4));    // gemini-3.1-flash-lite
  addModel('gemini',        getAt('gemini', 3));        // gemma-4-31b-it
  addModel('samba',         getAt('samba', 3));         // gemma-4-31B-it (samba)
  addModel('samba',         getAt('samba', 4));         // MiniMax-M2.7

  // Deduplicar manteniendo orden de prioridad
  const seen = new Set();
  return chain.filter(e => {
    if (!e.model) return false;
    const k = e.provider + ':' + e.model;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Modelos fijos ligeros usados UNICAMENTE para la fase de seleccion inteligente.
 * Son rapidos y baratos; su unica tarea es elegir la cadena optima del catalogo.
 */
const SELECTOR_MODELS = [
  { provider: 'gemini',        model: 'gemini-3.1-flash-lite' },
  { provider: 'groq',          model: 'llama-3.1-8b-instant'  },
  { provider: 'github_models', model: 'gpt-4o-mini'           }
];

/**
 * Convierte una seleccion de IA al formato interno de cadena de callWithFallback.
 */
function buildChainFromSelection(selection, keys) {
  const chain = [];
  const seen  = new Set();

  for (const item of selection) {
    const { provider, api_model_id } = item;
    if (!provider || !api_model_id || !keys[provider]) continue;
    const uniqueKey = provider + ':' + api_model_id;
    if (seen.has(uniqueKey)) continue;

    const providerData = PROVIDERS[provider];
    if (!providerData) continue;
    const modelObj = providerData.models.find(m => m.id === api_model_id);
    if (!modelObj) continue;

    seen.add(uniqueKey);
    chain.push({
      provider,
      model:                 api_model_id,
      maxInputChars:         modelObj.maxInputChars,
      max_completion_tokens: modelObj.max_completion_tokens,
      apiKey:                keys[provider]
    });
  }
  return chain;
}

/**
 * Selector inteligente: llama a un modelo ligero para que analice el contexto
 * del repo y elija la cadena optima consultando zenon_models.json.
 * Devuelve null si el selector falla (el caller usa buildDefaultChain).
 */
async function selectModelsWithAI(keys, stackInfo, mode, totalSize, userQuery = '') {
  // Sub-cadena del selector con los modelos fijos disponibles
  const selectorChain = SELECTOR_MODELS
    .filter(s => keys[s.provider])
    .map(s => {
      const providerData = PROVIDERS[s.provider];
      if (!providerData) return null;
      const modelObj = providerData.models.find(m => m.id === s.model);
      if (!modelObj) return null;
      return {
        provider:              s.provider,
        model:                 s.model,
        maxInputChars:         modelObj.maxInputChars,
        max_completion_tokens: modelObj.max_completion_tokens,
        apiKey:                keys[s.provider]
      };
    })
    .filter(Boolean);

  if (selectorChain.length === 0) return null;

  const catalog = loadModelCatalog();
  if (catalog.length === 0) return null;

  // Solo incluir modelos de proveedores con key configurada
  const availableProviders = Object.keys(keys).filter(p => keys[p]);
  const availableModels = catalog
    .map(entry => ({
      model_id:       entry.model_id,
      description:    entry.description,
      specialization: entry.specialization,
      providers:      (entry.providers || []).filter(p => availableProviders.includes(p.provider))
    }))
    .filter(entry => entry.providers.length > 0);

  if (availableModels.length === 0) return null;

  const sizeMB    = (totalSize / 1048576).toFixed(2);
  const sizeLabel = totalSize > 500000 ? 'MUY GRANDE (>500KB)'
                  : totalSize > 100000 ? 'GRANDE (>100KB)'
                  : totalSize > 30000  ? 'MEDIO (>30KB)'
                  : 'PEQUENO (<30KB)';

  const modeDesc = mode === 'correct'   ? 'correccion automatica de bugs, salida JSON estructurada'
                 : mode === 'objective' ? 'implementacion de objetivo de desarrollo, salida JSON estructurada'
                 : mode === 'trainer'   ? 'entrenamiento de conocimiento, requiere busqueda en Google (Google Search Grounding). Prioriza obligatoriamente modelos del proveedor "gemini" en los primeros lugares de la cadena para que puedan realizar busquedas en la web.'
                 : mode === 'helper'    ? 'asistencia interactiva sobre la base de codigo y resolucion de consultas'
                 : mode === 'updater'   ? 'sincronizacion de documentacion de texto con el codigo, salida JSON estructurada'
                 : mode === 'tester'    ? 'analisis de tests, identificacion de fallos y generacion/correccion de pruebas unitarias. Si auto-fix, salida JSON estructurada con los archivos corregidos; si modo reporte, informe Markdown detallado con trazas y soluciones.'
                 : mode === 'devops'    ? 'operador DevOps autonomo: analiza un plan de tareas definido por el usuario en lenguaje natural, genera scripts ejecutables personalizados, los orquesta en secuencia con dependencias, aplica auto-sanacion ante fallos y produce un reporte de ejecucion.'
                 : 'revision de codigo, produce informe Markdown';

  const selectorSystemInstruction =
    'Eres el motor de seleccion de modelos de IA de Zenon, una herramienta de analisis de codigo. ' +
    'Tu UNICA tarea es seleccionar la lista ordenada de mejores modelos para una tarea concreta. ' +
    'Devuelve SOLO JSON valido. Sin explicaciones. Sin markdown.';

  const selectorPrompt =
    'Selecciona los 4-5 mejores modelos del catalogo disponible para esta tarea:\n\n' +
    'CONTEXTO DE TAREA:\n' +
    '- Modo: "' + mode + '" -- ' + modeDesc + '\n' +
    '- Consulta o tarea específica del usuario: "' + userQuery + '"\n' +
    '- Stack dominante: ' + stackInfo.dominant.toUpperCase() + '\n' +
    '- Tamano del codebase: ' + sizeMB + ' MB (' + sizeLabel + ')\n\n' +
    'MODELOS DISPONIBLES (solo estos tienen API keys configuradas):\n' +
    JSON.stringify(availableModels, null, 2) + '\n\n' +
    'REGLAS DE SELECCION:\n' +
    '1. Clasificación de Complejidad: Analiza la consulta o tarea específica del usuario.\n' +
    '   - Si la consulta es descriptiva, simple o de consulta rápida (ej. preguntas generales de arquitectura en modo "helper" como "¿qué lenguajes se usan?" o "¿qué hace este archivo?"), prioriza modelos rápidos y de menor coste (como gemini-flash-lite, gpt-4o-mini o llama-3.1-8b) al principio de la cadena para evitar consumir recursos innecesarios.\n' +
    '   - Si la tarea implica desarrollo complejo, lógica profunda, escritura/modificación de código o actualización de documentación (como en modo "correct", "objective" o "updater"), prioriza modelos insignia de alta capacidad de razonamiento/programación (como gpt-4o, deepseek-v3-2 o gemini-2.5-flash) al principio de la cadena.\n' +
    '2. Para modo "trainer", prioriza obligatoriamente modelos de "gemini" que soportan búsqueda en Google en los primeros lugares.\n' +
    '3. Para codebases GRANDES o MUY GRANDES (>100KB): prioriza providers con maxInputChars mas alto.\n' +
    '4. El primer modelo de la cadena debe ser el mas capaz y adecuado disponible para el tipo y complejidad de consulta.\n' +
    '5. Incluye modelos de al menos 2 providers diferentes para resilencia.\n' +
    '6. No repitas el mismo par provider+api_model_id.\n\n' +
    'Devuelve SOLO este JSON (sin markdown, sin explicacion):\n' +
    '{\n' +
    '  "chain": [\n' +
    '    { "provider": "<nombre_provider>", "api_model_id": "<api_model_id_del_catalogo>" },\n' +
    '    { "provider": "<nombre_provider>", "api_model_id": "<api_model_id_del_catalogo>" }\n' +
    '  ]\n' +
    '}';

  try {
    const selLabel = selectorChain[0].provider.toUpperCase() + '/' + selectorChain[0].model;
    console.log('  🧠 Selector IA ejecutandose con: ' + selLabel);
    const result = await callWithFallback(selectorChain, 'assist', selectorSystemInstruction, selectorPrompt);
    const parsed = extractJSON(result.text);
    if (parsed && Array.isArray(parsed.chain) && parsed.chain.length > 0) {
      const chainStr = parsed.chain.map(m => m.provider + '/' + m.api_model_id).join(' -> ');
      console.log('  ✅ Seleccion IA: ' + parsed.chain.length + ' modelos -> ' + chainStr);
      return parsed.chain;
    }
    console.warn('  ⚠️  Selector IA devolvio JSON invalido. Usando cadena por defecto...');
  } catch (err) {
    console.warn('  ⚠️  Selector IA fallo (' + err.message + '). Usando cadena por defecto...');
  }
  return null;
}

// Default exclusions
const IGNORED_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  // Audio/Video
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  // Archives
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  // Fonts
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  // Executables/Binaries
  'exe', 'dll', 'so', 'dylib', 'bin', 'pdf', 'docx', 'xlsx', 'pptx',
  // Lock files
  'lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  // Databases
  'db', 'sqlite', 'sqlite3', 'sqlitedb'
]);

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',
  'bin',
  'obj'
]);

// Helper to safely run git commands
function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error(`Git command failed: git ${args.join(' ')}. Error: ${err.message}`);
  }
}

// Helper to append git exclusions as pathspecs
function addExclusions(args, exclude) {
  if (!exclude) return;
  const excludes = exclude.split(',').map(e => e.trim()).filter(Boolean);
  for (const pattern of excludes) {
    args.push(`:!${pattern}`);
  }
}

// Helper to retrieve git diff based on range and exclusions using pathspecs
function getGitDiff(range, exclude) {
  try {
    runGit(['status']);
  } catch (err) {
    throw new Error('Not a git repository or git command not available. Reviewer mode requires a git repository.');
  }

  // If explicit range is provided, use it
  if (range) {
    console.log(`🔍 Getting git diff for specified range: "${range}"`);
    const args = ['diff', range, '--', '.'];
    addExclusions(args, exclude);
    try {
      return runGit(args);
    } catch (e) {
      throw new Error(`Failed to get git diff for range "${range}": ${e.message}`);
    }
  }

  const isCI = !!process.env.GITHUB_ACTIONS;

  if (isCI) {
    const eventName = process.env.GITHUB_EVENT_NAME;
    console.log(`🔍 Running in CI. Event: "${eventName}"`);

    if (eventName === 'pull_request' || eventName === 'pull_request_target') {
      const baseRef = process.env.GITHUB_BASE_REF || 'main';
      console.log(`🔍 Pull Request detected. Comparing against target branch: "origin/${baseRef}"`);
      try {
        // Fetch base branch first
        try { runGit(['fetch', 'origin', baseRef]); } catch (e) {}
        const prArgs = ['diff', `origin/${baseRef}...HEAD`, '--', '.'];
        addExclusions(prArgs, exclude);
        return runGit(prArgs);
      } catch (e) {
        console.warn(`  ⚠️ Failed to diff against origin/${baseRef}: ${e.message}. Falling back to comparing last commit.`);
      }
    }

    // Push or other events: compare HEAD~1 with HEAD
    console.log('🔍 Comparing current commit against its parent (HEAD~1)...');
    try {
      const pushArgs = ['diff', 'HEAD~1', 'HEAD', '--', '.'];
      addExclusions(pushArgs, exclude);
      return runGit(pushArgs);
    } catch (e) {
      try {
        console.warn('  ⚠️ HEAD~1 not available (e.g. single commit). Fetching initial commit diff using show HEAD...');
        return runGit(['show', 'HEAD']);
      } catch (err) {
        throw new Error(`Failed to get diff for HEAD~1 in CI: ${err.message}`);
      }
    }
  } else {
    // Local terminal mode
    console.log('🔍 Running locally. Detecting changes...');
    // 1. Check working directory changes (staged and unstaged)
    const localArgs = ['diff', 'HEAD', '--', '.'];
    addExclusions(localArgs, exclude);
    const workingDiff = runGit(localArgs);
    if (workingDiff.trim()) {
      console.log('  👉 Found unsaved changes in the working directory.');
      return workingDiff;
    }

    // 2. If no unsaved changes, check last commit
    console.log('  👉 No unsaved changes found. Reviewing the last commit (HEAD~1)...');
    try {
      const lastCommitArgs = ['diff', 'HEAD~1', 'HEAD', '--', '.'];
      addExclusions(lastCommitArgs, exclude);
      return runGit(lastCommitArgs);
    } catch (e) {
      try {
        console.warn('  ⚠️ HEAD~1 not available (e.g. single commit). Fetching initial commit diff using show HEAD...');
        return runGit(['show', 'HEAD']);
      } catch (err) {
        throw new Error(`Failed to get local git diff: ${err.message}`);
      }
    }
  }
}

// Helper to parse CLI arguments (e.g. node zenon.js --mode correct)
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if ((arg === '--mode' || arg === '-m') && i + 1 < process.argv.length) {
      args.mode = process.argv[++i];
    } else if ((arg === '--exclude' || arg === '-e') && i + 1 < process.argv.length) {
      args.exclude = process.argv[++i];
    } else if ((arg === '--objective' || arg === '-o') && i + 1 < process.argv.length) {
      args.objectiveFile = process.argv[++i];
    } else if ((arg === '--topic' || arg === '-t') && i + 1 < process.argv.length) {
      args.topic = process.argv[++i];
    } else if ((arg === '--diff' || arg === '-d') && i + 1 < process.argv.length) {
      args.diffRange = process.argv[++i];
    } else if (arg === '--docs' && i + 1 < process.argv.length) {
      args.docs = process.argv[++i];
    } else if (arg === '--reset-stats') {
      args.resetStats = true;
    } else if (arg === '--test-cmd' && i + 1 < process.argv.length) {
      args.testCmd = process.argv[++i];
    } else if (arg === '--auto-fix') {
      // Support both --auto-fix (flag alone) and --auto-fix true/false
      const next = process.argv[i + 1];
      if (next && next !== 'false' && !next.startsWith('--')) {
        args.autoFix = next !== 'false';
        i++;
      } else {
        args.autoFix = true;
      }
    } else if ((arg === '--plan-file' || arg === '--devops-plan') && i + 1 < process.argv.length) {
      args.devopsPlanFile = process.argv[++i];
    } else if ((arg === '--devops-task' || arg === '--task') && i + 1 < process.argv.length) {
      args.devopsTask = process.argv[++i];
    } else if ((arg === '--notify-email' || arg === '--email') && i + 1 < process.argv.length) {
      args.notifyEmail = process.argv[++i];
    } else if ((arg === '--notify-webhook' || arg === '--webhook') && i + 1 < process.argv.length) {
      args.notifyWebhook = process.argv[++i];
    } else if (arg === '--self-heal') {
      args.selfHeal = true;
    }
    // --self-heal true/false support
    else if (arg === '--self-heal' || (arg === '--self-heal' && process.argv[i+1] === 'true')) {
      args.selfHeal = true;
    }
  }
  return args;
}

// Helper to update cumulative token usage and call statistics in .zenon_cache.json
function updateUsageStats(provider, model, mode, promptTokens, completionTokens) {
  if (!fs.existsSync(CACHE_FILE)) return;
  try {
    let cacheData = { fingerprint: '', knowledge: '', updatedAt: '' };
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {}

    if (!cacheData.usageStats) {
      cacheData.usageStats = {
        lastReset: new Date().toISOString(),
        totalCalls: 0,
        providers: {},
        modes: {}
      };
    }

    const stats = cacheData.usageStats;
    stats.totalCalls = (stats.totalCalls || 0) + 1;

    // Normalize prompt and completion tokens (make sure they are numbers)
    const pTokens = Number(promptTokens) || 0;
    const cTokens = Number(completionTokens) || 0;

    // Update provider statistics
    if (!stats.providers[provider]) {
      stats.providers[provider] = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    const p = stats.providers[provider];
    p.calls += 1;
    p.promptTokens += pTokens;
    p.completionTokens += cTokens;
    p.totalTokens += (pTokens + cTokens);

    // Update mode statistics
    if (!stats.modes[mode]) {
      stats.modes[mode] = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    const m = stats.modes[mode];
    m.calls += 1;
    m.promptTokens += pTokens;
    m.completionTokens += cTokens;
    m.totalTokens += (pTokens + cTokens);

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (err) {
    // Fail silently during regular model execution so we do not disrupt work
  }
}

// Recursively traverse directory if not a Git repository
function traverseDirectory(dir, fileList) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const relativePath = path.relative('.', fullPath);
      const parts = relativePath.split(/[/\\]/);
      // Ensure that actual ignored directories are skipped, not just any part that starts with '.'
      if (parts.some(part => IGNORED_DIRS.has(part))) {
        continue;
      }
      traverseDirectory(fullPath, fileList);
    } else {
      const relativePath = path.relative('.', fullPath);
      fileList.push(relativePath);
    }
  }
}

// Get the files to be analyzed, prioritizing git files if in a repo
function getProjectFiles(userExcludes) {
  let files = [];
  try {
    // Check if git is initialized and working
    runGit(['status']);
    const tracked = runGit(['ls-files']).split('\n').filter(Boolean);
    const untracked = runGit(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
    files = [...new Set([...tracked, ...untracked])];
  } catch (err) {
    console.log('Not a git repository or git command failed. Traversing directory recursively...');
    traverseDirectory('.', files);
  }

  return filterFiles(files, userExcludes);
}

// Filter out binary, locked, large, and user-excluded files
function filterFiles(fileList, userExcludes) {
  const userExcludeSet = new Set(
    userExcludes ? userExcludes.split(',').map(s => s.trim().replace(/\\/g, '/')) : []
  );

  return fileList.filter(file => {
    const normFile = file.replace(/\\/g, '/');
    const parts = normFile.split('/');
    
    // Skip ignored directories (e.g. node_modules, .git)
    // This check is refined to only skip explicit IGNORED_DIRS, not all directories starting with '.'
    if (parts.some(part => IGNORED_DIRS.has(part))) {
      return false;
    }

    // Skip ignored extensions
    const ext = normFile.split('.').pop().toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) {
      return false;
    }

    // Skip minified files
    if (normFile.includes('.min.')) {
      return false;
    }

    // Skip user excludes
    if (userExcludeSet.has(normFile) || Array.from(userExcludeSet).some(pattern => normFile.includes(pattern))) {
      return false;
    }

    // Read details and check if binary / oversized
    try {
      if (!fs.existsSync(file)) return false;
      const stats = fs.statSync(file);
      if (stats.size > 102400) { // Limit to 100KB per file
        return false;
      }

      // Read a chunk to inspect for null bytes (binary file check)
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(file, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return false;
        }
      }
    } catch (e) {
      return false;
    }

    return true;
  });
}

// Async sleep helper (used for exponential backoff on 429 errors)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Build the Gemini request body for a given mode
function buildRequestBody(mode, systemInstruction, prompt, model, enableGrounding = false) {
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: prompt }] }]
  };

  // Habilitar Google Search Grounding si el modelo lo soporta (gemini-*)
  if (enableGrounding && model.toLowerCase().includes('gemini')) {
    body.tools = [{ googleSearch: {} }];
  }

  if (mode.toLowerCase() === 'correct') {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          files: {
            type: 'ARRAY',
            description: 'List of files that require correction or improvements.',
            items: {
              type: 'OBJECT',
              properties: {
                path: {
                  type: 'STRING',
                  description: 'The relative path of the file to modify.'
                },
                content: {
                  type: 'STRING',
                  description: 'The complete, corrected content of the file. Do not truncate. You must write the full file contents.'
                },
                explanation: {
                  type: 'STRING',
                  description: 'A brief explanation of what was changed and why.'
                }
              },
              required: ['path', 'content']
            }
          }
        },
        required: ['files']
      }
    };
  }

  return body;
}

// Single model call — throws with statusCode property on HTTP errors
async function callGeminiModel(apiKey, model, mode, systemInstruction, prompt, enableGrounding = false) {
  const apiBase = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
  const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = buildRequestBody(mode, systemInstruction, prompt, model, enableGrounding);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Zenon AI engine error (${response.status}): ${errText}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();

  if (data.usageMetadata) {
    updateUsageStats('gemini', model, mode, data.usageMetadata.promptTokenCount, data.usageMetadata.candidatesTokenCount);
  }

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response candidates returned. The request may have been blocked by safety filters.');
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn(`Warning: Generation completed with reason: ${candidate.finishReason}`);
  }

  const parts = candidate.content ? candidate.content.parts : undefined;
  if (Array.isArray(parts) && parts.length > 0) {
    const extracted = extractTextFromContent(parts[0].text);
    if (extracted) {
      return extracted;
    }
  }
  throw new Error('Gemini API returned an empty or invalid content parts.');
}

// =============================================================================
// PASO 5: Smart Token Management — per-model profiles, file-level truncation,
//         and adaptive system instruction compression.
// =============================================================================

/**
 * Context tier per model — controls instruction verbosity and truncation budget.
 * Tiers: 'large' ≥200K chars | 'medium' 50K-199K | 'small' <50K
 */
  const MODEL_PROFILES = {
    // Google Gemini
    'gemini-2.5-flash':         { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'gemini-flash-lite-latest':  { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'gemini-3.1-flash-lite':     { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'google/gemini-3.1-flash-lite': { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    // Google Gemma
    'gemma-4-31b-it':            { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    'gemma-4-31b':               { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    // OpenAI / GitHub Models
    'gpt-4o':                    { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'gpt-4o-mini':               { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'gpt-oss-120b':              { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    // Meta Llama
    'meta-llama-3.1-405b-instruct': { tier: 'medium', maxTokens: 8000, maxChars: 28000 }, // strict limit for free tier
    'meta-llama-3.1-8b-instruct':   { tier: 'small', maxTokens: 8000, maxChars: 28000 },  // strict limit for free tier
    'llama-3.1-405b-instruct':   { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'llama-3.1-8b-instant':      { tier: 'small', maxTokens: 128000, maxChars: 500000 },
    'llama-3.3-70b-versatile':   { tier: 'small', maxTokens: 131072, maxChars: 520000 },
    'meta-llama-3.3-70b-instruct': { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'meta-llama/llama-3.3-70b-instruct:free': { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { tier: 'medium', maxTokens: 10000000, maxChars: 40000000 },
    // Qwen (Alibaba)
    'qwen/qwen3-coder:free':     { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    'qwen/qwen3.6-27b':          { tier: 'medium', maxTokens: 262144, maxChars: 1050000 },
    // Cohere
    'command-a-plus-05-2026':    { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'command-r-plus-08-2024':    { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'command-a-03-2025':         { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    'command-r-08-2024':         { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'cohere/north-mini-code:free': { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    // Cerebras
    'zai-glm-4.7':               { tier: 'medium', maxTokens: 131072, maxChars: 500000 },
    // SambaNova / OpenRouter / MiniMax
    'deepseek-v3.2':             { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'deepseek-v3-0324':          { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'minimax-m2.7':              { tier: 'medium', maxTokens: 128000, maxChars: 500000 }
  };

  /**
   * Adapts the system instruction to the model's context tier and available tokens.
   * For models with smaller context, it removes the verbose REPORT FORMAT block
   * and can truncate further if a precise maxChars limit is known.
   */
  function adaptSystemInstruction(systemInstruction, model) {
    const modelKey = model.toLowerCase();
    const profile = MODEL_PROFILES[modelKey] || MODEL_PROFILES[model] || { tier: 'medium', maxTokens: 128000, maxChars: 500000 }; // Default profile
    if (profile.tier === 'large') return systemInstruction;

    let adapted = systemInstruction;

    // Strip the REPORT FORMAT section for small/medium context models
    if (profile.tier === 'small' || profile.tier === 'medium') {
      adapted = adapted
        .replace(/REPORT FORMAT[\s\S]*?Every code snippet must be in a fenced block with the correct language tag\./,
                 'Return a concise Markdown report with sections: Bugs, Security, Performance, Code Quality. Use bullet points. Include file paths and code snippets only for critical issues.')
        .replace(/\n{3,}/g, '\n\n'); // Collapse excess blank lines
    }

    if (profile.tier === 'small') {
      // Further compress: strip the CRITICAL RULES block header, keep only the DO NOTs
      adapted = adapted
        .replace(/CRITICAL RULES — follow without exception:\n/, '')
        .replace(/YOUR TASK:\n/, '')
        .trim();
    }

    // If a precise maxChars is defined, ensure adapted instruction fits
    if (profile.maxChars && adapted.length > profile.maxChars * 0.1) { // Reserve 10% for instruction
      adapted = adapted.substring(0, profile.maxChars * 0.1);
      console.warn(`System instruction truncated for ${model} to fit maxChars.`);
    }

    return adapted;
  }

/**
 * Smart codebase truncation: cuts at file boundaries instead of mid-content,
 * and appends a manifest of omitted files so the model knows what was excluded.
 * Uses a dynamic buffer: 8% of maxInputChars or 3000 chars, whichever is larger.
 * Approximation: 1 token ≈ 3.5 chars (conservative for code).
 */
function smartTruncateCodebase(codebasePayload, systemInstruction, maxInputChars) {
  if (!maxInputChars) return codebasePayload;

  const sysLen = systemInstruction ? systemInstruction.length : 0;
  // Calcular el tamaño del buffer como un porcentaje de maxInputChars, con un mínimo de 3000 chars.
  // Esto asegura que el buffer es proporcional al límite de contexto del modelo.
  const BUFFER_PERCENTAGE = 0.08; // 8%
  const MIN_BUFFER_CHARS = 3000;
  const BUFFER = Math.max(Math.floor(maxInputChars * BUFFER_PERCENTAGE), MIN_BUFFER_CHARS);
  const available = maxInputChars - sysLen - BUFFER;

  if (available <= 0) {
    return '⚠️  [Codebase omitido: el system instruction supera el límite de contexto del modelo.]';
  }
  if (codebasePayload.length <= available) return codebasePayload;

  // Split into individual file blocks
  const FILE_SEPARATOR = '--- FILE: ';
  const blocks = codebasePayload.split(FILE_SEPARATOR).filter(Boolean);

  let result = '';
  const omittedFiles = [];

  for (const block of blocks) {
    const fileBlock = FILE_SEPARATOR + block;
    if (result.length + fileBlock.length <= available) {
      result += fileBlock;
    } else {
      // Extract just the filename from the block header (first line)
      const filename = block.split('\n')[0].trim();
      omittedFiles.push(filename);
    }
  }

  if (omittedFiles.length > 0) {
    result += `\n\n⚠️  [TRUNCATED: The following ${omittedFiles.length} file(s) were omitted due to context limits: ${omittedFiles.join(', ')}. Focus analysis on the files provided above.]`;
  }

  return result;
}

// Ayudante ultra-defensivo para extraer texto de la respuesta de cualquier IA (String, Array o Estructura Compleja)
function extractTextFromContent(content) {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'string') return item;
      if (typeof item.text === 'string') return item.text;
      if (item.text) return String(item.text);
      return '';
    }).join('').trim();
  }
  if (typeof content.text === 'string') {
    return content.text;
  }
  if (content.text) {
    return String(content.text);
  }
  return '';
}

// Llama de forma adaptativa a cualquier modelo y proveedor del catálogo
async function callProviderModel(entry, mode, systemInstruction, prompt, enableGrounding = false) {
  const { provider, model, apiKey, maxInputChars, max_completion_tokens } = entry;

  // Adapt system instruction verbosity to this model's context tier
  const adaptedInstruction = adaptSystemInstruction(systemInstruction, model);
  if (adaptedInstruction.length < systemInstruction.length) {
    const saved = systemInstruction.length - adaptedInstruction.length;
    const profile = MODEL_PROFILES[model] || { tier: 'medium' };
    console.log(`    🔧 System instruction comprimida para modelo ${profile.tier.toUpperCase()} (ahorro: ${saved} chars)`);
  }

  // Smart file-boundary truncation of the codebase payload
  const safePrompt = smartTruncateCodebase(prompt, adaptedInstruction, maxInputChars);
  if (safePrompt.length < prompt.length) {
    console.log(`    ✂️  Codebase truncado en límite de archivo: ${prompt.length} → ${safePrompt.length} chars para [${provider.toUpperCase()}] ${model}`);
  }

  // 1. Google Gemini
  if (provider === 'gemini') {
    return await callGeminiModel(apiKey, model, mode, adaptedInstruction, safePrompt, enableGrounding);
  }

  // 2. Cohere API V2
  if (provider === 'cohere') {
    const url = 'https://api.cohere.com/v2/chat';
    const body = {
      model: model,
      messages: [
        { role: 'system', content: adaptedInstruction },
        { role: 'user', content: safePrompt }
      ]
    };
    // response_format solo para modos que requieren JSON; command-a-plus puede rechazarlo en otros modos
    if (mode.toLowerCase() === 'correct' || mode.toLowerCase() === 'objective') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Cohere API error (${response.status}): ${text}`);
      err.statusCode = response.status;
      throw err;
    }

    const data = await response.json();
    if (data.meta && data.meta.tokens) {
      updateUsageStats('cohere', model, mode, data.meta.tokens.input_tokens, data.meta.tokens.output_tokens);
    }
    if (data.message && data.message.content !== undefined && data.message.content !== null) {
      const extracted = extractTextFromContent(data.message.content);
      if (extracted) {
        return extracted;
      }
    }
    throw new Error('Cohere V2 API returned an empty or invalid message content.');
  }

  // 3. Proveedores compatibles con formato OpenAI (Groq, OpenRouter, SambaNova, Cerebras, GitHub Models)
  let apiBase = '';
  if (provider === 'groq') {
    apiBase = 'https://api.groq.com/openai/v1';
  } else if (provider === 'openrouter') {
    apiBase = 'https://openrouter.ai/api/v1';
  } else if (provider === 'samba') {
    apiBase = 'https://api.sambanova.ai/v1';
  } else if (provider === 'cerebras') {
    apiBase = 'https://api.cerebras.ai/v1';
  } else if (provider === 'github_models') {
    apiBase = 'https://models.inference.ai.azure.com';
  }

  const url = `${apiBase}/chat/completions`;
  const body = {
    model: model,
    messages: [
      { role: 'system', content: adaptedInstruction },
      { role: 'user', content: safePrompt }
    ]
  };

  if (max_completion_tokens !== undefined) {
    body.max_completion_tokens = max_completion_tokens;
  }

  if (mode.toLowerCase() === 'correct' || mode.toLowerCase() === 'objective') {
    body.response_format = { type: 'json_object' };
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/amglogicalis/my-github-actions';
    headers['X-Title'] = 'Zenon AI Assistant';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`${provider.toUpperCase()} API error (${response.status}): ${text}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  if (data.usage) {
    updateUsageStats(provider, model, mode, data.usage.prompt_tokens, data.usage.completion_tokens);
  }
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`${provider.toUpperCase()} returned no choices in response.`);
  }

  const content = data.choices[0].message ? data.choices[0].message.content : undefined;
  const extracted = extractTextFromContent(content);
  if (extracted) {
    return extracted;
  }
  throw new Error(`${provider.toUpperCase()} returned an empty or invalid content in message choices.`);
}

// =============================================================================
// PASO 1 y 3: Fallback Chain across Providers with Exponential Backoff
// =============================================================================
/**
 * Extracts the first valid JSON object or array from a raw string.
 * Handles markdown fences (```json ... ```) and leading/trailing garbage text.
 */
function extractJSON(raw) {
  if (!raw) return null;
  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch (_) {}
  // Find the outermost { ... } or [ ... ] block
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = cleaned.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === open) depth++;
      else if (cleaned[i] === close) depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { break; }
      }
    }
  }
  return null;
}

/**
 * Detects infinite-loop responses or repetitive structural output (e.g., repeating Markdown tables).
 * Returns true if the model is clearly stuck in a loop.
 */
function isLoopingResponse(text) {
  if (!text || text.length < 200) return false;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return false;

  // 1. Detección de repetición de líneas exactas (como antes)
  const freq = {};
  for (const line of lines) { freq[line] = (freq[line] || 0) + 1; }
  const maxFreq = Math.max(...Object.values(freq));
  if (maxFreq > 5 && (maxFreq / lines.length) > 0.4) {
    return true; // Bucle de líneas exactas
  }

  // 2. Detección de patrones repetitivos en estructuras Markdown (ej. tablas)
  // Simplificación: si encontramos un patrón de líneas que se repiten en bloques
  // y cubren una parte significativa del texto, es un bucle estructural.
  for (let i = 0; i < lines.length - 2; i++) {
    const block = lines.slice(i, i + 3).join('\n'); // Bloque de 3 líneas
    let count = 0;
    for (let j = i; j < lines.length - 2; j++) {
      if (lines.slice(j, j + 3).join('\n') === block) {
        count++;
      }
    }
    if (count > 3 && (count * 3 / lines.length) > 0.3) {
      return true; // Bucle de bloques de líneas
    }
  }

  // 3. Detección de repetición de frases consecutivas (ej. bucle en una sola línea o entre líneas)
  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(/(.{15,200}?)\1{3,}/);
  if (match) {
    const repeatingUnit = match[1];
    // Evitar falsos positivos con repeticiones de un solo carácter (ej. "=================")
    const isSingleChar = /^(.)\1+$/.test(repeatingUnit);
    if (!isSingleChar) {
      return true; // Bucle de frase detectado
    }
  }

  return false;
}

async function callWithFallback(chain, mode, systemInstruction, prompt, enableGrounding = false) {
  if (chain.length === 0) {
    throw new Error('No API keys configured. Please configure at least one of: ZENON_API_KEY, GROQ_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY, SAMBA_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN / TOKEN_GH.');
  }

  let lastError;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    const isLastModel = i === chain.length - 1;
    const modelLabel = `[${entry.provider.toUpperCase()}] ${entry.model}`;

    try {
      if (i > 0) {
        console.log(`  ↳ Intentando fallback [${i}/${chain.length - 1}]: ${modelLabel}`);
      } else {
        console.log(`  Usando modelo principal: ${modelLabel}`);
      }

      const result = await callProviderModel(entry, mode, systemInstruction, prompt, enableGrounding);

      // Detect infinite-loop responses before accepting the result
      if (isLoopingResponse(result)) {
        console.warn(`  ⚠️  Modelo "${modelLabel}" devolvió una respuesta en bucle infinito. Descartando y cambiando al siguiente...`);
        lastError = new Error('Looping response detected');
        continue;
      }

      if (i > 0) {
        console.log(`  ✅ Fallback exitoso con modelo: ${modelLabel}`);
      }
      return {
        text: result,
        provider: entry.provider,
        model: entry.model
      };

      } catch (err) {
        lastError = err;
        const statusCode = err.statusCode || 0;
        const isPayloadTooLarge = statusCode === 413 || 
                                  (statusCode === 400 && (
                                    err.message.toLowerCase().includes('context') ||
                                    err.message.toLowerCase().includes('token') ||
                                    err.message.toLowerCase().includes('limit') ||
                                    err.message.toLowerCase().includes('length') ||
                                    err.message.toLowerCase().includes('too large')
                                  )) ||
                                  err.message.toLowerCase().includes('too large') || 
                                  err.message.toLowerCase().includes('context_length_exceeded');

        if (isLastModel) {
          console.error(`  ❌ Todos los modelos del catálogo de proveedores fallaron.`);
          break;
        }

        if (isPayloadTooLarge) {
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló por límite de tamaño/tokens (413 o context limit). Saltando todos los modelos de ${entry.provider.toUpperCase()} en esta ejecución...`);
          // Remover todos los modelos futuros de este mismo proveedor de la cadena de fallback
          for (let j = chain.length - 1; j > i; j--) {
            if (chain[j].provider === entry.provider) {
              chain.splice(j, 1);
            }
          }
        } else if (statusCode === 429) {
          // Rate-limited: wait a short constant time to clear RPM slot, then try next fallback
          // Since the next model is on a different provider/quota, we do not scale wait times globally
          const delayMs = BACKOFF_BASE_MS; // Constant 2s wait
          console.warn(`  ⚠️  Modelo "${modelLabel}" superó límite de cuota (429). Esperando ${delayMs / 1000}s antes de reintentar...`);
          await sleep(delayMs);
        } else if (statusCode >= 500) {
          // Server error: switch immediately
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló con error de servidor (${statusCode}). Detalle: ${err.message}. Cambiando al siguiente de inmediato...`);
        } else {
          // Other errors: switch immediately
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló (${statusCode || 'error de red'}). Detalle: ${err.message}. Cambiando al siguiente...`);
        }
      }
  }

  throw lastError;
}

// Send PR comment on GitHub
async function postPRComment(report, token) {
  if (!token) {
    console.log('No GitHub Token provided. Skipping PR comment.');
    return;
  }
  
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.log('No GITHUB_EVENT_PATH found. Skipping PR comment.');
    return;
  }

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const prNumber = event.pull_request ? event.pull_request.number : null;
    
    if (!prNumber) {
      console.log('Event is not a Pull Request. Skipping PR comment.');
      return;
    }

    const repo = process.env.GITHUB_REPOSITORY;
    const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
    const url = `${apiUrl}/repos/${repo}/issues/${prNumber}/comments`;

    const commentBody = `### <img src="${LOGO_BASE_URL}/logo.png" height="22" align="absmiddle" /> Zenon (AI Assistant) Code Review\n\n${report}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Zenon-AI-Assistant',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: commentBody })
    });

    if (response.ok) {
      console.log(`Successfully posted code analysis report to PR #${prNumber}`);
    } else {
      const errText = await response.text();
      console.error(`Failed to post PR comment (${response.status}): ${errText}`);
    }
  } catch (err) {
    console.error('Error posting PR comment:', err);
  }
}

// Commit and push changes back in CI
function commitAndPushChanges(modifiedFiles) {
  try {
    console.log('Configuring git credentials...');
    runGit(['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
    runGit(['config', '--local', 'user.name', 'github-actions[bot]']);

    // Stage changes
    for (const file of modifiedFiles) {
      console.log(`Staging: ${file}`);
      runGit(['add', file]);
    }

    // Verify if there are staged differences
    const staged = runGit(['diff', '--name-only', '--cached']);
    if (!staged) {
      console.log('No changes were staged. Nothing to commit.');
      return;
    }

    console.log('Committing changes...');
    runGit(['commit', '-m', 'Zenon: Auto-corrections and improvements']);

    console.log('Pushing changes...');
    runGit(['push']);
    console.log('Successfully committed and pushed corrections to the repository!');
  } catch (err) {
    console.error('Error committing and pushing changes:', err.message);
    console.log('Please ensure the GitHub Action has write permissions in your workflow configuration (e.g. "permissions: contents: write").');
  }
}

// Main function
async function main() {
  const cliArgs = parseArgs();
  
  // Resolve configurations prioritizing CLI args over GHA Inputs over Env Vars
  const keys = getAvailableKeys(cliArgs);
  const mode = (cliArgs.mode || process.env.INPUT_MODE || 'assist').toLowerCase();
  const exclude = cliArgs.exclude || process.env.INPUT_EXCLUDE || '';
  const objectiveFile = cliArgs.objectiveFile || process.env.INPUT_OBJECTIVE_FILE || 'zenon_objective.md';
  const topic = cliArgs.topic || process.env.INPUT_TOPIC || '';
  const diffRange = cliArgs.diffRange || process.env.INPUT_DIFF_RANGE || '';
  const githubToken = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const isCI = !!process.env.GITHUB_ACTIONS;

  // --- Startup diagnostics (visible in CI logs) ---
  console.log('=== Zenon startup ===');
  console.log(`Node.js      : ${process.version}`);
  console.log(`Mode         : ${mode}`);
  console.log(`Context      : ${isCI ? 'GitHub Actions CI' : 'Local Terminal'}`);
  console.log(`Keys found   : ${Object.keys(keys).filter(k => keys[k]).map(k => k.toUpperCase()).join(', ') || 'NINGUNA ❌'}`);
  console.log(`GitHub Token : ${githubToken ? 'found ✅' : 'not set (PR comments disabled)'}`);
  console.log(`Exclude      : "${exclude || '(none)'}"`);
  if (mode === 'objective') {
    const isFile = fs.existsSync(path.resolve(process.cwd(), objectiveFile));
    if (isFile) {
      console.log(`Objective    : File "${objectiveFile}"`);
    } else {
      const showText = objectiveFile.length > 50 ? objectiveFile.substring(0, 50) + '...' : objectiveFile;
      console.log(`Objective    : Text "${showText}"`);
    }
  } else if (mode === 'trainer') {
    console.log(`Topic        : "${topic || '(none)'}"`);
  } else if (mode === 'reviewer') {
    console.log(`Diff Range   : "${diffRange || '(auto)'}"`);
  } else if (mode === 'tester') {
    console.log(`Test Command : "${cliArgs.testCmd || process.env.INPUT_TEST_CMD || '(auto-detect)'}"`);
    console.log(`Auto Fix     : ${cliArgs.autoFix || process.env.INPUT_AUTO_FIX === 'true' ? 'yes' : 'no'}`);
    if (topic) console.log(`Focus Topic  : "${topic}"`);
  } else if (mode === 'devops') {
    const planFile = cliArgs.devopsPlanFile || process.env.INPUT_DEVOPS_PLAN_FILE || 'zenon_devops.md';
    const devopsTask = cliArgs.devopsTask || process.env.INPUT_DEVOPS_TASK || '';
    console.log(`Plan File    : "${planFile}"`);
    if (devopsTask) console.log(`Task Filter  : "${devopsTask}"`);
    console.log(`Self-Heal    : ${cliArgs.selfHeal || process.env.INPUT_SELF_HEAL === 'true' ? 'yes' : 'no'}`);
    const notifyEmail = cliArgs.notifyEmail || process.env.INPUT_NOTIFY_EMAIL || '';
    const notifyWebhook = cliArgs.notifyWebhook || process.env.INPUT_NOTIFY_WEBHOOK || '';
    console.log(`Notify Email : ${notifyEmail ? `"${notifyEmail}"` : '(silent mode)'}`);
    console.log(`Notify Webhook: ${notifyWebhook ? `"${notifyWebhook.substring(0, 40)}..."` : '(not set)'}`);
  }
  console.log('=====================');

  const hasAtLeastOneKey = Object.values(keys).some(Boolean);
  if (!hasAtLeastOneKey && mode !== 'analyzer') {
    console.error('');
    console.error('❌ Ninguna API Key de proveedor está configurada.');
    console.error('   Configura al menos una de las siguientes variables de entorno:');
    console.error('     ZENON_API_KEY, GROQ_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY, SAMBA_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN / TOKEN_GH');
    process.exit(1);
  }

  if (!['assist', 'correct', 'objective', 'trainer', 'reviewer', 'analyzer', 'helper', 'updater', 'tester', 'devops'].includes(mode)) {
    console.error(`❌ Modo "${mode}" no reconocido. Modos disponibles: "assist", "correct", "objective", "trainer", "reviewer", "analyzer", "helper", "updater", "tester", "devops".`);
    process.exit(1);
  }

  // =============================================================================
  // PASO 10: Modo Analyzer — Estadísticas de consumo y cuotas
  // =============================================================================
  if (mode === 'analyzer') {
    const QUOTA_LIMITS = {
      providers: {
        gemini: { limitName: 'Free Tier Daily Limit', limitValue: 1500, limitUnit: 'calls/day' },
        groq: { limitName: 'Free Tier Daily Limit', limitValue: 14400, limitUnit: 'calls/day' },
        cohere: { limitName: 'Trial Key Monthly Limit', limitValue: 1000, limitUnit: 'calls/month' },
        samba: { limitName: 'Daily Limit', limitValue: 10000, limitUnit: 'calls/day' },
        cerebras: { limitName: 'Daily Limit', limitValue: 10000, limitUnit: 'calls/day' },
        openrouter: { limitName: 'Free Tier Limit', limitValue: 1000, limitUnit: 'calls/day' },
        github_models: { limitName: 'Daily Rate Limit', limitValue: 50, limitUnit: 'calls/day' }
      }
    };

    const isReset = cliArgs.resetStats || process.env.INPUT_RESET_STATS === 'true';

    if (isReset) {
      if (fs.existsSync(CACHE_FILE)) {
        try {
          const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
          cacheData.usageStats = {
            lastReset: new Date().toISOString(),
            totalCalls: 0,
            providers: {},
            modes: {}
          };
          fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
          console.log('🔄 Estadísticas de uso reseteadas correctamente en .zenon_cache.json.');
          if (isCI && process.env.GITHUB_STEP_SUMMARY) {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🔄 Zenon Polis — Analyzer\n\nEstadísticas de uso reseteadas correctamente.\n`);
          }
        } catch (e) {
          console.error('❌ Error al resetear estadísticas:', e.message);
          process.exit(1);
        }
      } else {
        console.log('ℹ️ No existe archivo de caché para resetear.');
      }
      return;
    }

    let stats = {
      lastReset: new Date().toISOString(),
      totalCalls: 0,
      providers: {},
      modes: {}
    };

    if (fs.existsSync(CACHE_FILE)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (cacheData.usageStats) {
          stats = cacheData.usageStats;
        }
      } catch (e) {
        console.warn('⚠️ No se pudo leer la caché para compilar estadísticas.');
      }
    }

    stats.totalCalls = stats.totalCalls || 0;
    stats.providers = stats.providers || {};
    stats.modes = stats.modes || {};

    let report = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Analyzer\n\n`;
    report += `#### <img src="${LOGO_BASE_URL}/logo_zenon_analyzer.png" height="20" align="absmiddle" /> Análisis de Consumo y Estadísticas\n\n`;
    report += `* **Último reinicio**: ${stats.lastReset ? new Date(stats.lastReset).toLocaleString() : 'N/A'}\n`;
    report += `* **Total de llamadas exitosas**: ${stats.totalCalls}\n\n`;

    report += `### 🔌 Consumo por Proveedor de IA\n\n`;
    report += `| Proveedor | Llamadas | % del Total | Tokens Prompt | Tokens Completion | Tokens Totales | Cuota Estimada | % Cuota Consumida |\n`;
    report += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    const providerEntries = Object.entries(stats.providers);
    if (providerEntries.length === 0) {
      report += `| *Sin datos* | 0 | 0% | 0 | 0 | 0 | - | 0% |\n`;
    } else {
      for (const [prov, provStats] of providerEntries) {
        const calls = provStats.calls || 0;
        const pct = stats.totalCalls > 0 ? ((calls / stats.totalCalls) * 100).toFixed(1) + '%' : '0%';
        const pTokens = provStats.promptTokens || 0;
        const cTokens = provStats.completionTokens || 0;
        const tTokens = provStats.totalTokens || 0;

        const quotaInfo = QUOTA_LIMITS.providers[prov] || { limitName: 'Sin límite', limitValue: null, limitUnit: '' };
        let quotaLabel = '-';
        let quotaPct = '0%';
        if (quotaInfo.limitValue) {
          quotaLabel = `${quotaInfo.limitValue} ${quotaInfo.limitUnit}`;
          quotaPct = ((calls / quotaInfo.limitValue) * 100).toFixed(2) + '%';
        }

        report += `| **${prov.toUpperCase()}** | ${calls} | ${pct} | ${pTokens.toLocaleString()} | ${cTokens.toLocaleString()} | ${tTokens.toLocaleString()} | ${quotaLabel} | \`${quotaPct}\` |\n`;
      }
    }
    report += `\n`;

    report += `### ⚙️ Consumo por Modo de Ejecución\n\n`;
    report += `| Modo | Llamadas | % del Total | Tokens Prompt | Tokens Completion | Tokens Totales |\n`;
    report += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;

    const modeEntries = Object.entries(stats.modes);
    if (modeEntries.length === 0) {
      report += `| *Sin datos* | 0 | 0% | 0 | 0 | 0 |\n`;
    } else {
      for (const [m, mStats] of modeEntries) {
        const calls = mStats.calls || 0;
        const pct = stats.totalCalls > 0 ? ((calls / stats.totalCalls) * 100).toFixed(1) + '%' : '0%';
        const pTokens = mStats.promptTokens || 0;
        const cTokens = mStats.completionTokens || 0;
        const tTokens = mStats.totalTokens || 0;

        report += `| \`${m}\` | ${calls} | ${pct} | ${pTokens.toLocaleString()} | ${cTokens.toLocaleString()} | ${tTokens.toLocaleString()} |\n`;
      }
    }
    report += `\n`;

    if (providerEntries.length > 0) {
      report += `### 📊 Distribución de Llamadas por Proveedor\n\n`;
      report += `\`\`\`mermaid\npie title Llamadas por Proveedor\n`;
      for (const [prov, provStats] of providerEntries) {
        report += `    "${prov.toUpperCase()}" : ${provStats.calls || 0}\n`;
      }
      report += `\`\`\`\n\n`;
    }

    if (isCI) {
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
      }
      console.log(report);
      console.log('\n✅ Reporte de análisis publicado en el summary del job.');
    } else {
      let localReport = report
        .replaceAll(LOGO_BASE_URL + '/', 'assets/logos/')
        .replace(/### <img[^>]*src="assets\/logos\/logo_polis_zenon.png"[^>]*> /g, '# ')
        .replace(/#### <img[^>]*src="assets\/logos\/logo_zenon_analyzer.png"[^>]*> /g, '## ');

      fs.writeFileSync('zenon_report.md', localReport, 'utf8');
      console.log(localReport);
      console.log('\n✅ Reporte de análisis guardado en zenon_report.md');
    }
    return;
  }

  // =============================================================================
  // PASO 11: Modo Helper — Leer la consulta / duda del usuario
  // =============================================================================
  let helperQuery = '';
  if (mode === 'helper') {
    if (topic && topic.trim()) {
      helperQuery = topic.trim();
    } else {
      const directObjective = process.env.INPUT_OBJECTIVE || '';
      if (directObjective.trim()) {
        helperQuery = directObjective.trim();
      } else if (objectiveFile) {
        const objectivePath = path.resolve(process.cwd(), objectiveFile);
        if (fs.existsSync(objectivePath)) {
          helperQuery = fs.readFileSync(objectivePath, 'utf8').trim();
        } else {
          helperQuery = objectiveFile.trim();
        }
      }
    }

    if (!helperQuery || !helperQuery.trim()) {
      console.error('❌ No se ha proporcionado una consulta o duda para el asistente.');
      console.error('   Usa --topic "<tu duda>" o --objective "<tu duda>".');
      process.exit(1);
    }
    console.log(`🎯 Consulta cargada para Zenon Helper: "${helperQuery.length > 60 ? helperQuery.substring(0, 60) + '...' : helperQuery}"`);
  }

  // =============================================================================
  // PASO 8: Modo Trainer — Leer el tema a aprender
  // =============================================================================
  let topicContent = '';
  if (mode === 'trainer') {
    if (topic) {
      topicContent = topic.trim();
    } else {
      // Fallback a zenon_training.md
      const trainingFilePath = path.resolve(process.cwd(), 'zenon_training.md');
      if (fs.existsSync(trainingFilePath)) {
        topicContent = fs.readFileSync(trainingFilePath, 'utf8').trim();
      }
    }

    if (!topicContent) {
      console.error('❌ No se ha proporcionado un tema para entrenar.');
      console.error('   Usa --topic "<tema>" o crea un archivo "zenon_training.md" con las instrucciones.');
      process.exit(1);
    }
    console.log(`🎯 Tema cargado para entrenamiento: "${topicContent.length > 60 ? topicContent.substring(0, 60) + '...' : topicContent}"`);
  }

  // =============================================================================
  // PASO 4: Modo Objective — Leer el objetivo (desde texto directo o archivo)
  // =============================================================================
  let objectiveContent = '';
  if (mode === 'objective') {
    const directObjective = process.env.INPUT_OBJECTIVE || '';
    if (directObjective.trim()) {
      objectiveContent = directObjective.trim();
      console.log(`🎯 Objetivo cargado desde variable de entorno (${objectiveContent.length} caracteres)`);
    } else if (objectiveFile) {
      const objectivePath = path.resolve(process.cwd(), objectiveFile);
      if (fs.existsSync(objectivePath)) {
        objectiveContent = fs.readFileSync(objectivePath, 'utf8').trim();
        console.log(`🎯 Objetivo cargado desde archivo: ${objectiveFile} (${objectiveContent.length} caracteres)`);
      } else {
        // Si no existe como archivo físico, se asume que el valor de entrada es el texto directo del objetivo
        objectiveContent = objectiveFile.trim();
        console.log(`🎯 Objetivo cargado desde texto directo (${objectiveContent.length} caracteres)`);
      }
    }

    if (!objectiveContent) {
      console.error(`❌ No se ha proporcionado un objetivo para implementar.`);
      console.error(`   Usa --objective "<tu objetivo en texto directo>" o crea un archivo "zenon_objective.md" en la raíz.`);
      process.exit(1);
    }
  }

  console.log(`Zenon starting...`);
  console.log(`Mode: ${mode}`);
  console.log(`Context: ${isCI ? 'GitHub Actions CI' : 'Local Terminal'}`);

  let files = [];
  let stackInfo = { dominant: 'javascript', scores: {} };
  let totalSize = 0;

  if (mode !== 'trainer' && mode !== 'devops') {
    console.log('Scanning repository for code files...');
    files = getProjectFiles(exclude);
    console.log(`Found ${files.length} code files to analyze.`);

    if (files.length === 0) {
      console.log('No suitable code files found for analysis. Exiting.');
      return;
    }

    // Analizar la pila tecnológica dominante y construir el catálogo prioritario
    stackInfo = analyzeRepositoryStack(files);
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          totalSize += fs.statSync(file).size;
        }
      } catch (e) {}
    }
  }

  // Resolver la consulta o tarea específica para enriquecer el selector de IA
  let userQuery = 'Auditoría general del repositorio';
  if (mode === 'correct') {
    userQuery = 'Corrección autónoma de bugs y optimizaciones';
  } else if (mode === 'objective') {
    userQuery = objectiveContent;
  } else if (mode === 'trainer') {
    userQuery = topicContent;
  } else if (mode === 'reviewer') {
    userQuery = diffRange ? `Revisión de cambios en rango: ${diffRange}` : 'Revisión de cambios del diff actual';
  } else if (mode === 'helper') {
    userQuery = helperQuery;
  } else if (mode === 'analyzer') {
    userQuery = 'Análisis de consumo de tokens y cuotas de uso';
  } else if (mode === 'updater') {
    userQuery = 'Sincronización automática de documentación con cambios de código';
  } else if (mode === 'tester') {
    userQuery = topic ? `Análisis y testing de: ${topic}` : 'Análisis de tests, diagnóstico de fallos y corrección de pruebas unitarias';
  } else if (mode === 'devops') {
    const _devTask = cliArgs.devopsTask || process.env.INPUT_DEVOPS_TASK || '';
    userQuery = _devTask ? `Operador DevOps: ${_devTask}` : 'Operador DevOps autónomo: orquestar y ejecutar plan de automatización definido por el usuario en zenon_devops.md';
  }

  // Intentar la selección inteligente mediante IA primero
  const aiSelection = await selectModelsWithAI(keys, stackInfo, mode, totalSize, userQuery);
  let chain = null;
  if (aiSelection) {
    chain = buildChainFromSelection(aiSelection, keys);
  }
  if (!chain || chain.length === 0) {
    chain = buildDefaultChain(keys);
  }

  if (mode !== 'trainer' && mode !== 'devops') {
    console.log(`Dominant stack detected: ${stackInfo.dominant.toUpperCase()}`);
  }
  console.log(`Execution chain: ${chain.map(c => `${c.provider.toUpperCase()}:${c.model}`).join(' → ')}`);
  console.log(`🤖 IA Principal elegida para tu stack: [${chain[0].provider.toUpperCase()}] ${chain[0].model}`);

  const engineLabel = mode === 'correct' ? 'precision' : mode === 'objective' ? 'objective' : mode === 'trainer' ? 'trainer' : mode === 'devops' ? 'devops' : 'analysis';
  if (mode !== 'trainer' && mode !== 'devops') {
    console.log(`Total codebase size: ${(totalSize / 1024).toFixed(2)} KB | Engine: ${engineLabel} mode`);
  }

  // Construir el payload del repositorio completo (omitido en trainer, reviewer y devops inicialmente)
  let codebasePayload = '';
  if (mode !== 'trainer' && mode !== 'reviewer' && mode !== 'devops') {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          codebasePayload += `--- FILE: ${file}\n${content}\n--- END OF FILE ---\n\n`;
        }
      } catch (e) {
        console.warn(`Warning: Could not read file ${file}: ${e.message}`);
      }
    }
  }

  // =============================================================================
  // PASO 2: Autoentrenamiento y Carga de Conocimiento Contextual (Caché & Grounding)
  // =============================================================================
  const fingerprint = mode === 'trainer' ? 'trainer' : computeFingerprint(files);
  let cachedKnowledge = '';
  let cacheLoaded = false;
  let previousKnowledge = '';

  if (!fs.existsSync(CACHE_FILE)) {
    try {
      ensureGitignore();
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        fingerprint: '',
        knowledge: '',
        updatedAt: ''
      }, null, 2), 'utf8');
      console.log('ℹ️  Creado archivo de caché inicial (.zenon_cache.json) en la raíz del repositorio.');
    } catch (e) {
      // Ignorar fallos de inicialización silenciosamente
    }
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cacheData.knowledge) {
        previousKnowledge = cacheData.knowledge;
      }
      if (mode !== 'trainer' && (cacheData.fingerprint === fingerprint || mode === 'reviewer' || mode === 'helper' || mode === 'updater') && cacheData.knowledge) {
        cachedKnowledge = cacheData.knowledge;
        cacheLoaded = true;
        console.log('ℹ️  Cargada base de conocimiento contextual desde la caché (.zenon_cache.json)');
      }
    } catch (e) {
      console.log('ℹ️  No se pudo leer la caché o está corrupta. Iniciando re-entrenamiento...');
    }
  }

  if (mode !== 'trainer' && mode !== 'devops' && !cacheLoaded) {
    console.log('🧠 Base de conocimiento no encontrada o desactualizada. Iniciando autoentrenamiento...');
    ensureGitignore();

    // Cargar codebasePayload bajo demanda si está vacío
    if (!codebasePayload) {
      console.log('Cargando archivos del repositorio para el entrenamiento...');
      for (const file of files) {
        try {
          if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');
            codebasePayload += `--- FILE: ${file}\n${content}\n--- END OF FILE ---\n\n`;
          }
        } catch (e) {
          console.warn(`Warning: Could not read file ${file}: ${e.message}`);
        }
      }
    }

    // El system instruction NO menciona "Google Search tool" porque:
    //  - Gemini recibe el tool real vía enableGrounding=true en el body de la API (no necesita que el prompt lo pida).
    //  - Cohere/Groq/OpenRouter no tienen ese tool y un prompt que lo mencione causa error 422/400.
    // En su lugar, todos los modelos son instruidos a usar su conocimiento entrenado, lo cual funciona universalmente.
    const trainingSystemInstruction = `You are "Zenon", a codebase architect and senior software engineer.
Your task is to analyze the user's repository files and build a comprehensive knowledge profile of the codebase.
Identify:
1. The main programming languages, packages, frameworks, and runtimes used.
2. The architectural design patterns, folder structure, entry points, and module boundaries.
3. Crucial third-party APIs, libraries, and external services integrated, with notes on their versions and usage patterns.
4. Any custom conventions, error handling mechanisms, configuration patterns, or coding styles present in the project.
5. Known risks, potential bugs, security concerns, or anti-patterns based on your engineering knowledge.

Apply your training knowledge of software engineering best practices, security guidelines, and documentation for the specific technologies found in this codebase to enrich your analysis.
Provide a clear, concise, and structured summary of your findings. This summary will be cached and used by Zenon to guide code reviews and corrections.`;

    let trainingUserPrompt = '';
    if (previousKnowledge) {
      console.log('🧠 Detectado conocimiento previo acumulado en la caché. Iniciando entrenamiento incremental...');
      trainingUserPrompt = `We have an existing knowledge profile for this codebase:

--- PREVIOUS KNOWLEDGE PROFILE ---
${previousKnowledge}
---------------------------------

And here is the current state of the codebase files:

${codebasePayload}

Analyze the codebase files above and compare them with the previous knowledge profile. 
Based on the current files and your engineering knowledge:
- Update, refine, and enrich the previous knowledge profile.
- Preserve correct structural patterns and architectural findings that remain valid.
- Update any tech stack descriptions, conventions, libraries, risks, or code gaps that have changed or are new.
- Return a single, updated, and consolidated codebase knowledge profile.
Return the updated project knowledge profile now.`;
    } else {
      trainingUserPrompt = `Here are the codebase files for training:

${codebasePayload}

Analyze the codebase above. Based on the files and your engineering knowledge:
- Summarize the tech stack and architecture.
- Identify the most important patterns and conventions used.
- Flag any notable risks, known library issues, or best-practice gaps you can infer.
- Return a concise, structured knowledge profile that will help a future AI code reviewer understand this project.
Return the learned project knowledge profile now.`;
    }

    try {
      console.log('🔍 Realizando búsquedas y autoentrenamiento...');
      // Activamos enableGrounding = true para usar Google Search durante el entrenamiento
      const trainingResult = await callWithFallback(chain, 'assist', trainingSystemInstruction, trainingUserPrompt, true);
      cachedKnowledge = trainingResult.text;
      
      // Guardar en caché
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        fingerprint: fingerprint,
        knowledge: cachedKnowledge,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
      
      console.log(`✅ Autoentrenamiento completado con éxito utilizando la IA: [${trainingResult.provider.toUpperCase()}] ${trainingResult.model}. Guardado en .zenon_cache.json`);
    } catch (err) {
      console.warn('⚠️  Error durante el autoentrenamiento:', err.message);
      console.log('Continuando con el análisis directo sin base de conocimiento...');
    }
  }

  // =============================================================================
  // PASO 8: Modo Trainer — Ejecución de investigación y actualización de caché
  // =============================================================================
  if (mode === 'trainer') {
    const trainerSystemInstruction = `You are "Zenon", a codebase architect and senior software engineer.
Your task is to research and learn the technical details, architecture, best practices, and configuration rules for the topic specified by the user.
Use your training knowledge and search capabilities to extract:
1. Core concepts, architecture, and design patterns associated with this technology.
2. Typical configuration files, directories, dependencies, and environment variables.
3. Best practices for clean coding, security, performance, and structure.
4. Common pitfalls, anti-patterns, and troubleshooting strategies.

Format your findings in a structured, professional, and concise technical profile. This profile will be appended to Zenon's contextual knowledge base so that future code reviews and corrections in this repository will adhere to this technology's guidelines.`;

    const trainerUserPrompt = `Please research and compile a technical profile for:
"${topicContent}"

If we already have existing context in the cache, consolidate and merge the new findings with it.
Return the structured, professional technical profile now.`;

    try {
      console.log('🔍 Zenon Trainer is researching the topic using search grounding...');
      const trainingResult = await callWithFallback(chain, 'assist', trainerSystemInstruction, trainerUserPrompt, true);
      const newKnowledge = trainingResult.text;

      // Merge incrementally with existing cache
      let updatedKnowledge = previousKnowledge;
      const separator = `\n\n=== APRENDIZAJE: ${topicContent.toUpperCase()} ===\n`;
      if (updatedKnowledge.includes(separator)) {
        // Replace previous training on this topic
        const regex = new RegExp(`${separator.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}[\\s\\S]*?(?=\\n\\n=== APRENDIZAJE:|$)`);
        updatedKnowledge = updatedKnowledge.replace(regex, separator + newKnowledge);
      } else {
        // Append
        updatedKnowledge = (updatedKnowledge ? updatedKnowledge + '\n\n' : '') + separator + newKnowledge;
      }

      // Preserve existing codebase fingerprint if present
      let cacheData = { fingerprint: '' };
      if (fs.existsSync(CACHE_FILE)) {
        try { cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) {}
      }

      // Write updated cache
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        fingerprint: cacheData.fingerprint || '',
        knowledge: updatedKnowledge,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      console.log(`✅ Entrenamiento completado con éxito utilizando la IA: [${trainingResult.provider.toUpperCase()}] ${trainingResult.model}`);

      // Report
      if (isCI) {
        let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Trainer\n\n`;
        summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_trainer.png" height="20" align="absmiddle" /> Aprendizaje Completado\n\n`;
        summaryContent += `Zenon ha investigado e incorporado con éxito el siguiente tema a la base de conocimiento:\n\n`;
        summaryContent += `**Tema**: \`${topicContent}\`\n\n`;
        summaryContent += `#### Resumen Técnico Aprendido:\n${newKnowledge}\n`;
        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
        }
      } else {
        // Local mode report
        let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Trainer Report\n\n`;
        localReport += `## <img src="assets/logos/logo_zenon_trainer.png" height="26" /> Aprendizaje Completado\n\n`;
        localReport += `**Tema**: \`${topicContent}\`\n\n`;
        localReport += `### Resumen Técnico Aprendido:\n\n${newKnowledge}\n`;
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Detalles del aprendizaje guardados en zenon_report.md');
      }
      return;
    } catch (err) {
      console.error('❌ Error durante el entrenamiento:', err.message);
      process.exit(1);
    }
  }

  // =============================================================================
  // PASO 9: Modo Reviewer — Ejecución de revisión del Git Diff
  // =============================================================================
  if (mode === 'reviewer') {
    try {
      console.log('🔍 Zenon Reviewer is extracting the git diff...');
      const diffContent = getGitDiff(diffRange, exclude);

      if (!diffContent || !diffContent.trim()) {
        console.log('✅ No changes found to review.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Reviewer\n\nNo changes were found in the current diff range.\n`);
        }
        return;
      }

      console.log(`Found diff of ${diffContent.length} characters.`);

      let reviewerSystemInstruction = `You are "Zenon", a principal software engineer and expert code reviewer.
Your task is to review the code changes (git diff) provided by the user.
Analyze the changes to:
1. Identify logic bugs, syntax errors, or critical security vulnerabilities introduced in the modified code.
2. Flag bad practices, performance bottlenecks, or violations of clean coding guidelines.
3. Suggest clear, actionable improvements and optimized code replacements.

CRITICAL RULES:
- Only report issues directly related to the changed code (lines starting with '+' or '-'). Do not comment on unchanged code.
- Be concise and technical. Avoid generic advice, introductory boilerplate, or conversational preamble.
- Format your review report in clean Markdown using headings, tables, code blocks, and alerts (> [!WARNING] / > [!IMPORTANT]).
- Start directly with the first section heading.`;

      if (cachedKnowledge) {
        reviewerSystemInstruction += `\n\n=== CONTEXTO DEL REPOSITORIO (CONOCIMIENTO CACHÉ) ===\n${cachedKnowledge}\n======================================================`;
      }

      const reviewerUserPrompt = `=== GIT DIFF TO REVIEW ===
${diffContent}

Please perform a deep technical code review of this diff.`;

      console.log('🤖 Zenon is reviewing your changes...');
      const reviewResult = await callWithFallback(chain, 'assist', reviewerSystemInstruction, reviewerUserPrompt);
      const reportText = reviewResult.text;

      console.log(`\n✅ Review completed successfully using [${reviewResult.provider.toUpperCase()}] ${reviewResult.model}`);

      // Report
      if (isCI) {
        let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Reviewer\n\n`;
        summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_reviewer.png" height="20" align="absmiddle" /> Informe de Revisión\n\n`;
        summaryContent += `${reportText}\n`;

        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
        }

        // Post comment to PR if event is PR
        const eventName = process.env.GITHUB_EVENT_NAME;
        if (eventName === 'pull_request' || eventName === 'pull_request_target') {
          await postPRComment(reportText, githubToken);
        }
      } else {
        // Local mode report
        let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Reviewer Report\n\n`;
        localReport += `## <img src="assets/logos/logo_zenon_reviewer.png" height="26" /> Informe de Revisión\n\n`;
        localReport += `${reportText}\n`;
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Detalles de la revisión guardados en zenon_report.md');
      }
      return;
    } catch (err) {
      console.error('❌ Error durante la revisión:', err.message);
      process.exit(1);
    }
  }

  // =============================================================================
  // MODO TESTER — Ejecución de pruebas, análisis de fallos y corrección con IA
  // =============================================================================
  if (mode === 'tester') {
    try {
      const { execSync } = require('child_process');
      const autoFix = cliArgs.autoFix || process.env.INPUT_AUTO_FIX === 'true';
      const customTestCmd = cliArgs.testCmd || process.env.INPUT_TEST_CMD || '';

      // --- 1. Auto-detect test runner ---
      function detectTestRunner() {
        // JavaScript / TypeScript: npm test or npx runner
        if (fs.existsSync(path.join(process.cwd(), 'package.json'))) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
            if (pkg.scripts && pkg.scripts.test && pkg.scripts.test.trim() !== 'echo "Error: no test specified" && exit 1') {
              return { cmd: 'npm test', runtime: 'node', label: 'npm test (from package.json)' };
            }
            // Check devDependencies / dependencies for known runners
            const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
            if (deps.includes('jest'))   return { cmd: 'npx jest --no-coverage', runtime: 'node', label: 'Jest (npx)' };
            if (deps.includes('vitest')) return { cmd: 'npx vitest run',          runtime: 'node', label: 'Vitest (npx)' };
            if (deps.includes('mocha'))  return { cmd: 'npx mocha',               runtime: 'node', label: 'Mocha (npx)' };
          } catch (e) {}
          return { cmd: 'npm test', runtime: 'node', label: 'npm test (fallback)' };
        }
        // Python: pytest or unittest
        const hasPy = files.some(f => f.endsWith('.py'));
        if (hasPy || fs.existsSync(path.join(process.cwd(), 'pyproject.toml')) || fs.existsSync(path.join(process.cwd(), 'requirements.txt'))) {
          return { cmd: 'python -m pytest -v', runtime: 'python', label: 'pytest' };
        }
        // Go
        if (fs.existsSync(path.join(process.cwd(), 'go.mod'))) {
          return { cmd: 'go test ./...', runtime: 'go', label: 'go test' };
        }
        return null;
      }

      // --- 2. Run tests safely with timeout ---
      function runTests(cmd) {
        console.log(`🧪 Executing: ${cmd}`);
        try {
          const output = execSync(cmd, {
            cwd: process.cwd(),
            encoding: 'utf8',
            timeout: 120000,   // 2 minutes hard timeout
            stdio: ['pipe', 'pipe', 'pipe']
          });
          return { success: true, output: output, exitCode: 0 };
        } catch (err) {
          const output = (err.stdout || '') + '\n' + (err.stderr || '');
          return { success: false, output: output.trim(), exitCode: err.status || 1 };
        }
      }

      // --- 3. Determine which test command to use ---
      let testRunner = null;
      if (customTestCmd) {
        testRunner = { cmd: customTestCmd, runtime: 'custom', label: `Custom: ${customTestCmd}` };
      } else {
        testRunner = detectTestRunner();
      }

      if (!testRunner) {
        console.error('❌ Zenon Tester could not detect a test runner for this project.');
        console.error('   Hint: Use --test-cmd "your test command" to specify one manually.');
        console.error('   Supported auto-detections: npm test / jest / vitest / mocha / pytest / go test');
        process.exit(1);
      }

      console.log(`\n🧪 Zenon Tester detected runner: ${testRunner.label}`);
      if (topic) {
        console.log(`🎯 Focus: ${topic}`);
      }

      // --- 4. Run initial tests ---
      const initialRun = runTests(testRunner.cmd);

      // --- 5. Handle results ---
      if (initialRun.success) {
        // All tests pass
        console.log('\n✅ All tests passed!');
        const passReport = `### ✅ Zenon Tester — All Tests Passed\n\n` +
          `**Command:** \`${testRunner.cmd}\`\n\n` +
          `**Output:**\n\`\`\`\n${initialRun.output.slice(0, 3000)}\n\`\`\`\n`;

        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Tester\n\n`;
          summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_tester.png" height="20" align="absmiddle" /> Informe de Pruebas\n\n`;
          summaryContent += passReport;
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
        } else {
          let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Tester Report\n\n`;
          localReport += `## <img src="assets/logos/logo_zenon_tester.png" height="26" /> Pruebas Completadas\n\n`;
          localReport += passReport;
          fs.writeFileSync('zenon_report.md', localReport, 'utf8');
          console.log('✅ Test report written to zenon_report.md');
        }
        return;
      }

      // Tests failed — invoke AI
      console.log(`\n❌ Tests failed (exit code: ${initialRun.exitCode}). Invoking AI for diagnosis...`);
      console.log('--- Test Output ---');
      console.log(initialRun.output.slice(0, 2000));
      console.log('-------------------');

      const testerSystemInstruction = `You are "Zenon", a principal QA engineer and senior software developer with deep expertise in testing frameworks and debugging.
Your task is to analyze a failing test suite output alongside the repository source code and provide an expert diagnosis.

CRITICAL RULES:
- Be precise: always reference the exact file path, function name, and line number involved in the failure.
- Do NOT hallucinate fixes. Only correct demonstrable, real failures visible in the test output.
- Do NOT modify unrelated code or tests that are not involved in the failures.
- Preserve all existing code style, naming conventions, and framework patterns exactly.
${autoFix
  ? '- Return ONLY raw JSON (no markdown, no explanation). The JSON schema must be:\n{\n  "files": [\n    { "path": "relative/path/to/file", "content": "<complete corrected file content>", "reason": "<one-line explanation>" }\n  ]\n}'
  : '- Return a structured Markdown report. Do NOT introduce yourself or write any preamble. Start directly with the first section heading.'}
${cachedKnowledge ? `\n=== REPOSITORY CONTEXT (CACHED KNOWLEDGE) ===\n${cachedKnowledge}\n==============================================` : ''}`;

      const focusSection = topic ? `\n=== FOCUS TARGET ===\n${topic}\n====================\n` : '';
      const testerUserPrompt = `=== CODEBASE ===
${codebasePayload.slice(0, chain[0].maxInputChars - 8000)}

=== FAILING TEST OUTPUT ===
${initialRun.output.slice(0, 6000)}
${focusSection}
${
  autoFix
    ? 'Fix all test failures shown above. Return ONLY the raw JSON with corrected files. Do not include files that do not need changes.'
    : 'Analyze the failing tests above and provide a detailed technical report including:\n\n## 🧪 Test Failures\n| File | Test Name | Error | Root Cause |\n|------|-----------|-------|------------|\n\n## 🔍 Root Cause Analysis\nFor each failure: explain why the test is failing with reference to the actual code.\n\n## 🛠️ Recommended Fixes\nFor each failure: provide the corrected code snippet in a fenced block.\n\n## 📊 Summary\n| Total Failed | Root Cause Categories |\n|---|---|'
}`;

      console.log('🤖 Zenon Tester AI is analyzing the failures...');
      const testerResult = await callWithFallback(chain, autoFix ? 'correct' : 'assist', testerSystemInstruction, testerUserPrompt);
      const aiResponse = testerResult.text;
      console.log(`\n✅ AI analysis complete using [${testerResult.provider.toUpperCase()}] ${testerResult.model}`);

      if (autoFix) {
        // --- Auto-fix mode: parse JSON and apply corrections ---
        let result = extractJSON(aiResponse);
        if (!result) {
          console.warn(`  ⚠️  Model did not return valid JSON. Retrying with the remaining chain...`);
          const usedIndex = chain.findIndex(e => e.provider === testerResult.provider && e.model === testerResult.model);
          const remainingChain = usedIndex >= 0 ? chain.slice(usedIndex + 1) : [];
          if (remainingChain.length > 0) {
            const retryResult = await callWithFallback(remainingChain, 'correct', testerSystemInstruction, testerUserPrompt);
            result = extractJSON(retryResult.text);
          }
          if (!result) {
            console.error('❌ Could not obtain valid JSON from any model. Run without --auto-fix to get a text report.');
            process.exit(1);
          }
        }

        if (!result.files || !Array.isArray(result.files) || result.files.length === 0) {
          console.log('ℹ️  AI found no files to correct. The issue may require manual inspection.');
          return;
        }

        // Apply fixes
        const modifiedFiles = [];
        for (const file of result.files) {
          const dir = path.dirname(file.path);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file.path, file.content, 'utf8');
          modifiedFiles.push(file.path);
          console.log(`  ✅ Fixed: ${file.path} — ${file.reason || 'correction applied'}`);
        }

        // Re-run tests to verify fixes
        console.log('\n🔄 Re-running tests to verify fixes...');
        const verificationRun = runTests(testRunner.cmd);

        if (verificationRun.success) {
          console.log('\n✅ All tests now pass after auto-fix!');
          if (isCI) {
            let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Tester\n\n`;
            summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_tester.png" height="20" align="absmiddle" /> Auto-Fix Applied — Tests Now Pass ✅\n\n`;
            summaryContent += `The following files were corrected:\n\n`;
            for (const file of result.files) {
              summaryContent += `- **${file.path}**: ${file.reason || 'correction applied'}\n`;
            }
            if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
            commitAndPushChanges(modifiedFiles);
          } else {
            let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Tester Report\n\n`;
            localReport += `## <img src="assets/logos/logo_zenon_tester.png" height="26" /> Auto-Fix Aplicado — Tests en Verde ✅\n\n`;
            for (const file of result.files) {
              localReport += `- **${file.path}**: ${file.reason || 'correction applied'}\n`;
            }
            fs.writeFileSync('zenon_report.md', localReport, 'utf8');
            console.log('Details written to zenon_report.md');
          }
        } else {
          // Fixes did not resolve all failures
          console.log('⚠️  Tests still failing after auto-fix. Manual review is required.');
          const failReport = `### ⚠️ Zenon Tester — Auto-Fix Applied, Tests Still Failing\n\nFixes were applied to:\n\n${
            result.files.map(f => `- **${f.path}**: ${f.reason || ''}`).join('\n')
          }\n\n**Remaining failures:**\n\`\`\`\n${verificationRun.output.slice(0, 3000)}\n\`\`\``;
          if (isCI && process.env.GITHUB_STEP_SUMMARY) {
            let s = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Tester\n\n`;
            s += failReport;
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, s);
          } else {
            fs.writeFileSync('zenon_report.md', failReport, 'utf8');
            console.log('Partial fix report written to zenon_report.md');
          }
        }

      } else {
        // --- Report mode: output AI analysis ---
        if (isCI) {
          let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Tester\n\n`;
          summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_tester.png" height="20" align="absmiddle" /> Informe de Fallos de Pruebas\n\n`;
          summaryContent += `${aiResponse}\n`;
          if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
          const eventName = process.env.GITHUB_EVENT_NAME;
          if (eventName === 'pull_request' || eventName === 'pull_request_target') {
            await postPRComment(aiResponse, githubToken);
          }
        } else {
          let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Tester Report\n\n`;
          localReport += `## <img src="assets/logos/logo_zenon_tester.png" height="26" /> Informe de Fallos\n\n`;
          localReport += `${aiResponse}\n`;
          fs.writeFileSync('zenon_report.md', localReport, 'utf8');
          console.log('Test failure analysis written to zenon_report.md');
        }
      }
      return;
    } catch (err) {
      console.error('❌ Error durante el modo tester:', err.message);
      process.exit(1);
    }
  }

  // =============================================================================
  // ZENON DEVOPSER — Autonomous Local Serverless Lambda Platform & DevOps Operator
  // =============================================================================
  if (mode === 'devops') {
    try {
      const { execSync, spawnSync } = require('child_process');

      // --- Resolve DevOpser configuration ---
      const devopsPlanFile  = cliArgs.devopsPlanFile  || process.env.INPUT_DEVOPS_PLAN_FILE  || 'zenon_devops.md';
      const devopsTaskFilter = cliArgs.devopsTask     || process.env.INPUT_DEVOPS_TASK        || '';
      const selfHeal        = cliArgs.selfHeal        || process.env.INPUT_SELF_HEAL === 'true';
      const notifyEmail     = cliArgs.notifyEmail     || process.env.INPUT_NOTIFY_EMAIL       || '';
      const notifyWebhook   = cliArgs.notifyWebhook   || process.env.INPUT_NOTIFY_WEBHOOK     || '';
      const DEVOPS_DIR      = path.join(process.cwd(), '.zenon_devops');
      const TASKS_DIR       = path.join(DEVOPS_DIR, 'tasks');

      console.log('\n🚀 Zenon DevOpser — Autonomous DevOps Operator initializing...');

      // --- 1. Ensure .zenon_devops/tasks/ folder exists ---
      if (!fs.existsSync(TASKS_DIR)) {
        fs.mkdirSync(TASKS_DIR, { recursive: true });
        console.log(`📁 Created .zenon_devops/tasks/ directory`);
      }

      // --- 2. Read the user's plan from zenon_devops.md (or inline topic) ---
      let planRaw = '';
      const planPath = path.resolve(process.cwd(), devopsPlanFile);
      if (devopsTaskFilter && devopsTaskFilter.trim().length > 10 && !fs.existsSync(planPath)) {
        // Inline task declared via --devops-task "..."
        planRaw = `## Tarea: inline-task\n- **Instrucciones**: ${devopsTaskFilter.trim()}\n`;
        console.log(`📋 Inline task declared via --devops-task flag.`);
      } else if (fs.existsSync(planPath)) {
        planRaw = fs.readFileSync(planPath, 'utf8');
        console.log(`📋 Plan loaded from: ${devopsPlanFile} (${planRaw.length} chars)`);
      } else {
        console.error(`\n❌ Zenon DevOpser: Plan file not found: "${devopsPlanFile}"`);
        console.error(`   Create a "zenon_devops.md" file in the repository root with your task plan.`);
        console.error(`   Or use --devops-task "your task description" to declare an inline task.`);
        console.error(`   Example zenon_devops.md:\n`);
        console.error(`   ## Tarea: check-node-version`);
        console.error(`   - **Instrucciones**: Comprueba la version de Node.js instalada y valida que sea >= 18`);
        console.error(`   - **Ejecutar**: .zenon_devops/tasks/check-node.js  (optional, AI creates it if missing)`);
        process.exit(1);
      }

      // --- 3. Parse the plan: extract tasks with their metadata ---
      /**
       * parsePlan(planRaw) → Array of task objects:
       * {
       *   id: string,           — slug identifier derived from the task heading
       *   name: string,         — human-readable name
       *   instructions: string, — natural language instructions for the AI
       *   scriptPath: string,   — relative path to the script to execute (optional)
       *   dependsOn: string[],  — list of task IDs this depends on
       *   env: Object,          — environment key=value pairs to inject
       *   timeout: number,      — ms timeout for script execution (default 180000)
       *   continueOnError: bool — if true, pipeline continues even if this task fails
       * }
       */
      function parsePlan(raw) {
        const tasks = [];
        const sections = raw.split(/^##\s+Tarea:/im);
        for (let i = 1; i < sections.length; i++) {
          const section = sections[i];
          const lines = section.split('\n');
          const titleLine = lines[0].trim();
          const id = titleLine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const name = titleLine;
          let instructions = '';
          let scriptPath   = '';
          let dependsOn    = [];
          let envVars      = {};
          let timeout      = 180000;
          let continueOnError = false;

          for (const line of lines.slice(1)) {
            const l = line.trim();
            if (/^-\s*\*{0,2}Instrucciones\*{0,2}\s*:/i.test(l)) {
              instructions = l.replace(/^-\s*\*{0,2}Instrucciones\*{0,2}\s*:\s*/i, '').trim();
            } else if (/^-\s*\*{0,2}Ejecutar\*{0,2}\s*:/i.test(l)) {
              scriptPath = l.replace(/^-\s*\*{0,2}Ejecutar\*{0,2}\s*:\s*/i, '').replace(/\(.*?\)/g,'').trim();
            } else if (/^-\s*\*{0,2}Depende de\*{0,2}\s*:/i.test(l)) {
              const deps = l.replace(/^-\s*\*{0,2}Depende de\*{0,2}\s*:\s*/i, '');
              dependsOn = deps.split(',').map(d => d.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean);
            } else if (/^-\s*\*{0,2}Timeout\*{0,2}\s*:/i.test(l)) {
              const t = parseInt(l.replace(/^-\s*\*{0,2}Timeout\*{0,2}\s*:\s*/i, ''));
              if (!isNaN(t)) timeout = t * 1000;
            } else if (/^-\s*\*{0,2}Continuar si falla\*{0,2}\s*:/i.test(l)) {
              continueOnError = /true|si|yes/i.test(l);
            } else if (/^-\s*\*{0,2}Env\*{0,2}\s*:/i.test(l)) {
              const envLine = l.replace(/^-\s*\*{0,2}Env\*{0,2}\s*:\s*/i, '');
              envLine.split(',').forEach(pair => {
                const [k, ...vParts] = pair.split('=');
                if (k && vParts.length) envVars[k.trim()] = vParts.join('=').trim();
              });
            }
          }

          if (!id) continue;
          tasks.push({ id, name, instructions, scriptPath, dependsOn, env: envVars, timeout, continueOnError });
        }
        return tasks;
      }

      // --- 4. Extract optional global settings from the plan ---
      function extractGlobalSettings(raw) {
        const settings = { email: '', webhook: '' };
        const emailMatch = raw.match(/^##?\s*Destinatario[^\n]*\n([^\n]+)/im);
        if (emailMatch) settings.email = emailMatch[1].trim().replace(/^[-*]\s*/, '');
        const webhookMatch = raw.match(/^##?\s*Webhook[^\n]*\n([^\n]+)/im);
        if (webhookMatch) settings.webhook = webhookMatch[1].trim().replace(/^[-*]\s*/, '');
        return settings;
      }

      // --- 5. Resolve execution order via topological sort (Kahn's algorithm) ---
      function topologicalSort(tasks) {
        const idToTask = {};
        for (const t of tasks) idToTask[t.id] = t;
        const inDegree = {};
        const adjacency = {};
        for (const t of tasks) {
          inDegree[t.id] = (inDegree[t.id] || 0);
          adjacency[t.id] = adjacency[t.id] || [];
          for (const dep of t.dependsOn) {
            if (!idToTask[dep]) {
              console.warn(`  ⚠️  Task "${t.id}" depends on unknown task "${dep}" — skipping dependency`);
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
          console.warn('  ⚠️  Circular dependency detected in task plan. Executing remaining tasks in declaration order.');
          for (const t of tasks) {
            if (!sorted.find(s => s.id === t.id)) sorted.push(t);
          }
        }
        return sorted;
      }

      // --- 6. AI Lambda Generator: ask the AI to write a Node.js script ---
      async function generateLambdaScript(task, aiChain, cachedCtx) {
        console.log(`  🤖 Generating AI script for task: "${task.name}"...`);
        const scriptSystemInstruction = `You are "Zenon DevOpser", an autonomous DevOps AI engineer.
Your job is to write a self-contained, executable Node.js script that fulfills the user's task description EXACTLY.

RULES:
- The script must use ONLY built-in Node.js modules (fs, path, child_process, https, http, crypto, os, url, etc.).
- Do NOT use npm packages or require anything not in the Node.js standard library.
- The script must exit with process.exit(0) on success and process.exit(1) on failure.
- Include console.log statements to show clear progress updates to the user.
- Capture and log relevant output/results so Zenon can include them in the final report.
- Handle errors gracefully with try/catch and meaningful error messages.
- Do NOT include markdown fences, explanations, or any text outside the JavaScript code itself.
- Output ONLY the raw JavaScript code. Start directly with the first line of code.
${cachedCtx ? `\n=== REPOSITORY CONTEXT ===\n${cachedCtx.slice(0, 2000)}\n=========================` : ''}`;

        const scriptUserPrompt = `Write a Node.js script that does the following:\n\n${task.instructions}\n\nThe script will be saved as: ${task.scriptPath || `.zenon_devops/tasks/${task.id}.js`}\nOutput only the raw JavaScript code.`;

        const result = await callWithFallback(aiChain, 'devops', scriptSystemInstruction, scriptUserPrompt);
        let code = result.text.trim();
        // Strip markdown code fences if the model accidentally included them
        code = code.replace(/^```(?:javascript|js|node)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        return code;
      }

      // --- 7. Run a script safely in a sandboxed subprocess ---
      function runScript(scriptPath, taskEnv, timeoutMs) {
        const absPath = path.resolve(process.cwd(), scriptPath);
        if (!fs.existsSync(absPath)) {
          return { success: false, output: `Script not found: ${absPath}`, exitCode: 127 };
        }
        const mergedEnv = { ...process.env, ...taskEnv };
        console.log(`  ▶️  Running: node ${scriptPath}`);
        try {
          const output = execSync(`node "${absPath}"`, {
            cwd: process.cwd(),
            encoding: 'utf8',
            timeout: timeoutMs,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: mergedEnv
          });
          return { success: true, output: output.trim(), exitCode: 0 };
        } catch (err) {
          const output = ((err.stdout || '') + '\n' + (err.stderr || '')).trim();
          return { success: false, output: output, exitCode: err.status || 1 };
        }
      }

      // --- 8. Self-Healing Engine: ask the AI to fix a broken script ---
      async function healScript(task, scriptPath, errorOutput, scriptCode, aiChain) {
        console.log(`  🛡️  Self-Heal: asking AI to fix script for task "${task.name}"...`);
        const healSystemInstruction = `You are "Zenon DevOpser", an autonomous self-healing DevOps AI.
A Node.js script you previously wrote has failed. Your job is to analyze the error output and produce a corrected version of the script.

RULES:
- Output ONLY the raw corrected JavaScript code. No explanations, no markdown fences.
- Use ONLY built-in Node.js modules.
- Fix the root cause of the error shown in the logs.
- Preserve the original intent of the script.`;

        const healUserPrompt = `=== ORIGINAL TASK DESCRIPTION ===\n${task.instructions}\n\n=== FAILED SCRIPT CODE ===\n${scriptCode}\n\n=== ERROR OUTPUT ===\n${errorOutput.slice(0, 3000)}\n\nFix the script. Output only the corrected raw JavaScript code.`;

        const result = await callWithFallback(aiChain, 'devops', healSystemInstruction, healUserPrompt);
        let code = result.text.trim();
        code = code.replace(/^```(?:javascript|js|node)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        return code;
      }

      // --- 9. Webhook Notification ---
      async function sendWebhookNotification(webhookUrl, payload) {
        try {
          const { https: httpsModule, http: httpModule } = { https: require('https'), http: require('http') };
          const parsedUrl = new URL(webhookUrl);
          const body = JSON.stringify(payload);
          const opts = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          };
          const mod = parsedUrl.protocol === 'https:' ? httpsModule : httpModule;
          await new Promise((resolve, reject) => {
            const req = mod.request(opts, (res) => {
              res.on('data', () => {});
              res.on('end', resolve);
            });
            req.on('error', reject);
            req.write(body);
            req.end();
          });
          console.log(`  📡 Webhook notification sent to: ${parsedUrl.hostname}`);
        } catch (e) {
          console.warn(`  ⚠️  Webhook notification failed: ${e.message}`);
        }
      }

      // =====================================================================
      // MAIN DEVOPSER EXECUTION PIPELINE
      // =====================================================================
      const globalSettings = extractGlobalSettings(planRaw);
      const effectiveEmail = notifyEmail || globalSettings.email || '';
      const effectiveWebhook = notifyWebhook || globalSettings.webhook || '';

      let allTasks = parsePlan(planRaw);

      if (allTasks.length === 0) {
        console.error('\n❌ No tasks found in the plan file.');
        console.error('   Make sure your zenon_devops.md uses "## Tarea: task-name" headings.');
        process.exit(1);
      }

      // Filter tasks if --devops-task flag was used
      if (devopsTaskFilter && devopsTaskFilter.trim()) {
        const filterSlug = devopsTaskFilter.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filtered = allTasks.filter(t => t.id.includes(filterSlug) || t.name.toLowerCase().includes(devopsTaskFilter.toLowerCase()));
        if (filtered.length > 0) {
          allTasks = filtered;
          console.log(`🔎 Task filter applied: running ${filtered.length} matching task(s)`);
        } else {
          console.warn(`  ⚠️  No tasks matched filter "${devopsTaskFilter}". Running all tasks.`);
        }
      }

      // Topological sort to resolve dependencies
      const orderedTasks = topologicalSort(allTasks);
      console.log(`\n📋 Task execution plan (${orderedTasks.length} task(s)):`);
      orderedTasks.forEach((t, i) => {
        const deps = t.dependsOn.length ? ` [after: ${t.dependsOn.join(', ')}]` : '';
        console.log(`  ${i+1}. ${t.name} (${t.id})${deps}`);
      });
      console.log('');

      // ---- EXECUTE TASKS ----
      const taskResults = [];
      const completedTaskIds = new Set();
      const failedTaskIds = new Set();
      const startTime = Date.now();

      for (const task of orderedTasks) {
        // Check if dependencies have all succeeded
        const blockedByFailed = task.dependsOn.filter(dep => failedTaskIds.has(dep));
        if (blockedByFailed.length > 0) {
          console.log(`  ⏭️  Skipping task "${task.name}" — blocked by failed dependency: ${blockedByFailed.join(', ')}`);
          taskResults.push({ task, status: 'skipped', output: `Blocked by failed dependency: ${blockedByFailed.join(', ')}`, scriptPath: '', duration: 0 });
          failedTaskIds.add(task.id);
          continue;
        }

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🔧 Task [${orderedTasks.indexOf(task)+1}/${orderedTasks.length}]: ${task.name}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const taskStart = Date.now();
        let resolvedScriptPath = task.scriptPath;
        let scriptCode = '';

        // Determine the script path
        if (!resolvedScriptPath) {
          resolvedScriptPath = `.zenon_devops/tasks/${task.id}.js`;
        }

        const absScriptPath = path.resolve(process.cwd(), resolvedScriptPath);

        // If the script does not exist AND we have instructions, generate it with AI
        if (!fs.existsSync(absScriptPath) && task.instructions) {
          console.log(`  📝 Script not found. AI will generate it at: ${resolvedScriptPath}`);
          scriptCode = await generateLambdaScript({ ...task, scriptPath: resolvedScriptPath }, chain, cachedKnowledge);
          const scriptDir = path.dirname(absScriptPath);
          if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true });
          fs.writeFileSync(absScriptPath, scriptCode, 'utf8');
          console.log(`  ✅ AI-generated script saved: ${resolvedScriptPath}`);
        } else if (fs.existsSync(absScriptPath)) {
          scriptCode = fs.readFileSync(absScriptPath, 'utf8');
          console.log(`  📂 Using existing script: ${resolvedScriptPath}`);
        } else if (!task.instructions) {
          console.error(`  ❌ Task "${task.name}" has no instructions and no script file at "${resolvedScriptPath}".`);
          taskResults.push({ task, status: 'error', output: 'No instructions and no script file found.', scriptPath: resolvedScriptPath, duration: 0 });
          failedTaskIds.add(task.id);
          continue;
        }

        // Run the script
        let runResult = runScript(resolvedScriptPath, task.env, task.timeout);
        const duration = Date.now() - taskStart;

        if (!runResult.success && selfHeal && task.instructions) {
          // Self-Healing: try to fix the script and re-run once
          console.log(`  ❌ Script failed (exit code: ${runResult.exitCode}). Self-healing enabled — attempting auto-fix...`);
          console.log(`  --- Error output ---\n${runResult.output.slice(0, 1000)}\n  ---`);

          const fixedCode = await healScript(task, resolvedScriptPath, runResult.output, scriptCode, chain);
          fs.writeFileSync(absScriptPath, fixedCode, 'utf8');
          console.log(`  🛡️  Healed script saved. Re-running...`);

          runResult = runScript(resolvedScriptPath, task.env, task.timeout);
          if (runResult.success) {
            console.log(`  ✅ Self-healing succeeded! Task "${task.name}" now passes.`);
          } else {
            console.log(`  ⚠️  Self-healing attempted but task still fails. Manual review required.`);
          }
        }

        const taskStatus = runResult.success ? 'success' : (task.continueOnError ? 'warning' : 'failure');

        if (runResult.success) {
          console.log(`  ✅ Task "${task.name}" completed successfully (${(duration/1000).toFixed(1)}s)`);
          completedTaskIds.add(task.id);
        } else {
          console.log(`  ❌ Task "${task.name}" failed (exit code: ${runResult.exitCode}) (${(duration/1000).toFixed(1)}s)`);
          if (task.continueOnError) {
            console.log(`  ℹ️  continueOnError=true — pipeline will continue.`);
            completedTaskIds.add(task.id);
          } else {
            failedTaskIds.add(task.id);
          }
        }

        if (runResult.output) {
          const preview = runResult.output.slice(0, 500);
          console.log(`  📤 Output preview:\n${preview}${runResult.output.length > 500 ? '\n  [... truncated ...]' : ''}`);
        }

        taskResults.push({ task, status: taskStatus, output: runResult.output, scriptPath: resolvedScriptPath, duration });
      }

      // =====================================================================
      // BUILD FINAL REPORT
      // =====================================================================
      const totalDuration = Date.now() - startTime;
      const successCount = taskResults.filter(r => r.status === 'success').length;
      const failureCount = taskResults.filter(r => r.status === 'failure').length;
      const warningCount = taskResults.filter(r => r.status === 'warning').length;
      const skippedCount = taskResults.filter(r => r.status === 'skipped').length;
      const overallSuccess = failureCount === 0 && skippedCount === 0;

      const statusEmoji = overallSuccess ? '✅' : (failureCount > 0 ? '❌' : '⚠️');
      const statusLabel = overallSuccess ? 'ALL TASKS SUCCEEDED' : (failureCount > 0 ? 'SOME TASKS FAILED' : 'COMPLETED WITH WARNINGS');

      let reportMd = '';
      if (isCI) {
        reportMd += `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — DevOpser\n\n`;
        reportMd += `#### <img src="${LOGO_BASE_URL}/logo_zenon_DevOpser.png" height="20" align="absmiddle" /> DevOps Execution Report\n\n`;
      } else {
        reportMd += `# Zenon Polis — DevOpser Report\n\n`;
        reportMd += `## DevOps Execution Report\n\n`;
      }

      reportMd += `${statusEmoji} **${statusLabel}** — ${orderedTasks.length} task(s) in ${(totalDuration/1000).toFixed(1)}s\n\n`;
      reportMd += `| Metric | Value |\n|---|---|\n`;
      reportMd += `| ✅ Succeeded | ${successCount} |\n`;
      reportMd += `| ❌ Failed | ${failureCount} |\n`;
      reportMd += `| ⚠️ Warning (continued) | ${warningCount} |\n`;
      reportMd += `| ⏭️ Skipped | ${skippedCount} |\n`;
      reportMd += `| ⏱️ Total Duration | ${(totalDuration/1000).toFixed(1)}s |\n`;
      reportMd += `| 🛡️ Self-Heal | ${selfHeal ? 'Enabled' : 'Disabled'} |\n\n`;

      reportMd += `## Task Results\n\n`;
      for (const result of taskResults) {
        const icon = result.status === 'success' ? '✅' : result.status === 'failure' ? '❌' : result.status === 'warning' ? '⚠️' : '⏭️';
        reportMd += `### ${icon} ${result.task.name} (\`${result.task.id}\`)\n\n`;
        if (result.scriptPath) reportMd += `**Script**: \`${result.scriptPath}\`  \n`;
        reportMd += `**Status**: ${result.status.toUpperCase()} | **Duration**: ${(result.duration/1000).toFixed(1)}s\n\n`;
        if (result.output && result.output.trim()) {
          const outputPreview = result.output.slice(0, 2000);
          reportMd += `<details>\n<summary>Output Log</summary>\n\n\`\`\`\n${outputPreview}${result.output.length > 2000 ? '\n... [truncated]' : ''}\n\`\`\`\n\n</details>\n\n`;
        }
      }

      // AI summary analysis of the entire run
      let aiSummaryText = '';
      if (taskResults.length > 0) {
        console.log('\n🤖 Zenon DevOpser AI is generating the execution summary...');
        const summarySystemInstruction = `You are "Zenon DevOpser", a senior DevOps AI analyst.
You have just orchestrated and executed a series of automation tasks. Analyze the results and provide a concise, actionable summary.
Write in structured Markdown. Be direct and technical. Do not include greetings or filler text.`;

        const summaryUserPrompt = `Plan file: ${devopsPlanFile}\nSelf-Heal: ${selfHeal ? 'enabled' : 'disabled'}\n\n=== EXECUTION RESULTS ===\n${taskResults.map(r =>
          `TASK: ${r.task.name} (${r.task.id})\nStatus: ${r.status}\nOutput: ${r.output.slice(0, 800)}`
        ).join('\n\n---\n\n')}\n\nProvide:\n1. A brief executive summary (2-3 sentences)\n2. Key findings or notable outputs from each task\n3. Any recommended follow-up actions or warnings\n4. Overall pipeline health assessment`;

        try {
          const summaryResult = await callWithFallback(chain, 'assist', summarySystemInstruction, summaryUserPrompt);
          aiSummaryText = summaryResult.text;
          reportMd += `## 🤖 AI Executive Summary\n\n${aiSummaryText}\n\n`;
          console.log(`  ✅ AI summary generated using [${summaryResult.provider.toUpperCase()}] ${summaryResult.model}`);
        } catch (e) {
          console.warn(`  ⚠️  Could not generate AI summary: ${e.message}`);
        }
      }

      // Write report
      const cleanReport = reportMd
        .replace(/### <img[^>]*> /g, '# ')
        .replace(/#### <img[^>]*> /g, '## ');
      fs.writeFileSync('zenon_report.md', cleanReport, 'utf8');
      console.log('\n📊 Report written to zenon_report.md');

      const htmlReport = buildHtmlReport(taskResults, overallSuccess, statusLabel, totalDuration, successCount, failureCount, warningCount, skippedCount, selfHeal, aiSummaryText);
      fs.writeFileSync('zenon_report.html', htmlReport, 'utf8');
      console.log('📊 Premium HTML report written to zenon_report.html');

      if (isCI && process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, reportMd);
        console.log('📊 Report published to GitHub Actions Job Summary.');
      }
      console.log(reportMd.slice(0, 1500));

      // =====================================================================
      // OPTIONAL NOTIFICATIONS
      // =====================================================================
      if (effectiveWebhook && effectiveWebhook.startsWith('http')) {
        // Discord / Slack / Generic webhook
        const webhookPayload = {
          text: `${statusEmoji} **Zenon DevOpser** — ${statusLabel}`,
          content: `${statusEmoji} **Zenon DevOpser** — ${statusLabel}`,
          embeds: [{
            title: `Zenon DevOpser — ${statusLabel}`,
            color: overallSuccess ? 0x00cc66 : 0xff4444,
            description: `**Plan**: \`${devopsPlanFile}\`\n**Tasks**: ${orderedTasks.length} | ✅ ${successCount} | ❌ ${failureCount} | ⚠️ ${warningCount} | ⏭️ ${skippedCount}\n**Duration**: ${(totalDuration/1000).toFixed(1)}s`,
            fields: taskResults.map(r => ({
              name: `${r.status === 'success' ? '✅' : r.status === 'failure' ? '❌' : r.status === 'warning' ? '⚠️' : '⏭️'} ${r.task.name}`,
              value: r.output.slice(0, 200) || '(no output)',
              inline: false
            })).slice(0, 5)
          }],
          attachments: [{
            color: overallSuccess ? 'good' : 'danger',
            title: `Zenon DevOpser — ${statusLabel}`,
            text: `Tasks: ${orderedTasks.length} | ✅ ${successCount} | ❌ ${failureCount}`
          }]
        };
        await sendWebhookNotification(effectiveWebhook, webhookPayload);
      }

      if (effectiveEmail && isCI) {
        // Email notification via GitHub Actions step (documented in workflow)
        console.log(`\n📧 Email notification target: ${effectiveEmail}`);
        console.log(`   To send emails, configure the "dawidd6/action-send-mail" step in your workflow.`);
        console.log(`   The zenon_report.md file contains the full report to include in the email body.`);
      } else if (effectiveEmail && !isCI) {
        console.log(`\n📧 Email notification target: ${effectiveEmail}`);
        console.log(`   Local email sending requires PowerShell Send-MailMessage or a mail relay.`);
        console.log(`   The zenon_report.md file contains the full report for your email body.`);
      }

      console.log(`\n🏁 Zenon DevOpser finished. ${statusEmoji} ${statusLabel}`);
      if (failureCount > 0) process.exit(1);
      return;

    } catch (err) {
      console.error('❌ Error durante el modo DevOpser:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }

// Helper to search codebase files for matching keywords to provide live context
function searchCodebaseForQuery(query, files) {
  const stopwords = new Set([
    'como', 'funciona', 'que', 'es', 'en', 'este', 'repo', 'repositorio', 'para', 'sirve', 
    'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'a', 'con', 'por', 'lo', 'duda',
    'pregunta', 'explicar', 'explicacion', 'sobre', 'del', 'al', 'nos', 'se', 'su', 'sus'
  ]);
  
  const words = query.toLowerCase()
    .replace(/[^a-z0-9áéíóúñ_\-\/]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  if (words.length === 0) return '';

  console.log(`🔍 Búsqueda en caliente de archivos para las palabras clave: ${words.join(', ')}`);

  let contextText = '';
  let matchedFilesCount = 0;
  const maxMatchedFiles = 8;
  const maxBytesPerFile = 6144; // Max 6KB per file to avoid context bloat

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    if (matchedFilesCount >= maxMatchedFiles) break;

    const lowerFile = file.toLowerCase();
    let content = null;
    let isMatch = false;

    if (words.some(word => lowerFile.includes(word))) {
      isMatch = true;
    } else {
      try {
        content = fs.readFileSync(file, 'utf8');
        const lowerContent = content.toLowerCase();
        if (words.some(word => lowerContent.includes(word))) {
          isMatch = true;
        }
      } catch (e) {
        continue;
      }
    }

    if (isMatch) {
      if (content === null) {
        try {
          content = fs.readFileSync(file, 'utf8');
        } catch (e) {
          continue;
        }
      }

      let snippet = content;
      if (content.length > maxBytesPerFile) {
        snippet = content.substring(0, maxBytesPerFile) + '\n\n... [TRUNCATED - CONTENIDO RESTANTE OMITIDO] ...';
      }

      contextText += `--- ARCHIVO ENCONTRADO: ${file}\n${snippet}\n--- FIN DE ARCHIVO ---\n\n`;
      matchedFilesCount++;
    }
  }

  if (contextText) {
    return `=== LIVE CONTEXT FROM CODEBASE (ARCHIVOS ENCONTRADOS QUE ENCAJAN CON TU PREGUNTA) ===\n${contextText}========================================================================\n\n`;
  }
  return '';
}

  // =============================================================================
  // PASO 11: Modo Helper — Ejecución del Asistente de Repositorio
  // =============================================================================
  if (mode === 'helper') {
    try {
      console.log('🤖 Zenon Helper is formulating your answer based on repository knowledge...');

      let helperSystemInstruction = `You are "Zenon", a senior codebase architect and developer assistant.
Your task is to answer the user's questions or doubts about the current codebase.
You will be provided with the codebase knowledge profile (which summarizes the tech stack, languages, patterns, frameworks, and architecture of this repository).

Use your knowledge of software engineering and the provided codebase profile to answer the user's query in a clear, precise, and structured Markdown format.
Use headings, bullet points, tables, code blocks, or alerts (> [!NOTE] / > [!IMPORTANT]) where appropriate to make the answer easy to read and understand.
Avoid introductory greetings, pleasantries, or concluding conversational filler. Go straight to the answer.`;

      if (cachedKnowledge) {
        helperSystemInstruction += `\n\n=== CONTEXTO DEL REPOSITORIO (CONOCIMIENTO CACHÉ) ===\n${cachedKnowledge}\n======================================================`;
      }

      const liveContext = searchCodebaseForQuery(helperQuery, files);

      const helperUserPrompt = `${liveContext}=== USER QUERY ===
${helperQuery}

Please answer the user query based on the codebase knowledge base and the live context files provided. If the cache knowledge base is outdated or does not contain specific information about the query, prioritize the live context files to give an accurate, up-to-date, and correct answer. Do not hallucinate or make up details not present in the files.`;

      console.log('🤖 Zenon is thinking...');
      const helperResult = await callWithFallback(chain, 'assist', helperSystemInstruction, helperUserPrompt);
      const answerText = helperResult.text;

      console.log(`\n✅ Explanation generated successfully using [${helperResult.provider.toUpperCase()}] ${helperResult.model}`);

      // Report
      if (isCI) {
        let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Helper\n\n`;
        summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_helper.png" height="20" align="absmiddle" /> Asistente de Repositorio\n\n`;
        summaryContent += `**Consulta**: *${helperQuery}*\n\n`;
        summaryContent += `${answerText}\n`;

        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
        }
      } else {
        // Local mode report
        let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Helper Report\n\n`;
        localReport += `## <img src="assets/logos/logo_zenon_helper.png" height="26" /> Asistente de Repositorio\n\n`;
        localReport += `**Consulta**: *${helperQuery}*\n\n`;
        localReport += `${answerText}\n`;
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Respuesta del asistente guardada en zenon_report.md');
      }
      return;
    } catch (err) {
      console.error('❌ Error durante la consulta del asistente:', err.message);
      process.exit(1);
    }
  }

  // =============================================================================
  // PASO 13: Modo Updater — Sincronización Automática de Documentación
  // =============================================================================
  if (mode === 'updater') {
    try {
      console.log('📝 Zenon Updater is checking for code changes to update documentation...');

      // 1. Get git diff of changes (excluding markdown files and internal files)
      const updaterExclude = exclude ? `${exclude},*.md,.gitignore,.zenon_cache.json` : '*.md,.gitignore,.zenon_cache.json';
      const diffContent = getGitDiff(diffRange, updaterExclude);

      if (!diffContent || !diffContent.trim()) {
        console.log('✅ No code changes detected. Documentation is already up to date.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Updater\n\nNo se detectaron cambios en el código que requieran actualizar la documentación.\n`);
        }
        return;
      }

      console.log(`Found code changes with a diff of ${diffContent.length} characters.`);

      const CWD_NORM = process.cwd().toLowerCase().replace(/\\/g, '/');

      // Helper function to resolve, normalize and validate explicit doc paths (Path Traversal guard)
      function validateAndGetRelativeDocPath(filePath) {
        const resolved = path.resolve(filePath);
        const resolvedNorm = resolved.toLowerCase().replace(/\\/g, '/');

        if (!resolvedNorm.startsWith(CWD_NORM)) {
          throw new Error(`Path traversal attempt detected: ${filePath}`);
        }
        if (!fs.existsSync(resolved)) {
          throw new Error(`Documentation file not found: ${filePath}`);
        }
        if (!resolvedNorm.endsWith('.md')) {
          throw new Error(`Only markdown files (.md) are allowed: ${filePath}`);
        }
        return path.relative(process.cwd(), resolved);
      }

      // 2. Discover target documentation files to check/update
      let docFiles = [];
      const explicitDocs = cliArgs.docs || process.env.INPUT_DOCS || '';
      if (explicitDocs) {
        const rawDocs = explicitDocs.split(',').map(f => f.trim()).filter(Boolean);
        for (const rawPath of rawDocs) {
          try {
            const validatedPath = validateAndGetRelativeDocPath(rawPath);
            docFiles.push(validatedPath);
          } catch (e) {
            console.error(`❌ [updater] Path validation failed for "${rawPath}": ${e.message}`);
            throw e; // Fail-fast on explicit invalid inputs
          }
        }
      } else {
        // Auto-detect root md files and docs/ folder md files
        const internalDocs = new Set([
          'zenon_plan.md', 'zenon_objective.md', 'zenon_report.md', 'zenon_devops.md',
          'changelog.md', 'contributing.md', 'license.md',
          'code_of_conduct.md', 'security.md', 'pull_request_template.md',
          'issue_template.md'
        ]);

        docFiles = files.filter(file => {
          const lower = file.toLowerCase();
          const ext = lower.split('.').pop();
          if (ext !== 'md') return false;

          // Exclude internal files and policies
          const base = path.basename(file).toLowerCase();
          if (internalDocs.has(base)) {
            return false;
          }

          // Must be in root or docs/ folder
          const dir = path.dirname(file);
          return dir === '.' || dir === 'docs';
        });
      }

      if (docFiles.length === 0) {
        console.log('ℹ️ No documentation files found to update.');
        return;
      }

      console.log(`Target documentation files to audit: ${docFiles.join(', ')}`);

      // 3. Read target documentation files
      const docPayloads = [];
      for (const file of docFiles) {
        if (fs.existsSync(file)) {
          try {
            const content = fs.readFileSync(file, 'utf8');
            docPayloads.push({ path: file, content });
          } catch (e) {
            console.warn(`  ⚠️ Could not read document file: ${file}. Skipping.`);
          }
        }
      }

      if (docPayloads.length === 0) {
        console.log('ℹ️ No readable documentation contents found.');
        return;
      }

      // 4. Call LLM for each document — with integrity guards and smart patch strategy
      const modifiedDocs = [];

      // --- Integrity validators ---

      // Returns true if the document content looks complete (no unclosed fences/blocks)
      function validateDocumentIntegrity(content) {
        const lines = content.split('\n');
        let inCode = false;
        let mermaidOpen = 0;
        let codeOpen = 0;
        let tableLines = 0;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('```')) {
            if (!inCode) {
              inCode = true;
              codeOpen++;
              if (trimmed.toLowerCase().includes('mermaid')) mermaidOpen++;
            } else {
              inCode = false;
              codeOpen--;
              if (mermaidOpen > 0) mermaidOpen--;
            }
          }
          if (trimmed.startsWith('|') && trimmed.endsWith('|')) tableLines++;
        }

        const issues = [];
        if (inCode) issues.push('Unclosed code fence (```) detected');
        if (mermaidOpen > 0) issues.push('Unclosed mermaid diagram detected');

        return { valid: issues.length === 0, issues };
      }

      // Returns true if newContent is not suspiciously shorter than originalContent
      function validateContentLength(originalContent, newContent) {
        const originalLen = originalContent.length;
        const newLen = newContent.length;
        // Allow up to 30% shrinkage — more than that is likely truncation
        const minAllowedLen = Math.floor(originalLen * 0.70);
        if (newLen < minAllowedLen) {
          return {
            valid: false,
            message: `New content (${newLen} chars) is ${Math.round((1 - newLen / originalLen) * 100)}% shorter than original (${originalLen} chars). Likely truncated — rejecting to protect document.`
          };
        }
        return { valid: true };
      }

      // Truncate diff smartly to avoid context overflow
      function truncateDiff(diff, maxChars) {
        if (diff.length <= maxChars) return diff;
        const half = Math.floor(maxChars / 2);
        return diff.slice(0, half) + '\n\n... [DIFF TRUNCATED FOR CONTEXT SAFETY] ...\n\n' + diff.slice(-half);
      }

      // Large doc threshold: above this we use patch strategy instead of full-file replacement
      const LARGE_DOC_THRESHOLD = 8000; // 8KB

      for (const doc of docPayloads) {
        console.log(`\n🔍 Auditing documentation file: ${doc.path} (${doc.content.length} chars)...`);

        const isLargeDoc = doc.content.length > LARGE_DOC_THRESHOLD;
        const maxDiffChars = Math.floor((chain[0].maxInputChars - doc.content.length - 2000) * 0.7);
        const safeDiff = truncateDiff(diffContent, Math.max(maxDiffChars, 3000));

        let updaterSystemInstruction;
        let updaterUserPrompt;

        if (isLargeDoc) {
          // ---------------------------------------------------------------
          // PATCH STRATEGY for large docs: model returns only changed sections
          // This avoids truncation of the full document in the JSON response
          // ---------------------------------------------------------------
          console.log(`  📐 Large document detected (${doc.content.length} chars) — using patch strategy`);

          updaterSystemInstruction = `You are "Zenon Updater", a principal technical documentation architect.
Your task is to identify ONLY the specific sections of a documentation file that need to be updated based on recent code changes.

CRITICAL RULES:
- Return a list of PATCHES — only the sections that changed, not the full document.
- Each patch has: "search" (exact text to find in the document), "replace" (new text to substitute), and "reason".
- The "search" field must be an EXACT, UNIQUE substring from the current document — long enough to be unambiguous (at least 2-3 lines).
- The "replace" field contains the replacement text for that specific section only.
- If no updates are needed at all, return an empty patches array.
- NEVER include the full document in your response.
- Return ONLY raw JSON. No markdown fences, no explanation outside the JSON.`;

          updaterUserPrompt = `=== RECENT CODE CHANGES (GIT DIFF) ===
${safeDiff}

=== CURRENT DOCUMENT: ${doc.path} ===
${doc.content.slice(0, chain[0].maxInputChars - safeDiff.length - 3000)}

=== OBJECTIVE ===
Identify only the sections of this document that are outdated relative to the code changes above.
Return ONLY the sections that need to change as search/replace patches. If no changes are needed, return empty patches array.

Return ONLY raw JSON with this exact schema:
{
  "patches": [
    {
      "search": "<exact substring from the document to find — must be unique and at least 2 full lines>",
      "replace": "<new text to substitute in place of the search text>",
      "reason": "<brief explanation of what changed and why>"
    }
  ]
}`;

        } else {
          // ---------------------------------------------------------------
          // FULL-FILE STRATEGY for small docs (standard approach, now with guards)
          // ---------------------------------------------------------------
          updaterSystemInstruction = `You are "Zenon Updater", a principal technical documentation architect and software writer.
Your task is to synchronize repository documentation with recent code changes.

CRITICAL RULES:
- Analyze the recent code changes (git diff) and compare them with the current document content.
- If the changes in the code have left any parts of the document outdated (e.g. modified CLI flags, changed routes, renamed functions, new setups), update only the affected sections.
- Make ONLY precise, additive, or selective updates. Do NOT rewrite or rephrase unaffected sections. Keep the rest of the document 100% identical.
- Follow the document's original style, formatting, tone, emojis, header logos, and layout exactly.
- NEVER truncate the document. The "content" field MUST contain the COMPLETE file — every single line, from start to finish.
- Return ONLY the raw JSON output in the specified schema. No conversational filler, no markdown fences outside the JSON.`;

          updaterUserPrompt = `=== RECENT CODE CHANGES (GIT DIFF) ===
${safeDiff}

=== CURRENT DOCUMENT PATH: ${doc.path} ===
${doc.content}

=== OBJECTIVE ===
Analyze if the code changes require any updates to this document. If updates are needed, generate the COMPLETE updated content (all ${doc.content.length} characters approximately — do not shorten). If no updates are needed, return an empty files array.

Return ONLY raw JSON with this exact schema (no markdown formatting, no code fences):
{
  "files": [
    { "path": "${doc.path}", "content": "<complete updated file content — MUST include every line>", "reason": "<brief explanation of changes made>" }
  ]
}`;
        }

        console.log(`🤖 Zenon is analyzing "${doc.path}" [${isLargeDoc ? 'patch' : 'full-file'} strategy]...`);
        const updaterResult = await callWithFallback(chain, 'correct', updaterSystemInstruction, updaterUserPrompt);
        const rawResponse = updaterResult.text;

        let result = extractJSON(rawResponse);
        if (!result) {
          console.warn(`  ⚠️ Could not parse JSON response for ${doc.path}. Retrying with remaining chain...`);
          const usedIndex = chain.findIndex(e => e.provider === updaterResult.provider && e.model === updaterResult.model);
          const remainingChain = usedIndex >= 0 ? chain.slice(usedIndex + 1) : [];
          if (remainingChain.length > 0) {
            const retryResult = await callWithFallback(remainingChain, 'correct', updaterSystemInstruction, updaterUserPrompt);
            result = extractJSON(retryResult.text);
          }
        }

        if (!result) {
          console.warn(`  ⚠️ Could not obtain valid JSON for ${doc.path} after retry. Skipping to protect document.`);
          continue;
        }

        // --- Apply patches (large doc strategy) ---
        if (isLargeDoc) {
          const patches = result.patches || [];
          if (!Array.isArray(patches) || patches.length === 0) {
            console.log(`✅ No updates needed for: ${doc.path}`);
            continue;
          }

          let updatedContent = doc.content;
          let patchApplied = 0;
          let patchFailed = 0;

          for (const patch of patches) {
            if (!patch.search || !patch.replace) {
              console.warn(`  ⚠️ Patch missing search/replace fields — skipping`);
              patchFailed++;
              continue;
            }
            if (!updatedContent.includes(patch.search)) {
              console.warn(`  ⚠️ Patch search text not found in document — skipping: "${patch.search.slice(0, 80)}..."`);
              patchFailed++;
              continue;
            }
            updatedContent = updatedContent.replace(patch.search, patch.replace);
            patchApplied++;
            console.log(`  🔧 Patch applied: ${patch.reason || '(no reason given)'}`);
          }

          if (patchApplied === 0) {
            console.log(`✅ No patches could be applied for: ${doc.path} (${patchFailed} failed)`);
            continue;
          }

          // Integrity checks on patched content
          const lenCheck = validateContentLength(doc.content, updatedContent);
          if (!lenCheck.valid) {
            console.error(`  ❌ INTEGRITY CHECK FAILED for ${doc.path}: ${lenCheck.message}`);
            console.error(`  🛡️ Document was NOT written. Original file is preserved.`);
            continue;
          }

          const integrityCheck = validateDocumentIntegrity(updatedContent);
          if (!integrityCheck.valid) {
            console.error(`  ❌ BLOCK INTEGRITY CHECK FAILED for ${doc.path}: ${integrityCheck.issues.join('; ')}`);
            console.error(`  🛡️ Document was NOT written. Original file is preserved.`);
            continue;
          }

          fs.writeFileSync(doc.path, updatedContent, 'utf8');
          modifiedDocs.push({ path: doc.path, reason: patches.map(p => p.reason).filter(Boolean).join('; ') });
          console.log(`✅ Patches applied to: ${doc.path} (${patchApplied}/${patches.length} patches)`);

        } else {
          // --- Apply full-file replacement (small doc strategy) ---
          if (!result.files || result.files.length === 0) {
            console.log(`✅ No updates needed for: ${doc.path}`);
            continue;
          }

          const fileUpdate = result.files[0];
          const newContent = fileUpdate.content;
          const reason = fileUpdate.reason || 'Auto-synchronized with code changes.';

          if (!newContent || !newContent.trim()) {
            console.warn(`  ⚠️ AI returned empty content for ${doc.path} — skipping to protect document.`);
            continue;
          }

          // Integrity guard: length check
          const lenCheck = validateContentLength(doc.content, newContent);
          if (!lenCheck.valid) {
            console.error(`  ❌ INTEGRITY CHECK FAILED for ${doc.path}: ${lenCheck.message}`);
            console.error(`  🛡️ Document was NOT written. Original file is preserved.`);
            continue;
          }

          // Integrity guard: block completeness
          const integrityCheck = validateDocumentIntegrity(newContent);
          if (!integrityCheck.valid) {
            console.error(`  ❌ BLOCK INTEGRITY CHECK FAILED for ${doc.path}: ${integrityCheck.issues.join('; ')}`);
            console.error(`  🛡️ Document was NOT written. Original file is preserved.`);
            continue;
          }

          fs.writeFileSync(doc.path, newContent, 'utf8');
          modifiedDocs.push({ path: doc.path, reason });
          console.log(`✅ File updated: ${doc.path}`);
          console.log(`   Reason: ${reason}`);
        }
      }


      // 5. Commit and push in GHA CI, or write report
      if (modifiedDocs.length === 0) {
        console.log('\n✅ All target documentation is already synchronized. No changes applied.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Updater\n\nToda la documentación está sincronizada con los últimos cambios de código.\n`);
        }
        return;
      }

      if (isCI) {
        let summaryContent = `### <img src="${LOGO_BASE_URL}/logo_polis_zenon.png" height="24" align="absmiddle" /> Zenon Polis — Updater\n\n`;
        summaryContent += `#### <img src="${LOGO_BASE_URL}/logo_zenon_updater.png" height="20" align="absmiddle" /> Documentación Sincronizada\n\n`;
        summaryContent += `Se han detectado discrepancias y se ha actualizado automáticamente la documentación del proyecto:\n\n`;
        for (const doc of modifiedDocs) {
          summaryContent += `- **${doc.path}**: ${doc.reason}\n`;
        }
        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);
        }

        try {
          console.log('Configuring git credentials...');
          runGit(['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
          runGit(['config', '--local', 'user.name', 'github-actions[bot]']);

          for (const doc of modifiedDocs) {
            runGit(['add', doc.path]);
          }

          const staged = runGit(['diff', '--name-only', '--cached']);
          if (staged) {
            console.log('Committing changes...');
            runGit(['commit', '-m', 'docs(zenon): auto-update documentation [skip ci]']);
            console.log('Pushing changes...');
            runGit(['push']);
            console.log('Successfully committed and pushed documentation updates!');
          }
        } catch (e) {
          console.error('Error committing documentation updates:', e.message);
        }
      } else {
        let localReport = `# <img src="assets/logos/logo_polis_zenon.png" height="32" /> Zenon Polis — Updater Report\n\n`;
        localReport += `## <img src="assets/logos/logo_zenon_updater.png" height="26" /> Sincronización Completada\n\n`;
        localReport += `Se han actualizado los siguientes archivos de documentación para reflejar los cambios en el código:\n\n`;
        for (const doc of modifiedDocs) {
          localReport += `- **${doc.path}**: ${doc.reason}\n`;
        }
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Resumen de sincronización guardado en zenon_report.md');
      }

      return;
    } catch (err) {
      console.error('❌ Error durante la sincronización documental:', err.message);
      process.exit(1);
    }
  }

  // Prompt logic
  const isCorrectMode = mode === 'correct';
  const isObjectiveMode = mode === 'objective';

  let systemInstruction;
  let userPrompt;

  if (isObjectiveMode) {
    // ==========================================================================
    // PASO 4: Modo Objective — System Instruction y Prompt específicos
    // ==========================================================================
    systemInstruction = `You are Zenon, a principal-level software engineer implementing a precise development objective.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your reasoning process, or write any preamble. Start working immediately.
- Do NOT hallucinate APIs, libraries, or patterns that do not exist in the codebase.
- Do NOT truncate file content — every 'content' field must contain the complete, production-ready file.
- Do NOT include files that were not changed.
- Preserve all existing code style, naming conventions, and architectural patterns exactly.
- All changes must be additive or safe drop-in replacements — never break existing functionality.

YOUR TASK:
1. Read the codebase to understand architecture, frameworks, conventions, and dependencies.
2. Implement the objective completely and correctly in the fewest, most precise changes possible.
3. Return ONLY the raw JSON schema — no markdown fences, no explanation, no commentary.`;

    if (cachedKnowledge) {
      systemInstruction += `\n\n=== CONTEXTO DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n================================================`;
    }

    userPrompt = `=== CODEBASE ===
${codebasePayload}

=== OBJECTIVE TO IMPLEMENT ===
${objectiveContent}

Implement the objective fully. Return ONLY the raw JSON (no markdown, no explanation) with this exact schema:
{
  "files": [
    { "path": "relative/path/to/file", "content": "<complete file content>", "reason": "<one-line explanation>" }
  ]
}`;

    console.log('🎯 Zenon is implementing the objective...');
  } else {
    systemInstruction = isCorrectMode
      ? `You are Zenon, a principal-level software engineer performing automated code correction.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your approach, or write any preamble. Return JSON immediately.
- Do NOT hallucinate fixes — only correct real, demonstrable bugs, errors, or security flaws.
- Do NOT truncate file content — every 'content' field must be the complete, corrected, production-ready file.
- Do NOT include files that require no changes.
- Do NOT add comments like "// ... rest stays the same" — write the full file every time.
- Preserve all existing formatting, naming conventions, and architectural patterns.
- Return ONLY raw JSON — no markdown fences, no explanation text, no commentary outside the JSON.`
      : `You are Zenon, a principal-level software engineer performing a deep technical code review.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your process, or write any preamble or conclusion paragraph.
- Do NOT produce vague or generic advice. Every finding must be specific, actionable, and reference actual code.
- Do NOT hallucinate issues that don't exist in the provided files.
- Go straight to findings. Start your report with the first section heading.

REPORT FORMAT — use this exact structure in clean Markdown:

## 🛠️ Bugs & Functional Issues
| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|

## 🔒 Security Vulnerabilities
| Risk | File | Description | Remediation |
|------|------|-------------|-------------|

## ⚡ Performance Improvements
For each issue: describe the bottleneck, show the problematic code snippet, and provide the optimized replacement.

## 🧼 Code Quality & Best Practices
For each issue: reference the specific file/function, explain why it is a problem, and provide a corrected code snippet.

## 📊 Summary
| Category | Issues Found | Critical |
|----------|-------------|----------|

Use \`> [!WARNING]\` for critical security or data-loss risks.
Use \`> [!IMPORTANT]\`  for breaking changes or high-impact refactors.
Every code snippet must be in a fenced block with the correct language tag.`;

    // Inyectar el conocimiento adquirido al systemInstruction principal
    if (cachedKnowledge) {
      systemInstruction += `\n\n=== APRENDIZAJE CONTEXTUAL DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n=============================================================`;
    }

    userPrompt = isCorrectMode
      ? `=== CODEBASE ===
${codebasePayload}

Correct all real bugs, errors, and security flaws found. Return ONLY the raw JSON (no markdown, no explanation) with this exact schema:
{
  "files": [
    { "path": "relative/path/to/file", "content": "<complete corrected file content>", "reason": "<one-line explanation of what was fixed>" }
  ]
}`
      : `=== CODEBASE ===
${codebasePayload}

Perform a deep technical review. Return ONLY the Markdown report — no preamble, no introduction, no closing paragraph. Start directly with the first section heading.`;

    console.log('Zenon is analyzing your codebase...');
  }

  try {
    // Objective mode reuses the 'correct' JSON schema (files array) for output
    const callMode = isObjectiveMode ? 'correct' : mode;
    const analysisResult = await callWithFallback(chain, callMode, systemInstruction, userPrompt);
    const rawResponse = analysisResult.text;
    console.log(`\n✅ Análisis completado con éxito utilizando la IA: [${analysisResult.provider.toUpperCase()}] ${analysisResult.model}`);

    if (isCorrectMode || isObjectiveMode) {
      let result = extractJSON(rawResponse);
      if (!result) {
        // The model that responded could not produce valid JSON. Retry with the remaining chain.
        console.warn(`  ⚠️  El modelo [${analysisResult.provider.toUpperCase()}] ${analysisResult.model} no devolvió JSON válido. Reintentando con el resto de la cadena...`);
        const usedIndex = chain.findIndex(e => e.provider === analysisResult.provider && e.model === analysisResult.model);
        const remainingChain = usedIndex >= 0 ? chain.slice(usedIndex + 1) : [];
        if (remainingChain.length === 0) {
          console.error('Failed to parse correction response. Raw output was:');
          console.log(rawResponse.slice(0, 500));
          throw new Error('No remaining models in chain could produce valid JSON.');
        }
        const retryResult = await callWithFallback(remainingChain, callMode, systemInstruction, userPrompt);
        result = extractJSON(retryResult.text);
        if (!result) {
          console.error('Failed to parse correction response after retry. Raw output was:');
          console.log(retryResult.text.slice(0, 500));
          throw new Error('No model in the fallback chain produced valid JSON.');
        }
        console.log(`  ✅ JSON válido obtenido tras reintento con [${retryResult.provider.toUpperCase()}] ${retryResult.model}`);
      }

      if (!result.files || !Array.isArray(result.files)) {
        console.log('Zenon did not find any files that require changes.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          const header = isObjectiveMode ? 'Zenon Objective Completion' : 'Zenon Auto-Correction';
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="${LOGO_BASE_URL}/logo.png" height="22" align="absmiddle" /> ${header}\n\nNo changes were found necessary for this codebase.\n`);
        }
        return;
      }

      const modifiedFiles = [];
      console.log(`Zenon proposes changes in ${result.files.length} files.`);

      for (const file of result.files) {
        const filePath = file.path;
        const newContent = file.content;
        const explanation = file.reason || file.explanation || 'No explanation provided.';

        console.log(`\nApplying changes to: ${filePath}`);
        console.log(`Reason: ${explanation}`);

        // Ensure parent directories exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(filePath, newContent, 'utf8');
        modifiedFiles.push(filePath);
      }

      console.log('\nAll changes applied to local files.');

      if (isCI) {
        // Write report to step summary
        let summaryContent = '';
        if (isObjectiveMode) {
          summaryContent = `### <img src="${LOGO_BASE_URL}/logo.png" height="22" align="absmiddle" /> Zenon Objective Completed\n\n`;
          summaryContent += `**Goal/Objective**:\n> ${objectiveContent.replace(/\n/g, '\n> ')}\n\n`;
          summaryContent += `Zenon has successfully implemented the objective by making changes to the following files:\n\n`;
        } else {
          summaryContent = `### <img src="${LOGO_BASE_URL}/logo.png" height="22" align="absmiddle" /> Zenon Auto-Correction Applied\n\n`;
          summaryContent += `Zenon has analyzed your code and applied corrections to the following files:\n\n`;
        }
        for (const file of result.files) {
          const reason = file.reason || file.explanation || 'Applied improvements';
          summaryContent += `- **${file.path}**: ${reason}\n`;
        }
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);

        // Commit and push changes
        commitAndPushChanges(modifiedFiles);
      } else {
        console.log('\n[Local Mode] Changes applied. You can use "git diff" to review changes.');
        // Write a local changes report
        let localReport = '';
        if (isObjectiveMode) {
          localReport = `# Zenon Objective Implementation Report\n\n`;
          localReport += `**Goal/Objective**:\n> ${objectiveContent.replace(/\n/g, '\n> ')}\n\n`;
          localReport += `The following changes were applied to your local files to achieve the objective:\n\n`;
        } else {
          localReport = `# Zenon Auto-Corrections Report\n\nThe following changes were applied to your local files:\n\n`;
        }
        for (const file of result.files) {
          const reason = file.reason || file.explanation || 'Applied improvements';
          localReport += `## File: ${file.path}\n**Explanation**: ${reason}\n\n`;
        }
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Details written to zenon_report.md');
      }

    } else {
      // Assist mode: Markdown review report
      console.log('\n--- Zenon Code Review Summary ---\n');
      console.log(rawResponse);
      console.log('\n----------------------------------\n');

      if (isCI) {
        // Write report to GHA Job Summary
        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="${LOGO_BASE_URL}/logo.png" height="22" align="absmiddle" /> Zenon (AI Assistant) Code Review\n\n${rawResponse}`);
        }

        // Post comment to PR if event is PR
        const eventName = process.env.GITHUB_EVENT_NAME;
        if (eventName === 'pull_request' || eventName === 'pull_request_target') {
          await postPRComment(rawResponse, githubToken);
        }
      } else {
        // Write locally to zenon_report.md
        fs.writeFileSync('zenon_report.md', rawResponse, 'utf8');
        console.log('Full report written to zenon_report.md');
      }
    }

  } catch (err) {
    console.error('Error during execution:', err.message);
    process.exit(1);
  }
}

// Global safety net — catch any unhandled promise rejection or exception
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection in Zenon:');
  console.error(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception in Zenon:');
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
});function mdToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  
  for (let line of lines) {
    let l = line.trim();
    if (!l) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }
    
    l = l
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a;">$1</strong>')
      .replace(/`(.*?)`/g, '<code style="background-color:#f1f5f9; color:#0f172a; padding:2px 4px; border-radius:4px; font-family:Consolas, Monaco, monospace; font-size:13px;">$1</code>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
      
    if (l.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 style="color:#1e293b; font-size:17px; font-weight:600; margin-top:20px; margin-bottom:10px;">${l.substring(4)}</h3>`;
    } else if (l.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 style="color:#0f172a; font-size:20px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-top:25px; margin-bottom:15px;">${l.substring(3)}</h2>`;
    } else if (l.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1 style="color:#0f172a; font-size:24px; font-weight:800; margin-top:30px; margin-bottom:20px;">${l.substring(2)}</h1>`;
    } else if (l.startsWith('- ') || l.startsWith('* ')) {
      if (!inList) {
        html += '<ul style="padding-left:20px; margin-bottom:15px; margin-top:10px; list-style-type:disc;">';
        inList = true;
      }
      html += `<li style="margin-bottom:8px; color:#475569; line-height:1.5; font-size:14px;">${l.substring(2)}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p style="margin-bottom:15px; color:#334155; line-height:1.6; font-size:14px;">${l}</p>`;
    }
  }
  
  if (inList) {
    html += '</ul>';
  }
  
  return html;
}

function buildHtmlReport(taskResults, overallSuccess, statusLabel, totalDuration, successCount, failureCount, warningCount, skippedCount, selfHeal, aiSummary) {
  const statusColor = overallSuccess ? '#10b981' : (failureCount > 0 ? '#ef4444' : '#f59e0b');
  const statusBg = overallSuccess ? '#dcfce7' : (failureCount > 0 ? '#fee2e2' : '#fef3c7');
  const statusBorder = overallSuccess ? '#bbf7d0' : (failureCount > 0 ? '#fecaca' : '#fde68a');
  const statusEmoji = overallSuccess ? '✅' : (failureCount > 0 ? '❌' : '⚠️');
  
  const logoDevopsUrl = 'https://raw.githubusercontent.com/amglogicalis/Zenon/main/assets/logos/logo_zenon_DevOpser.png';

  // 1. Build Failures Summary box if any tasks failed
  let failuresAlertHtml = '';
  if (failureCount > 0) {
    const failedTasks = taskResults.filter(r => r.status === 'failure');
    let failuresList = '';
    for (const f of failedTasks) {
      failuresList += `<li style="margin-bottom: 5px;"><strong>${f.task.name}</strong> (\`${f.task.id}\`): ${f.output ? f.output.split('\n')[0].slice(0, 100) : 'Failed without output'}...</li>`;
    }
    failuresAlertHtml = `
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px 20px; margin-bottom: 25px; text-align: left;">
        <span style="font-size: 15px; font-weight: 800; color: #991b1b; display: block; margin-bottom: 8px;">
          ⚠️ Failed Tasks Summary
        </span>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #7f1d1d; line-height: 1.5;">
          ${failuresList}
        </ul>
      </div>
    `;
  }

  // 2. Build task details
  let tasksHtml = '';
  for (const r of taskResults) {
    const taskEmoji = r.status === 'success' ? '✅' : r.status === 'failure' ? '❌' : r.status === 'warning' ? '⚠️' : '⏭️';
    const badgeColor = r.status === 'success' ? '#10b981' : r.status === 'failure' ? '#ef4444' : r.status === 'warning' ? '#f59e0b' : '#64748b';
    const badgeBg = r.status === 'success' ? '#dcfce7' : r.status === 'failure' ? '#fee2e2' : r.status === 'warning' ? '#fef3c7' : '#f1f5f9';
    const cardBorder = r.status === 'success' ? '#e2e8f0' : r.status === 'failure' ? '#fecaca' : r.status === 'warning' ? '#fde68a' : '#e2e8f0';
    const cardBg = r.status === 'success' ? '#ffffff' : r.status === 'failure' ? '#fff5f5' : r.status === 'warning' ? '#fffbeb' : '#ffffff';
    
    let outputLog = '';
    if (r.output && r.output.trim()) {
      const escapedOutput = r.output.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      outputLog = `
        <div style="margin-top: 15px;">
          <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 5px;">Output Log:</div>
          <pre style="background-color: #0f172a; color: #f8fafc; padding: 15px; border-radius: 6px; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; overflow-x: auto; margin: 0; white-space: pre-wrap; word-break: break-all;">${escapedOutput}</pre>
        </div>
      `;
    }
    
    tasksHtml += `
      <div style="background-color: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: left;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a; margin-right: 8px;">${taskEmoji} ${r.task.name}</span>
              <code style="background-color: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px;">${r.task.id}</code>
            </td>
            <td align="right" valign="top" style="width: 100px;">
              <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
                ${r.status}
              </span>
            </td>
          </tr>
        </table>
        <div style="font-size: 13px; color: #64748b; margin-top: 8px;">
          ${r.scriptPath ? `<strong>Script:</strong> <code style="font-family: monospace; font-size: 12px; color: #0f172a;">${r.scriptPath}</code> &nbsp;|&nbsp;` : ''}
          <strong>Duration:</strong> ${(r.duration/1000).toFixed(1)}s
        </div>
        ${outputLog}
      </div>
    `;
  }

  const aiSummaryHtml = aiSummary ? `
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 30px; text-align: left;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 15px;">
        <tr>
          <td style="width: 40px; valign: middle;">
            <div style="font-size: 24px;">🤖</div>
          </td>
          <td valign="middle">
            <h3 style="margin: 0; color: #166534; font-size: 16px; font-weight: 700;">AI Executive Summary</h3>
          </td>
        </tr>
      </table>
      <div style="font-size: 14px; color: #1e3a1e;">
        ${mdToHtml(aiSummary)}
      </div>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Zenon DevOpser Execution Report</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 20px 10px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="650px" style="max-width: 650px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);" cellpadding="0" cellspacing="0" border="0">
              
              <!-- HEADER -->
              <tr>
                <td style="background-color: #0f172a; padding: 25px 30px; text-align: left;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="valign: middle;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; display: inline-block;">
                          Zenon Polis
                        </h1>
                        <span style="display: inline-block; background-color: #c084fc; color: #3b0764; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-left: 8px; text-transform: uppercase; vertical-align: middle;">
                          DevOpser
                        </span>
                        <div style="margin-top: 5px; font-size: 13px; color: #94a3b8;">
                          Autonomous DevOps Operator & Local Serverless Platform
                        </div>
                      </td>
                      <td align="right" style="width: 50px; valign: middle;">
                        <img src="${logoDevopsUrl}" alt="Zenon Logo" width="40" height="40" style="display: block; border-radius: 8px;" />
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- MAIN CONTENT -->
              <tr>
                <td style="padding: 30px;">
                  
                  <!-- STATUS BANNER -->
                  <div style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 8px; padding: 15px 20px; margin-bottom: 25px; text-align: left;">
                    <span style="font-size: 18px; font-weight: 800; color: #0f172a; display: block; margin-bottom: 4px;">
                      ${statusEmoji} ${statusLabel}
                    </span>
                    <span style="font-size: 13px; color: #475569;">
                      Executed <strong>${taskResults.length}</strong> task(s) in <strong>${(totalDuration/1000).toFixed(1)}s</strong>
                    </span>
                  </div>
                  
                  <!-- FAILURES ALERT BLOCK -->
                  ${failuresAlertHtml}
                  
                  <!-- METRICS GRID -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                          <tr>
                            <td>
                              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: left;">Pipeline Run</div>
                              <table width="100%" cellpadding="0" cellspacing="2" border="0" style="margin-top: 8px; font-size: 13px;">
                                <tr>
                                  <td style="color: #64748b; text-align: left;">✅ Succeeded:</td>
                                  <td align="right" style="font-weight: 700; color: #166534;">${successCount}</td>
                                </tr>
                                <tr>
                                  <td style="color: #64748b; text-align: left;">❌ Failed:</td>
                                  <td align="right" style="font-weight: 700; color: #991b1b;">${failureCount}</td>
                                </tr>
                                <tr>
                                  <td style="color: #64748b; text-align: left;">⚠️ Warnings:</td>
                                  <td align="right" style="font-weight: 700; color: #854d0e;">${warningCount}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                          <tr>
                            <td>
                              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: left;">System Details</div>
                              <table width="100%" cellpadding="0" cellspacing="2" border="0" style="margin-top: 8px; font-size: 13px;">
                                <tr>
                                  <td style="color: #64748b; text-align: left;">Self-Heal:</td>
                                  <td align="right" style="font-weight: 700; color: #0f172a;">${selfHeal ? 'Enabled' : 'Disabled'}</td>
                                </tr>
                                <tr>
                                  <td style="color: #64748b; text-align: left;">Duration:</td>
                                  <td align="right" style="font-weight: 700; color: #0f172a;">${(totalDuration/1000).toFixed(1)}s</td>
                                </tr>
                                <tr>
                                  <td style="color: #64748b; text-align: left;">Skipped:</td>
                                  <td align="right" style="font-weight: 700; color: #0f172a;">${skippedCount}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- AI EXECUTIVE SUMMARY -->
                  ${aiSummaryHtml}
                  
                  <!-- TASK RESULTS HEADER -->
                  <h2 style="color: #0f172a; font-size: 18px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; margin-bottom: 20px; text-align: left;">
                    Task Results Details
                  </h2>
                  
                  <!-- LIST OF TASKS -->
                  ${tasksHtml}
                  
                </td>
              </tr>
              
              <!-- FOOTER -->
              <tr>
                <td style="background-color: #f1f5f9; padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                  Sent autonomously by <strong>Zenon DevOpser</strong> • ${new Date().toUTCString()}
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

main();