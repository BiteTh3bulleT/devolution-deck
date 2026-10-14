// Explicit local UI fixture. This never becomes application data or production startup behavior.
import {randomUUID} from 'node:crypto';
async function ipc(command,args={}) { const r=await fetch('http://127.0.0.1:47831/ipc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,args})}).then(r=>r.json());if(!r.ok)throw Error(r.error);return r.data; }
const base=await ipc('project_get');const project=structuredClone(base);project.title='Interface preview';
project.tracks=['Drums','Bass','Atmosphere','Lead'].map((name,index)=>({id:randomUUID(),name,index,track_type:'audio',clips:[{id:randomUUID(),media_asset_id:project.media[0].id,start_secs:index*2,source_offset_secs:0,duration_secs:2,slice_markers:[]}],midi_clips:[],volume_db:[-4,-8,-12,-6][index],pan:[0,0,-.2,.2][index],muted:false,solo:false,plugin_chain:{instances:[]},freeze_state:{is_frozen:false,original_clips:[],original_midi_clips:[]},take_lanes:[],comp_regions:[],armed:false}));
project.library_items=[0,1].map(i=>({id:randomUUID(),media_asset_id:project.media[0].id,title:'Reference tone '+(i+1),artist:'Native DSP fixture',bpm:i?124:120,phrase_markers:[],cue_points:[],saved_loops:[],rating:0,added_unix_ms:Date.now(),play_count:0}));
project.decks.forEach((d,i)=>{d.loaded_track={library_item_id:project.library_items[i].id,media_asset_id:project.media[0].id};d.tempo_bpm=i?124:120;d.position_secs=0;});
await ipc('project_patch',{baseline:base,project});console.log('UI fixture seeded; four tracks and two loaded decks.');
