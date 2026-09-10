import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locates the monorepo root by walking up for `pnpm-workspace.yaml`.
 *
 * Relative paths in configuration (`./assets/fixtures/audio`, `./var/storage`)
 * must mean the same directory whether the process was started from the repo
 * root, from `apps/api`, or from a test runner — otherwise the API and the
 * worker end up with different storage roots and deliveries go missing.
 */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Installed outside the workspace (a container image): fall back to CWD.
  return process.cwd();
}

/** Resolves a configured path against the repo root unless it is already absolute. */
export function resolveFromRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot(), p);
}
