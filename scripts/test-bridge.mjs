// Local verification only: real Rust DSP behind a browser-compatible IPC adapter.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const work = path.resolve('output/playwright/native-fixtures'); mkdirSync(work, { recursive: true });
const binary = path.resolve(`src-tauri/target/debug/audio-lab-cli${process.platform === 'win32' ? '.exe' : ''}`);
function native(command, args = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject); child.on('exit', (code) => { try { if (code) throw Error(stderr || `Native adapter exited ${code}`); const result = JSON.parse(stdout); if (!result.ok) throw Error(result.error); resolve(result.data); } catch (e) { reject(e); } });
    child.stdin.end(JSON.stringify({ command, args }));
  });
}
let project = await native('project_new'); project.title = 'Audio Lab verification'; project.navigation.main_view = 'lab';
const seed = path.join(work, 'reference_1000Hz.wav');
const seedResult = await native('audio_lab_generate', { outputPath: seed, settings: { kind: 'sine', duration_secs: 2, frequency_hz: 1000, end_frequency_hz: 20000, level_dbfs: -18, sample_rate: 48000 } });
function asset(file, analysis) { return { id: randomUUID(), name: path.basename(file, path.extname(file)), path: file, duration_secs: analysis.duration_secs, sample_rate: analysis.sample_rate, channels: 2 }; }
project.media.push(asset(seed, seedResult.analysis));
let sequence = Promise.resolve();
async function dispatch(command, args) {
  appendFileSync(path.join(work, 'requests.jsonl'), JSON.stringify({ command, args, time: Date.now() }) + '\n');
  if (command.startsWith('audio_lab_')) return native(command, args);
  switch (command) {
    case 'project_get': return project;
    case 'project_new': project = await native('project_new'); return project;
    case 'project_patch': project = await native('project_patch', { ...args, current: project }); return project;
    case 'media_import_audio': { const analysis = await native('audio_lab_analyze', { path: args.path }); const imported = asset(args.path, analysis); project.media.push(imported); return imported; }
    case 'navigation_update': project.navigation = args.navigation; return project.navigation;
    case 'shortcut_bindings_set': project.shortcuts = args.bindings; return args.bindings;
    case 'recovery_snapshot_save': { const metadata = { id: randomUUID(), path: path.join(work, `snapshot_${Date.now()}.decksnap`), created_unix_ms: Date.now(), reason: args.reason ?? 'manual' }; writeFileSync(metadata.path, JSON.stringify({ metadata, project })); project.recovery_snapshots.push(metadata); return metadata; }
    case 'track_add': { const track = { id: randomUUID(), name: args.name || 'Lab audio', index: project.tracks.length, track_type: args.trackType ?? 'audio', clips: [], midi_clips: [], volume_db: 0, pan: 0, muted: false, solo: false, plugin_chain: { instances: [] }, freeze_state: { is_frozen: false, original_clips: [], original_midi_clips: [] }, take_lanes: [], comp_regions: [], armed: false }; project.tracks.push(track); return track; }
    case 'clip_place': { const clip = { ...args.payload, id: randomUUID(), slice_markers: [] }; delete clip.track_index; project.tracks[args.payload.track_index].clips.push(clip); return clip; }
    case 'waveform_peaks': { const data = await native('audio_lab_analyze', { path: args.path }); return { buckets: data.waveform.map(b => ({min:Math.min(b.left_min,b.right_min),max:Math.max(b.left_max,b.right_max)})) }; }
    case 'playback_meters': return { master_peak:0, master_rms:0, tracks:project.tracks.map(t => ({track_id:t.id,peak:0,rms:0})) };
    case 'playback_refresh': case 'playback_stop': return null;
    case 'playback_is_playing': return false;
    case 'playback_position_ms': return 0;
    case 'error_report_add': project.error_reports.push({ ...args, id: randomUUID() }); return project.error_reports.at(-1);
    case 'plugin:dialog|save': return path.join(work, path.basename(args.options?.defaultPath ?? 'lab_output.wav'));
    case 'plugin:dialog|open': return seed;
    default: throw Error(`Unsupported verification IPC: ${command}`);
  }
}
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/ipc') { res.writeHead(404); res.end(); return; }
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8_000_000) { res.writeHead(413); res.end(); return; } }
  const request = JSON.parse(body);
  const task = sequence.catch(() => {}).then(() => dispatch(request.command, request.args ?? {})); sequence = task;
  try { const data = await task; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, data })); }
  catch (error) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: false, error: String(error.message ?? error) })); }
});
server.listen(47831, '127.0.0.1');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', env: { ...process.env, DECK_TEST_BRIDGE: '1' } });
function close() { vite.kill(); server.close(); } process.on('SIGINT', close); process.on('SIGTERM', close);
console.log('Audio Lab native verification bridge: http://127.0.0.1:5173 (fixture data only)');
