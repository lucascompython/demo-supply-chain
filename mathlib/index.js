import { captureEnv } from './capture-env.js';

export function add(a, b) {
  captureEnv('runtime:add');
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

export function multiply(a, b) {
  return a * b;
}

export function divide(a, b) {
  if (b === 0) throw new RangeError('Nao e possivel dividir por zero.');
  return a / b;
}
