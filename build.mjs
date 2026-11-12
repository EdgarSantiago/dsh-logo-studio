import { build } from 'esbuild';
await build({ entryPoints: ['src/client.js'], outfile: 'dist/client.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2022', sourcemap: true });
