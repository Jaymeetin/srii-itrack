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
const LEGACY_SCHOOL_EXCEPTION_IDS=new Set([
 "68ece6a5-941c-4385-8062-5e4223877b60", // SINUNDOLAN ES
 "d526729d-ee5e-4c1a-87f9-77f513c8778b"  // BUGO CS
]);
const MB=30*1024*1024;
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
 ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 ".xls":"application/vnd.ms-excel",
 ".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 ".ppt":"application/vnd.ms-powerpoint",
 ".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
     paragraphs[1].innerHTML='<span class="tag good">AVAILABLE</span> DepEd Google Drive uploads';
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
  '<div class="iu-heading"><div><span class="iu-kicker">'+(kind==="announcement"?"DISTRICT ANNOUNCEMENT":"MY DOCUMENTS")+'</span>'+
  '<h3>'+ (host?"Submit for This School":kind==="announcement"?"Upload for an announcement":"Add files to a routed document") +'</h3></div>'+
  '<span class="iu-workspace-label">'+(kind==="announcement"?"ANNOUNCEMENT":"ROUTED DOCUMENT")+'</span></div>'+
  (host?'':'<p class="iu-which">'+(kind==="announcement"?
   'Use this only for what the <strong>District asked schools to submit</strong>. Sending your own letter, request or form? <button type="button" class="link-button" data-a="send">Route a document</button> instead.':
   'Use this for <strong>your own documents</strong> (letters, requests, forms). Answering a District announcement? <button type="button" class="link-button" data-a="nav" data-page="announcements">Go to Announcements</button> instead.')+'</p>')+
  '<p class="iu-description">'+(kind==="announcement"?
   (host?'Upload for this school using your own AO II account. Your identity and the represented school are recorded; only district administrators verify the submission.':'Choose an assigned requirement and upload a PDF, Word file, or image. Revised submissions keep their version history.'):
   'Attach a file to a document you created, sent, or received through routing. Files remain private to authorized participants.'
  )+'</p>'+
  '<div class="iu-loading iu-message">Checking your approved account and available '+(kind==="announcement"?"requirements":"documents")+'…</div>'+
  '<div class="iu-controls" hidden>'+
   '<div class="field iu-target"><label for="iu-target-'+kind+'">'+(kind==="announcement"?"Select the correct announcement":"Routed document")+'</label><select id="iu-target-'+kind+'" class="iu-select"></select></div>'+
   (kind==="announcement"?'<div class="iu-announcement-review" aria-live="polite">Choose an announcement to view its school and title before uploading.</div>'+
     '<label class="iu-confirm-row"><input type="checkbox" class="iu-confirm-input" disabled> <span>I checked the <strong>school and announcement</strong> above. This is the correct destination for my file.</span></label>':'')+
   '<div class="iu-date" aria-live="polite"></div>'+
   '<div class="iu-file"><span class="iu-file-icon" aria-hidden="true">'+(window.ITRACK_ICON?.('upload')||'↥')+'</span><div class="iu-file-inner"><label for="iu-file-'+kind+'">Choose PDF, Word, Excel, PowerPoint or image files</label>'+
    '<input id="iu-file-'+kind+'" class="iu-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" aria-label="Select one or more files to upload">'+
    '<p class="iu-muted">You can pick several files at once. Together they must not be more than 30 MB.</p>'+
    '<button type="button" class="btn alt iu-scan">'+(window.ITRACK_ICON?.('camera')||'')+'Scan paper with camera</button></div></div>'+
   '<div class="iu-selection">No files selected</div>'+
   '<img class="iu-image" alt="Preview of the selected picture" hidden>'+
   '<div class="iu-actions"><button type="button" class="btn alt iu-compress" disabled>Compress Pictures</button>'+
    '<button type="button" class="btn iu-upload" disabled>Upload to Google Drive</button></div><div class="iu-progress" hidden role="status" aria-live="polite"><span class="iu-progress-label">Preparing upload…</span><progress class="iu-progress-bar" max="100"></progress></div>'+
   '<p class="iu-limits">30 MB in total for the files you upload together; a routed document also shares one 30 MB total across all its attachments. No fixed file-count limit. Images compress automatically on your device. PDF and Office files keep their format; Office files with macros are refused. For oversized PDFs, <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noopener noreferrer">use iLovePDF Compress PDF ↗</a> only where document privacy permits.</p>'+
   '<div class="iu-history" aria-live="polite"><h4>Submission history</h4><div class="iu-history-list">Select a requirement to view its records.</div></div>'+
  '</div>'+
  '<div class="iu-message" hidden aria-live="polite"></div>';
 if(host){
  newPanel._iuDelegated={announcementId:host.dataset.announcementId,
    schoolId:host.dataset.schoolId,assignmentId:host.dataset.assignmentId};
  host.append(newPanel);
 }else{
  const section=content.querySelector("#iu-anchor")||content.querySelector(".sectionhead");
  if(section)section.after(newPanel);else content.prepend(newPanel);
 }
 if(kind==="document"){
  const old=[...content.querySelectorAll(".panel")].find(x=>x!==newPanel&&x.querySelector("h3")?.textContent?.trim()==="Compress a Screenshot");
  if(old)old.hidden=true;
 }
 initialize(newPanel,kind);
}
const helperApi=()=>window.ITRACK_UPLOAD;
const totalBytes=node=>(node._iuFiles||[]).reduce((sum,x)=>sum+x.file.size,0);
function setProcessing(node,yes){
 node.dataset.processing=yes?"yes":"no";
 const list=node._iuFiles||[];
 const hasTarget=!!node.querySelector(".iu-select")?.value;
 const confirmed=node._iuKind!=="announcement"||node._iuConfirmed===true;
 const typed=list.every(x=>!!x.type);
 const ready=!yes&&!node._iuPreparing&&list.length>0&&typed&&hasTarget&&confirmed&&totalBytes(node)<=MB;
 const upload=node.querySelector(".iu-upload");
 if(upload){upload.disabled=!ready;upload.textContent=yes?"Uploading, please wait…":
  list.length>1?"Upload "+list.length+" Files to Google Drive":"Upload to Google Drive";}
 const comp=node.querySelector(".iu-compress");
 if(comp)comp.disabled=yes||!list.some(x=>/^image\//.test(mimeFor(x.original)));
 node.querySelector(".iu-input")?.toggleAttribute("disabled",yes);
 node.querySelector(".iu-select")?.toggleAttribute("disabled",yes);
 node.querySelectorAll(".iu-copy-type,.iu-remove").forEach(el=>el.toggleAttribute("disabled",yes));
}
function preview(node){
 const image=node.querySelector(".iu-image");
 if(!image)return;
 if(node._iuBlobUrl){URL.revokeObjectURL(node._iuBlobUrl);node._iuBlobUrl=null;}
 const only=(node._iuFiles||[]).length===1?node._iuFiles[0].file:null;
 if(only&&mimeFor(only).startsWith("image/")){
  node._iuBlobUrl=URL.createObjectURL(only);
  image.src=node._iuBlobUrl;image.hidden=false;
 }else{image.hidden=true;image.removeAttribute("src");}
}
function updateFile(node){
 const list=node._iuFiles||[];
 if(node._iuKind&&node._iuOwner){
   liveDrafts.set(node._iuKind,{owner:node._iuOwner,files:list,
    targetId:node.querySelector(".iu-select")?.value||null});
 }
 const caption=node.querySelector(".iu-selection");
 const total=totalBytes(node),over=total>MB,untyped=list.filter(x=>!x.type).length;
 caption.innerHTML=list.length?
  '<div class="iu-files">'+list.map((x,i)=>
   '<div class="iu-file-row"><div class="iu-file-name"><strong>'+esc(x.file.name)+'</strong>'+
   '<small>'+size(x.file.size)+(x.file.size<x.original.size?' · compressed from '+size(x.original.size):'')+'</small></div>'+
   helperApi().copySelect('class="iu-copy-type" data-index="'+i+'"',x.type)+
   '<button type="button" class="btn tiny alt iu-remove" data-index="'+i+'" aria-label="Remove '+esc(x.file.name)+'">Remove</button></div>').join("")+'</div>'+
  '<p class="iu-total'+(over?' is-over':'')+'">'+list.length+' file'+(list.length===1?'':'s')+' · <strong>'+size(total)+'</strong> of 30 MB'+
   (over?' · over the limit: remove or compress files':untyped?' · choose a copy type for '+(untyped===1?'the remaining file':untyped+' files'):'')+'</p>':
  'No files selected';
 preview(node);
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
   if(kind==="announcement"&&!aoII&&!LEGACY_SCHOOL_EXCEPTION_IDS.has(profile.school_id))
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
    .map(x=>({id:x.assignment_id,label:x.school_name+" — "+x.announcement_name,
      schoolName:x.school_name,announcementTitle:x.announcement_name,announcementCode:"",deadline:x.deadline_at}));
  }else if(kind==="announcement"){
   const a=await withDeadline(db.from("announcement_assignments")
    .select("id,announcement_id,school_id,assigned_user_id").eq("obligation_status","required"),
    "Requirements loading");
   if(a.error)throw a.error;
   const n=await withDeadline(db.from("announcements")
    .select("id,announcement_code,title,status,deadline_at").eq("status","open").order("created_at",{ascending:false}),
    "Announcement loading");
   if(n.error)throw n.error;
   // Resolve the actual school for every option. The upload form must not guess
   // the school or present a default announcement when a user opens the screen.
   const schoolIds=[...new Set((a.data||[]).map(x=>x.school_id).filter(Boolean))];
   let schoolNames=new Map();
   if(schoolIds.length){
    const schools=await withDeadline(db.from("schools").select("id,name").in("id",schoolIds),
      "Announcement school lookup");
    if(schools.error)throw schools.error;
    schoolNames=new Map((schools.data||[]).map(s=>[s.id,s.name]));
   }
   options=(a.data||[]).filter(a=>a.assigned_user_id===user.id||
    (!!profile.school_id && a.school_id===profile.school_id)).map(a=>{
    const ann=(n.data||[]).find(x=>x.id===a.announcement_id);
    const schoolName=a.school_id?schoolNames.get(a.school_id):"District Office";
    if(!ann||!schoolName)return null;
    return {id:a.id,label:schoolName+" — "+(ann.announcement_code?ann.announcement_code+" — ":"")+ann.title,
      schoolName,announcementTitle:ann.title,announcementCode:ann.announcement_code||"",deadline:ann.deadline_at};
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
  select.innerHTML=(kind==="announcement"?'<option value="" selected disabled>— Choose the announcement first —</option>':"")+
    options.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join("");
  if(kind==="announcement"){
   select.value="";
   const wanted=window.ITRACK_UPLOAD_TARGET;
   if(wanted&&!node._iuDelegated&&options.some(x=>x.id===wanted)){select.value=wanted;window.ITRACK_UPLOAD_TARGET=null;}
  }
  node._iuConfirmed=false;
  const checkbox=node.querySelector(".iu-confirm-input");
  if(checkbox){checkbox.checked=false;checkbox.disabled=true;
    checkbox.addEventListener("change",()=>{
      node._iuConfirmed=checkbox.checked;
      setProcessing(node,false);
    });
  }
  node.querySelector(".iu-controls").hidden=false;
  const saved=node._iuDelegated?null:liveDrafts.get(kind);
  if(saved?.owner===user.id){
    // Only document uploads may restore their previous target. Announcement
    // uploads always require an explicit choice, even after page navigation.
    if(kind!=="announcement"&&saved.targetId&&options.some(x=>x.id===saved.targetId))select.value=saved.targetId;
    node._iuFiles=Array.isArray(saved.files)?saved.files:[];
  }else node._iuFiles=[];
  // Camera scan: the photos become one PDF, added like any chosen file, marked "Scanned copy".
  node.querySelector(".iu-scan")?.addEventListener("click",()=>{
   if(!window.ITRACK_SCAN){notify(node,"The camera scan is still loading. Try again in a moment.","error");return;}
   window.ITRACK_SCAN.open({onDone:file=>{
    if(!node.isConnected)return;
    node._iuFiles=[...(node._iuFiles||[]),{original:file,file,type:"scanned_copy"}];
    if(kind==="announcement"){
     node._iuConfirmed=false;
     const check=node.querySelector(".iu-confirm-input");
     if(check)check.checked=false;
    }
    updateFile(node);
    notify(node,"Scanned PDF added: "+file.name+". Check the list below, then upload.","success");
   }});
  });
  const input=node.querySelector(".iu-input");
  input.addEventListener("change",async()=>{
   const picked=[...(input.files||[])];
   input.value="";                       // the same file can be picked again after removal
   if(!picked.length)return;
   const version=(node._iuFileVersion||0)+1;node._iuFileVersion=version;
   const unsupported=picked.filter(f=>!mimeFor(f)||f.size<1);
   const usable=picked.filter(f=>mimeFor(f)&&f.size>0);
   if(kind==="announcement"){
    node._iuConfirmed=false;
    const check=node.querySelector(".iu-confirm-input");
    if(check)check.checked=false;
   }
   node._iuPreparing=true;setProcessing(node,true);
   if(usable.some(f=>mimeFor(f).startsWith("image/")))notify(node,"Automatically compressing pictures on your device…");
   const added=[];
   for(const original of usable){
    let file=original;
    if(mimeFor(original).startsWith("image/")){
     // A damaged picture must never leave the panel stuck on "preparing".
     try{file=await Promise.race([window.ITRACK_UPLOAD.optimizeImage(original),new Promise(resolve=>setTimeout(()=>resolve(original),8000))]);}catch(_){file=original;}
    }
    added.push({original,file,type:""});
   }
   if(node._iuFileVersion!==version||!node.isConnected)return;
   const known=new Set((node._iuFiles||[]).map(x=>x.original.name+":"+x.original.size));
   node._iuFiles=[...(node._iuFiles||[]),...added.filter(x=>!known.has(x.original.name+":"+x.original.size))];
   node._iuPreparing=false;
   if(unsupported.length)notify(node,"Skipped "+unsupported.length+" unsupported or empty file(s). Choose PDF, Word, Excel, PowerPoint, JPG, PNG or WebP.","error");
   else node.querySelector(".iu-message").hidden=true;
   updateFile(node);
  });
  // One listener serves every row: copy type choice and Remove.
  node.querySelector(".iu-selection").addEventListener("change",event=>{
   const pick=event.target.closest(".iu-copy-type");if(!pick)return;
   const item=node._iuFiles?.[Number(pick.dataset.index)];if(!item)return;
   item.type=pick.value;updateFile(node);
  });
  node.querySelector(".iu-selection").addEventListener("click",event=>{
   const remove=event.target.closest(".iu-remove");if(!remove||node.dataset.processing==="yes")return;
   node._iuFiles.splice(Number(remove.dataset.index),1);updateFile(node);
  });
  select.addEventListener("change",()=>updateTarget(node,kind));
  node.querySelector(".iu-compress").addEventListener("click",()=>compress(node));
  node.querySelector(".iu-upload").addEventListener("click",()=>upload(node,kind));
  await updateTarget(node,kind);
  if(node.isConnected&&node._iuFiles?.length)updateFile(node);
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
 if(kind==="announcement"){
  node._iuConfirmed=false;
  const check=node.querySelector(".iu-confirm-input");
  if(check){check.checked=false;check.disabled=!opt;}
  const summary=node.querySelector(".iu-announcement-review");
  if(summary)summary.innerHTML=opt?
   '<span class="iu-review-kicker">Confirm the destination</span>'+
   '<span class="iu-review-school">School: <strong>'+esc(opt.schoolName)+'</strong></span>'+
   '<span class="iu-review-code">'+esc(opt.announcementCode||"Announcement requirement")+'</span>'+
   '<strong class="iu-review-title">'+esc(opt.announcementTitle)+'</strong>':
   '<span class="iu-review-empty">Choose an announcement to view its school and title before uploading.</span>';
 }
 await refreshHistory(node,kind);
 if(node._iuOwner&&node._iuKind&&!node._iuDelegated){
   const previous=liveDrafts.get(node._iuKind)||{};
   liveDrafts.set(node._iuKind,{
     owner:node._iuOwner,
     files:node._iuFiles?.length?node._iuFiles:previous.files||[],
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
   db.from("submissions").select("id,original_filename,content_type,file_size_bytes,first_received_at,version_number,verification_status,storage_status,copy_type").eq("assignment_id",id).order("version_number",{ascending:false}).order("first_received_at",{ascending:false}).limit(12):
   db.from("document_attachments").select("id,original_filename,content_type,file_size_bytes,uploaded_at,copy_type").eq("document_id",id).order("uploaded_at",{ascending:false}).limit(12);
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
   return '<div class="iu-history-item"><div class="iu-history-detail"><strong>'+esc(x.original_filename)+'</strong><small>'+helperApi().copyTag(x.copy_type)+esc(details)+'</small></div>'+
    '<span class="iu-state iu-state--'+esc(state)+'">'+esc(state==='pending'?'AWAITING REVIEW':state.toUpperCase())+'</span>'+actions+'</div>';
  }).join("");
 }catch(e){if(node.isConnected)history.textContent="Could not load history: "+(e?.message||e);}
}
async function compress(node){
 const pictures=(node._iuFiles||[]).filter(x=>/^image\//.test(mimeFor(x.original)));
 if(!pictures.length){notify(node,"Choose a picture first. PDF and Office files are kept as they are, without compression.","error");return;}
 let saved=0;
 try{
  for(const item of pictures){
   const bmp=await createImageBitmap(item.original);
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
   if(blob.size<item.file.size){
    saved+=item.file.size-blob.size;
    item.file=new File([blob],item.original.name.replace(/\.[^.]+$/,"").slice(0,150)+"-compressed.webp",{type:"image/webp"});
   }
  }
  notify(node,saved?"Compression complete: saved "+size(saved)+". Inspect the pictures to ensure all text is readable.":
   "The pictures are already as small as they can be; nothing was changed.",saved?"success":"");
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
 if(node.dataset.processing==="yes"||node._iuPreparing)return;
 const list=node._iuFiles||[],id=node.querySelector(".iu-select")?.value;
 const target=node._iuOptions?.find(x=>x.id===id),helper=window.ITRACK_UPLOAD;
 if(!list.length||!id||!target){notify(node,"Choose both a requirement and at least one file.","error");return;}
 if(kind==="announcement"&&!node._iuConfirmed){notify(node,"Confirm the school and announcement before uploading.","error");return;}
 if(list.some(x=>!x.type)){notify(node,"Choose a copy type (Scanned copy, Soft copy or Proof) for every file.","error");return;}
 const total=totalBytes(node);
 if(total>MB){notify(node,"These files total "+size(total)+", which is more than 30 MB. Remove or compress some files first.","error");return;}
 if(list.some(x=>!mimeFor(x.file)||x.file.size<1)){notify(node,"One of the files has an unsupported extension or is empty.","error");return;}
 setProcessing(node,true);
 let done=0;
 const count=list.length;      // the list shrinks as files are confirmed
 try{
  if(kind==="document"){
   const {data:current,error:existingError}=await db.from("document_attachments")
    .select("file_size_bytes").eq("document_id",id);
   if(existingError)throw Error("Could not verify the existing attachment sizes. Retry when connected.");
   const existing=(current||[]).reduce((n,x)=>n+Number(x.file_size_bytes||0),0);
   const warning=helper.sizeError(list.map(x=>x.file),existing);
   if(warning){notify(node,warning,"error");return;}
  }
  const destination=kind==="announcement"?
   "School: "+target.schoolName+"\nAnnouncement: "+(target.announcementCode?target.announcementCode+" — ":"")+target.announcementTitle:
   target.label;
  const listing=list.map((x,i)=>(i+1)+". "+x.file.name+" ("+size(x.file.size)+", "+helper.copyLabel(x.type)+")").join("\n");
  if(!confirm("FINAL UPLOAD CONFIRMATION\n\n"+list.length+" file"+(list.length===1?"":"s")+", "+size(total)+" in total:\n"+listing+"\n\n"+destination+
   "\n\nUpload "+(list.length===1?"this file":"these files")+" to the private district Google Drive for this destination?"))return;
  updateUploadPhase(node,"Checking your login…");
  notify(node,"Preparing your secure upload. Keep this page open.");
  // Files sent together for one requirement form one submission version.
  const batchId=kind==="announcement"&&crypto.randomUUID?crypto.randomUUID():null;
  let last=null;
  while(node._iuFiles.length){
   const item=node._iuFiles[0],position=(done+1)+" of "+count;
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Your session expired. Please sign in again.");
   last=await helper.upload({
    file:item.file,targetType:kind,targetId:id,token:session.access_token,
    url:settings.url,apikey:settings.publishableKey,copyType:item.type,batchId,
    onProgress:stage=>{
     if(stage.phase==="reading")updateUploadPhase(node,"File "+position+": preparing on device "+stage.percent+"% (not yet uploaded)",null);
     else if(stage.phase==="transferring")updateUploadPhase(node,"File "+position+": "+stage.percent+"% transferred",stage.percent);
     else if(stage.phase==="confirming")updateUploadPhase(node,"File "+position+": waiting for Google Drive and database confirmation…",null);
    }
   });
   done++;
   node._iuFiles.shift();           // confirmed files leave the list, so a retry never sends them twice
   updateFile(node);setProcessing(node,true);
  }
  updateUploadPhase(node,done===1?"File upload confirmed and recorded.":"All "+done+" files confirmed and recorded.",100);
  if(kind==="announcement"){
   node._iuConfirmed=false;
   const checkbox=node.querySelector(".iu-confirm-input");
   if(checkbox)checkbox.checked=false;
  }
  updateFile(node);
  await refreshHistory(node,kind);
  if(kind==="document")window.dispatchEvent(new CustomEvent("itrack:document-uploaded",{detail:{documentId:id}}));
  if(kind==="announcement"&&node._iuDelegated){
   window.dispatchEvent(new CustomEvent("itrack:school-submitted",{detail:{
    schoolId:node._iuDelegated.schoolId,announcementId:node._iuDelegated.announcementId
   }}));
  }
  notify(node,(done===1?"Thank you! Your file was received and recorded.":"Thank you! All "+done+" files were received and recorded.")+
   " Received: "+displayTime(last?.received_at)+"."+
   (kind==="announcement"?" The District will check it next.":""),"success");
 }catch(error){
  updateUploadPhase(node,"Upload not confirmed. Check submission history before retrying.");
  await refreshHistory(node,kind).catch(()=>{});
  if(kind==="document"&&done)window.dispatchEvent(new CustomEvent("itrack:document-uploaded",{detail:{documentId:id}}));
  notify(node,(done?done+" of "+count+" files were saved. The file that stopped: ":"Upload not confirmed: ")+(error?.message||String(error))+
   ". Check the upload history or ask the administrator to review the log before retrying, to avoid duplicate files."+
   (done?" The files still listed above were not uploaded.":""),"error");
 }finally{if(node.isConnected)setProcessing(node,false);}
}
// "Submit" on a requirement: choose it in the announcement panel and bring the panel into view.
// The person still confirms the school and announcement before anything uploads.
window.addEventListener("itrack:upload-target",event=>{
 const id=event.detail?.id;if(!id)return;
 const node=[...root.querySelectorAll(".itrack-upload")].find(n=>n._iuKind==="announcement"&&!n._iuDelegated);
 const select=node?.querySelector(".iu-select");
 if(select&&node._iuOptions?.some(x=>x.id===id)){
  select.value=id;select.dispatchEvent(new Event("change"));window.ITRACK_UPLOAD_TARGET=null;
 }else window.ITRACK_UPLOAD_TARGET=id;   // picked up when the panel finishes loading
 (node||root.querySelector(".itrack-upload"))?.scrollIntoView({behavior:"smooth",block:"start"});
});
const observer=new MutationObserver(markPanel);
observer.observe(root,{childList:true});
markPanel();
})();