/**
 * Divides two numbers.
 *
 * @param {number} a - The numerator.
 * @param {number} b - The denominator.
 * @returns {number} The result of dividing `a` by `b`.
 * @throws {Error} If `b` is zero, as division by zero is not allowed.
 */
function divide(a, b) {
    if (b === 0) {
        throw new Error("Division by zero is not allowed.");
    }
    return a / b;
}

module.exports = { divide };