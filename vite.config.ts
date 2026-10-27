import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Unique per build; the page compares it with version.json to notice a newer deploy. */
const BUILD_ID = Date.now().toString(36);

/** Sites with an implementation in src/platform. */
const PLATFORMS = ['web'];

/** Emits version.json next to index.html with the current build id. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) + '\n' });
    },
  };
}

// The production build is a single self-contained index.html,
// so it can be published as a claude.ai artifact or opened from disk.
// `vite build --mode <platform>` builds for one site; plain dev and build target our own hosting.
export default defineConfig(({ mode }) => {
  const platform = mode === 'development' || mode === 'production' ? 'web' : mode;
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unknown platform "${platform}". Known: ${PLATFORMS.join(', ')}`);
  }
  return {
    plugins: [viteSingleFile(), versionFile()],
    define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __PLATFORM__: JSON.stringify(platform) },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  };
});
