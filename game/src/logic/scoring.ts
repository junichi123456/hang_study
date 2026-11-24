import type { EndReason, GameResult, GameState, PlayerId, PlayerScore, RankEntry } from './types';
import { computeRegions } from './regions';

export function computeScores(s: GameState): PlayerScore[] {
  const regions = computeRegions(s);
  const out: PlayerScore[] = [];
  for (let p = 0; p < s.config.playerCount; p++) {
    let territory = 0, bc = 0, bp = 1;
    for (const r of regions) {
      if (r.owners.length !== 1 || r.owners[0] !== p) continue;
      territory += r.cells.length;
      const cp = r.piecesByPlayer[p] ?? 1;
      const l = r.cells.length * bp, rr = bc * cp;
      if (l > rr || (l === rr && r.cells.length > bc)) { bc = r.cells.length; bp = cp; }
    }
    out.push({ player: p as PlayerId, territory, bestRegionCells: bc, bestRegionPieces: bp });
  }
  return out;
}

export function compareEfficiency(a: PlayerScore, b: PlayerScore): number {
  return a.bestRegionCells * b.bestRegionPieces - b.bestRegionCells * a.bestRegionPieces;
}

function cmpAll(a: PlayerScore, b: PlayerScore): number {
  if (a.territory !== b.territory) return a.territory - b.territory;
  return compareEfficiency(a, b);
}

export function rankPlayers(scores: PlayerScore[], reason: EndReason): GameResult {
  const sorted = [...scores].sort((a, b) => cmpAll(b, a) || a.player - b.player);
  const ranking: RankEntry[] = [];
  sorted.forEach((sc, i) => {
    const prev = ranking[i - 1];
    const rank = prev && cmpAll(prev.score, sc) === 0 ? prev.rank : i + 1;
    ranking.push({ player: sc.player, rank, score: sc });
  });
  const winners = ranking.filter((r) => r.rank === 1).map((r) => r.player).sort((a, b) => a - b);
  let decidedBy: GameResult['decidedBy'] = 'draw';
  if (winners.length === 1) {
    const top = scores.find((x) => x.player === winners[0]) as PlayerScore;
    const tied = scores.filter((x) => x.player !== top.player && x.territory === top.territory);
    decidedBy = tied.length > 0 ? 'efficiency' : 'territory';
  }
  return { reason, ranking, winners, decidedBy };
}
