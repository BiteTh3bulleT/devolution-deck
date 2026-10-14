import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
export function nativeEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32' && !env.CMAKE_GENERATOR) {
    const vswhere = 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe';
    if (existsSync(vswhere)) {
      const installed = execFileSync(vswhere, ['-all', '-products', '*', '-format', 'json'], { encoding: 'utf8' });
      const vs2022 = JSON.parse(installed).find((v) => v.installationVersion.startsWith('17.'));
      if (vs2022) env.CMAKE_GENERATOR = 'Visual Studio 17 2022';
    }
  }
  return env;
}
