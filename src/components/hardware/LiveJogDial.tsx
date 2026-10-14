import { useEffect, useRef, useState } from 'react';
import { angleDelta, liveScratch, type ScratchAction } from '../../utils/liveScratch';
import jogDial from '../../assets/ui/v5/jog-dial.png';
let scratchToken=0;
export function JogDial({ label, position, disabled, vinylMode, onScratchLive, onNudge, sensitivity=1 }: { label:string; position:number; disabled:boolean; vinylMode:boolean; sensitivity?:number; onScratchLive:(token:number,action:ScratchAction,speed:number)=>Promise<void>; onNudge:(beats:number)=>void }) {
  const drag=useRef<{id:number;x:number;width:number;cx:number;cy:number;angle:number;time:number;rotation:number;session:ReturnType<typeof liveScratch>|null;timer:number} | null>(null);
  const [rotation,setRotation]=useState<number|null>(null);
  const [error,setError]=useState<string|null>(null);
  const release=()=>{const active=drag.current;if (!active)return;drag.current=null;window.clearInterval(active.timer);active.session?.end();setRotation(null);};
  useEffect(()=>{
    const cancel=()=>release();const hidden=()=>{if(document.hidden)release();};
    window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',hidden);
    return ()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',hidden);release();};
  },[disabled,vinylMode]);
  return <><button type="button" className="hardware-jog" aria-label={label} disabled={disabled} title={`${vinylMode ? 'Hold and rotate to scratch live; release to resume' : 'Drag then release to nudge'}; arrow keys nudge a quarter beat`}
    onPointerDown={e=>{
      if(e.button!==0||disabled||drag.current)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);setError(null);
      const box=e.currentTarget.getBoundingClientRect();const cx=box.left+box.width/2,cy=box.top+box.height/2;
      const token=Date.now()*1000+(scratchToken++%1000);
      const session=vinylMode?liveScratch((action,speed)=>onScratchLive(token,action,speed),error=>setError(String(error))):null;
      const active={id:e.pointerId,x:e.clientX,width:box.width,cx,cy,angle:Math.atan2(e.clientY-cy,e.clientX-cx),time:performance.now(),rotation:position*90,session,timer:0};
      active.timer=window.setInterval(()=>{if(drag.current===active&&performance.now()-active.time>60)active.session?.move(0);},60);
      drag.current=active;setRotation(active.rotation);
    }}
    onPointerMove={e=>{
      const active=drag.current;if(!active||active.id!==e.pointerId)return;
      if(!active.session){setRotation(position*90+(e.clientX-active.x)*380/active.width);return;}
      const angle=Math.atan2(e.clientY-active.cy,e.clientX-active.cx),now=performance.now();
      if(Math.hypot(e.clientX-active.cx,e.clientY-active.cy)<active.width*0.15){active.angle=angle;active.time=now;active.session.move(0);return;}
      const delta=angleDelta(active.angle,angle);const dt=Math.max(8,now-active.time)/1000;
      active.rotation+=delta*180/Math.PI;active.session.move(delta/(2*Math.PI)*1.8/dt*sensitivity);
      active.angle=angle;active.time=now;setRotation(active.rotation);
    }}
    onPointerUp={e=>{const active=drag.current;if(!active||active.id!==e.pointerId)return;if(!active.session){const delta=(e.clientX-active.x)*1.9/active.width;if(Math.abs(delta)>0.01)onNudge(delta);}release();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={e=>{if(drag.current?.id===e.pointerId)release();}} onLostPointerCapture={e=>{if(drag.current?.id===e.pointerId)release();}}
    onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onNudge(e.key==='ArrowLeft'?-.25:.25);}}}>
    <img src={jogDial} alt="" draggable={false} style={{transform:`rotate(${rotation??position*90}deg)`}} />
    <span className="hardware-jog-hub" aria-hidden="true">DΞ</span>
  </button>{error&&<span role="alert">{error}</span>}</>;
}
