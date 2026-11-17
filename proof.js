/* SRII i-TRACK proof of handover photos.
 * The person handing documents over takes a photo of the receiver holding them.
 * Before it is uploaded, the app prints the transmittal number, the receiver's
 * name, the date and time, and who took the photo onto the picture, and makes
 * it small (about 0.3 MB). app.js saves and loads them (it holds the database
 * client); this file only draws the screens and the stamp.
 */
(()=>{
'use strict';
const icon=n=>typeof window.ITRACK_ICON==='function'?window.ITRACK_ICON(n):'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_SIDE=1600;
const FONT='Inter, "Segoe UI", Arial, sans-serif';
const stampTime=d=>new Date(d).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'});

async function readImage(file){
 if('createImageBitmap' in window){
  try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){/* fall back */}
 }
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file);const img=new Image();
  img.onload=()=>{resolve(img);setTimeout(()=>URL.revokeObjectURL(url),1000);};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('The photo could not be read. Please take it again.'));};
  img.src=url;
 });
}

// Make one line fit the width: smaller letters first, then cut with "…".
function fit(ctx,text,maxWidth,size,weight){
 let s=size;
 const set=()=>{ctx.font=weight+' '+s+'px '+FONT;};
 set();
 while(s>11&&ctx.measureText(text).width>maxWidth){s--;set();}
 if(ctx.measureText(text).width<=maxWidth)return text;
 let t=text;
 while(t.length>3&&ctx.measureText(t+'…').width>maxWidth)t=t.slice(0,-1);
 return t+'…';
}

