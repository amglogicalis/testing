/**
 * Adds a new task to the list with basic validation for input parameters.
 *
 * @param {string} text - The text of the task, must not be empty or null.
 * @param {boolean} [completed=false] - Whether the task is completed, default is false.
 * @returns {void}
 */
function addTask(text, completed = false) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Task text must be a non-empty string.');
    }
    if (typeof completed !== 'boolean') {
        throw new Error('Completed status must be a boolean.');
    }

    const newTask = { text, completed };
    tasks.push(newTask);
    renderTasks();
}

module.exports = { addTask };