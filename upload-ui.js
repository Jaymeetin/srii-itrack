/* SRII i-TRACK authenticated school document upload UI.
 * Backend is authoritative: never rely on UI visibility for permissions.
 */
(() => {
"use strict";
const root=document.getElementById("app");
const settings=window.ITRACK_CONFIG;
// Use the authenticated session already owned by app.js. Creating separate
// browser auth clients was causing repeated session checks on some phones.
const db=window.ITRACK_DB;
if(!root||!db||!settings?.url||!settings?.publishableKey)return;
// Frontend display gate only. Supabase Edge Functions + database RLS enforce access.
const PILOT_SCHOOL_IDS=new Set([
 "68ece6a5-941c-4385-8062-5e4223877b60", // SINUNDOLAN ES
 "d526729d-ee5e-4c1a-87f9-77f513c8778b"  // BUGO CS
]);
const MB=4*1024*1024;
async function withDeadline(promise,label,ms=18000){
 let timer;
 try{
  return await Promise.race([
   promise,
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(
    label+" took too long. Check your connection, then tap Retry Account Check."
   )),ms);})
  ]);
 }finally{clearTimeout(timer);}
}
function loadingMessage(node,text){
 const area=node.querySelector(".iu-loading");
 if(area&&node.isConnected)area.textContent=text;
}
function retryAccountCheck(node,kind){
 if(!node.isConnected)return;
 let retry=node.querySelector(".iu-retry");
 if(retry)return;
 retry=document.createElement("button");
 retry.type="button";
 retry.className="btn alt iu-retry";
 retry.textContent="Retry Account Check";
 retry.addEventListener("click",()=>{
  if(!node.isConnected)return;
  retry.remove();
  const area=node.querySelector(".iu-message:not(.iu-loading)");
  if(area)area.hidden=true;
  const progress=document.createElement("div");
  progress.className="iu-loading iu-message";
  progress.textContent="Rechecking your account…";
  node.querySelector(".iu-controls")?.before(progress);
  initialize(node,kind);
 });
 node.append(retry);
}
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
// Preserve files only in process memory (never localStorage or sessionStorage).
const liveDrafts=new Map();
let draftOwner=null;
db.auth.onAuthStateChange(event=>{
 if(event==="SIGNED_OUT"){liveDrafts.clear();draftOwner=null;}
});
function notify(node,text,kind=""){
 const message=node.querySelector(".iu-message");
 if(!message||!node.isConnected)return;
 message.hidden=false;message.textContent=text;
 message.className="iu-message"+(kind?" "+kind:"");
}
function markPanel(){
 // OIC-PSDS oversight is read-only. The upload Edge Function also rejects it.
 if(window.ITRACK_CONTEXT?.profile?.role==="oic_psds")return;
 const content=root.querySelector(".app .content");
 if(!content)return;
 const conn=[...content.querySelectorAll(".panel")].find(x=>x.querySelector("h3")?.textContent?.trim()==="Connections");
 if(conn){
   const paragraphs=conn.querySelectorAll("p");
   if(paragraphs.length>=3){
     paragraphs[1].innerHTML='<span class="tag warn">PILOT</span> DepEd Google Drive uploads';
     paragraphs[2].textContent="Authorized routed-document attachments are available district-wide. School announcement submissions still follow role-based permissions.";
   }
 }
 const host=root.querySelector("#monitor-school-upload-host");
 const title=content.querySelector("h1")?.textContent?.trim();
 const kind=host?"announcement":title==="Announcements"?"announcement":title==="My Documents"?"document":null;
 if(!kind)return;
 if((host||content).querySelector(".itrack-upload"))return;
 const newPanel=document.createElement("section");
 newPanel.className="panel itrack-upload";
 newPanel.innerHTML=
  '<div class="iu-heading"><div><span class="iu-kicker">DEPED GOOGLE DRIVE</span>'+
  '<h3>'+ (host?"Submit for This School":kind==="announcement"?"Submit a Requirement":"Attach a Document") +'</h3></div>'+
  '<span class="iu-pilot">TRIAL</span></div>'+
  '<p class="iu-description">'+(kind==="announcement"?
   (host?'Upload for this school using your own AO II account. Your identity and the represented school are recorded; only district administrators verify the submission.':'Choose an assigned requirement and upload a PDF, Word file, or image. Revised submissions keep their version history.'):
   'Attach a file to a document you created, sent, or received through routing. Files remain private to authorized participants.'
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
    '<button type="button" class="btn iu-upload" disabled>Upload to Google Drive</button></div><div class="iu-progress" hidden role="status" aria-live="polite"><span class="iu-progress-label">Preparing upload…</span><progress class="iu-progress-bar" max="100"></progress></div>'+
   '<p class="iu-limits">Maximum 4 MB per file. Compression is optional and applies to images only. For PDF and Word files, the original is preserved. Avoid uploading confidential documents while this pilot is being tested.</p>'+
   '<div class="iu-history" aria-live="polite"><h4>Submission history</h4><div class="iu-history-list">Select a requirement to view its records.</div></div>'+
  '</div>'+
  '<div class="iu-message" hidden aria-live="polite"></div>';
 if(host){
  newPanel._iuDelegated={announcementId:host.dataset.announcementId,
    schoolId:host.dataset.schoolId,assignmentId:host.dataset.assignmentId};
  host.append(newPanel);
 }else{
  const section=content.querySelector(".sectionhead");
  if(section)section.after(newPanel);else content.prepend(newPanel);
 }
 if(kind==="document"){
  const old=[...content.querySelectorAll(".panel")].find(x=>x!==newPanel&&x.querySelector("h3")?.textContent?.trim()==="Compress a Screenshot");
  if(old)old.hidden=true;
 }
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
 if(node._iuKind&&node._iuOwner){
   liveDrafts.set(node._iuKind,{
    owner:node._iuOwner,
    original:node._iuOriginal||null,
    file:node._iuFile||null,
    targetId:node.querySelector(".iu-select")?.value||null
   });
 }
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
  loadingMessage(node,"Checking your current login…");
  // The profile SELECT below is checked against authenticated RLS on the server;
  // the browser only needs the existing session, not an extra /auth/v1/user call.
  const {data:sessionData,error:userError}=await withDeadline(db.auth.getSession(),"Login check");
  const user=sessionData?.session?.user;
  if(userError||!user)throw Error("Please sign in again to submit documents.");
  loadingMessage(node,"Checking your approved account…");
  const p=await withDeadline(db.from("profiles")
   .select("id,school_id,role,position_title,account_status").eq("id",user.id).single(),"Account approval check");
  if(p.error)throw p.error;
  if(p.data?.account_status!=="active")throw Error("Your account must be approved before uploading.");
  const profile=p.data;
  if(draftOwner!==user.id){liveDrafts.clear();draftOwner=user.id;}
  node._iuOwner=user.id;
  node._iuKind=kind;
  const admin=["main_admin","backup_admin"].includes(profile.role);
  const aoII=profile.role==="school_user"&&/^(?:(?:administrative|administration)\s+officer\s+(?:ii|2)|ao\s*(?:ii|2))$/i.test((profile.position_title||"").trim());
  if(!admin){
   const school=await withDeadline(db.from("schools")
    .select("name,is_active").eq("id",profile.school_id).single(),"School approval check");
   if(school.error||!school.data?.is_active)throw Error("Your approved school is not active.");
   if(profile.role!=="school_user")
    throw Error("Only approved school personnel or district administrators can upload files.");
   // Any active school user may attach to an authorized routed document.
   // RLS limits the document picker; the upload server independently verifies involvement.
   if(kind==="announcement"&&!aoII&&!PILOT_SCHOOL_IDS.has(profile.school_id))
    throw Error("Submitting announcement requirements for other schools requires an approved AO II account.");
  }
  let options=[];
  loadingMessage(node,"Loading assigned "+(kind==="announcement"?"requirements":"documents")+"…");
  if(kind==="announcement"&&node._iuDelegated){
   const delegated=node._iuDelegated;
   if(!admin&&!aoII)throw Error("Only district administrators and approved AO II staff may submit for another school.");
   const {data,error}=await withDeadline(db.rpc("i_track_status_school_upload_target",{
    p_announcement_id:delegated.announcementId,p_school_id:delegated.schoolId
   }),"Selected school permission check");
   if(error)throw error;
   options=(data||[]).filter(x=>x.assignment_id===delegated.assignmentId)
    .map(x=>({id:x.assignment_id,label:x.school_name+" — "+x.announcement_name,deadline:x.deadline_at}));
  }else if(kind==="announcement"){
   const a=await withDeadline(db.from("announcement_assignments")
    .select("id,announcement_id,school_id,assigned_user_id").eq("obligation_status","required"),
    "Requirements loading");
   if(a.error)throw a.error;
   const n=await withDeadline(db.from("announcements")
    .select("id,announcement_code,title,status,deadline_at").eq("status","open").order("created_at",{ascending:false}),
    "Announcement loading");
   if(n.error)throw n.error;
   options=(a.data||[]).filter(a=>a.assigned_user_id===user.id||
    (!!profile.school_id && a.school_id===profile.school_id)).map(a=>{
    const ann=(n.data||[]).find(x=>x.id===a.announcement_id);
    return ann?{id:a.id,label:(ann.announcement_code?ann.announcement_code+" — ":"")+ann.title,deadline:ann.deadline_at}:null;
   }).filter(Boolean);
  }else{
   const d=await withDeadline(db.from("documents")
    .select("id,tracking_number,subject").order("created_at",{ascending:false}).limit(200),
    "Document loading");
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
  const saved=node._iuDelegated?null:liveDrafts.get(kind);
  if(saved?.owner===user.id){
    if(saved.targetId&&options.some(x=>x.id===saved.targetId))select.value=saved.targetId;
    node._iuOriginal=saved.original||null;
    node._iuFile=saved.file||null;
  }else{
    node._iuOriginal=null;node._iuFile=null;
  }
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
  if(node.isConnected&&node._iuFile)updateFile(node);
 }catch(e){
  if(!node.isConnected)return;
  node.querySelector(".iu-loading")?.remove();
  notify(node,e?.message||String(e),"error");
  retryAccountCheck(node,kind);
 }
}
async function updateTarget(node,kind){
 const id=node.querySelector(".iu-select")?.value;
 const opt=node._iuOptions?.find(x=>x.id===id);
 const extra=node.querySelector(".iu-date");
 extra.textContent=opt?.deadline?"Deadline: "+displayTime(opt.deadline)+" (Philippine time)":"";
 await refreshHistory(node,kind);
 if(node._iuOwner&&node._iuKind&&!node._iuDelegated){
   const previous=liveDrafts.get(node._iuKind)||{};
   liveDrafts.set(node._iuKind,{
     owner:node._iuOwner,
     original:node._iuOriginal||previous.original||null,
     file:node._iuFile||previous.file||null,
     targetId:id||null
   });
 }
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
  const {data,error}=await withDeadline(query,"Submission history loading",15000);
  if(error)throw error;
  if(!node.isConnected||node.querySelector(".iu-select")?.value!==id)return;
  if(!data?.length){history.textContent=node._iuDelegated?"No uploads are visible to your account for this school. Other schools\u0027 files remain private.":"No files submitted for this requirement yet.";return;}
  history.innerHTML=data.map(x=>{
   const state=kind==="announcement"?(["verified","rejected"].includes(x.verification_status)?x.verification_status:"pending"):"stored";
   const when=displayTime(kind==="announcement"?x.first_received_at:x.uploaded_at);
   const details=(kind==="announcement"?"Version "+x.version_number+" · ":"")+size(x.file_size_bytes)+" · "+when;
   const available=kind==="document"||x.storage_status==="uploaded";
   const viewable=x.content_type==="application/pdf"||["image/png","image/jpeg","image/webp"].includes(x.content_type);
   const actions=available?
     '<div class="iu-file-actions">'+
     (viewable?'<button type="button" class="btn tiny alt iu-file-action" data-mode="view" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-name="'+esc(x.original_filename)+'">View</button>':'')+
     '<button type="button" class="btn tiny alt iu-file-action" data-mode="download" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-name="'+esc(x.original_filename)+'">Download</button></div>':
     '<span class="iu-archived">Archived offline</span>';
   return '<div class="iu-history-item"><div class="iu-history-detail"><strong>'+esc(x.original_filename)+'</strong><small>'+esc(details)+'</small></div>'+
    '<span class="iu-state iu-state--'+esc(state)+'">'+esc(state.toUpperCase())+'</span>'+actions+'</div>';
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
function updateUploadPhase(node,message,pct=null){
 const area=node.querySelector(".iu-progress");if(!area)return;
 area.hidden=false;
 const label=area.querySelector(".iu-progress-label"),bar=area.querySelector(".iu-progress-bar");
 if(label)label.textContent=message;
 if(bar){if(pct===null)bar.removeAttribute("value");else bar.value=Math.max(0,Math.min(100,pct));}
}
async function toBase64(file,onProgress){
 return await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(",")[1]);
  reader.onerror=()=>reject(Error("Unable to read the selected file"));
  reader.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round((e.loaded/e.total)*100));};
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
 updateUploadPhase(node,"Checking your account…");
 notify(node,"Preparing to upload. Keep this page open.");
 let timer=null;
 try{
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("Your session expired. Please sign in again.");
  updateUploadPhase(node,"Reading the selected file on your device…",0);
  const base64=await toBase64(f,pct=>updateUploadPhase(node,"Reading file: "+pct+"% (local preparation)",pct));
  updateUploadPhase(node,"Transferring file to the secure server… (transfer percentage unavailable)");
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
  updateUploadPhase(node,"Checking the secure server and Google Drive confirmation…");
  const body=await reply.json().catch(()=>({}));
  if(!reply.ok||!body.ok)throw Error(body.error||"Upload was not accepted. Status "+reply.status);
  updateUploadPhase(node,"File upload confirmed and recorded.",100);
  node._iuFile=null;node._iuOriginal=null;node.querySelector(".iu-input").value="";
  updateFile(node);
  await refreshHistory(node,kind);
  // Update the inline attachment beside Open without rebuilding the upload form.
  if(kind==="document")window.dispatchEvent(new CustomEvent("itrack:document-uploaded",{detail:{documentId:id}}));
  if(kind==="announcement"&&node._iuDelegated){
   window.dispatchEvent(new CustomEvent("itrack:school-submitted",{detail:{
    schoolId:node._iuDelegated.schoolId,announcementId:node._iuDelegated.announcementId
   }}));
  }
  notify(node,"File uploaded and recorded successfully! Received: "+displayTime(body.received_at)+". "+
   (body.stored_file_name?"Saved in Drive as: "+body.stored_file_name+". ":"")+
   "Recorded as a submission for "+(node._iuDelegated?"the selected school":"your school")+
   ". Only the District Administrator verifies submissions; no school approval is required.","success");
 }catch(e){
  updateUploadPhase(node,"Upload not confirmed. Check the submission history before attempting another upload.");
  await refreshHistory(node,kind).catch(()=>{});
  notify(node,e?.name==="AbortError"?
   "The upload confirmation timed out. DO NOT retry yet; ask the administrator to check Drive and the upload log for duplicates.":
   "Upload not confirmed: "+(e?.message||String(e))+". Check submission history before retrying to avoid duplicate uploads.","error");
 }finally{if(timer)clearTimeout(timer);if(node.isConnected)setProcessing(node,false);}
}
const observer=new MutationObserver(markPanel);
observer.observe(root,{childList:true});
markPanel();
})();