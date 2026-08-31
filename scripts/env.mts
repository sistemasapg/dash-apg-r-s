import path from 'node:path';
import fs from 'node:fs';

/** Carrega .env.local (e .env como fallback) antes de qualquer import de lib. */
export function carregarEnv(): void {
  for (const arquivo of ['.env.local', '.env']) {
    const caminho = path.join(process.cwd(), arquivo);
    if (fs.existsSync(caminho)) {
      process.loadEnvFile(caminho);
    }
  }
}

carregarEnv();
