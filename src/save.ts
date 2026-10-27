// Persistent meta progress: currencies and tech levels. Where it is stored is up to the platform.
import { platform } from './platform';

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

function parse(data: unknown): SaveData {
  if (!data || typeof data !== 'object') return fresh();
  const d = data as Partial<SaveData>;
  // unknown or broken data starts over rather than crashing the game
  if (d.v !== VERSION) return fresh();
  return { ...fresh(), ...d };
}

/** The live save, empty until `loadSave()`. Mutate fields, then call `persist()`. */
export const save: SaveData = fresh();

/** Reads the save once at startup, before anything shows progress. */
export async function loadSave(): Promise<void> {
  Object.assign(save, parse(await platform.load()));
}

export function persist(): void {
  void platform.save(save);
}

/** Debug: wipes all meta progress. */
export function resetSave(): void {
  Object.assign(save, fresh());
  persist();
}
