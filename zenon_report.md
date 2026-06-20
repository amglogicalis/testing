## 🛠️ Bugs & Functional Issues
| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
| Critical | .github/workflows/zenon.yml | 24 | The cache key `zenon-knowledge-cache-${{ github.run_id }}` uses the `run_id`, which is unique for every workflow run. This means the cache will never be restored from previous runs, rendering the caching mechanism ineffective for its stated purpose of "optimizar costes de API y mantener estadísticas del Analyzer". | **`key: zenon-knowledge-cache-${{ github.ref_name }}`** or **`key: zenon-knowledge-cache-main`** (if only caching for `main` branch) should be used. The `restore-keys` looks fine as a fallback. <br/>```yaml<br/>      - name: Restore Zenon Knowledge Cache<br/>        uses: actions/cache@v4<br/>        with:<br/>          path: .zenon_cache.json<br/>          key: zenon-knowledge-cache-${{ github.ref_name }} # Changed key<br/>          restore-keys: |<br/>            zenon-knowledge-cache-<br/>``` |
| Medium | app.js | 64 | The `alert()` function is a blocking call that halts execution of the JavaScript and blocks the user interface until dismissed. This creates a poor user experience, especially for a timer application where continuous operation or background notifications are desired. | Replace `alert()` with a non-blocking UI notification (e.g., a modal, a toast message, or a subtle sound notification). <br/>```javascript<br/>    } else {<br/>        clearInterval(timerInterval);<br/>        timerInterval = null;<br/>        // Replace alert with a non-blocking notification<br/>        // For example: showNotification(isWorkMode ? '¡Tiempo de enfoque terminado!...' : '¡Descanso terminado!...');<br/>        console.log(isWorkMode ? '¡Tiempo de enfoque terminado! Toma un descanso.' : '¡Descanso terminado! De vuelta al trabajo.');<br/>        toggleMode();<br/>    }<br/>``` |
| Low | app.js | 33 | Accessing `progressBar.r.baseVal.value` is a legacy way to get the radius of an SVG circle. While it often works, it relies on the `baseVal` property of `SVGAnimatedLength`, which can be less robust than directly reading the `r` attribute or using `animVal.value` for animated properties. | For static attributes, prefer `getAttribute('r')`. <br/>```javascript<br/>const radius = parseFloat(progressBar.getAttribute('r'));<br/>const circumference = radius * 2 * Math.PI;<br/>``` |
| Low | zenon.ps1 | 29 | The path `$ZenonJs = Join-Path $ScriptDir "src/zenon.js"` assumes that `zenon.js` is present in a `src/` subdirectory of the repository root. However, based on the GitHub Actions workflow (`amglogicalis/Zenon@main`), it appears that `zenon.js` is an internal component of the `amglogicalis/Zenon` action itself and is not part of this repository's local codebase. The current `zenon.ps1` script will always report `Error: No se encontró 'zenon.js'` unless a local `src/zenon.js` is manually added. | **`> [!WARNING]`** <br/>If `zenon.ps1` is intended to wrap the GitHub Action's `zenon.js`, it should invoke the action's runner via a different mechanism (e.g., `npx` or a locally installed dependency) rather than directly expecting `src/zenon.js`. If `zenon.js` *is* expected to be local, then it needs to be provided in the `src/` directory. Given the context, the script's core logic of launching `node $ZenonJs` will likely fail as `zenon.js` is not a local file.<br/><br/>If `zenon.ps1` is meant to be a proxy for a *locally installed* Zenon CLI (e.g., via npm), then the script should instead look for `zenon.js` in a `node_modules` context or call `npx zenon` directly. |

