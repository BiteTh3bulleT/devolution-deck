const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { create } = require('zustand');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(overrides = {}) {
  let callback, starts = 0, stops = 0, error;
  const api = { playbackPlayArrangement: async () => {starts++;}, playbackStop: async () => {stops++;}, playbackIsPlaying: async () => true, playbackPositionMs: async () => 1000, ...overrides };
  const service = {stop() {}, tick() {}};
  const mocks = {'zustand':{create}, '../api':api, './recordingStore':{useRecordingStore:{getState:()=>({stopRecording: overrides.recordStop ?? (async()=>{})})}}, './projectStore':{useProjectStore:{getState:()=>({project:{id:'p',bpm:120}}),setState:s=>{error=s.error;}}}, '../services/metronome':{metronomeService:service}, '../services/midiSequencer':{midiSequencer:service}};
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/stores/transportStore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>mocks[n],console,setInterval:cb=>{callback=cb;return 1;},clearInterval:()=>{callback=null;}});
  return {store:exports.useTransportStore, poll:()=>callback(), counts:()=>({starts,stops}), error:()=>error};
}
test('Stop cancels a pending Play and late completion cannot revive transport',async()=>{
  const d=deferred(), f=fixture({playbackPlayArrangement:()=>d.promise});
  const play=f.store.getState().play(); assert.equal(f.store.getState().status,'starting');
  await f.store.getState().stop(); d.resolve(); await play;
  assert.equal(f.store.getState().status,'stopped'); assert.equal(f.store.getState()._positionPollId,null);
});
test('repeated Play is ignored while preparation is pending',async()=>{
  const d=deferred();let calls=0;const f=fixture({playbackPlayArrangement:()=>{calls++;return d.promise;}});
  const first=f.store.getState().play(); await f.store.getState().play(); assert.equal(calls,1);
  d.resolve();await first;assert.equal(f.store.getState().status,'playing');
});
test('playback errors leave a stopped transport and visible error',async()=>{
  const f=fixture({playbackPlayArrangement:async()=>{throw Error('device gone');}});await f.store.getState().play();
  assert.equal(f.store.getState().status,'stopped'); assert.match(f.error(),/device gone/);
});
test('late position replies after Stop cannot overwrite the reset playhead',async()=>{
  const d=deferred(), f=fixture({playbackPositionMs:()=>d.promise});await f.store.getState().play();
  const poll=f.poll(); await Promise.resolve(); await f.store.getState().stop(); d.resolve(9000);await poll;
  assert.equal(f.store.getState().positionSecs,0);assert.equal(f.store.getState().status,'stopped');
});
test('Stop dispatches audio immediately while a recording take is still being written',async()=>{
  const d=deferred(), f=fixture({recordStop:()=>d.promise});await f.store.getState().play();
  const stop=f.store.getState().stop();assert.equal(f.counts().stops,1);assert.equal(f.store.getState().status,'stopped');d.resolve();await stop;
});
test('position polling cannot stack concurrent requests',async()=>{
  const d=deferred();let calls=0;const f=fixture({playbackIsPlaying:()=>{calls++;return d.promise;}});await f.store.getState().play();
  const first=f.poll();await f.poll();assert.equal(calls,1);d.resolve(true);await first;
});
