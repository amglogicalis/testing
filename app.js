// App state variables
let workDuration = 25 * 60; // 25 minutes in seconds
let breakDuration = 5 * 60;  // 5 minutes in seconds
let currentDuration = workDuration;
let timeLeft = currentDuration;
let timerInterval = null;
let isWorkMode = true;

// DOM Elements
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

// Setup progress ring
const radius = progressBar.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
progressBar.style.strokeDashoffset = 0;

function updateProgress() {
    const totalDuration = isWorkMode ? workDuration : breakDuration;
    const percentage = ((totalDuration - timeLeft) / totalDuration) * 100;
    const offset = circumference - (percentage / 100) * circumference;
    progressBar.style.strokeDashoffset = offset;
}

// Format time remaining
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update time display
function updateDisplay() {
    timeDisplay.textContent = formatTime(timeLeft);
    updateProgress();
}

// Timer tick logic
function tick() {
    if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();
    } else {
        clearInterval(timerInterval);
        timerInterval = null;
        alert(isWorkMode ? '¡Tiempo de enfoque terminado! Toma un descanso.' : '¡Descanso terminado! De vuelta al trabajo.');
        toggleMode();
    }
}

// Mode Selection
function toggleMode() {
    isWorkMode = !isWorkMode;
    if (isWorkMode) {
        currentDuration = workDuration;
        stateLabel.textContent = '¡A trabajar!';
        document.documentElement.style.setProperty('--accent-color', '#ff5e5b');
        document.documentElement.style.setProperty('--accent-glow', 'rgba(255, 94, 91, 0.3)');
        workModeBtn.classList.add('active');
        breakModeBtn.classList.remove('active');
    } else {
        currentDuration = breakDuration;
        stateLabel.textContent = 'Descanso';
        document.documentElement.style.setProperty('--accent-color', '#10b981');
        document.documentElement.style.setProperty('--accent-glow', 'rgba(16, 185, 129, 0.3)');
        breakModeBtn.classList.add('active');
        workModeBtn.classList.remove('active');
    }
    timeLeft = currentDuration;
    updateDisplay();
}

// --- TIMER CONTROLS (BUG ALERT!) ---
// INICIO DEL TIMER: Aquí reside el fallo de código.
// No validamos si "timerInterval" ya está en ejecución ni limpiamos el anterior interval antes de crear uno nuevo.
// Si el usuario presiona "Iniciar" varias veces consecutivas, se acumularán múltiples intervalos acelerando el contador.
function startTimer() {
    timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        // Nota: Solo limpia el último intervalo referenciado por timerInterval.
        // Los intervalos huérfanos acumulados por múltiples clics de "start" seguirán ejecutándose en segundo plano.
        timerInterval = null;
    }
}

function resetTimer() {
    pauseTimer();
    timeLeft = currentDuration;
    updateDisplay();
}

// Event Listeners for Controls
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

workModeBtn.addEventListener('click', () => {
    if (!isWorkMode) {
        pauseTimer();
        isWorkMode = false; // so toggleMode sets it to true
        toggleMode();
    }
});

breakModeBtn.addEventListener('click', () => {
    if (isWorkMode) {
        pauseTimer();
        isWorkMode = true; // so toggleMode sets it to break/false
        toggleMode();
    }
});

// --- TASKS LIST LOGIC ---
let tasks = [];

function renderTasks() {
    taskList.innerHTML = '';
    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <div class="task-item-content">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-index="${index}">
                <span class="task-text">${task.text}</span>
            </div>
            <button class="delete-task-btn" data-index="${index}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        taskList.appendChild(li);
    });
}

function addTask() {
    const text = taskInput.value.trim();
    if (text !== '') {
        tasks.push({ text, completed: false });
        taskInput.value = '';
        renderTasks();
    }
}

// Handle checkbox toggle and delete actions
taskList.addEventListener('click', (e) => {
    // Checkbox toggle
    if (e.target.classList.contains('task-checkbox')) {
        const index = parseInt(e.target.dataset.index);
        tasks[index].completed = e.target.checked;
        renderTasks();
    }
    
    // Delete task button
    const deleteBtn = e.target.closest('.delete-task-btn');
    if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index);
        tasks.splice(index, 1);
        renderTasks();
    }
});

// Event listeners for tasks
addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});

// Initial Render
updateDisplay();
