
(() => {
'use strict';
const C=window.ITRACK_CONFIG;
const $=document.getElementById('app');
const toast=document.getElementById('toast');
const db=window.supabase?.createClient(C.url,C.publishableKey,{auth:{persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
// Reuse one authenticated client across tracking, upload and download screens.
// Multiple clients refreshing the same mobile session can reset upload forms.
window.ITRACK_DB=db;
const state={session:null,profile:null,schools:[],announcements:[],profiles:[],docs:[],recipients:[],monitor:[],selectedId:'',view:(['verification','reports'].includes(new URLSearchParams(location.search).get('view'))?new URLSearchParams(location.search).get('view'):'dashboard'),authMode:'login',modal:null,detail:null,routes:[],theme:localStorage.getItem('srii-theme')||'light',busy:false,file:null,compressed:null,fileNote:'',counts:null,schoolSubmissions:[],schoolAssignments:[],docAttachments:[],docAttachmentError:'',reviewSelectedId:'',reviewRows:[],reviewVersions:[],reviewRequired:0,districtReport:[],issue:null};
document.documentElement.dataset.theme=state.theme;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}):'—';
const short=x=>x?new Date(x).toLocaleDateString('en-PH',{dateStyle:'medium',timeZone:'Asia/Manila'}):'—';
const announcementName=a=>(a?.announcement_code?a.announcement_code+' — ':'')+(a?.title||'Announcement');
const clean=x=>String(x||'').trim();
const yesAdmin=()=>['main_admin','backup_admin'].includes(state.profile?.role);
const isOic=()=>state.profile?.role==='oic_psds';
const districtOversight=()=>yesAdmin()||isOic();
const isMain=()=>state.profile?.role==='main_admin';
const active=()=>state.profile?.account_status==='active';
const label=x=>String(x||'').replaceAll('_',' ');
const pTag=x=>`<span class="tag ${['active','submitted','received','open','Submitted'].includes(x)?'good':['pending','awaiting_ack','Pending','returned'].includes(x)?'warn':['Late','disabled'].includes(x)?'bad':'info'}">${esc(label(x))}</span>`;
const table=(cols,rows)=>rows.length?`<div class="tablewrap"><table class="data"><thead><tr>${cols.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<div class="empty">No records available yet.</div>';
const field=(caption,name,type='text',value='',placeholder='')=>`<div class="field"><label for="${esc(name)}">${esc(caption)}</label><input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${type==='password'?'minlength="8"':''} required></div>`;
const schoolOpts=()=>state.schools.filter(s=>s.is_active).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
function pop(message,error=false){toast.textContent=message;toast.style.background=error?'#a43142':'#173d80';toast.classList.add('show');clearTimeout(pop.timer);pop.timer=setTimeout(()=>toast.classList.remove('show'),5000);}
function brand(){return `<div class="brand"><span class="brandmark"><img src="./assets/srii-emblem.svg" alt="" width="48" height="45"></span><span class="brand-label">SRII <span class="brand-accent">i-TRACK</span><small>DOCUMENT TRACKING SYSTEM</small></span></div>`;}
function stat(label,value,desc){return `<div class="stat"><div class="label">${esc(label)}</div><strong>${esc(value)}</strong><div class="note">${esc(desc)}</div></div>`;}
function err(e){console.error(e);pop(e?.message||String(e),true);}
async function initial(){
 if(!db){$.innerHTML='<div class="startup">Could not load the Supabase library. Check your connection and refresh.</div>';return;}
 try{const {data,error}=await db.from('schools').select('id,name,is_active').order('name');if(error)throw error;state.schools=data||[];}catch(e){state.issue=e.message;show();return;}
 db.auth.onAuthStateChange((event,session)=>{
  // Mobile file pickers can background the PWA. Supabase then refreshes its
  // access token or repeats SIGNED_IN when the chooser closes. Neither
  // changes the logged-in identity, so do not destroy an in-progress form.
  const previousId=state.session?.user?.id||null;
  const nextId=session?.user?.id||null;
  state.session=session;
  if(state.profile && previousId===nextId &&
    ['TOKEN_REFRESHED','SIGNED_IN','INITIAL_SESSION','USER_UPDATED'].includes(event)) return;
  setTimeout(sync,0);
 });
 const {data:{session}}=await db.auth.getSession();state.session=session;await sync();
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
async function sync(){
 try{
  state.issue=null;
  if(!state.session){state.profile=null;show();return;}
  const {data,error}=await db.from('profiles').select('id,display_name,school_id,requested_school_id,role,account_status,position_title').eq('id',state.session.user.id).single();
  if(error)throw error;
  state.profile=data;
  if(isOic()&&!['dashboard','announcements','monitoring','reports'].includes(state.view))state.view='dashboard';
  if(active())await load();else show();
 }catch(e){state.issue=e.message;show();}
}
async function load(){
 if(!active()){show();return;}
 try{
  const tasks=[];
  if(['dashboard','announcements','monitoring','verification','reports'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('announcements').select('id,announcement_code,title,description,status,deadline_at,original_deadline_at,created_at').order('created_at',{ascending:false});if(error)throw error;state.announcements=data||[];if(!state.selectedId||!state.announcements.some(x=>x.id===state.selectedId))state.selectedId=state.announcements.find(x=>x.status!=='draft')?.id||'';})());
  }
  if(!isOic()&&['dashboard','documents'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('documents').select('id,tracking_number,subject,document_type,status,created_by,origin_school_id,created_at').order('created_at',{ascending:false}).limit(200);if(error)throw error;state.docs=data||[];if(state.view==='documents')await loadDocumentAttachments();})());
  }
  if(yesAdmin()&&['dashboard','approvals'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('profiles').select('id,display_name,school_id,requested_school_id,position_title,role,account_status,created_at').order('created_at',{ascending:false});if(error)throw error;state.profiles=data||[];})());
  }
  if(state.view==='dashboard'){
   if(isOic())tasks.push((async()=>{const {data,error}=await db.rpc('i_track_district_report');if(error)throw error;state.districtReport=data||[];})());
   else if(yesAdmin())tasks.push((async()=>{const {data,error}=await db.rpc('i_track_registration_counts');if(!error)state.counts=Array.isArray(data)?data[0]:data;})());
   else tasks.push((async()=>{
     const {data:assignments,error:aError}=await db.from('announcement_assignments')
       .select('id,announcement_id,school_id,assigned_user_id,obligation_status')
       .eq('obligation_status','required');
     if(aError)throw aError;
     state.schoolAssignments=(assignments||[]).filter(a=>a.school_id===state.profile.school_id||a.assigned_user_id===state.profile.id);
     if(!state.schoolAssignments.length){state.schoolSubmissions=[];return;}
     const {data:submissions,error:sError}=await db.from('submissions')
       .select('assignment_id,first_received_at,version_number,storage_status')
       .in('assignment_id',state.schoolAssignments.map(a=>a.id))
       .in('storage_status',['uploaded','archived']);
     if(sError)throw sError;
     state.schoolSubmissions=submissions||[];
   })());
  }
  if(state.view==='reports'&&districtOversight())tasks.push((async()=>{const {data,error}=await db.rpc('i_track_district_report');if(error)throw error;state.districtReport=data||[];})());
  await Promise.all(tasks);
  if(state.view==='monitoring')await loadMonitor();
  if(state.view==='verification'&&yesAdmin())await loadVerification();
  if(state.view==='documents')await loadRecipients();
  show();
 }catch(e){err(e);show();}
}
async function loadDocumentAttachments(){
 // The user's Supabase JWT and attachment RLS limit results to authorized documents.
 // Never request or expose Drive file IDs in the browser.
 const ids=state.docs.map(d=>d.id).filter(Boolean);
 state.docAttachments=[];
 state.docAttachmentError='';
 if(!ids.length)return;
 const records=[];
 for(let i=0;i<ids.length;i+=40){
  const {data,error}=await db.from('document_attachments')
   .select('id,document_id,original_filename,content_type,file_size_bytes,uploaded_at')
   .in('document_id',ids.slice(i,i+40))
   .order('uploaded_at',{ascending:false})
   .limit(500);
  if(error){
   state.docAttachmentError='Could not load attachments. Try reopening Documents.';
   console.error('Document attachment list failed',error);
   return;
  }
  records.push(...(data||[]));
 }
 state.docAttachments=records.sort((a,b)=>new Date(b.uploaded_at)-new Date(a.uploaded_at));
}
function attachmentListHtml(documentId){
 if(state.docAttachmentError)return '<p class="doc-att-empty">'+esc(state.docAttachmentError)+'</p>';
 const files=state.docAttachments.filter(x=>x.document_id===documentId);
 if(!files.length)return '<span class="doc-att-empty">No file attached yet</span>';
 return '<div class="doc-att-list">'+files.map(f=>{
  const filename=String(f.original_filename||'Attachment');
  const previewable=['application/pdf','image/jpeg','image/png','image/webp'].includes(f.content_type);
  const data=' data-kind="document" data-id="'+esc(f.id)+'" data-name="'+esc(filename)+'"';
  return '<div class="doc-att-row"><span class="doc-att-icon" aria-hidden="true">▤</span>'+
   '<span class="doc-att-name" title="'+esc(filename)+'">'+esc(filename)+'</span>'+
   '<span class="doc-att-actions">'+(previewable?
   '<button type="button" class="btn tiny alt iu-file-action"'+data+' data-mode="view" aria-label="View '+esc(filename)+'">View</button>':'')+
   '<button type="button" class="btn tiny alt iu-file-action"'+data+' data-mode="download" aria-label="Download '+esc(filename)+'">Download</button>'+
   '</span></div>';
 }).join('')+'</div>';
}
window.addEventListener('itrack:document-uploaded',async event=>{
 const id=event.detail?.documentId;
 if(!active()||state.view!=='documents'||!state.docs.some(x=>x.id===id))return;
 try{
  await loadDocumentAttachments();
  if(state.view!=='documents')return;
  $.querySelectorAll('[data-doc-files]').forEach(el=>{
   const docId=el.getAttribute('data-doc-files');
   if(state.docs.some(d=>d.id===docId))el.innerHTML=attachmentListHtml(docId);
  });
 }catch(error){console.error('Could not refresh document attachments',error);}
});
async function loadRecipients(){const {data,error}=await db.rpc('i_track_recipient_directory');if(error)throw error;state.recipients=data||[];}
async function loadMonitor(){if(!state.selectedId){state.monitor=[];return;}const {data,error}=await db.rpc('i_track_monitor',{p_announcement_id:state.selectedId});if(error)throw error;state.monitor=data||[];}
async function loadVerification(){
 if(!yesAdmin()||!active())throw new Error('Administrator access required.');
 const announcements=state.announcements.filter(a=>['open','closed'].includes(a.status));
 if(!state.reviewSelectedId||!announcements.some(a=>a.id===state.reviewSelectedId))
  state.reviewSelectedId=announcements[0]?.id||'';
 const requestedId=state.reviewSelectedId;
 if(!requestedId){
  state.reviewRows=[];state.reviewVersions=[];state.reviewRequired=0;
  return;
 }
 const {data:assignments,error:assignmentError}=await db.from('announcement_assignments')
  .select('id,school_id,assigned_user_id').eq('announcement_id',requestedId).eq('obligation_status','required');
 if(assignmentError)throw assignmentError;
 if(state.reviewSelectedId!==requestedId)return;
 const required=(assignments||[]).length;
 const versions=[];
 if(required){
  const ids=assignments.map(a=>a.id);
  for(let i=0;i<ids.length;i+=40){
   // Pagination is important: old versions must not silently disappear when
   // there are hundreds of records across the district.
   for(let offset=0;;offset+=500){
    const {data,error}=await db.from('submissions')
     .select('id,assignment_id,original_filename,content_type,file_size_bytes,first_received_at,version_number,verification_status,verified_at,storage_status')
     .in('assignment_id',ids.slice(i,i+40))
     .in('storage_status',['uploaded','archived'])
     .order('version_number',{ascending:false})
     .order('first_received_at',{ascending:false})
     .order('id',{ascending:false})
     .range(offset,offset+499);
    if(error)throw error;
    versions.push(...(data||[]));
    if(!data||data.length<500)break;
    if(offset>=9500)throw new Error('Submission history exceeds the current display limit. Contact district support.');
   }
  }
 }
 if(state.reviewSelectedId!==requestedId)return;
 const assigned=new Map((assignments||[]).map(a=>[a.id,a]));
 const byAssignment=new Map();
 for(const file of versions){
  if(!byAssignment.has(file.assignment_id))byAssignment.set(file.assignment_id,[]);
  byAssignment.get(file.assignment_id).push(file);
 }
 const rows=[];
 for(const [assignmentId,files] of byAssignment){
  files.sort((a,b)=>Number(b.version_number)-Number(a.version_number)||
   new Date(b.first_received_at)-new Date(a.first_received_at));
  const current=files[0];
  const latestVerified=files.find(f=>f.verification_status==='verified')||null;
  const assignment=assigned.get(assignmentId);
  const schoolName=state.schools.find(sc=>sc.id===assignment?.school_id)?.name||'Individual assignment';
  rows.push({...current,school_name:schoolName,latestVerified,versions:files});
 }
 state.reviewRequired=required;
 state.reviewVersions=versions;
 state.reviewRows=rows.sort((a,b)=>a.school_name.localeCompare(b.school_name));
}
function reviewFileActions(file,compact=false){
 const filename=String(file.original_filename||'Document');
 if(file.storage_status==='archived')
  return '<span class="small muted">Archived to SSD — online file unavailable</span>';
 const previewable=['application/pdf','image/jpeg','image/png','image/webp'].includes(file.content_type);
 const attrs=' data-kind="announcement" data-id="'+esc(file.id)+'" data-name="'+esc(filename)+'"';
 return '<span class="verify-file-actions'+(compact?' is-compact':'')+'">'+
  (previewable?'<button type="button" class="btn tiny alt iu-file-action" data-mode="view"'+attrs+'>View</button>':'')+
  '<button type="button" class="btn tiny alt iu-file-action" data-mode="download"'+attrs+'>Download</button></span>';
}
function verificationPage(){
 if(!yesAdmin())return '<div class="notice danger">Administrator access required.</div>';
 const notices=state.announcements.filter(a=>['open','closed'].includes(a.status));
 const options=notices.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===state.reviewSelectedId?' selected':'')+'>'+esc(announcementName(a))+'</option>').join('');
 const uploadedSchools=state.reviewRows.length;
 const awaitingNow=state.reviewRows.filter(s=>s.verification_status==='pending').length;
 const oldPending=state.reviewRows.reduce((count,s)=>count+s.versions.slice(1).filter(f=>f.verification_status==='pending').length,0);
 const currentVerified=state.reviewRows.filter(s=>s.verification_status==='verified').length;
 const rows=state.reviewRows.map(s=>{
  const name=String(s.original_filename||'Uploaded document');
  const currentStatus=['pending','verified','rejected'].includes(s.verification_status)?s.verification_status:'pending';
  const approved=s.latestVerified;
  const approvedText=approved?
   '<div class="verify-approved"><span class="verify-status verify-status-verified">Verified V'+esc(approved.version_number)+'</span>'+
   '<span class="small muted">'+esc(approved.original_filename)+'</span>'+
   '<span class="small muted">Reviewed '+esc(date(approved.verified_at))+'</span></div>':
   '<span class="small muted">No verified version yet</span>';
  const decision=currentStatus==='pending'?
   '<div class="verify-action-buttons"><button class="btn tiny" type="button" data-a="verify-submission" data-id="'+esc(s.id)+'">Verify V'+esc(s.version_number)+'</button>'+
   '<button class="btn tiny danger" type="button" data-a="reject-submission" data-id="'+esc(s.id)+'">Reject</button></div>':
   '<span class="small muted">'+(currentStatus==='verified'?'Latest upload already verified':'Latest upload rejected')+'</span>';
  const history=s.versions.map((f,index)=>{
   const versionStatus=['pending','verified','rejected'].includes(f.verification_status)?f.verification_status:'pending';
   const superseded=index>0;
   const flag=superseded?'Previous version': 'Latest upload';
   const statusLabel=superseded&&versionStatus==='pending'?'Pending (superseded)':label(versionStatus);
   return '<div class="verify-history-entry'+(superseded?' is-prior':' is-current')+'">'+
    '<div class="verify-history-top"><strong>V'+esc(f.version_number)+' · '+flag+'</strong>'+
    '<span class="verify-status verify-status-'+versionStatus+(superseded&&versionStatus==='pending'?' verify-status-superseded':'')+'">'+esc(statusLabel)+'</span></div>'+
    '<div class="verify-history-file">'+esc(f.original_filename)+'</div>'+
    '<div class="small muted">Received '+esc(date(f.first_received_at))+
    (f.verified_at?' · Reviewed '+esc(date(f.verified_at)):'')+'</div>'+
    reviewFileActions(f,true)+'</div>';
  }).join('');
  const historyControl='<details class="verify-history"><summary>View version history ('+s.versions.length+')</summary>'+
   '<div class="verify-history-list">'+history+'</div></details>';
  return '<tr><td><strong>'+esc(s.school_name)+'</strong></td>'+
   '<td class="verify-file-cell"><span class="verify-current-label">Latest upload · V'+esc(s.version_number)+'</span>'+
   '<strong class="verify-file-name">'+esc(name)+'</strong>'+
   '<div class="small muted">Received '+esc(date(s.first_received_at))+' · '+(Number(s.file_size_bytes||0)/1024).toFixed(1)+' KB</div>'+
   reviewFileActions(s)+'</td>'+
   '<td class="verify-approved-cell">'+approvedText+'</td>'+
   '<td><span class="verify-status verify-status-'+currentStatus+'">'+esc(label(currentStatus))+'</span></td>'+
   '<td class="verify-review-cell">'+decision+historyControl+'</td></tr>';
 });
 return '<div class="sectionhead"><div><div class="eyebrow">District administrator</div>'+
  '<h1>Submission Verification</h1>'+
  '<p class="sub">Review the latest upload, compare it with the latest verified version, and inspect every earlier version.</p></div>'+
  '<button class="btn alt" data-a="refresh-verification">↻ Refresh</button></div>'+
  '<section class="panel verify-panel"><div class="verify-picker"><div class="field">'+
  '<label for="review-ann">Announcement to review</label><select id="review-ann">'+options+'</select></div>'+
  '<div class="verify-summary"><strong>'+awaitingNow+'</strong><span>Latest uploads awaiting review</span>'+
  '<small>'+currentVerified+' current versions verified · '+uploadedSchools+' schools with uploads · '+state.reviewRequired+' required assignments</small></div></div>'+
  '<div class="notice">Verify or reject the latest submitted version only. Approval does not change the submission deadline or timeliness.</div>'+
  (oldPending?'<p class="verify-historical-note"><strong>'+oldPending+' earlier version'+(oldPending===1?' is':'s are')+' still marked Pending.</strong> '+
   'They are superseded and shown in Version History, not in the current review queue. No historical decisions have been changed.</p>':'')+
  (state.reviewSelectedId?table(['School','Latest submission','Latest verified','Current status','Review / History'],rows):
   '<div class="empty">No published announcements are available for verification.</div>')+
  (state.reviewSelectedId&&!rows.length?'<p class="note">No uploaded submissions for this announcement yet.</p>':'')+
  '</section>';
}
function show(){
 if(state.issue){$.innerHTML=`<div class="startup"><h2>Connection problem</h2><p>${esc(state.issue)}</p><button class="btn" data-a="retry">Retry</button></div>`;return;}
 if(!state.session){window.ITRACK_CONTEXT=null;authPage();return;}
 if(!state.profile){$.innerHTML='<div class="startup">Preparing account…</div>';return;}
 if(!active()){window.ITRACK_CONTEXT=null;pendingPage();return;}
 appPage();
}
function authPage(){
 const registering=state.authMode==='register';
 $.innerHTML=`<div class="auth">
 <aside class="auth-aside">${brand()}<div><h1>Connecting Schools.<br><em>Tracking Documents.</em><br>Ensuring Accountability.</h1><p>San Remigio II District — integrated announcements, document routing and compliance monitoring.</p></div><small>SAN REMIGIO II · OFFICIAL WORKSPACE TRIAL</small></aside>
 <main class="auth-content"><div class="auth-card"><div class="auth-top"><button class="btn alt tiny" data-a="theme">◐ Light / Dark</button></div>
 <div class="eyebrow">Welcome to SRII i-TRACK</div><h1>${registering?'Create an Account':'Sign In'}</h1><p class="sub">${registering?'Use your DepEd or personal Gmail account. District approval is required.':'Use your registered email and password.'}</p>
 <form id="${registering?'register':'login'}">
 ${registering?field('Complete name','full_name')+`<div class="field"><label for="registration-type">Account type</label><select id="registration-type" name="registration_type"><option value="school_user">School Personnel</option><option value="oic_psds">OIC-PSDS · District Oversight (Read Only)</option></select></div>`+field('Position / Designation','position_title','text','','Administrative Officer II')+`<div class="field" id="register-school-field"><label for="school">School</label><select id="school" name="school" required><option value="">Select your school</option>${schoolOpts()}</select></div><p class="note" id="oic-register-note" hidden>The OIC-PSDS account is assigned to the District Office, with no school. Only the Main Administrator may approve this request. Oversight does not grant file, upload or approval access.</p>`:''}
 ${field('Email address','email','email')}${field('Password','password','password')}<button type="submit" class="btn block">${registering?'Register Account':'Sign In'}</button></form>
 <div class="switch">${registering?'Already registered?':'New personnel?'} <button class="link-button" data-a="switch">${registering?'Sign in':'Register here'}</button></div>
 <p class="note">Your password is handled by Supabase Authentication; never send it to the district administrator.</p></div></main></div>`;
}
function pendingPage(){
 const oic=isOic();
 const waiting=state.profile.account_status==='pending';
 const detail=waiting?
  (oic?'The Main Administrator must approve this District Office oversight account. No school assignment is required.':
   'Your registration needs approval and school assignment by the District Administrator.'):
  'Contact the District Administrator if you believe this is a mistake.';
 $.innerHTML='<div class="pending">'+brand()+'<h2 style="margin-top:24px">'+
  (waiting?'Waiting for Approval':'Account Not Active')+'</h2><p class="sub">'+
  esc(detail)+'</p>'+(oic?'<p class="note"><strong>Requested role:</strong> OIC-PSDS · Read-only district oversight</p>':'')+
  pTag(state.profile.account_status)+'<p></p><div class="toolbar"><button class="btn" data-a="refresh">Check Again</button>'+
  '<button class="btn alt" data-a="logout">Sign Out</button></div></div>';
}
const menu=[['dashboard','⌂ Home'],['announcements','▤ Announcements'],['monitoring','▥ Submission Status']];
function appPage(){
 const nav=[...menu,...(!isOic()?[['documents','▣ My Documents']]:[]),...(districtOversight()?[['reports','▥ District Reports']]:[]),...(yesAdmin()?[['verification','✓ Submission Verification'],['approvals','♙ Account Approvals'],['archive','▤ Archive Documents']]:[])].map(([id,title])=>`<button class="${state.view===id?'active':''}" data-a="nav" data-page="${id}">${title}</button>`).join('');
 const title={dashboard:'Home',announcements:'Announcements',monitoring:'Submission Monitoring',documents:'My Documents',reports:'District Reports',verification:'Submission Verification',approvals:'Account Management',archive:'Document Archiving'}[state.view]||'Overview';
 const school=state.schools.find(x=>x.id===state.profile.school_id)?.name||'District Office';
 const name=state.profile.display_name||(isOic()?'OIC-PSDS':'District Administrator');
 const body={dashboard:dashboardPage,announcements:announcementPage,monitoring:monitorPage,documents:documentPage,reports:districtReportPage,verification:verificationPage,approvals:approvalPage,archive:archivePage}[state.view]?.()||dashboardPage();
 // Read-only presentation context for the upload panel. Not an authorization
 // mechanism: Supabase RLS and the Edge Function enforce permissions.
 window.ITRACK_CONTEXT={
   userId:state.session?.user?.id||null,
   profile:{role:state.profile.role,school_id:state.profile.school_id,
            account_status:state.profile.account_status},
   schools:state.schools.map(s=>({id:s.id,name:s.name,is_active:s.is_active})),
   announcements:state.announcements.map(a=>({id:a.id,announcement_code:a.announcement_code,title:a.title,status:a.status,deadline_at:a.deadline_at})),
   docs:state.docs.map(d=>({id:d.id,tracking_number:d.tracking_number,subject:d.subject}))
 };
 $.innerHTML=`<div class="app"><aside class="sidebar">${brand()}<nav>${nav}</nav><div class="sidebar-footer"><button data-a="theme">◐ Light / Dark Mode</button><button data-a="logout">↩ Sign Out</button><div class="user-mini">${esc(name)}<br>${esc(label(state.profile.role))} · ${esc(school)}</div></div></aside>
 <div class="main"><header class="topbar"><div><h2>${esc(title)}</h2><div class="note">One District. One Direction.</div></div>${pTag('active')}</header><div class="content">${body}</div></div></div>${state.modal?modalHtml():''}`;
}
function dashboardPage(){
 const name=state.profile.display_name||"District User";
 const school=state.schools.find(x=>x.id===state.profile.school_id)?.name||"District Office";
 const admin=yesAdmin();
 const oversight=isOic();
 const report=state.districtReport||[];
 const reportTotals=report.reduce((sum,x)=>({required:sum.required+Number(x.required_schools||0),submitted:sum.submitted+Number(x.submitted_count||0),late:sum.late+Number(x.late_count||0),pending:sum.pending+Number(x.pending_count||0)}),{required:0,submitted:0,late:0,pending:0});
 const assigned=state.schoolAssignments||[];
 const submissions=state.schoolSubmissions||[];
 const byAnn=new Map();
 if(!admin&&!oversight){
  for(const a of assigned){
   const ann=state.announcements.find(n=>n.id===a.announcement_id);
   if(ann&&ann.status!=="draft")byAnn.set(ann.id,{...ann,assignmentId:a.id});
  }
 }
 const mine=[...byAnn.values()];
 const latest=(admin||oversight?state.announcements.filter(a=>a.status!=="draft"):mine).slice(0,5);
 function receipt(assignmentId){
  const dates=submissions.filter(s=>s.assignment_id===assignmentId).map(s=>new Date(s.first_received_at).getTime()).filter(Number.isFinite);
  return dates.length?Math.min(...dates):null;
 }
 function schoolStatus(a){
  const time=receipt(a.assignmentId);
  if(time!==null)return time>new Date(a.deadline_at).getTime()?"Late":"Submitted";
  return a.deadline_at&&Date.now()>new Date(a.deadline_at).getTime()?"Pending":"Pending";
 }
 const submitted=mine.filter(a=>schoolStatus(a)==="Submitted").length;
 const late=mine.filter(a=>schoolStatus(a)==="Late").length;
 const pending=mine.filter(a=>schoolStatus(a)==="Pending").length;
 const metrics=admin?[
  ["Schools",state.schools.filter(s=>s.is_active).length,"school"],
  ["Open Notices",state.announcements.filter(a=>a.status==="open").length,"file-text"],
  ["Documents",state.docs.length,"folder"],
  ["Approvals",state.profiles.filter(p=>p.account_status==="pending").length,"user"]
 ]:oversight?[
  ["Schools",state.schools.filter(s=>s.is_active).length,"school"],
  ["Announcements",state.announcements.filter(a=>a.status!=="draft").length,"file-text"],
  ["Submitted",reportTotals.submitted,"check"],
  ["Pending",reportTotals.pending,"clock"]
 ]:[
  ["Requirements",mine.length,"file-text"],
  ["Submitted",submitted,"check"],
  ["Pending",pending,"clock"],
  ["Late",late,"alert"]
 ];
 const signs={school:"▥","file-text":"▤",folder:"▣",user:"♙",check:"✓",clock:"◷",alert:"!"};
 const metricHtml=metrics.map(([title,num,key],i)=>
  '<div class="v2-metric v2-metric-'+i+'"><span class="v2-metric-icon" aria-hidden="true">'+signs[key]+'</span><div><span class="v2-metric-label">'+esc(title)+'</span><strong>'+esc(num)+'</strong></div></div>'
 ).join("");
 const announcements=latest.map(a=>{
  const status=admin||oversight?a.status:schoolStatus(a);
  const detail=admin||oversight?"View status":status==="Submitted"?"View":"Open";
  return '<div class="v2-notice-item"><span class="v2-notice-symbol" aria-hidden="true">▤</span><div class="v2-notice-copy"><strong>'+esc(a.title)+'</strong><small>'+esc((a.announcement_code?a.announcement_code+' · ':'')+short(a.deadline_at))+'</small></div>'+
   '<span class="v2-notice-state">'+pTag(status)+'</span>'+
   '<button class="btn tiny alt" data-a="nav" data-page="announcements">'+detail+'</button></div>';
 }).join("")||'<div class="empty">No assigned announcements yet.</div>';
 const upcoming=latest.filter(a=>a.deadline_at&&new Date(a.deadline_at)>new Date()&&a.status!=="closed")
  .sort((a,b)=>new Date(a.deadline_at)-new Date(b.deadline_at)).slice(0,3);
 const reminders=upcoming.map(a=>'<div class="v2-reminder"><span class="v2-dot"></span><span>'+esc(short(a.deadline_at))+'</span><strong>'+esc(announcementName(a))+'</strong></div>').join("")||
  '<p class="note">No upcoming deadlines.</p>';
 const quick=oversight?
  '<div class="v2-actions">'+
   '<button data-a="nav" data-page="announcements"><span>▤</span><strong>Announcements</strong><small>District notices</small></button>'+
   '<button data-a="nav" data-page="monitoring"><span>▥</span><strong>School Status</strong><small>District-wide compliance</small></button>'+
   '<button data-a="nav" data-page="reports"><span>▦</span><strong>District Reports</strong><small>Read-only summaries</small></button>'+
  '</div>':
  '<div class="v2-actions">'+
   '<button data-a="nav" data-page="announcements"><span>↥</span><strong>Submit a File</strong><small>School requirements</small></button>'+
   '<button data-a="nav" data-page="documents"><span>▣</span><strong>My Documents</strong><small>Route and track</small></button>'+
   '<button data-a="nav" data-page="monitoring"><span>▥</span><strong>District Status</strong><small>Submission progress</small></button>'+
   (admin?'<button data-a="nav" data-page="approvals"><span>♙</span><strong>Account Review</strong><small>Approve school users</small></button>':
    '<button data-a="nav" data-page="announcements"><span>◷</span><strong>Due Dates</strong><small>Latest notices</small></button>')+
  '</div>';
 return '<section class="v2-intro"><div><div class="eyebrow">SAN REMIGIO II DISTRICT</div><h1>Welcome back, '+esc(name)+'!</h1><p class="v2-role">'+esc(oversight?"OIC-PSDS · District Oversight (Read Only)":admin?"District Administrator":school)+'</p></div><div class="v2-motto">One District. One Direction.<br><strong>Organized for a Stronger SRII.</strong></div></section>'+
  '<div class="v2-metrics">'+metricHtml+'</div>'+
  '<div class="v2-home-grid"><div class="v2-home-primary">'+
  '<section class="panel v2-board"><div class="panel-head"><h3>Latest Announcements</h3><button class="btn tiny alt" data-a="nav" data-page="announcements">View All</button></div><div class="v2-notice-list">'+announcements+'</div></section>'+
  '<section class="panel v2-board"><h3>Quick Actions</h3>'+quick+'</section>'+
  '</div><div class="v2-home-secondary">'+
  '<section class="panel v2-board"><h3>At a Glance</h3><div class="v2-summary-big">'+esc(admin?state.announcements.filter(a=>a.status==="open").length:oversight?reportTotals.submitted:submitted)+'<small>'+esc(admin?"Open announcements":oversight?"On-time school submissions":"Submitted requirements")+'</small></div>'+
   '<button class="btn alt block" data-a="nav" data-page="monitoring">View Submission Status</button></section>'+
  '<section class="panel v2-board"><h3>Upcoming Deadlines</h3>'+reminders+'</section>'+
  '</div></div>';
}
function districtReportPage(){
 if(!districtOversight())return '<div class="notice danger">District oversight access required.</div>';
 const reports=state.districtReport||[];
 const total=reports.reduce((sum,r)=>({
  required:sum.required+Number(r.required_schools||0),
  onTime:sum.onTime+Number(r.submitted_count||0),
  late:sum.late+Number(r.late_count||0),
  pending:sum.pending+Number(r.pending_count||0)
 }),{required:0,onTime:0,late:0,pending:0});
 const complete=total.required?Math.round(((total.onTime+total.late)/total.required)*100):0;
 const rows=reports.map(r=>{
  const required=Number(r.required_schools||0);
  const onTime=Number(r.submitted_count||0);
  const late=Number(r.late_count||0);
  const pending=Number(r.pending_count||0);
  const percent=required?Math.round(((onTime+late)/required)*100):0;
  return '<tr><td><strong>'+esc(r.announcement_code)+'</strong><div class="small muted">'+esc(r.title)+'</div></td>'+
    '<td>'+esc(short(r.deadline_at))+'</td>'+
    '<td>'+esc(required)+'</td><td>'+esc(onTime)+'</td><td>'+esc(late)+'</td>'+
    '<td>'+esc(pending)+'</td><td><strong>'+esc(percent)+'%</strong></td></tr>';
 });
 return '<div class="sectionhead"><div><div class="eyebrow">District-wide reporting</div>'+
  '<h1>District Reports</h1><p class="sub">Read-only compliance summaries for official oversight. Submission files and individual upload times are not included.</p></div>'+
  '<button class="btn alt" data-a="export-district-report"'+(!reports.length?' disabled':'')+'>↧ Export CSV</button></div>'+
  '<div class="stats">'+stat('Announcements',reports.length,'Published district requests')+
  stat('School requirements',total.required,'Across all announcements')+
  stat('On-time submissions',total.onTime,'Received by the deadline')+
  stat('Late submissions',total.late,'Received after the deadline')+
  stat('Pending',total.pending,'Not yet submitted')+
  stat('Completion',complete+'%','Submitted on time or late')+'</div>'+
  '<section class="panel"><h3>Announcement Compliance Summary</h3>'+
  table(['Announcement','Deadline','Required','On Time','Late','Pending','Completion'],rows)+
  '<p class="note">Counts are based on each school’s first securely received submission and the current official deadline. No school’s file or submission timestamp is shown.</p></section>';
}
function exportDistrictReport(){
 if(!districtOversight())throw new Error('District oversight access required.');
 const rows=state.districtReport||[];
 if(!rows.length)throw new Error('There are no district reports to export.');
 const csvCell=value=>{
  const content=String(value??'');
  const protectedValue=/^[=+\-@\t\r]/.test(content.trimStart())?"'"+content:content;
  return '"'+protectedValue.replaceAll('"','""')+'"';
 };
 const head=['Announcement Reference','Announcement Title','Deadline (PHT)','Required Schools','On Time','Late','Pending','Completion Percent'];
 const lines=[head.map(csvCell).join(',')];
 for(const row of rows){
  const required=Number(row.required_schools||0);
  const received=Number(row.submitted_count||0)+Number(row.late_count||0);
  lines.push([row.announcement_code,row.title,date(row.deadline_at),required,
   Number(row.submitted_count||0),Number(row.late_count||0),Number(row.pending_count||0),
   required?Math.round(received/required*100):0].map(csvCell).join(','));
 }
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;
 link.download='SRII_District_Compliance_Report_'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function announcementPage(){
 const rows=state.announcements.map(a=>`<tr><td><span class="ann-ref">${esc(a.announcement_code||'')}</span><strong>${esc(a.title)}</strong><div class="small muted">${esc(a.description||'')}</div></td><td>${pTag(a.status)}</td><td>${short(a.deadline_at)}</td><td><button class="btn tiny alt" data-a="monitor" data-id="${a.id}">Monitor</button></td></tr>`);
 return `<div class="sectionhead"><div><div class="eyebrow">District requirements</div><h1>Announcements</h1><p class="sub">Official school submission requests and deadlines.</p></div>${yesAdmin()?'<button class="btn" data-a="new-announcement">+ New Announcement</button>':''}</div><div class="panel"><h3>Announcement Board</h3>${table(['Announcement','Status','Deadline',''],rows)}</div>`;
}
function monitorPage(){
 const opts=state.announcements.filter(a=>a.status!=='draft').map(a=>`<option value="${a.id}" ${a.id===state.selectedId?'selected':''}>${esc(announcementName(a))}</option>`).join('');
 const n=x=>state.monitor.filter(s=>s.submission_status===x).length;
 const rows=state.monitor.map(x=>`<tr><td>${esc(x.school_name)}</td><td>${pTag(x.submission_status)}</td></tr>`);
 return `<div class="eyebrow">District-wide visibility</div><h1>Submission Monitoring</h1><p class="sub">All users see school status only. Documents and other schools' submission dates remain private.</p>
 <div class="panel"><div class="field"><label>Announcement</label><select id="pick-ann"><option value="">Choose an announcement</option>${opts}</select></div></div>
 ${state.selectedId?`<div class="stats">${stat('Required Schools',state.monitor.length,'For selected announcement')}${stat('Submitted',n('Submitted'),'On time')}${stat('Late',n('Late'),'After deadline')}${stat('Pending',n('Pending'),'Not yet submitted')}</div><div class="panel"><h3>School Status</h3>${table(['School','Status'],rows)}</div>`:'<div class="panel empty">Choose an announcement to view status.</div>'}
 <div class="notice">Privacy: this view does not show other schools' files, upload dates, names of submitters, or download links.</div>`;
}
function documentPage(){
 const rows=state.docs.map(d=>'<tr>'+
  '<td><b>'+esc(d.tracking_number)+'</b></td>'+
  '<td>'+esc(d.subject)+'</td>'+
  '<td>'+esc(d.document_type)+'</td>'+
  '<td>'+pTag(d.status)+'</td>'+
  '<td class="doc-attachment-cell"><div data-doc-files="'+esc(d.id)+'">'+attachmentListHtml(d.id)+'</div></td>'+
  '<td><button class="btn tiny alt" data-a="detail" data-id="'+esc(d.id)+'">Open</button></td>'+
  '</tr>');
 return `<div class="sectionhead"><div><div class="eyebrow">Routing and acknowledgment</div><h1>My Documents</h1><p class="sub">Open a document or view its attached files directly below.</p></div><button class="btn" data-a="send">+ Route Document</button></div><div class="panel"><h3>Document Registry</h3>${table(['Tracking #','Document Name','Type','Status','Attachments',''],rows)}</div>
 <div class="panel"><h3>Compress a Screenshot</h3><div class="notice">Image compression works locally and is free. Documents can be attached using the secure upload panel above.</div><div class="filebox"><input id="image-file" type="file" accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx"><p id="file-status" class="note" style="margin:9px 0 0">${esc(state.fileNote||'Choose a screenshot, PDF, or Word document.')}</p></div><div class="toolbar" style="margin-top:13px"><button class="btn alt" data-a="compress">Compress File</button>${state.compressed?'<button class="btn alt" data-a="save-compressed">Download Compressed Image</button>':''}<button class="btn" disabled>Upload to Drive — Use secure panel above</button></div></div>`;
}
function approvalPage(){
 if(!yesAdmin())return '<div class="notice danger">Administrator access required.</div>';
 const rows=state.profiles.map(p=>{
  const oversight=p.role==='oic_psds';
  const school=oversight?'District Office (no school)':state.schools.find(s=>s.id===(p.school_id||p.requested_school_id))?.name||'Unassigned';
  const pending=p.account_status==='pending';
  const canReview=pending&&(!oversight||isMain());
  const actions=canReview?
   '<button class="btn tiny" data-a="approve" data-id="'+esc(p.id)+'">Approve</button>'+
   '<button class="btn tiny danger" data-a="reject" data-id="'+esc(p.id)+'">Reject</button>':
   pending&&oversight?'<span class="small muted">Main Administrator only</span>':
   isMain()&&p.account_status==='active'&&p.role!=='main_admin'&&p.role!=='oic_psds'?
   '<button class="btn tiny alt" data-a="backup" data-id="'+esc(p.id)+'" data-enable="'+(p.role==='backup_admin'?'false':'true')+'">'+
   (p.role==='backup_admin'?'Remove Backup':'Make Backup')+'</button>':'';
  const roleLabel=oversight?'OIC-PSDS · Read Only':label(p.role);
  return '<tr><td><strong>'+esc(p.display_name||'Unnamed user')+'</strong>'+
   '<div class="small muted">'+esc(p.position_title||'')+'</div></td>'+
   '<td>'+esc(school)+'</td><td>'+pTag(p.account_status)+'</td>'+
   '<td>'+esc(roleLabel)+'</td><td><div class="actionbuttons">'+actions+'</div></td></tr>';
 });
 return '<div class="eyebrow">Administrator controls</div><h1>Account Approvals</h1>'+
  '<p class="sub">Approve school personnel with a school assignment. The OIC-PSDS requests a separate District Office role with no school and read-only access; only the Main Administrator may approve it.</p>'+
  '<div class="panel">'+table(['Name','School / Office','Status','Role','Action'],rows)+'</div>';
}
function archivePage(){return `<div class="eyebrow">Administrator controls</div><h1>Archive Documents</h1><p class="sub">Two-month archival to an SSD after verification.</p><div class="panel"><div class="notice warn"><b>Not yet enabled.</b> This will prepare downloadable archives, verify copies, and require administrator confirmation before any Drive files are deleted.</div><button class="btn" disabled>Archive Documents</button><p class="note" style="margin-top:12px">Submission metadata and audit history will remain in Supabase after archiving.</p></div>`;}
function modalHtml(){
 const m=state.modal;let title='',body='',footer='';
 if(m==='new-announcement'){
  title='Create Announcement';
  body=`<form id="form-ann">${field('Title','title')}<div class="field"><label>Description / Instructions</label><textarea name="description" placeholder="What should schools submit?"></textarea></div>${field('Deadline (Philippine time)','deadline','datetime-local')}<div class="field"><label>Required schools</label><label class="small"><input type="checkbox" id="all-schools" checked> Select all schools</label><div class="school-grid">${state.schools.filter(x=>x.is_active).map(x=>`<label><input class="school-checkbox" type="checkbox" value="${x.id}" checked> ${esc(x.name)}</label>`).join('')}</div></div></form>`;
  footer='<button class="btn alt" data-a="close">Cancel</button><button class="btn" type="submit" form="form-ann">Publish</button>';
 }else if(m==='send'){
  title='Route a Document';
  body=`<form id="form-doc">${field('Subject','subject')}${field('Document Type','type','text','General')}<div class="field"><label>Recipient</label><select name="recipient" required><option value="">Choose recipient</option>${state.recipients.filter(x=>x.user_id!==state.session.user.id).map(x=>`<option value="${x.user_id}">${esc(x.display_name)} · ${esc(x.school_name)}</option>`).join('')}</select></div><div class="field"><label>Instructions (optional)</label><textarea name="notes"></textarea></div></form><div class="notice">Routing records are active. Online file attachments are not yet enabled.</div>`;
  footer='<button class="btn alt" data-a="close">Cancel</button><button class="btn" type="submit" form="form-doc">Send Document</button>';
 }else if(m==='detail'){
  const d=state.detail;title=d.tracking_number;
  const routes=state.routes;const last=routes.at(-1);const mine=last?.to_user_id===state.session.user.id;
  const canAck=mine&&last.status==='awaiting_ack';const canForward=mine&&last.status==='received'&&!last.processed_at;
  body=`<h3>${esc(d.subject)}</h3><p class="sub">${esc(d.document_type)} · ${pTag(d.status)} · ${date(d.created_at)}</p><section class="doc-detail-attachments"><h3>Attached Files</h3><div data-doc-files="${esc(d.id)}">${attachmentListHtml(d.id)}</div></section><h3>Routing History</h3><div class="timeline">${routes.map(r=>`<div class="event"><strong>${esc(label(r.route_action))} · ${esc(label(r.status))}</strong><span class="small muted">${date(r.sent_at)}</span>${r.note?`<p>${esc(r.note)}</p>`:''}${r.acknowledged_at?`<p class="note">Acknowledged: ${date(r.acknowledged_at)}</p>`:''}</div>`).join('')}</div>`;
  if(canForward)body+=`<div class="field"><label>Next recipient</label><select id="next-person"><option value="">Choose recipient</option>${state.recipients.filter(x=>x.user_id!==state.session.user.id).map(x=>`<option value="${x.user_id}">${esc(x.display_name)} · ${esc(x.school_name)}</option>`).join('')}</select></div><div class="field"><label>Note (optional)</label><input id="route-note"></div>`;
  footer=`<button class="btn alt" data-a="close">Close</button>${canAck?`<button class="btn" data-a="ack" data-id="${last.id}">Acknowledge Receipt</button>`:''}${canForward?`<button class="btn alt" data-a="route" data-id="${last.id}" data-return="true">Return</button><button class="btn" data-a="route" data-id="${last.id}" data-return="false">Forward</button>`:''}`;
 }
 return `<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn alt tiny" data-a="close">✕</button></header>${body}<footer>${footer}</footer></div></div>`;
}
async function openDetail(id){
 const d=state.docs.find(x=>x.id===id);if(!d)return;
 const {data,error}=await db.from('document_routes').select('*').eq('document_id',id).order('sent_at');if(error)throw error;
 state.detail=d;state.routes=data||[];await loadRecipients();state.modal='detail';show();
}
async function compress(){
 const f=state.file||document.getElementById('image-file')?.files?.[0];
 if(!f)throw new Error('Select a file first.');
 if(!['image/jpeg','image/png','image/webp'].includes(f.type)){state.fileNote='PDF and Word documents are preserved without compression.';state.compressed=null;show();return;}
 const bmp=await createImageBitmap(f), scale=Math.min(1,1920/Math.max(bmp.width,bmp.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);
 const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close?.();
 const blob=await new Promise(done=>canvas.toBlob(done,'image/webp',0.84));
 if(!blob)throw new Error('This browser cannot compress the image.');
 const use=blob.size<f.size;
 state.compressed=use?new File([blob],f.name.replace(/\.[^.]+$/,'')+'-compressed.webp',{type:'image/webp'}):f;
 state.fileNote=use?`Reduced from ${(f.size/1024).toFixed(0)} KB to ${(blob.size/1024).toFixed(0)} KB. Download and check text readability.`:'Original image is already smaller; keeping the original file.';
 show();pop('Compression complete. No file was uploaded.');
}
async function click(e){
 const t=e.target.closest('[data-a]');if(!t||state.busy)return;
 const a=t.dataset.a;
 try{
  if(a==='retry'){location.reload();return;}
  if(a==='switch'){state.authMode=state.authMode==='login'?'register':'login';show();return;}
  if(a==='theme'){state.theme=state.theme==='dark'?'light':'dark';localStorage.setItem('srii-theme',state.theme);document.documentElement.dataset.theme=state.theme;show();return;}
  if(a==='logout'){await db.auth.signOut();state.session=null;state.profile=null;state.view='dashboard';state.modal=null;show();return;}
  if(a==='refresh'){await sync();return;}
  if(a==='export-district-report'){exportDistrictReport();pop('District compliance report prepared.');return;}
  if(a==='nav'){
   if(t.dataset.page==='verification'&&!yesAdmin())throw new Error('Administrator access required.');
   if(t.dataset.page==='reports'&&!districtOversight())throw new Error('District oversight access required.');
   if(isOic()&&!['dashboard','announcements','monitoring','reports'].includes(t.dataset.page))throw new Error('This OIC-PSDS account is read-only.');
   state.view=t.dataset.page;state.modal=null;
   const url=new URL(location.href);
   if(['verification','reports'].includes(state.view))url.searchParams.set('view',state.view);
   else url.searchParams.delete('view');
   history.replaceState(null,'',url);
   await load();return;
  }
  if(a==='refresh-verification'){
   if(!yesAdmin()||state.view!=='verification')throw new Error('Administrator access required.');
   await loadVerification();show();pop('Verification list refreshed.');return;
  }
  if(a==='verify-submission'||a==='reject-submission'){
   if(!yesAdmin()||state.view!=='verification')throw new Error('Administrator access required.');
   const submission=state.reviewRows.find(x=>x.id===t.dataset.id);
   if(!submission||submission.verification_status!=='pending')throw new Error('Submission is no longer pending. Refresh the list.');
   const approving=a==='verify-submission';
   const confirmation=approving?
    'Have you opened and inspected "'+submission.original_filename+'" from '+submission.school_name+'? Verify Version '+submission.version_number+'?':
    'Reject "'+submission.original_filename+'" from '+submission.school_name+'? Its original upload and audit history will remain saved.';
   if(!confirm(confirmation))return;
   state.busy=true;t.disabled=true;
   try{
    const {error}=await db.rpc('i_track_verify_submission',{p_submission_id:submission.id,p_approved:approving});
    if(error)throw error;
    await loadVerification();show();
    pop(approving?'Submission verified.':'Submission rejected. A corrected version can be uploaded.');
   }finally{state.busy=false;t.disabled=false;}
   return;
  }
  if(a==='monitor'){state.selectedId=t.dataset.id;state.view='monitoring';await load();return;}
  if(a==='close'){state.modal=null;show();return;}
  if(a==='new-announcement'){state.modal='new-announcement';show();return;}
  if(a==='send'){if(isOic())throw new Error('OIC-PSDS accounts cannot route documents.');await loadRecipients();state.modal='send';show();return;}
  if(a==='detail'){if(isOic())throw new Error('OIC-PSDS accounts cannot view private documents.');await openDetail(t.dataset.id);return;}
  if(a==='approve'||a==='reject'){
   const user=state.profiles.find(p=>p.id===t.dataset.id);if(!user)return;
   if(user.role==='oic_psds'&&!isMain())throw new Error('Only the Main Administrator can review OIC-PSDS registration.');
   if(!confirm(`${a==='approve'?'Approve':'Reject'} ${user.role==='oic_psds'?'the read-only OIC-PSDS District Office account':'this school user'}?`))return;
   const {error}=await db.rpc('i_track_review_account',{p_user_id:user.id,p_approve:a==='approve',p_school_id:user.requested_school_id||null});if(error)throw error;
   await load();pop('Account reviewed.');return;
  }
  if(a==='backup'){
   if(!confirm('Change Backup Administrator permissions?'))return;
   const {error}=await db.rpc('i_track_set_backup_admin',{p_user_id:t.dataset.id,p_enable:t.dataset.enable==='true'});if(error)throw error;
   await load();pop('Permissions updated.');return;
  }
  if(a==='ack'){
   const {error}=await db.rpc('i_track_acknowledge_route',{p_route_id:t.dataset.id});if(error)throw error;state.modal=null;await load();pop('Receipt acknowledged.');return;
  }
  if(a==='route'){
   const next=document.getElementById('next-person')?.value,note=document.getElementById('route-note')?.value||'';
   if(!next)throw new Error('Choose a recipient.');
   const {error}=await db.rpc('i_track_route_document',{p_route_id:t.dataset.id,p_next_user_id:next,p_return:t.dataset.return==='true',p_note:note});if(error)throw error;
   state.modal=null;await load();pop('Document routed.');return;
  }
  if(a==='compress'){await compress();return;}
  if(a==='save-compressed'){
   const f=state.compressed;if(!f)return;
   const u=URL.createObjectURL(f),anchor=document.createElement('a');anchor.href=u;anchor.download=f.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;
  }
 }catch(e){err(e);}
}
async function submit(e){
 const form=e.target;if(!['register','login','form-ann','form-doc'].includes(form.id))return;
 e.preventDefault();if(state.busy)return;state.busy=true;form.querySelectorAll('button[type=submit]').forEach(x=>x.disabled=true);
 try{
  const fd=new FormData(form);
  if(form.id==='register'){
   const email=clean(fd.get('email')),password=String(fd.get('password')||''),name=clean(fd.get('full_name')),school=clean(fd.get('school'));
   const type=clean(fd.get('registration_type'))||'school_user';
   if(!['school_user','oic_psds'].includes(type))throw new Error('Select a valid account type.');
   if(password.length<8)throw new Error('Password must have at least 8 characters.');
   if(!name||(!school&&type==='school_user'))throw new Error('Complete your name and school.');
   const meta={full_name:name,position_title:clean(fd.get('position_title'))|| (type==='oic_psds'?'OIC-PSDS':''),
      registration_type:type,requested_school_id:type==='oic_psds'?null:school};
   const {error}=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:meta}});if(error)throw error;
   state.authMode='login';show();pop(type==='oic_psds'?
    'OIC-PSDS registration requested. Verify your email, then wait for the Main Administrator to approve District Office oversight.':
    'Registration received. Please verify email and wait for district approval.');return;
  }
  if(form.id==='login'){
   const {error}=await db.auth.signInWithPassword({email:clean(fd.get('email')),password:String(fd.get('password')||'')});if(error)throw error;
   await sync();pop('Signed in.');return;
  }
  if(form.id==='form-ann'){
   const selected=[...form.querySelectorAll('.school-checkbox:checked')].map(c=>c.value);
   if(!selected.length)throw new Error('Select at least one school.');
   const raw=clean(fd.get('deadline'));if(!raw)throw new Error('Enter a deadline.');
   const localTime=new Date(raw+'+08:00');if(Number.isNaN(localTime.getTime()))throw new Error('Invalid deadline.');
   const {error}=await db.rpc('i_track_create_announcement',{p_title:clean(fd.get('title')),p_description:clean(fd.get('description')),p_deadline_at:localTime.toISOString(),p_school_ids:selected});if(error)throw error;
   state.modal=null;state.view='announcements';await load();pop('Announcement created.');return;
  }
  if(form.id==='form-doc'){
   const {data,error}=await db.rpc('i_track_send_document',{p_subject:clean(fd.get('subject')),p_document_type:clean(fd.get('type')),p_recipient_id:clean(fd.get('recipient')),p_notes:clean(fd.get('notes'))});if(error)throw error;
   state.modal=null;state.view='documents';await load();pop(`Document routed: ${data}`);return;
  }
 }catch(e){err(e);}finally{state.busy=false;}
}
$.addEventListener('click',click);
$.addEventListener('submit',submit);
$.addEventListener('change',async e=>{
 if(e.target.id==='registration-type'){
  const oic=e.target.value==='oic_psds';
  const group=document.getElementById('register-school-field');
  const select=document.getElementById('school');
  const info=document.getElementById('oic-register-note');
  if(group)group.hidden=oic;
  if(select){select.required=!oic;if(oic)select.value='';}
  const position=document.getElementById('position_title');
  if(position){
   position.placeholder=oic?'OIC-PSDS':'Administrative Officer II';
   if(oic&&!position.value)position.value='OIC-PSDS';
   else if(!oic&&position.value==='OIC-PSDS')position.value='';
  }
  if(info)info.hidden=!oic;
 }
 if(e.target.id==='all-schools')document.querySelectorAll('.school-checkbox').forEach(c=>c.checked=e.target.checked);
 if(e.target.id==='pick-ann'){state.selectedId=e.target.value;try{await loadMonitor();show();}catch(ex){err(ex);}}
 if(e.target.id==='review-ann'&&yesAdmin()){state.reviewSelectedId=e.target.value;try{await loadVerification();show();}catch(ex){err(ex);}}
 if(e.target.id==='image-file'){state.file=e.target.files?.[0]||null;state.compressed=null;state.fileNote=state.file?`Selected ${state.file.name} — ${(state.file.size/1024).toFixed(0)} KB`:'';const note=document.getElementById('file-status');if(note)note.textContent=state.fileNote;}
});
initial();
})();
