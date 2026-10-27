// Our own hosting and plain browsers: no SDK, progress in localStorage,
// a newer deploy is noticed by comparing the build id baked into this page with version.json.
import type { Platform } from './index';

declare const __BUILD_ID__: string;

const SAVE_KEY = 'swarm.save';
const CHECK_EVERY_MS = 5 * 60 * 1000;

async function newerBuild(): Promise<boolean> {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return false; // dev server, artifact or file:// — there is no version.json
    const { build } = (await res.json()) as { build?: string };
    return !!build && build !== __BUILD_ID__;
  } catch {
    return false; // offline or blocked: try again next time
  }
}

export const web: Platform = {
  async init() {},
  ready() {},
  gameplayStart() {},
  gameplayStop() {},
  lang: () => navigator.language.slice(0, 2).toLowerCase(),

  async load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async save(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage blocked: progress lives until reload */ }
  },

  // no service worker, so a reload is all it takes to get the new version
  watchUpdates(onNewer) {
    let found = false;
    const check = async () => {
      if (found || document.hidden) return;
      if (await newerBuild()) {
        found = true;
        onNewer();
      }
    };
    // an installed app is often resumed instead of relaunched, so check whenever it comes back
    document.addEventListener('visibilitychange', () => { void check(); });
    setInterval(() => { void check(); }, CHECK_EVERY_MS);
  },
};
