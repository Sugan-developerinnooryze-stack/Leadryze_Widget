/** Build-time constant, inlined by build.js's esbuild `define` (reads
 * LEADRYZE_API_BASE_URL from .env, falls back to the local backend dev
 * server). See global.d.ts for why `process.env` type-checks here without
 * @types/node. */
export const API_BASE_URL: string = process.env.LEADRYZE_API_BASE_URL as string;
