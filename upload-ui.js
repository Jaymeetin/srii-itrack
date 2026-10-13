/* SRII i-TRACK authenticated school document upload UI.
 * Backend is authoritative: never rely on UI visibility for permissions.
 */
(() => {
"use strict";
const root=document.getElementById("app");
const settings=window.ITRACK_CONFIG;
if(!root||!window.supabase||!settings?.url||!settings?.publishableKey)return;
const db=window.supabase.createClient(settings.url,settings.publishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const MB=4*1024*1024;
const TYPES={
 ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",
 ".webp":"image/webp",".pdf":"application/pdf",".doc":"application/msword",
 ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const displayTime=x=>x?new Date(x).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Manila"}):"—";
const size=x=>x>=1048576?(x/1048576).toFixed(2)+" MB":(x/1024).toFixed(1)+" KB";
const mimeFor=file=>{
 const extension=/\.[^.]+$/.exec(file.name)?.[0]?.toLowerCase();
 return TYPES[extension]||"";
};
let lastMount=null;
function notify(node,text,kind=""){
 const message=node.querySelector(".iu-message");
 if(!message||!node.isConnected)return;
 message.hidden=false;message.textContent=text;
 message.className="iu-message"+(kind?" "+kind:"");
}
function markPanel(){
 const content=root.querySelector(".app .content");
 if(!content)return;
 const conn=[...content.querySelectorAll(".panel")].find(x=>x.querySelector("h3")?.textContent?.trim()==="Connections");
 if(conn){
   const paragraphs=conn.querySelectorAll("p");
   if(paragraphs.length>=3){
     paragraphs[1].innerHTML='<span class="tag warn">PILOT</span> DepEd Google Drive uploads';
     paragraphs[2].textContent="Authenticated uploads are being tested with district administrators and SINUNDOLAN ES before wider rollout.";
   }
 }
 const title=content.querySelector("h1")?.textContent?.trim();
 const kind=title==="Announcements"?"announcement":title==="My Documents"?"document":null;
 if(!kind)return;
 if(content.querySelector(".itrack-upload"))return;
 const newPanel=document.createElement("section");
 newPanel.className="panel itrack-upload";
 newPanel.innerHTML=
  '<div class="iu-heading"><div><span class="iu-kicker">DEPED GOOGLE DRIVE</span>'+
  '<h3>'+ (kind==="announcement"?"Submit a Requirement":"Attach a Document") +'</h3></div>'+
  '<span class="iu-pilot">LIMITED ROLLOUT</span></div>'+
  '<p class="iu-description">'+(kind==="announcement"?
   'Choose a district requirement assigned to your school, then upload your PDF, Word document, or screenshot. Revised submissions keep their version history.':
   'Choose a document you are authorized to access. Upload supporting files without changing its permanent tracking number.'
  )+'</p>'+
  '<div class="iu-loading iu-message">Checking your approved account and available '+(kind==="announcement"?"requirements":"documents")+'…</div>'+
  '<div class="iu-controls" hidden>'+
   '<div class="field iu-target"><label for="iu-target-'+kind+'">'+(kind==="announcement"?"Assigned requirement":"Routed document")+'</label><select id="iu-target-'+kind+'" class="iu-select"></select></div>'+
   '<div class="iu-date" aria-live="polite"></div>'+
   '<div class="iu-file"><span class="iu-file-icon" aria-hidden="true">↥</span><div class="iu-file-inner"><label for="iu-file-'+kind+'">Choose a PDF, Word or image file</label>'+
    '<input id="iu-file-'+kind+'" class="iu-input" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" aria-label="Select document to upload"></div></div>'+
   '<div class="iu-selection">No document selected</div>'+
   '<img class="iu-image" alt="Preview of selected screenshot" hidden>'+
   '<div class="iu-actions"><button type="button" class="btn alt iu-compress" disabled>Compress File</button>'+
    '<button type="button" class="btn iu-upload" disabled>Upload to Google Drive</button></div>'+
   '<p class="iu-limits">Maximum 4 MB per file. Compression is optional and applies to images only. For PDF and Word files, the original is preserved. Avoid uploading confidential documents while this pilot is being tested.</p>'+
   '<div class="iu-history" aria-live="polite"><h4>Submission history</h4><div class="iu-history-list">Select a requirement to view its records.</div></div>'+
  '</div>'+
  '<div class="iu-message" hidden aria-live="polite"></div>';
 const section=content.querySelector(".sectionhead");
 if(section)section.after(newPanel);else content.prepend(newPanel);
 if(kind==="document"){
  const old=[...content.querySelectorAll(".panel")].find(x=>x!==newPanel&&x.querySelector("h3")?.textContent?.trim()==="Compress a Screenshot");
  if(old)old.hidden=true;
 }
 lastMount=newPanel;
 initialize(newPanel,kind);
}
function setProcessing(node,yes){
 node.dataset.processing=yes?"yes":"no";
 const ready=!yes&&!!node._iuFile&&!!node.querySelector(".iu-select")?.value&&node._iuFile.size<=MB;
 const upload=node.querySelector(".iu-upload");
 if(upload){upload.disabled=!ready;upload.textContent=yes?"Uploading, please wait…":"Upload to Google Drive";}
 const comp=node.querySelector(".iu-compress");
 if(comp)comp.disabled=yes||!node._iuOriginal||!/^image\//.test(mimeFor(node._iuOriginal));
 node.querySelector(".iu-input")?.toggleAttribute("disabled",yes);
 node.querySelector(".iu-select")?.toggleAttribute("disabled",yes);
}
function preview(node,file){
 const image=node.querySelector(".iu-image");
 if(!image)return;
 if(node._iuBlobUrl){URL.revokeObjectURL(node._iuBlobUrl);node._iuBlobUrl=null;}
 if(file&&mimeFor(file).startsWith("image/")){
  node._iuBlobUrl=URL.createObjectURL(file);
  image.src=node._iuBlobUrl;image.hidden=false;
 }else{image.hidden=true;image.removeAttribute("src");}
}
function updateFile(node){
 const f=node._iuFile;
 const caption=node.querySelector(".iu-selection");
 caption.innerHTML=f?
  'Selected: <strong>'+esc(f.name)+'</strong> · '+size(f.size)+(f.size>MB?' · exceeds 4 MB limit':''):
  'No document selected';
 preview(node,f);
 setProcessing(node,false);
}
async function initialize(node,kind){
 try{
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user)throw Error("Please sign in again to submit documents.");
  const p=await db.from("profiles").select("id,school_id,role,account_status").eq("id",user.id).single();
  if(p.error)throw p.error;
  if(p.data?.account_status!=="active")throw Error("Your account must be approved before uploading.");
  const profile=p.data;
  const admin=["main_admin","backup_admin"].includes(profile.role);
  if(!admin){
   const school=await db.from("schools").select("name,is_active").eq("id",profile.school_id).single();
   if(school.error||!school.data?.is_active)throw Error("Your approved school is not active.");
   if(profile.role!=="school_user"||school.data.name!=="SINUNDOLAN ES")
    throw Error("Secure file uploads are currently available to the district administrators and SINUNDOLAN ES pilot accounts only.");
  }
  let options=[];
  if(kind==="announcement"){
   const a=await db.from("announcement_assignments").select("id,announcement_id,school_id,assigned_user_id").eq("obligation_status","required");
   if(a.error)throw a.error;
   const n=await db.from("announcements").select("id,title,status,deadline_at").eq("status","open").order("created_at",{ascending:false});
   if(n.error)throw n.error;
   options=(a.data||[]).filter(a=>a.assigned_user_id===user.id||
    (!!profile.school_id && a.school_id===profile.school_id)).map(a=>{
    const ann=(n.data||[]).find(x=>x.id===a.announcement_id);
    return ann?{id:a.id,label:ann.title,deadline:ann.deadline_at}:null;
   }).filter(Boolean);
  }else{
   const d=await db.from("documents").select("id,tracking_number,subject").order("created_at",{ascending:false}).limit(200);
   if(d.error)throw d.error;
   options=(d.data||[]).map(x=>({id:x.id,label:x.tracking_number+" — "+x.subject,deadline:null}));
  }
  if(!node.isConnected)return;
  const loading=node.querySelector(".iu-loading");
  if(loading)loading.remove();
  if(!options.length){
   notify(node,kind==="announcement"?
    "No active announcement requirements are assigned to this account. District administrators cannot submit on behalf of a school unless explicitly assigned.":
    "No routed documents are available for your account.","");
   return;
  }
  node._iuOptions=options;
  const select=node.querySelector(".iu-select");
  select.innerHTML=options.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join("");
  node.querySelector(".iu-controls").hidden=false;
  node._iuOriginal=null;node._iuFile=null;
  const input=node.querySelector(".iu-input");
  input.addEventListener("change",()=>{
   const file=input.files?.[0]||null;
   node._iuOriginal=file;node._iuFile=file;
   const mime=file&&mimeFor(file);
   if(file&&!mime){
    node._iuFile=null;notify(node,"Unsupported file extension. Choose PDF, Word, JPG, PNG or WebP.","error");
   }else{node.querySelector(".iu-message").hidden=true;}
   updateFile(node);
  });
  select.addEventListener("change",()=>updateTarget(node,kind));
  node.querySelector(".iu-compress").addEventListener("click",()=>compress(node));
  node.querySelector(".iu-upload").addEventListener("click",()=>upload(node,kind));
  await updateTarget(node,kind);
 }catch(e){
  if(!node.isConnected)return;
  node.querySelector(".iu-loading")?.remove();
  notify(node,e?.message||String(e),"error");
 }
}
async function updateTarget(node,kind){
 const id=node.querySelector(".iu-select")?.value;
 const opt=node._iuOptions?.find(x=>x.id===id);
 const extra=node.querySelector(".iu-date");
 extra.textContent=opt?.deadline?"Deadline: "+displayTime(opt.deadline)+" (Philippine time)":"";
 await refreshHistory(node,kind);
 setProcessing(node,false);
}
async function refreshHistory(node,kind){
 const id=node.querySelector(".iu-select")?.value;
 const history=node.querySelector(".iu-history-list");
 if(!id||!history)return;
 history.textContent="Loading saved files…";
 try{
  const query=kind==="announcement"?
   db.from("submissions").select("id,original_filename,content_type,file_size_bytes,first_received_at,version_number,verification_status,storage_status").eq("assignment_id",id).order("version_number",{ascending:false}).limit(6):
   db.from("document_attachments").select("id,original_filename,content_type,file_size_bytes,uploaded_at").eq("document_id",id).order("uploaded_at",{ascending:false}).limit(6);
  const {data,error}=await query;
  if(error)throw error;
  if(!node.isConnected||node.querySelector(".iu-select")?.value!==id)return;
  if(!data?.length){history.textContent="No files submitted for this requirement yet.";return;}
  history.innerHTML=data.map(x=>{
   const state=kind==="announcement"?x.verification_status:"stored";
   const when=displayTime(kind==="announcement"?x.first_received_at:x.uploaded_at);
   const details=(kind==="announcement"?"Version "+x.version_number+" · ":"")+size(x.file_size_bytes)+" · "+when;
   const available=kind==="document"||x.storage_status==="uploaded";
   const viewable=x.content_type==="application/pdf"||["image/png","image/jpeg","image/webp"].includes(x.content_type);
   const actions=available?
     '<div class="iu-file-actions">'+
     (viewable?'<button type="button" class="btn tiny alt iu-file-action" data-mode="view" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-name="'+esc(x.original_filename)+'">View</button>':'')+
     '<button type="button" class="btn tiny alt iu-file-action" data-mode="download" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-name="'+esc(x.original_filename)+'">Download</button></div>':
     '<span class="iu-archived">Archived offline</span>';
   return '<div class="iu-history-item"><div><strong>'+esc(x.original_filename)+'</strong><small>'+esc(details)+'</small></div>'+
    '<div class="iu-history-controls"><span class="iu-state '+esc(state)+'">'+esc(state.toUpperCase())+'</span>'+actions+'</div></div>';
  }).join("");
 }catch(e){if(node.isConnected)history.textContent="Could not load history: "+(e?.message||e);}
}
async function compress(node){
 const original=node._iuOriginal;
 if(!original||!/^image\//.test(mimeFor(original))){notify(node,"Choose an image first. PDF and Word files are preserved without compression.","error");return;}
 try{
  const bmp=await createImageBitmap(original);
  const scale=Math.min(1,2100/Math.max(bmp.width,bmp.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bmp.width*scale));
  canvas.height=Math.max(1,Math.round(bmp.height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
  bmp.close?.();
  const blob=await new Promise(ok=>canvas.toBlob(ok,"image/webp",0.84));
  if(!blob)throw Error("Image compression is unavailable on this browser.");
  if(blob.size>=original.size){
   node._iuFile=original;notify(node,"Original file is already smaller; no compression was applied.");
  }else{
   const filename=original.name.replace(/\.[^.]+$/,"").slice(0,150)+"-compressed.webp";
   node._iuFile=new File([blob],filename,{type:"image/webp"});
   notify(node,"Compression complete: "+size(original.size)+" → "+size(blob.size)+". Inspect the preview to ensure all text is readable.","success");
  }
  updateFile(node);
 }catch(e){notify(node,"Compression failed: "+(e?.message||String(e)),"error");}
}
async function toBase64(file){
 return await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(",")[1]);
  reader.onerror=()=>reject(Error("Unable to read the selected file"));
  reader.readAsDataURL(file);
 });
}
async function upload(node,kind){
 if(node.dataset.processing==="yes")return;
 const f=node._iuFile,id=node.querySelector(".iu-select")?.value;
 const target=node._iuOptions?.find(x=>x.id===id);
 if(!f||!id||!target){notify(node,"Choose both a requirement and a file.","error");return;}
 if(f.size>MB||f.size<1){notify(node,"File must be between 1 byte and 4 MB. Compress screenshots first if needed.","error");return;}
 const mime=mimeFor(f);
 if(!mime){notify(node,"File extension is not supported.","error");return;}
 if(!confirm("Upload "+f.name+" ("+size(f.size)+") for "+target.label+" to the private district Google Drive?"))return;
 setProcessing(node,true);
 notify(node,"Checking your account and securely uploading. Keep this page open.");
 let timer=null;
 try{
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("Your session expired. Please sign in again.");
  const base64=await toBase64(f);
  const controller=new AbortController();
  timer=setTimeout(()=>controller.abort(),70000);
  const reply=await fetch(settings.url+"/functions/v1/itrack-upload",{
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    apikey:settings.publishableKey,
    Authorization:"Bearer "+session.access_token
   },
   body:JSON.stringify({
    target_type:kind,target_id:id,file_name:f.name,
    mime_type:mime,content_base64:base64
   }),
   signal:controller.signal
  });
  const body=await reply.json().catch(()=>({}));
  if(!reply.ok||!body.ok)throw Error(body.error||"Upload was not accepted. Status "+reply.status);
  node._iuFile=null;node._iuOriginal=null;node.querySelector(".iu-input").value="";
  updateFile(node);
  await refreshHistory(node,kind);
  notify(node,"File uploaded and recorded successfully! Received: "+displayTime(body.received_at)+". Your school's submission status will update in Submission Monitoring. Administrator verification is a separate step.","success");
 }catch(e){
  notify(node,e?.name==="AbortError"?
   "The upload confirmation timed out. DO NOT retry yet; ask the administrator to check Drive and the upload log for duplicates.":
   "Upload not confirmed: "+(e?.message||String(e)),"error");
 }finally{if(timer)clearTimeout(timer);if(node.isConnected)setProcessing(node,false);}
}
const observer=new MutationObserver(markPanel);
observer.observe(root,{childList:true});
markPanel();
})();