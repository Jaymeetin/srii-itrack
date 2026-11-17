/* SRII i-TRACK camera scan: photos of paper pages become one PDF, in the browser.
 * Nothing leaves the phone until the person uploads the PDF the usual way.
 * Pages can be added, turned, reordered and removed; an optional clean mode
 * makes them look like a scanner copy (white paper, dark text).
 */
(()=>{
'use strict';
const icon=n=>typeof window.ITRACK_ICON==='function'?window.ITRACK_ICON(n):'';
const MAX_SIDE=1700;              // long side of each page image, in pixels
const A4=[595.28,841.89];         // points
const MARGIN=18;                  // points around each picture
const LIMIT=30*1024*1024;
const num=v=>Number(v.toFixed(2)).toString();

async function readImage(file){
 if('createImageBitmap' in window){
  try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){/* fall back */}
 }
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file);const img=new Image();
  img.onload=()=>{resolve(img);setTimeout(()=>URL.revokeObjectURL(url),1000);};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('One of the photos could not be read. Try taking it again.'));};
  img.src=url;
 });
}

// Grey, then stretch so the paper turns white and the writing turns dark.
function cleanUp(ctx,w,h){
 const image=ctx.getImageData(0,0,w,h),px=image.data,hist=new Uint32Array(256);
 for(let i=0;i<px.length;i+=4){const y=(px[i]*299+px[i+1]*587+px[i+2]*114)/1000|0;px[i]=y;hist[y]++;}
 const total=w*h;let acc=0,lo=0,hi=255;
 for(let v=0;v<256;v++){acc+=hist[v];if(acc>=total*0.02){lo=v;break;}}
 acc=0;for(let v=255;v>=0;v--){acc+=hist[v];if(acc>=total*0.30){hi=v;break;}}
 if(hi-lo<48)lo=Math.max(0,hi-48);
 const span=hi-lo,lut=new Uint8ClampedArray(256);
 for(let v=0;v<256;v++){const t=Math.min(1,Math.max(0,(v-lo)/span));lut[v]=Math.round(255*Math.pow(t,1.35));}
 for(let i=0;i<px.length;i+=4){const y=lut[px[i]];px[i]=y;px[i+1]=y;px[i+2]=y;}
 ctx.putImageData(image,0,0);
}

async function renderPage(page,clean){
 const img=await readImage(page.file);
 const iw=img.width,ih=img.height,scale=Math.min(1,MAX_SIDE/Math.max(iw,ih));
 const w=Math.round(iw*scale),h=Math.round(ih*scale),turn=((page.turn%360)+360)%360,side=turn===90||turn===270;
 const canvas=document.createElement('canvas');canvas.width=side?h:w;canvas.height=side?w:h;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(turn*Math.PI/180);ctx.drawImage(img,-w/2,-h/2,w,h);
 ctx.setTransform(1,0,0,1,0,0);
 if(img.close)img.close();
 if(clean)cleanUp(ctx,canvas.width,canvas.height);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare a page.')),'image/jpeg',clean?0.72:0.8));
 return {bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height};
}