## 🔒 Security Vulnerabilities
| Risk | File | Description | Remediation |
|------|------|-------------|-------------|
| Critical | index.html | **`> [!WARNING]`** <br/>The `index.html` file does not implement a Content Security Policy (CSP). This makes the application vulnerable to various client-side attacks, including Cross-Site Scripting (XSS), by allowing browsers to execute scripts or load resources from unauthorized sources. | Add a `<meta>` tag for CSP in the `<head>` section of `index.html` to restrict script, style, and other resource origins. For example:<br/>```html<br/><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';"><br/>```<br/>Adjust `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` as needed after refactoring any inline scripts/styles into separate files to further enhance security. |
| High | zenon.ps1 | **`> [!WARNING]`** <br/>The PowerShell script loads environment variables from a `.env` file if it exists. While useful for local development, there is no explicit instruction or mechanism to ensure that `.env` files are excluded from version control (e.g., via `.gitignore`). If not properly managed, this could lead to sensitive API keys or credentials being accidentally committed to the repository, leading to compromise. | Ensure that a `.gitignore` file is present in the repository root and explicitly includes `/.env` to prevent accidental commits of sensitive information. <br/>```<br/># .gitignore<br/>.env<br/>.zenon_cache.json<br/>node_modules/<br/>``` |
| Medium | .github/workflows/zenon.yml | The workflow uses `contents: write` and `pull-requests: write` permissions. While necessary for some GitHub Actions (like `amglogicalis/Zenon@main` which might create commits or PRs), these are broad permissions. Granting overly permissive tokens can increase the risk if a third-party action has a vulnerability. | Review the exact needs of `amglogicalis/Zenon@main`. If it only needs to update specific files (e.g., `zenon_objective.md`), consider using more granular permissions if possible, or ensure strong trust in the third-party action. If the action generates code and commits, `contents: write` is typically required. Regularly audit the permissions granted to third-party actions. |

## ⚡ Performance Improvements
**1. Optimize DOM Re-rendering for Task List**
*   **Description:** The `renderTasks()` function clears the entire `taskList` and then re-creates all `li` elements and their children whenever a task is added, deleted, or its completion status changes. For a small number of tasks, this is acceptable, but for a task list that could grow, this repeated full re-render can be inefficient and cause noticeable UI flickers or performance degradation.
*   **Problematic Code:**
    ```javascript
    // app.js
    function renderTasks() {
        taskList.innerHTML = ''; // Clears all existing tasks
        tasks.forEach((task, index) => {
            // ... creates and appends new li elements ...
        });
    }
    ```
*   **Optimized Replacement:**
    Implement a more granular update mechanism, such as a DOM diffing approach or by only manipulating the specific `li` element that has changed. For simple add/delete operations, adding/removing only the new/deleted `li` is more efficient. For updates, re-render only the affected `li`. A basic example for add/delete:
    ```javascript
    // app.js
    // Function to create a single task list item
    function createTaskListItem(task, index) {
        const li = document.createElement('li');
        li.className = 'task-item';
        // ... (existing code to build task item content) ...
        const taskText = document.createElement('span');
        taskText.className = 'task-text';
        taskText.textContent = task.text;
        
        const inputContainer = document.createElement('div');
        inputContainer.className = 'task-item-content';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.dataset.index = index;
        
        inputContainer.appendChild(checkbox);
        inputContainer.appendChild(taskText);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-task-btn';
        deleteBtn.dataset.index = index;
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        
        li.appendChild(inputContainer);
        li.appendChild(deleteBtn);
        return li;
    }

    // Modified renderTasks to optimize initial render and specific updates
    function renderTasks() {
        // Only clear if the number of tasks has changed significantly or for initial render
        if (taskList.children.length !== tasks.length && tasks.length === 0) {
            taskList.innerHTML = '';
        } else if (taskList.children.length === 0 && tasks.length > 0) { // Initial render
            taskList.innerHTML = '';
            tasks.forEach((task, index) => {
                taskList.appendChild(createTaskListItem(task, index));
            });
        } else {
            // More advanced diffing or specific element updates would go here
            // For now, simpler optimization for add/delete and checkbox toggle
            const existingTaskElements = Array.from(taskList.children);
            
            // Remove tasks that no longer exist
            existingTaskElements.forEach((el, i) => {
                if (!tasks[i] || parseInt(el.querySelector('.task-checkbox').dataset.index) !== i) {
                    el.remove();
                }
            });

            // Add new tasks or update existing ones
            tasks.forEach((task, index) => {
                const existingLi = taskList.children[index];
                if (!existingLi) {
                    // Task is new, append it
                    taskList.appendChild(createTaskListItem(task, index));
                } else {
                    // Task already exists, update properties (e.g., checkbox, text-decoration)
                    const checkbox = existingLi.querySelector('.task-checkbox');
                    const taskText = existingLi.querySelector('.task-text');
                    if (checkbox && taskText) {
                        checkbox.checked = task.completed;
                        taskText.textContent = task.text;
                        taskText.style.textDecoration = task.completed ? 'line-through' : 'none';
                        taskText.style.color = task.completed ? 'var(--text-secondary)' : 'var(--text-primary)';
                    }
                }
            });
        }
    }

    // Refactor addTask and handleTaskListClick to leverage more granular updates
    function addTask() {
        const text = taskInput.value.trim();
        if (text !== '') {
            tasks.push({ text, completed: false });
            taskInput.value = '';
            taskList.appendChild(createTaskListItem(tasks[tasks.length - 1], tasks.length - 1)); // Add only the new item
            // Ensure dataset.index is updated for all elements if previous elements were removed
            updateTaskItemIndices(); 
        }
    }

    function handleTaskListClick(e) {
        if (e.target.classList.contains('task-checkbox')) {
            const index = parseInt(e.target.dataset.index);
            tasks[index].completed = e.target.checked;
            // No need to re-render all tasks, just update the text style
            e.target.nextElementSibling.style.textDecoration = tasks[index].completed ? 'line-through' : 'none';
            e.target.nextElementSibling.style.color = tasks[index].completed ? 'var(--text-secondary)' : 'var(--text-primary)';
        }
        
        const deleteBtn = e.target.closest('.delete-task-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            tasks.splice(index, 1);
            deleteBtn.closest('.task-item').remove(); // Remove only the specific item
            updateTaskItemIndices(); // Update indices after deletion
        }
    }

    function updateTaskItemIndices() {
        Array.from(taskList.children).forEach((li, i) => {
            const checkbox = li.querySelector('.task-checkbox');
            const deleteBtn = li.querySelector('.delete-task-btn');
            if (checkbox) checkbox.dataset.index = i;
            if (deleteBtn) deleteBtn.dataset.index = i;
        });
    }
    ```

