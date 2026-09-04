const assert = require("assert");
const { add, subtract, multiply, divide } = require("../src/calculator.js");

console.log("Running Calculator Test Suite...");

assert.strictEqual(add(10, 5), 15, "add(10, 5) should equal 15");
assert.strictEqual(subtract(10, 5), 5, "subtract(10, 5) should equal 5");
assert.strictEqual(divide(10, 2), 5, "divide(10, 2) should equal 5");

// This assertion will fail because multiply returns a + b (9) instead of a * b (20)
assert.strictEqual(multiply(4, 5), 20, "multiply(4, 5) should equal 20");

console.log("All tests passed successfully!");
