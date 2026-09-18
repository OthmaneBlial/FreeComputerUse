import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/ui', { recursive: true });
await cp('src/ui', 'dist/ui', { recursive: true });
