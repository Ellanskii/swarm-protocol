// Notices a newer deploy: compares the build id baked into this page with version.json on the server.
// No service worker, so a reload is all it takes to get the new version.

declare const __BUILD_ID__: string;

const CHECK_EVERY_MS = 5 * 60 * 1000;

let available = false;

async function check(): Promise<void> {
  if (available || document.hidden) return;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return; // dev server, artifact or file:// — there is no version.json
    const { build } = (await res.json()) as { build?: string };
    if (!build || build === __BUILD_ID__) return;
    available = true;
    for (const b of document.querySelectorAll<HTMLElement>('[data-update]')) b.hidden = false;
  } catch {
    // offline or blocked: try again next time
  }
}

/** Buttons marked `data-update` appear once a newer build is deployed and reload the page. */
export function watchForUpdates(): void {
  for (const b of document.querySelectorAll<HTMLElement>('[data-update]')) {
    b.addEventListener('click', () => location.reload());
  }
  // an installed app is often resumed instead of relaunched, so check whenever it comes back
  document.addEventListener('visibilitychange', () => { void check(); });
  setInterval(() => { void check(); }, CHECK_EVERY_MS);
}
