import { writeFileSync } from 'node:fs';
import { serialize } from '../../src/logic';
import { fx } from './boardFixture';
import { withPieces } from './boards';

const vline = (x: number, to = 7) => Array.from({ length: to + 1 }, (_, y) => `V:${x},${y}`);
const wb = fx(withPieces([['a', 4, 4], ['A', 0, 0], ['B', 8, 8], ['b', 8, 0]], ['H:4,3']));
writeFileSync('tests/e2e/fixtures/wallbreak.json', serialize({ ...wb, pieces: wb.pieces }));
const near = fx(withPieces([['a', 1, 3], ['A', 2, 6], ['a', 1, 8], ['A', 3, 8], ['B', 6, 2], ['b', 7, 3], ['b', 5, 5], ['B', 6, 6]], vline(3)),
  { phase: 'wall', currentPlayer: 0, pendingWall: { pieceId: 'p0-c1', cell: { x: 3, y: 8 } } });
writeFileSync('tests/e2e/fixtures/near-end.json', serialize(near));
