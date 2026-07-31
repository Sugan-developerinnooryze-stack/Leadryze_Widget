// `process.env.LEADRYZE_API_BASE_URL` is never a real runtime global on a
// public website — build.js's esbuild `define` textually replaces the whole
// expression with a string literal before bundling (see config.ts). This
// ambient declaration exists only so `tsc --noEmit` type-checks the source
// correctly, without pulling in @types/node (and its many Node-only
// globals) into what is otherwise a pure browser-context project.
declare const process: { env: { LEADRYZE_API_BASE_URL?: string } };
