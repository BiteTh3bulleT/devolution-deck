const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/parameterQueue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,Map,Promise});
const {parameterQueue}=exportsObject;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('rapid touch gestures retain the final gain and filter with one request in flight',async()=>{
  const wait=deferred(),started=deferred(),calls=[];let active=0,max=0;
  const queue=parameterQueue(async(key,patch)=>{active++;max=Math.max(max,active);calls.push({key,...patch});if(calls.length===1){started.resolve();await wait.promise;}active--;});
  const first=queue('A',{gainDb:0});await started.promise;
  queue('A',{gainDb:-3});queue('A',{filter:0.2});const last=queue('A',{gainDb:-6});
  wait.resolve();await Promise.all([first,last]);
  assert.equal(max,1);assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{key:'A',gainDb:0},{key:'A',gainDb:-6,filter:0.2}]);
});
test('both decks can process touches independently',async()=>{
  const wait=deferred(),calls=[];const queue=parameterQueue(async(key)=>{calls.push(key);if(key==='A')await wait.promise;});
  const a=queue('A',{});await queue('B',{});assert.deepEqual(calls,['A','B']);wait.resolve();await a;
});
test('a failed parameter request releases its lane for a retry',async()=>{
  let fail=true;const queue=parameterQueue(async()=>{if(fail)throw Error('device');});
  await assert.rejects(queue('A',{}),/device/);fail=false;await queue('A',{});
});
