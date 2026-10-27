// The only place that knows which site the game runs on. Every site gets its own build
// (`vite build --mode <platform>`), and the game talks to the site only through `platform`.
import { web } from './web';

export interface Platform {
  /** Loads the site SDK. The game waits for it before reading the save. */
  init(): Promise<void>;
  /** Loading is done and the game can be played. */
  ready(): void;
  /** Active play begins: a run starts or resumes. */
  gameplayStart(): void;
  /** Active play ends: pause, level-up, run over, base. */
  gameplayStop(): void;
  /** Two-letter interface language, e.g. 'ru'. */
  lang(): string;
  /** Meta progress as last saved, or null. Never throws. */
  load(): Promise<unknown>;
  /** Stores meta progress. Never throws. */
  save(data: object): Promise<void>;
  /** Own hosting only: calls `onNewer` once a newer build is deployed. */
  watchUpdates?(onNewer: () => void): void;
}

declare const __PLATFORM__: 'web';

const PLATFORMS = { web } satisfies Record<typeof __PLATFORM__, Platform>;

export const platform: Platform = PLATFORMS[__PLATFORM__];
