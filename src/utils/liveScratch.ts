export type ScratchAction = 'begin' | 'update' | 'end';
/** Begin/end cannot be coalesced away; movement retains only the latest unsent velocity. */
export function liveScratch(send:(action:ScratchAction,speed:number)=>Promise<void>,onError:(error:unknown)=>void) {
  let latest:number|null=null,ended=false,failed=false;
  let flight:Promise<void>|null=null;
  const pump=()=>{
    if (flight || ended || failed || latest===null) return;
    const speed=latest;latest=null;
    flight=send('update',speed).catch(error=>{failed=true;onError(error);}).finally(()=>{flight=null;pump();});
  };
  flight=send('begin',0).catch(error=>{failed=true;onError(error);}).finally(()=>{flight=null;pump();});
  return {
    move(speed:number) {if (!ended) {latest=Math.max(-8,Math.min(8,speed));pump();}},
    end() {if(ended)return;ended=true;latest=null;void (async()=>{await flight;await send('end',0);})().catch(onError);},
  };
}
export function angleDelta(from:number,to:number):number {
  return Math.atan2(Math.sin(to-from),Math.cos(to-from));
}
