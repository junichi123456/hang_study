import type { PlayerCount } from '../logic';

export interface Settings { playerCount: PlayerCount; names: string[]; }
const KEY = 'hang.settings.v1';
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Settings;
      if ((s.playerCount === 2 || s.playerCount === 3) && Array.isArray(s.names)) return s;
    }
  } catch { /* ignore */ }
  return { playerCount: 2, names: ['', '', ''] };
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
