const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/liveScratch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod,Math,Promise});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('release before begin completes still sends end and discards buffered movement',async()=>{
  const wait=deferred(),calls=[];const session=mod.liveScratch(async(action,speed)=>{calls.push([action,speed]);if(action==='begin')await wait.promise;},()=>{});
  session.move(-2);session.end();session.end();wait.resolve();await tick();assert.deepEqual(calls,[['begin',0],['end',0]]);
});
test('movement is audible before release and only its latest pending velocity is sent',async()=>{
  const wait=deferred(),started=deferred(),calls=[];const session=mod.liveScratch(async(action,speed)=>{calls.push([action,speed]);if(action==='update'&&speed===1){started.resolve();await wait.promise;}},()=>{});
  await tick();session.move(1);await started.promise;session.move(-1);session.move(-4);wait.resolve();await tick();
  assert.deepEqual(calls,[['begin',0],['update',1],['update',-4]]);session.end();await tick();assert.equal(calls.at(-1)[0],'end');
});
test('failed begin stops movement but release still attempts cleanup',async()=>{
  const calls=[],errors=[];const session=mod.liveScratch(async(action)=>{calls.push(action);if(action==='begin')throw Error('stopped');},e=>errors.push(e.message));
  session.move(2);await tick();session.end();await tick();assert.deepEqual(calls,['begin','end']);assert.deepEqual(errors,['stopped']);
});
test('angular scratch crosses the seam without a full-turn speed spike',()=>{
  assert.ok(Math.abs(mod.angleDelta(179*Math.PI/180,-179*Math.PI/180)-2*Math.PI/180)<1e-10);
  assert.ok(Math.abs(mod.angleDelta(-179*Math.PI/180,179*Math.PI/180)+2*Math.PI/180)<1e-10);
});
