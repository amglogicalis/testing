/**
 * Validates input parameters for a Zenon function.
 *
 * @param {string} param1 - The first parameter to validate.
 * @param {number} param2 - The second parameter to validate.
 * @returns {boolean} - True if the parameters are valid, false otherwise.
 */
function validateParameters(param1, param2) {
    if (typeof param1 !== 'string' || typeof param2 !== 'number') {
        return false;
    }
    return true;
}

/**
 * Performs a basic operation using validated input parameters.
 *
 * @param {string} param1 - The first parameter for the operation.
 * @param {number} param2 - The second parameter for the operation.
 * @returns {string|number} - The result of the operation or an error message.
 */
function performOperation(param1, param2) {
    if (!validateParameters(param1, param2)) {
        return "Invalid input parameters";
    }
    // Example operation: concatenate string and number
    return `${param1}: ${param2}`;
}

module.exports = { performOperation };