// The photo, with a dark band at the bottom holding the proof details.
function stamp(canvas,img,info){
 const scale=Math.min(1,MAX_SIDE/Math.max(img.width,img.height));
 const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
 canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');
 ctx.drawImage(img,0,0,w,h);
 const size=Math.max(13,Math.min(40,Math.round(w/40)));
 const pad=Math.round(size*.65),gap=Math.round(size*1.32),edge=Math.max(5,Math.round(size*.28));
 const receiver=String(info.receiver||'').trim()||'(type the name of the receiver)';
 const position=String(info.position||'').trim();
 const lines=[
  {weight:700,size,color:'#ffd66b',text:'PROOF OF HANDOVER'+(info.number?' · '+info.number:'')},
  {weight:600,size:Math.round(size*.92),color:'#ffffff',text:'Received by: '+receiver+(position?' · '+position:'')},
  {weight:500,size:Math.round(size*.82),color:'#e7ecf7',text:stampTime(info.when||Date.now())+' · Photo by '+(info.taker||'i-TRACK user')+' · SRII i-TRACK'}
 ];
 const band=pad*2+gap*(lines.length-1)+size;
 ctx.fillStyle='rgba(9,24,56,.74)';ctx.fillRect(0,h-band,w,band);
 ctx.fillStyle='#f2b630';ctx.fillRect(0,h-band,edge,band);
 ctx.textBaseline='top';
 const x=edge+pad,maxWidth=w-x-pad;
 lines.forEach((line,i)=>{
  const text=fit(ctx,line.text,maxWidth,line.size,line.weight);
  ctx.fillStyle=line.color;ctx.fillText(text,x,h-band+pad+i*gap);
 });
}
const toJpeg=(canvas,quality)=>new Promise((resolve,reject)=>
 canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the photo.')),'image/jpeg',quality));

/* ---------- taking the photo ---------- */
function open({number,taker,save,onSaved}={}){
 if(document.querySelector('.proof-backdrop'))return;
 let img=null,taken=0,busy=false,timer=0;
 const back=document.createElement('div');back.className='scan-backdrop proof-backdrop';
 back.innerHTML='<div class="scan-dialog proof-dialog" role="dialog" aria-modal="true" aria-labelledby="proof-title">'+
  '<header class="scan-head"><div><h3 id="proof-title">Proof of handover'+(number?' · '+esc(number):'')+'</h3>'+
  '<p>Take one photo of the person who received the documents, holding them. Ask them first.</p></div>'+
  '<button type="button" class="scan-close" data-proof="close" aria-label="Close">'+icon('x')+'</button></header>'+
  '<div class="scan-add"><label class="btn">'+icon('camera')+'<span data-proof-label>Take photo</span><input type="file" accept="image/*" capture="environment" data-proof="camera" hidden></label>'+
  '<label class="btn alt">'+icon('upload')+'Choose photo<input type="file" accept="image/*" data-proof="pick" hidden></label></div>'+
  '<div class="proof-stage"><p class="scan-empty">'+icon('camera')+'<span>Your photo will appear here, with the date, time and names printed on it.</span></p>'+
  '<canvas class="proof-canvas" hidden></canvas></div>'+
  '<div class="proof-fields">'+
   '<label class="proof-field"><span>Received by <b aria-hidden="true">*</b></span><input type="text" data-proof="name" maxlength="120" autocomplete="off" placeholder="Name of the person who received them"></label>'+
   '<label class="proof-field"><span>Position or office</span><input type="text" data-proof="position" maxlength="120" autocomplete="off" placeholder="e.g. Records Section, Division Office"></label></div>'+
  '<label class="scan-clean proof-consent"><input type="checkbox" data-proof="agree"> <span>I asked the receiver and they agreed to be in the photo.</span></label>'+
  '<p class="proof-privacy">Only the people on this transmittal and District administrators can see the photo.</p>'+
  '<p class="scan-message" hidden></p>'+
  '<footer class="scan-foot"><span class="scan-count"></span>'+
  '<button type="button" class="btn alt" data-proof="close">Cancel</button>'+
  '<button type="button" class="btn" data-proof="save" disabled>'+icon('check')+'Save proof photo</button></footer></div>';
 document.body.append(back);document.body.classList.add('scan-open');
 const $=sel=>back.querySelector(sel);
 const canvas=$('.proof-canvas');
 const fields=()=>({receiver:$('[data-proof="name"]').value.trim(),position:$('[data-proof="position"]').value.trim(),agree:$('[data-proof="agree"]').checked});
 const message=(text,bad)=>{const m=$('.scan-message');m.hidden=!text;m.textContent=text||'';m.classList.toggle('is-bad',!!bad);};
 const ready=()=>{const f=fields();$('[data-proof="save"]').disabled=busy||!img||f.receiver.length<2||!f.agree;};
 const draw=()=>{if(!img)return;const f=fields();stamp(canvas,img,{number,taker,receiver:f.receiver,position:f.position,when:taken});};
 const close=()=>{
  clearTimeout(timer);if(img?.close)img.close();back.remove();
  if(!document.querySelector('.scan-backdrop'))document.body.classList.remove('scan-open');
  document.removeEventListener('keydown',onKey);
 };
 const onKey=e=>{if(e.key==='Escape'&&!busy)close();};
 document.addEventListener('keydown',onKey);
 back.addEventListener('change',async e=>{
  const what=e.target.dataset.proof;
  if(what==='camera'||what==='pick'){
   const file=e.target.files?.[0];e.target.value='';
   if(!file)return;
   if(!/^image\//.test(file.type)&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)){message('Please choose a photo.',true);return;}
   try{
    const next=await readImage(file);
    if(img?.close)img.close();
    img=next;taken=Date.now();message('');
    $('.proof-stage .scan-empty').hidden=true;canvas.hidden=false;
    $('[data-proof-label]').textContent='Take another photo';
    draw();
   }catch(err){message(err?.message||String(err),true);}
  }
  ready();
 });
 back.addEventListener('input',e=>{
  const what=e.target.dataset.proof;
  if(what==='name'||what==='position'){clearTimeout(timer);timer=setTimeout(draw,120);}
  ready();
 });
 back.addEventListener('click',async e=>{
  const b=e.target.closest('[data-proof]');if(!b||busy)return;
  const what=b.dataset.proof;
  if(what==='close'){close();return;}
  if(what!=='save')return;
  const f=fields();
  if(!img){message('Take the photo first.',true);return;}
  if(f.receiver.length<2){message('Type the name of the person who received the documents.',true);return;}
  if(!f.agree){message('Ask the receiver first, then tick the box.',true);return;}
  busy=true;ready();b.textContent='Saving…';
  try{
   clearTimeout(timer);draw();
   let blob=await toJpeg(canvas,.82);
   if(blob.size>4.5*1024*1024)blob=await toJpeg(canvas,.6);
   await save(blob,f);
   close();onSaved?.();
  }catch(err){
   busy=false;b.innerHTML=icon('check')+'Save proof photo';ready();
   message(err?.message||String(err),true);
  }
 });
 $('[data-proof="close"]').focus();
}

/* ---------- showing the photos ---------- */
function thumbs(list,key){
 return '<div class="proof-list">'+list.map(p=>'<button type="button" class="proof-thumb" data-a="proof-view" data-key="'+esc(key)+'" data-id="'+esc(p.id)+'" aria-label="Open the proof photo: received by '+esc(p.receiver_name)+'">'+
  '<span class="proof-img">'+(p.url?'<img src="'+esc(p.url)+'" alt="" loading="lazy">':icon('camera'))+'</span>'+
  '<span class="proof-cap"><strong>'+esc(p.receiver_name)+'</strong>'+
  '<small>'+(p.transmittal_number?esc(p.transmittal_number)+' · ':'')+esc(stampTime(p.taken_at))+'</small></span></button>').join('')+'</div>';
}

function panel({key,kind,id,number,canAdd,st}={}){
 st=st||{loading:true};
 if(st.error==='unavailable')return '';
 const list=st.list||[];
 const body=st.loading&&!list.length?'<p class="proof-note">Loading photos…</p>':
  st.error?'<p class="proof-note">The photos could not load: '+esc(st.error)+'</p>':
  list.length?thumbs(list,key):
  '<p class="proof-note">'+(canAdd?'No proof photo yet. Take one when you hand the documents over.':'No proof photo yet.')+'</p>';
 return '<section class="proof-box" data-proof-box="'+esc(key)+'">'+
  '<div class="proof-head"><span class="proof-icon" aria-hidden="true">'+icon('camera')+'</span>'+
  '<div class="proof-title"><strong>Proof of handover</strong><small>'+
  (canAdd?'Optional. A photo of the person who received the documents, holding them.':'Photos taken when these documents were handed over.')+'</small></div>'+
  (canAdd?'<button type="button" class="btn alt" data-a="proof-take" data-kind="'+esc(kind)+'" data-id="'+esc(id)+'" data-number="'+esc(number||'')+'">'+icon('camera')+'Take proof photo</button>':'')+
  '</div>'+body+'</section>';
}

function view(p,{canRemove,onDownload,onRemove}={}){
 if(document.querySelector('.proof-viewer'))return;
 let busy=false;
 const back=document.createElement('div');back.className='scan-backdrop proof-viewer';
 back.innerHTML='<div class="scan-dialog proof-view-dialog" role="dialog" aria-modal="true" aria-labelledby="proof-view-title">'+
  '<header class="scan-head"><div><h3 id="proof-view-title">Proof of handover'+(p.transmittal_number?' · '+esc(p.transmittal_number):'')+'</h3>'+
  '<p>Received by <strong>'+esc(p.receiver_name)+'</strong>'+(p.receiver_position?', '+esc(p.receiver_position):'')+
  '. Photo by '+esc(p.taken_by_name||'an i-TRACK user')+', '+esc(stampTime(p.taken_at))+'.</p></div>'+
  '<button type="button" class="scan-close" data-pv="close" aria-label="Close">'+icon('x')+'</button></header>'+
  '<div class="proof-full">'+(p.url?'<img src="'+esc(p.url)+'" alt="Proof of handover photo">':
   '<p class="scan-empty">'+icon('camera')+'<span>The photo could not load. Close it and open it again.</span></p>')+'</div>'+
  '<p class="scan-message" hidden></p>'+
  '<footer class="scan-foot">'+(canRemove?'<button type="button" class="btn alt proof-remove" data-pv="remove">'+icon('trash')+'Remove photo</button>':'')+
  '<span class="scan-count"></span>'+
  '<button type="button" class="btn alt" data-pv="download">'+icon('download')+'Download</button>'+
  '<button type="button" class="btn" data-pv="close">Close</button></footer></div>';
 document.body.append(back);document.body.classList.add('scan-open');
 const $=sel=>back.querySelector(sel);
 const message=(text,bad)=>{const m=$('.scan-message');m.hidden=!text;m.textContent=text||'';m.classList.toggle('is-bad',!!bad);};
 const close=()=>{back.remove();if(!document.querySelector('.scan-backdrop'))document.body.classList.remove('scan-open');document.removeEventListener('keydown',onKey);};
 const onKey=e=>{if(e.key==='Escape'&&!busy)close();};
 document.addEventListener('keydown',onKey);
 back.addEventListener('click',async e=>{
  if(e.target===back&&!busy){close();return;}
  const b=e.target.closest('[data-pv]');if(!b||busy)return;
  const what=b.dataset.pv;
  if(what==='close'){close();return;}
  const label=b.innerHTML;busy=true;b.disabled=true;message('');
  try{
   if(what==='download'){b.textContent='Downloading…';await onDownload?.(p);}
   if(what==='remove'){b.textContent='Removing…';if(await onRemove?.(p)){busy=false;close();return;}}
  }catch(err){message(err?.message||String(err),true);}
  busy=false;b.disabled=false;b.innerHTML=label;
 });
 $('[data-pv="close"]').focus();
}

window.ITRACK_PROOF=Object.freeze({open,view,panel,thumbs,stamp,stampTime});
})();
