const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const outdir = path.join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

// The backend serves this file at /widget/loader.js (see backend/src/app.ts's
// own static-serving line) — copied here automatically after every build so
// there's no manual "remember to copy it over" step.
const BACKEND_WIDGET_DIR = path.join(__dirname, '..', 'backend', 'public', 'widget');

// Same build-time constant-injection trick as leadryze-browser-agent's own
// build.js — the bundled browser code contains a literal string, never a
// runtime `process.env` reference (which doesn't exist on a public website).
const define = {
  'process.env.LEADRYZE_API_BASE_URL': JSON.stringify(
    process.env.LEADRYZE_API_BASE_URL || 'http://localhost:5000/api/v1',
  ),
};

function copyToBackend() {
  try {
    fs.mkdirSync(BACKEND_WIDGET_DIR, { recursive: true });
    fs.copyFileSync(path.join(outdir, 'loader.js'), path.join(BACKEND_WIDGET_DIR, 'loader.js'));
    console.log(`[leadryze-widget] Copied -> ${path.join(BACKEND_WIDGET_DIR, 'loader.js')}`);
  } catch (err) {
    console.warn('[leadryze-widget] Could not copy into backend/public/widget/ (is the backend project at the expected sibling path?):', err.message);
  }
}

async function run() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  const buildOptions = {
    entryPoints: { loader: 'src/loader.ts' },
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2018',
    define,
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    logLevel: 'info',
    // onEnd fires after the initial build AND after every rebuild in watch
    // mode — this is what keeps the backend's served copy in sync
    // automatically, whether you run `build` once or leave `dev` watching.
    plugins: [{
      name: 'copy-to-backend',
      setup(build) {
        build.onEnd((result) => { if (result.errors.length === 0) copyToBackend(); });
      },
    }],
  };

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[leadryze-widget] Watching src/ for changes -> dist/loader.js (auto-copied to backend/public/widget/ after every rebuild)');
  } else {
    await esbuild.build(buildOptions);
    console.log(`[leadryze-widget] Build complete -> ${outdir}/loader.js`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
