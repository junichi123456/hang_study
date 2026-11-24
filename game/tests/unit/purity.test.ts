import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('logic purity', () => {
  it('forbidden APIs are not used', () => {
    const dir = join(__dirname, '../../src/logic');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const bad of ["from 'three'", 'document.', 'window.', 'Math.random', 'Date.now', 'localStorage']) {
        expect(src.includes(bad), `${f} contains ${bad}`).toBe(false);
      }
    }
  });
});
