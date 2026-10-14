import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const binary = fs.readFileSync(process.argv[2] ?? 'src-tauri/target/release/devolution-deck.exe');
const assetNames = ['alien-mothership','devooo-logo','jog-dial','knob-cap','knob-bezel','button-idle','button-pressed','button-amber','fader-cap'];
const assets = new Map(assetNames.map(name => [name, fs.readFileSync(`src/assets/ui/v5/${name}.png`)]));
const found = new Set();
let touchStyles = false;
const build = 'src-tauri/target/release/build';
for (const dir of fs.readdirSync(build).filter(name => name.startsWith('devolution-deck-'))) {
  const root = path.join(build,dir,'out','tauri-codegen-assets');
  if (!fs.existsSync(root)) continue;
  for (const name of fs.readdirSync(root).filter(name => /\.(png|css)$/.test(name))) {
    const packed = fs.readFileSync(path.join(root,name));
    if (!binary.includes(packed)) continue;
    let data; try { data = zlib.brotliDecompressSync(packed); } catch { continue; }
    if (name.endsWith('.png')) for (const [asset,source] of assets) if (data.equals(source)) found.add(asset);
    if (name.endsWith('.css')) {
      const css = data.toString('utf8');
      if (/alien-mothership-[\w-]+\.png/.test(css) && css.includes('touch-performance') && /clamp\(320px,\s*32vw,\s*440px\)/.test(css) && /min-height:48px/.test(css)) touchStyles = true;
    }
  }
}
const result = {sha256:crypto.createHash('sha256').update(binary).digest('hex'), embeddedAssets:[...found].sort(),touchStyles,missing:assetNames.filter(name=>!found.has(name))};
console.log(JSON.stringify(result,null,2));
if (result.missing.length || !touchStyles) process.exitCode=1;
