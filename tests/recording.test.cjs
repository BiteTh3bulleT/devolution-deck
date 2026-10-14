const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript'),{create}=require('zustand');
function fixture(bars=1, directory=async()=>'/documents'){
 let callback,started=0,stopped=0;
 const mocks={'zustand':{create},'../api':{recordingStart:async()=>{started++;},recordingStopToTimeline:async()=>{stopped++;}},'./projectStore':{useProjectStore:{getState:()=>({project:{bpm:120,monitoring:{target_buffer_ms:64}},load:async()=>{}})}},'./transportStore':{useTransportStore:{getState:()=>({status:'stopped',positionSecs:0})}},'./metronomeStore':{useMetronomeStore:{getState:()=>({countInBars:bars})}},'@tauri-apps/api/path':{documentDir:directory,join:async(...p)=>p.join('/')}};
 const exports={};const code=ts.transpileModule(fs.readFileSync('src/stores/recordingStore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>mocks[n],console,setTimeout:cb=>{callback=cb;return 1;},clearTimeout:()=>{callback=null;}});
 return {store:exports.useRecordingStore,fire:()=>callback(),counts:()=>({started,stopped})};
}
test('stopping after count-in stops native capture and places the take',async()=>{const f=fixture();await f.store.getState().startRecording('track',2);await f.fire();assert.equal(f.store.getState().status,'recording');await f.store.getState().stopRecording();assert.deepEqual(f.counts(),{started:1,stopped:1});assert.equal(f.store.getState().status,'idle');});
test('cancelling during count-in never starts capture',async()=>{const f=fixture();await f.store.getState().startRecording('track',0);await f.store.getState().stopRecording();assert.deepEqual(f.counts(),{started:0,stopped:0});assert.equal(f.store.getState().status,'idle');});
test('recording without count-in stops normally',async()=>{const f=fixture(0);await f.store.getState().startRecording('track',0);await f.store.getState().stopRecording();assert.deepEqual(f.counts(),{started:1,stopped:1});});

test('cancel at count-in boundary cannot start late capture', async()=>{
 let resolveDirectory; const directory=new Promise(resolve=>{resolveDirectory=resolve;});
 const f=fixture(1,()=>directory); await f.store.getState().startRecording('track',0);
 const starting=f.fire(); await f.store.getState().stopRecording(); resolveDirectory('/documents'); await starting;
 assert.deepEqual(f.counts(),{started:0,stopped:0}); assert.equal(f.store.getState().status,'idle');
});