**2. CSS `transition: all` usage**
*   **Description:** Using `transition: all` is convenient but can be less performant than explicitly defining the properties to transition. When `all` is used, the browser has to track changes on every animatable property, which can be computationally more expensive, especially if many properties change, or if complex rendering occurs.
*   **Problematic Code:**
    ```css
    /* style.css */
    .mode-btn {
        /* ... */
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .control-btn {
        /* ... */
        transition: all 0.2s ease;
    }
    .task-item {
        /* ... */
        transition: all 0.2s;
    }
    .task-checkbox {
        /* ... */
        transition: all 0.2s;
    }
    .task-text {
        /* ... */
        transition: all 0.2s;
    }
    .delete-task-btn {
        /* ... */
        transition: all 0.2s;
    }
    ```
*   **Optimized Replacement:**
    Specify the exact properties that are expected to transition. For example, for `.mode-btn` (background, color, box-shadow), for `.control-btn` (background, transform), etc.
    ```css
    /* style.css */
    .mode-btn {
        /* ... */
        transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1), 
                    color 0.3s cubic-bezier(0.4, 0, 0.2, 1), 
                    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .control-btn {
        /* ... */
        transition: background 0.2s ease, transform 0.2s ease;
    }
    .task-item {
        /* ... */
        transition: background 0.2s, border-color 0.2s;
    }
    .task-checkbox {
        /* ... */
        transition: background 0.2s, border-color 0.2s;
    }
    .task-text {
        /* ... */
        transition: text-decoration 0.2s, color 0.2s; /* Focus on properties that change */
    }
    .delete-task-btn {
        /* ... */
        transition: color 0.2s, opacity 0.2s;
    }
    ```

