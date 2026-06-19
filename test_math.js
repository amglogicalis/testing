// math_functions.js (or directly in test_math.js for simplicity)
function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

// Basic assertion function
function assert(condition, message) {
    if (!condition) {
        console.error('Assertion failed:', message);
        return false;
    } else {
        console.log('Assertion passed:', message);
        return true;
    }
}

// Test cases
function runTests() {
    console.log('Running math function tests...');

    // Test add function
    assert(add(2, 3) === 5, 'add(2, 3) should return 5');
    assert(add(-1, 1) === 0, 'add(-1, 1) should return 0');
    assert(add(0, 0) === 0, 'add(0, 0) should return 0');
    assert(add(10, -5) === 5, 'add(10, -5) should return 5');

    // Test subtract function
    assert(subtract(5, 2) === 3, 'subtract(5, 2) should return 3');
    assert(subtract(1, 1) === 0, 'subtract(1, 1) should return 0');
    assert(subtract(0, 5) === -5, 'subtract(0, 5) should return -5');
    assert(subtract(-10, -5) === -5, 'subtract(-10, -5) should return -5');
    assert(subtract(10, 0) === 10, 'subtract(10, 0) should return 10');

    console.log('Math function tests finished.');
}

// Execute tests
runTests();