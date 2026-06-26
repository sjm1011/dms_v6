import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const targetPath = join(process.cwd(), 'next-env.d.ts');
const content = readFileSync(targetPath, 'utf8');
const cleaned = content
  .split(/\r?\n/)
  .filter((line) => !/^import "\.\/\.next\/(?:dev\/)?types\/routes\.d\.ts";$/.test(line))
  .join('\r\n');

if (cleaned !== content) {
  writeFileSync(targetPath, `${cleaned.replace(/\r\n$/, '')}\r\n`, 'utf8');
}

rmSync(join(process.cwd(), '.next', 'types', 'routes.d.ts'), {
  force: true
});

rmSync(join(process.cwd(), '.next', 'dev', 'types', 'routes.d.ts'), {
  force: true
});
