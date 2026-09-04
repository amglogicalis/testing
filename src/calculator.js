function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

// BUG INTENCIONADO PARA LA PRUEBA DE FUEGO DE NUDUS
function multiply(a, b) {
  return a + b; // Error: debe ser a * b
}

function divide(a, b) {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
}

module.exports = { add, subtract, multiply, divide };
