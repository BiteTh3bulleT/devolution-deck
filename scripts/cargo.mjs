import { spawn } from 'node:child_process';
import { nativeEnv } from './native-env.mjs';
const args = process.argv.slice(2);
if (!args.includes('--manifest-path')) args.push('--manifest-path', 'src-tauri/Cargo.toml');
const child = spawn('cargo', args, { stdio: 'inherit', env: nativeEnv() });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