// A small PDF writer: one A4 page per picture (landscape pictures get a landscape page).
function buildPdf(images){
 const enc=new TextEncoder(),parts=[],offsets=[];let length=0;
 const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);length+=b.length;};
 const obj=(n,body)=>{offsets[n]=length;add(n+' 0 obj\n');if(typeof body==='function')body();else add(body);add('\nendobj\n');};
 add('%PDF-1.4\n');add(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] /Count '+images.length+' >>');
 images.forEach((im,i)=>{
  const wide=im.width>im.height,pw=wide?A4[1]:A4[0],ph=wide?A4[0]:A4[1];
  const s=Math.min((pw-2*MARGIN)/im.width,(ph-2*MARGIN)/im.height);
  const dw=im.width*s,dh=im.height*s,x=(pw-dw)/2,y=(ph-dh)/2;
  const pageN=3+i*3,imgN=pageN+1,drawN=pageN+2;
  obj(pageN,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+num(pw)+' '+num(ph)+'] /Resources << /XObject << /Im0 '+imgN+' 0 R >> >> /Contents '+drawN+' 0 R >>');
  obj(imgN,()=>{add('<< /Type /XObject /Subtype /Image /Width '+im.width+' /Height '+im.height+
   ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.bytes.length+' >>\nstream\n');add(im.bytes);add('\nendstream');});
  const draw='q '+num(dw)+' 0 0 '+num(dh)+' '+num(x)+' '+num(y)+' cm /Im0 Do Q';
  obj(drawN,'<< /Length '+draw.length+' >>\nstream\n'+draw+'\nendstream');
 });
 const count=3+images.length*3,start=length;
 let table='xref\n0 '+count+'\n0000000000 65535 f \n';
 for(let k=1;k<count;k++)table+=String(offsets[k]).padStart(10,'0')+' 00000 n \n';
 add(table+'trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}

async function makePdf(pages,clean,onProgress){
 const images=[];
 for(let i=0;i<pages.length;i++){onProgress?.(i+1,pages.length);images.push(await renderPage(pages[i],clean));}
 const blob=buildPdf(images);
 const day=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
 return new File([blob],'Scanned_'+day+'_'+pages.length+'-page'+(pages.length===1?'':'s')+'.pdf',{type:'application/pdf'});
}

function open({onDone}={}){
 if(document.querySelector('.scan-backdrop'))return;
 const pages=[];let clean=true,busy=false;
 const back=document.createElement('div');back.className='scan-backdrop';
 back.innerHTML='<div class="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title">'+
  '<header class="scan-head"><div><h3 id="scan-title">Scan paper with camera</h3>'+
  '<p>Take a photo of each page, flat and in good light. The app joins them into one PDF.</p></div>'+
  '<button type="button" class="scan-close" data-scan="close" aria-label="Close">'+icon('x')+'</button></header>'+
  '<div class="scan-add"><label class="btn">'+icon('camera')+'Take a photo of a page<input type="file" accept="image/*" capture="environment" data-scan="camera" hidden></label>'+
  '<label class="btn alt">'+icon('upload')+'Choose photos<input type="file" accept="image/*" multiple data-scan="pick" hidden></label></div>'+
  '<div class="scan-pages" aria-live="polite"></div>'+
  '<label class="scan-clean"><input type="checkbox" data-scan="clean" checked> <span><strong>Clean black and white</strong> · makes it look like a scanner copy</span></label>'+
  '<p class="scan-message" hidden></p>'+
  '<footer class="scan-foot"><span class="scan-count">No pages yet</span>'+
  '<button type="button" class="btn alt" data-scan="close">Cancel</button>'+
  '<button type="button" class="btn" data-scan="done" disabled>'+icon('check')+'Make PDF and add it</button></footer></div>';
 document.body.append(back);document.body.classList.add('scan-open');
 const $=sel=>back.querySelector(sel);
 const message=(text,bad)=>{const m=$('.scan-message');m.hidden=!text;m.textContent=text||'';m.classList.toggle('is-bad',!!bad);};
 const draw=()=>{
  $('.scan-pages').innerHTML=pages.length?pages.map((p,i)=>'<figure class="scan-page">'+
   '<div class="scan-thumb"><img src="'+p.url+'" alt="Page '+(i+1)+'" style="transform:rotate('+p.turn+'deg)"'+(clean?' class="is-clean"':'')+'></div>'+
   '<figcaption>Page '+(i+1)+'</figcaption><div class="scan-tools">'+
   '<button type="button" data-scan="turn" data-i="'+i+'" aria-label="Turn page '+(i+1)+'">'+icon('refresh')+'</button>'+
   '<button type="button" data-scan="left" data-i="'+i+'" aria-label="Move page '+(i+1)+' earlier"'+(i?'':' disabled')+'>'+icon('chevronLeft')+'</button>'+
   '<button type="button" data-scan="right" data-i="'+i+'" aria-label="Move page '+(i+1)+' later"'+(i<pages.length-1?'':' disabled')+'>'+icon('chevronRight')+'</button>'+
   '<button type="button" data-scan="drop" data-i="'+i+'" aria-label="Take out page '+(i+1)+'">'+icon('x')+'</button></div></figure>').join(''):
   '<p class="scan-empty">'+icon('camera')+'<span>Your pages will appear here.</span></p>';
  $('.scan-count').textContent=pages.length?pages.length+' page'+(pages.length===1?'':'s'):'No pages yet';
  $('[data-scan="done"]').disabled=!pages.length||busy;
 };
 const addFiles=list=>{
  const pictures=[...list].filter(f=>/^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  if(pictures.length<list.length)message('Only photos can be added here.',true);else message('');
  for(const file of pictures)pages.push({file,url:URL.createObjectURL(file),turn:0});
  draw();
 };
 const close=()=>{for(const p of pages)URL.revokeObjectURL(p.url);back.remove();document.body.classList.remove('scan-open');document.removeEventListener('keydown',onKey);};
 const onKey=e=>{if(e.key==='Escape'&&!busy)close();};
 document.addEventListener('keydown',onKey);
 back.addEventListener('change',e=>{
  const what=e.target.dataset.scan;
  if(what==='camera'||what==='pick'){addFiles(e.target.files||[]);e.target.value='';}
  if(what==='clean'){clean=e.target.checked;draw();}
 });
 back.addEventListener('click',async e=>{
  const b=e.target.closest('[data-scan]');if(!b||busy)return;
  const what=b.dataset.scan,i=Number(b.dataset.i);
  if(what==='close'){close();return;}
  if(what==='turn'){pages[i].turn=(pages[i].turn+90)%360;draw();return;}
  if(what==='left'&&i>0){[pages[i-1],pages[i]]=[pages[i],pages[i-1]];draw();return;}
  if(what==='right'&&i<pages.length-1){[pages[i+1],pages[i]]=[pages[i],pages[i+1]];draw();return;}
  if(what==='drop'){URL.revokeObjectURL(pages[i].url);pages.splice(i,1);draw();return;}
  if(what==='done'&&pages.length){
   busy=true;draw();b.textContent='Making the PDF…';
   try{
    const file=await makePdf(pages,clean,(n,total)=>{b.textContent='Preparing page '+n+' of '+total+'…';});
    if(file.size>LIMIT)throw Error('The PDF is larger than 30 MB. Take out some pages, or scan them in two parts.');
    onDone?.(file);close();
   }catch(err){busy=false;b.innerHTML=icon('check')+'Make PDF and add it';draw();message(err?.message||String(err),true);}
  }
 });
 draw();
 $('[data-scan="close"]').focus();
}

window.ITRACK_SCAN=Object.freeze({open,makePdf,buildPdf});
})();