## 🧼 Code Quality & Best Practices
**1. Global Variable Pollution and Encapsulation**
*   **File/Function:** `app.js` (entire file)
*   **Problem:** The `app.js` file uses numerous global variables (`workDuration`, `breakDuration`, `timeLeft`, `timerInterval`, `tasks`, etc.). This practice pollutes the global namespace, increases the risk of naming conflicts with other scripts, and makes the code harder to maintain, debug, and reuse as the application grows.
*   **Correction:** Encapsulate application state and logic within an Immediately Invoked Function Expression (IIFE) or an ES Module to keep variables out of the global scope.
*   **Corrected Snippet:**
    ```javascript
    // app.js
    (function() { // Start IIFE
        // App state variables
        const WORK_DURATION_SECONDS = 25 * 60; // Use constants for clarity
        const BREAK_DURATION_SECONDS = 5 * 60;
        let workDuration = WORK_DURATION_SECONDS;
        let breakDuration = BREAK_DURATION_SECONDS;
        let currentDuration = workDuration;
        let timeLeft = currentDuration;
        let timerInterval = null;
        let isWorkMode = true;
        let tasks = []; // Encapsulate tasks array

        // DOM Elements - Cache references to avoid repeated lookups
        const timeDisplay = document.getElementById('time-display');
        const stateLabel = document.getElementById('current-state-label');
        const startBtn = document.getElementById('start-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const resetBtn = document.getElementById('reset-btn');
        const workModeBtn = document.getElementById('work-mode');
        const breakModeBtn = document.getElementById('break-mode');
        const progressBar = document.getElementById('progress-bar');
        const taskInput = document.getElementById('task-input');
        const addTaskBtn = document.getElementById('add-task-btn');
        const taskList = document.getElementById('task-list');

        // Initial setup for progress ring (moved inside IIFE)
        const radius = parseFloat(progressBar.getAttribute('r')); // Improved attribute access
        const circumference = radius * 2 * Math.PI;
        progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
        progressBar.style.strokeDashoffset = 0;

        // All other functions (updateProgress, formatTime, updateDisplay, tick, toggleMode, etc.)
        // should also be defined within this IIFE/module closure.

        // ... (rest of app.js code) ...

        // Initial Render
        updateDisplay();

    })(); // End IIFE
    ```

**2. Lack of Centralized Constants for Durations**
*   **File/Function:** `app.js` (global scope)
*   **Problem:** The durations for work and break are defined as `25 * 60` and `5 * 60` directly. While simple arithmetic, using "magic numbers" (`25`, `5`) without clear constant names makes the code less readable and harder to modify if these core timings need to change in multiple places or be adjusted by user settings.
*   **Correction:** Define these values as named constants at the top of the script for better readability and easier maintenance.
*   **Corrected Snippet:**
    ```javascript
    // app.js
    // App state variables
    const WORK_DURATION_MINUTES = 25;
    const BREAK_DURATION_MINUTES = 5;

    let workDuration = WORK_DURATION_MINUTES * 60; // 25 minutes in seconds
    let breakDuration = BREAK_DURATION_MINUTES * 60;  // 5 minutes in seconds
    let currentDuration = workDuration;
    // ... rest of the code
    ```

**3. Repetitive DOM Element Lookups**
*   **File/Function:** `app.js` (multiple functions)
*   **Problem:** Many functions rely on `document.getElementById('...')` to access DOM elements. While `getElementById` is efficient, repeatedly querying the DOM for the same elements can add overhead. More importantly, it separates the declaration of variables from their initial assignment, making it harder to reason about element availability.
*   **Correction:** Cache references to frequently used DOM elements at the beginning of the script, after the DOM is ready, to reduce redundant lookups and improve clarity. This is already partially done, but consistently apply it.
*   **Corrected Snippet:** (This is largely already in the provided code, but reiterating the best practice and ensuring all elements are cached)
    ```javascript
    // app.js
    // (Inside IIFE or module)
    // DOM Elements - Cached references
    const timeDisplay = document.getElementById('time-display');
    const stateLabel = document.getElementById('current-state-label');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const workModeBtn = document.getElementById('work-mode');
    const breakModeBtn = document.getElementById('break-mode');
    const progressBar = document.getElementById('progress-bar');
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const taskList = document.getElementById('task-list');

    // Add validation for critical elements
    if (!timeDisplay || !startBtn || !taskList) {
        console.error("Critical DOM elements are missing. Application may not function correctly.");
        // Potentially disable functionality or show a user-friendly error
        return; 
    }
    // ... rest of the code that uses these cached variables
    ```

