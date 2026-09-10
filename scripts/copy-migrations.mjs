#!/usr/bin/env node
/** Copies the .sql migration files next to the compiled db package output. */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = process.cwd();
const from = join(pkgRoot, 'src', 'migrations');
const to = join(pkgRoot, 'dist', 'migrations');

await mkdir(dirname(to), { recursive: true });
await cp(from, to, { recursive: true });
console.log(`copied migrations -> ${to}`);
