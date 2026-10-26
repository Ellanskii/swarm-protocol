// Persistent meta progress: currencies and tech levels. localStorage for now, the Yandex Games SDK later.

const KEY = 'swarm.save';
const VERSION = 1;

export interface SaveData {
  v: number;
  scrap: number;
  cores: number;
  /** Tech node levels by id; missing means not bought. */
  tech: Record<string, number>;
  /** Unlock nodes the player took out of the run pool. */
  off: string[];
  runs: number;
  wins: number;
}

const fresh = (): SaveData => ({ v: VERSION, scrap: 0, cores: 0, tech: {}, off: [], runs: 0, wins: 0 });

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as Partial<SaveData>;
    // unknown or broken data starts over rather than crashing the game
    if (data.v !== VERSION) return fresh();
    return { ...fresh(), ...data };
  } catch {
    return fresh();
  }
}

/** The live save. Mutate fields, then call `persist()`. */
export const save: SaveData = load();

export function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage blocked: progress lives until reload */ }
}

/** Debug: wipes all meta progress. */
export function resetSave(): void {
  Object.assign(save, fresh());
  persist();
}
