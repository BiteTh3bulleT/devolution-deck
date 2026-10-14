import { spawn } from 'node:child_process';
import { nativeEnv } from './native-env.mjs';
const child = spawn(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...process.argv.slice(2)], { stdio: 'inherit', env: nativeEnv() });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