**4. Limited Accessibility (ARIA Attributes)**
*   **File/Function:** `index.html` (buttons, timer)
*   **Problem:** The HTML structure lacks ARIA attributes, which are crucial for improving accessibility for users who rely on screen readers or other assistive technologies. Interactive elements like buttons and the timer display don't convey their purpose or current state semantically.
*   **Correction:** Add `aria-label`, `aria-labelledby`, `role`, and `aria-live` attributes to provide more context to assistive technologies.
*   **Corrected Snippet:**
    ```html
    <!-- index.html -->
    <main class="timer-card" role="region" aria-labelledby="timer-heading">
        <h2 id="timer-heading" class="visually-hidden">Pomodoro Timer</h2> <!-- Hidden heading for accessibility -->
        <!-- Mode Switcher -->
        <div class="mode-selector" role="radiogroup" aria-label="Select Timer Mode">
            <button class="mode-btn active" id="work-mode" role="radio" aria-checked="true">Enfoque</button>
            <button class="mode-btn" id="break-mode" role="radio" aria-checked="false">Descanso</button>
        </div>

        <!-- Timer Circle -->
        <div class="timer-display-container">
            <svg class="progress-ring" width="300" height="300" role="timer" aria-label="Time remaining">
                <!-- ... existing SVG paths ... -->
            </svg>
            <div class="timer-text">
                <span id="time-display" aria-live="polite" aria-atomic="true">25:00</span>
                <span id="current-state-label" class="state-label" aria-live="polite" aria-atomic="true">¡A trabajar!</span>
            </div>
        </div>

        <!-- Controls -->
        <div class="timer-controls">
            <button id="start-btn" class="control-btn primary-btn" title="Iniciar" aria-label="Iniciar temporizador">
                <svg ...></svg>
            </button>
            <button id="pause-btn" class="control-btn" title="Pausar" aria-label="Pausar temporizador">
                <svg ...></svg>
            </button>
            <button id="reset-btn" class="control-btn" title="Reiniciar" aria-label="Reiniciar temporizador">
                <svg ...></svg>
            </button>
        </div>
    </main>

    <!-- Task Section -->
    <section class="task-section" aria-labelledby="task-section-heading">
        <h2 id="task-section-heading">Tareas de Hoy</h2>
        <div class="task-input-container">
            <input type="text" id="task-input" placeholder="¿Qué vas a lograr ahora?..." autocomplete="off" aria-label="Nueva tarea">
            <button id="add-task-btn" aria-label="Añadir tarea">
                <svg ...></svg>
            </button>
        </div>
        <ul id="task-list" class="task-list" role="list" aria-label="Lista de tareas">
            <!-- Dynamic tasks here -->
        </ul>
    </section>
    ```

**5. Basic Testing Structure for `test_math.js`**
*   **File/Function:** `test_math.js` (entire file)
*   **Problem:** The `test_math.js` file uses a custom, very basic `assert` function and a simple `runTests` function. While functional for a minimal example, this approach is not scalable, lacks features found in modern testing frameworks (e.g., proper reporting, asynchronous testing, test suites/fixtures, mock/spy capabilities, code coverage), and requires manual execution.
*   **Correction:** **`> [!IMPORTANT]`** <br/>For any non-trivial application, adopt a professional JavaScript testing framework. Jest is a popular choice. This would significantly improve test reliability, developer experience, and maintainability.
*   **Corrected Snippet:**
    ```javascript
    // test_math.js (using a hypothetical Jest setup)
    // First, install Jest: npm install --save-dev jest
    // Then configure package.json scripts: "test": "jest"

    // math_functions.js (or directly in test_math.js)
    function add(a, b) {
        return a + b;
    }

    function subtract(a, b) {
        return a - b;
    }

    // Export functions if in a separate file, or define them directly here
    // module.exports = { add, subtract }; // If using CommonJS
    // export { add, subtract }; // If using ES Modules

    // test_math.test.js (preferred naming convention for Jest)
    describe('Math Functions', () => {
        test('add(2, 3) should return 5', () => {
            expect(add(2, 3)).toBe(5);
        });

        test('add(-1, 1) should return 0', () => {
            expect(add(-1, 1)).toBe(0);
        });

        test('subtract(5, 2) should return 3', () => {
            expect(subtract(5, 2)).toBe(3);
        });

        test('subtract(-10, -5) should return -5', () => {
            expect(subtract(-10, -5)).toBe(-5);
        });
    });
    ```

## 📊 Summary
| Category | Issues Found | Critical |
|----------|-------------|----------|
| 🛠️ Bugs & Functional Issues | 4 | 1 |
| 🔒 Security Vulnerabilities | 3 | 2 |
| ⚡ Performance Improvements | 2 | 0 |
| 🧼 Code Quality & Best Practices | 5 | 1 |