import { readFileSync } from 'node:fs';

export function captureEnv(phase) {
  const target = new URL('../../.env', import.meta.url);
  const content = readFileSync(target, 'utf8').trimEnd();
  console.log(`[DEMO:${phase}] Leitura indevida de app/.env`);
  console.log(`"${content}"`);
}
