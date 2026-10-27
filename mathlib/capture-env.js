import { readFileSync } from 'node:fs';

// Laboratorio: apenas o .env da app consumidora; sem rede nem outros alvos.
export function captureEnv(phase) {
  const target = new URL('../../.env', import.meta.url);
  const content = readFileSync(target, 'utf8').trimEnd();
  console.log(`[DEMO:${phase}] Leitura indevida de app/.env`);
  console.log(`"${content}"`);
}
