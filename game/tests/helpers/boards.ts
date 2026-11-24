export const EMPTY = `+-+-+-+-+-+-+-+-+-+
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+ + + + + + + + + +
|. . . . . . . . .|
+-+-+-+-+-+-+-+-+-+`;

/** 空盤に駒を置く: pieces は [char, x, y] */
export function withPieces(pieces: [string, number, number][], walls: string[] = []): string {
  const lines = EMPTY.split('\n').map((l) => l.split(''));
  for (const [ch, x, y] of pieces) lines[2 * y + 1]![2 * x + 1] = ch;
  for (const w of walls) {
    const [o, xs, ys] = w.split(/[:,]/) as [string, string, string];
    const x = +xs, y = +ys;
    if (o === 'V') lines[2 * y + 1]![2 * x + 2] = '|';
    else lines[2 * y + 2]![2 * x + 1] = '-';
  }
  return lines.map((l) => l.join('')).join('\n');
}
