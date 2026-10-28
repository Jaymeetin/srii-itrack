
(() => {
'use strict';
const C=window.ITRACK_CONFIG;
const $=document.getElementById('app');
const toast=document.getElementById('toast');
// Supabase redirects expired confirmation links with error_code=otp_expired
// (in the query string or the URL hash). Capture this before its auth client
// processes/clears the callback; never treat a URL parameter as verification.
function expiredEmailLinkFromUrl(){
 const fragment=location.hash.startsWith('#?')?location.hash.slice(2):location.hash.slice(1);
 const parts=[new URLSearchParams(location.search),new URLSearchParams(fragment)];
 const code=parts.map(p=>p.get('error_code')||'').find(Boolean)||'';
 const description=parts.map(p=>p.get('error_description')||'').find(Boolean)||'';
 const expired=code==='otp_expired'||code==='otp_invalid'||
  /(?:link|token).*?(?:expired|invalid)|(?:expired|invalid).*?(?:link|token)/i.test(description);
 if(!expired)return false;
 try{
  const url=new URL(location.href);
  for(const key of ['error','error_code','error_description'])url.searchParams.delete(key);
  if(['#error=','#error_code=','#error_description=','#?error='].some(prefix=>url.hash.startsWith(prefix)))url.hash='';
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
 }catch(e){console.warn('Expired-link redirect could not be cleaned',e);}
 return true;
}
const arrivedFromExpiredEmailLink=expiredEmailLinkFromUrl();
const db=window.supabase?.createClient(C.url,C.publishableKey,{auth:{persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
// Reuse one authenticated client across tracking, upload and download screens.
// Multiple clients refreshing the same mobile session can reset upload forms.
window.ITRACK_DB=db;
const knownViews=new Set(['dashboard','announcements','monitoring','documents','reports','school-files','verification','approvals','archive','division','retrieval','settings']);
// The manifest launches at ./ (Home). Navigation keeps the page in the URL,
// so a real refresh returns to that page without persistent cross-launch state.
const urlView=new URLSearchParams(location.search).get('view');
const firstView=knownViews.has(urlView)?urlView:'dashboard';
localStorage.removeItem('srii-current-view');
const state={session:null,profile:null,schools:[],announcements:[],profiles:[],docs:[],docTypes:[],docTypeRequests:[],recipients:[],monitor:[],monitorSchool:null,monitorSchoolFiles:[],monitorDetail:null,monitorFiles:[],selectedId:sessionStorage.getItem('srii-last-announcement')||'',view:firstView,authMode:arrivedFromExpiredEmailLink?'resend':'login',emailHelpReason:arrivedFromExpiredEmailLink?'expired':'',queueTicket:localStorage.getItem('srii-registration-queue-ticket')||'',queueInfo:null,adminRegistrationQueue:[],lastSignupEmail:'',emailRetryAt:Number(localStorage.getItem('srii-email-retry-after')||0),recoveryReady:false,accountEmails:[],showRemovedAccounts:false,modal:null,detail:null,routes:[],approvals:[],divisionHistory:[],routeHistory:[],theme:localStorage.getItem('srii-theme')||'light',busy:false,file:null,compressed:null,fileNote:'',counts:null,schoolSubmissions:[],schoolAssignments:[],docAttachments:[],schoolSubmissionDocs:[],compliances:[],selectedSchoolSubmission:null,docAttachmentError:'',reviewSelectedId:sessionStorage.getItem('srii-review-announcement')||'',reviewRows:[],reviewCompliances:[],reviewVersions:[],reviewRequired:0,schoolFiles:[],schoolFilesSchool:'',schoolFilesAnnouncement:'',schoolFilesVersions:'all',districtReport:[],divisionData:{transmittals:[],items:[],eligible:[],people:[]},divisionSelected:'',divisionNotices:[],documentNotices:[],divisionRetrievable:[],divisionSearchResults:[],divisionQuery:'',documentDivisionStatuses:[],approverAssignments:[],announcementApproverEditing:null,announcementEditId:null,announcementEditorData:null,announcementCancelId:null,transmittalEditing:false,retrievalData:{},retrievalPicked:new Set(),retrievalTurnoverPicked:new Set(),retrievalDistrictPicked:new Set(),retrievalSearch:'',privateDetails:null,profileRequests:[],userFeedback:[],issue:null,maintenance:{enabled:false,message:''}};
document.documentElement.dataset.theme=state.theme;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}):'—';
const short=x=>x?new Date(x).toLocaleDateString('en-PH',{dateStyle:'medium',timeZone:'Asia/Manila'}):'—';
const phtDatetimeLocal=x=>x?new Date(new Date(x).getTime()+8*60*60*1000).toISOString().slice(0,16):'';
const announcementName=a=>(a?.announcement_code?a.announcement_code+' — ':'')+(a?.title||'Announcement');
const clean=x=>String(x||'').trim();
const yesAdmin=()=>['main_admin','backup_admin'].includes(state.profile?.role);
const isOic=()=>state.profile?.role==='oic_psds';
const districtOversight=()=>yesAdmin()||isOic();
const isMain=()=>state.profile?.role==='main_admin';
const active=()=>state.profile?.account_status==='active';
const isAoII=()=>active()&&state.profile?.role==='school_user'&&/^(?:(?:administrative|administration)\s+officer\s+(?:ii|2)|ao\s*(?:ii|2))$/i.test((state.profile?.position_title||'').trim());
function rememberView(view){
 if(!knownViews.has(view))throw new Error('Unknown application page.');
 state.view=view;
 const url=new URL(location.href);
 if(view==='dashboard')url.searchParams.delete('view');
 else url.searchParams.set('view',view);
 history.replaceState(null,'',url);
}
function rememberAnnouncement(id,verification=false){
 const key=verification?'srii-review-announcement':'srii-last-announcement';
 if(id)sessionStorage.setItem(key,id);
 else sessionStorage.removeItem(key);
}

const label=x=>String(x||'').replaceAll('_',' ');
const pTag=x=>`<span class="tag ${['active','submitted','received','open','Submitted'].includes(x)?'good':['pending','awaiting_ack','Pending','returned'].includes(x)?'warn':['Late','disabled'].includes(x)?'bad':'info'}">${esc(label(x))}</span>`;
const table=(cols,rows)=>rows.length?`<div class="tablewrap"><table class="data"><thead><tr>${cols.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<div class="empty">No records available yet.</div>';
const eyeIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeOffIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 5.1A11.8 11.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.3 3.6M6 6C3.5 8 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.4-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const field=(caption,name,type='text',value='',placeholder='')=>{
 const input='<input id="'+esc(name)+'" name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'"'+(type==='password'?' minlength="8" autocomplete="'+(state.authMode==='login'?'current-password':'new-password')+'"':'')+' required>';
 return '<div class="field'+(type==='password'?' password-field':'')+'"><label for="'+esc(name)+'">'+esc(caption)+'</label>'+
  (type==='password'?'<div class="password-wrap">'+input+'<button type="button" class="password-toggle" data-a="toggle-password" data-for="'+esc(name)+'" aria-label="Show '+esc(caption.toLowerCase())+'" aria-controls="'+esc(name)+'" aria-pressed="false" title="Show password">'+eyeIcon+'</button></div>':input)+'</div>';
};
function emailQuotaError(error,context='Email'){
 if(error?.code==='over_email_send_rate_limit'||(error?.status===429&&/email/i.test(error.message||''))){
  state.emailRetryAt=Date.now()+60*60*1000;
  localStorage.setItem('srii-email-retry-after',String(state.emailRetryAt));
  return new Error(context+' could not be emailed because the district email service reached its limit. Email verification remains required. Try again after approximately '+date(new Date(state.emailRetryAt).toISOString())+'. Email delivery is not automatic until a dedicated SMTP sender and background retry service are configured.');
 }
 if(error?.code==='email_address_not_authorized')
  return new Error('The current Supabase email service is not authorized to email this address. The District Administrator needs to configure a dedicated SMTP sender.');
 return error;
}

const schoolOpts=()=>state.schools.filter(s=>s.is_active).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
function pop(message,error=false){toast.textContent=message;toast.style.background=error?'#a43142':'#173d80';toast.classList.add('show');clearTimeout(pop.timer);pop.timer=setTimeout(()=>toast.classList.remove('show'),5000);}
function brand(){return `<div class="brand"><a class="brandmark logo-download-link" href="./assets/srii-itrack-official-logo.png" download="SRII-iTRACK-Official-Logo.png" title="Click or tap to save the original SRII i-TRACK logo" aria-label="Download official SRII i-TRACK logo"><img class="official-logo-image" src="./assets/srii-itrack-logo-optimized.webp" alt="SRII i-TRACK official district emblem" width="48" height="45" decoding="async"></a><span class="brand-label">SRII <span class="brand-accent">i-TRACK</span><small>DOCUMENT TRACKING SYSTEM</small></span></div>`;}
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
  if(event==='PASSWORD_RECOVERY'){
   state.recoveryReady=true;state.authMode='set-password';
   setTimeout(()=>show(),0);return;
  }
  if(state.recoveryReady&&session){setTimeout(()=>show(),0);return;}
  if(state.profile && previousId===nextId &&
    ['TOKEN_REFRESHED','SIGNED_IN','INITIAL_SESSION','USER_UPDATED'].includes(event)) return;
  setTimeout(sync,0);
 });
 const {data:{session}}=await db.auth.getSession();state.session=session;await sync();
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
async function readMaintenance(){if(!state.session)return;const {data,error}=await db.from('system_maintenance').select('enabled,message').eq('id',true).maybeSingle();if(!error&&data)state.maintenance=data;}
async function sync(){
 try{
  state.issue=null;
  if(state.recoveryReady){show();return;}
  if(!state.session){state.profile=null;show();return;}
  const {data,error}=await db.from('profiles').select('id,display_name,school_id,requested_school_id,role,account_status,position_title').eq('id',state.session.user.id).single();
  if(error)throw error;
  state.profile=data;
  if(active())await readMaintenance();
  if(isOic()&&!['dashboard','announcements','monitoring','reports','settings'].includes(state.view))rememberView('dashboard');
  if(!yesAdmin()&&['school-files','verification','approvals','archive'].includes(state.view))rememberView('dashboard');
  if(yesAdmin()&&state.view==='settings')rememberView('dashboard');
  if(!districtOversight()&&state.view==='reports')rememberView('dashboard');
  if(active())await load();else show();
 }catch(e){state.issue=e.message;show();}
}
async function load(){
 if(!active()){show();return;}
 try{
  const tasks=[];
  tasks.push((async()=>{const {data,error}=await db.rpc('i_track_approver_assignments');if(error)throw error;state.approverAssignments=data||[];})());
  if(['dashboard','announcements','monitoring','verification','reports','school-files'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('announcements').select('id,announcement_code,title,description,status,deadline_at,original_deadline_at,created_at,cancelled_at,cancellation_reason').order('created_at',{ascending:false});if(error)throw error;state.announcements=data||[];if(!state.selectedId||!state.announcements.some(x=>x.id===state.selectedId))state.selectedId=state.announcements.find(x=>x.status!=='draft')?.id||'';})());
  }
  if(!isOic()&&['dashboard','documents','division'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('documents').select('id,tracking_number,subject,document_type,status,destination,created_by,origin_school_id,created_at').order('created_at',{ascending:false}).limit(200);if(error)throw error;state.docs=data||[];if(state.view==='documents')await Promise.all([loadDocumentAttachments(),loadRoutingHistory(),loadDocumentTypes(),loadSchoolSubmissionDocuments(),loadCompliances()]);
    else if(state.view==='dashboard')await loadRoutingHistory();
    await loadDocumentDivisionStatuses();})());
  }
  if(yesAdmin()&&['dashboard','approvals'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('profiles').select('id,display_name,school_id,requested_school_id,position_title,role,account_status,created_at').order('created_at',{ascending:false});if(error)throw error;state.profiles=data||[];})());
   if(state.view==='approvals')tasks.push((async()=>{
    const [accounts,waiting]=await Promise.all([
     db.rpc('i_track_admin_account_emails'),
     db.rpc('i_track_admin_registration_queue')
    ]);
    if(accounts.error)throw accounts.error;
    if(waiting.error)throw waiting.error;
    state.accountEmails=accounts.data||[];
    state.adminRegistrationQueue=waiting.data||[];
   })());
  }
  if(state.view==='retrieval')tasks.push((async()=>{
    const {data,error}=await db.rpc('i_track_retrieval_board');
    if(error)throw error;
    state.retrievalData=data||{};
    const validAvailable=new Set((data?.available||[]).map(x=>x.item_id));
    const validTurnover=new Set((data?.my_batch_items||[]).filter(x=>x.division_status==='retrieved_from_division').map(x=>x.item_id));
    const validDistrict=new Set((data?.district_queue||[]).map(x=>x.item_id));
    state.retrievalPicked=new Set([...state.retrievalPicked].filter(id=>validAvailable.has(id)));
    state.retrievalTurnoverPicked=new Set([...state.retrievalTurnoverPicked].filter(id=>validTurnover.has(id)));
    state.retrievalDistrictPicked=new Set([...state.retrievalDistrictPicked].filter(id=>validDistrict.has(id)));
   })());
   if(state.view==='division')tasks.push((async()=>{const {data,error}=await db.rpc('i_track_division_list');if(error)throw error;state.divisionData=data||{transmittals:[],items:[],eligible:[],people:[]};const deepLink=new URLSearchParams(location.search).get('transmittal');if(deepLink&&state.divisionData.transmittals.some(t=>t.id===deepLink))state.divisionSelected=deepLink;const notice=await db.from('division_notifications').select('id,message,created_at').order('created_at',{ascending:false}).limit(12);state.divisionNotices=notice.data||[];const retrieval=await db.rpc('i_track_division_retrievable');if(retrieval.error)throw retrieval.error;state.divisionRetrievable=retrieval.data||[];})());
  if(!yesAdmin()&&!isOic()&&['dashboard','documents'].includes(state.view))tasks.push((async()=>{
   const [routing,division]=await Promise.all([
    db.from('document_notifications').select('id,document_id,message,created_at,read_at').order('created_at',{ascending:false}).limit(12),
    db.from('document_division_notifications').select('id,document_id,message,created_at,read_at').order('created_at',{ascending:false}).limit(12)
   ]);
   if(routing.error||division.error)console.error('Some document notifications unavailable',routing.error||division.error);
   state.documentNotices=[
    ...(routing.data||[]).map(n=>({...n,source:'routing'})),
    ...(division.data||[]).map(n=>({...n,source:'division'}))
   ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,12);
  })());
  if(state.view==='settings'&&!yesAdmin())tasks.push((async()=>{
   const [privateResult,requestsResult,feedbackResult]=await Promise.all([
    db.from('user_private_details').select('employee_id,birthdate,plantilla_item,messenger_url,prc_id,bachelors_degree').eq('user_id',state.session.user.id).maybeSingle(),
    db.from('profile_change_requests').select('id,requested_name,requested_position,requested_school_id,status,submitted_at,reviewer_note').order('submitted_at',{ascending:false}).limit(5),
    db.from('user_feedback').select('id,category,subject,status,submitted_at,admin_response').eq('submitted_by',state.session.user.id).order('submitted_at',{ascending:false}).limit(5)
   ]);
   if(privateResult.error)throw privateResult.error;
   if(requestsResult.error)throw requestsResult.error;
   if(feedbackResult.error)throw feedbackResult.error;
   state.userFeedback=feedbackResult.data||[];
   state.privateDetails=privateResult.data||{};
   state.profileRequests=requestsResult.data||[];
  })());
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
  if(state.view==='verification'&&(yesAdmin()||state.approverAssignments.some(x=>x.user_id===state.session.user.id)))await loadVerification();
  if(state.view==='school-files'&&yesAdmin())await loadSchoolFiles();
  if(state.view==='documents'||(yesAdmin()&&['announcements','verification'].includes(state.view)))await loadRecipients();
  show();
 }catch(e){err(e);show();}
}
async function loadDocumentDivisionStatuses(){
 const {data,error}=await db.rpc('i_track_document_division_summary');
 if(error)throw error;state.documentDivisionStatuses=data||[];
}
function divisionStatusForDocument(id){
 return (state.documentDivisionStatuses||[]).find(x=>x.document_id===id)||null;
}
function divisionStageLabel(s){
 return {in_transmittal:'In Transmittal to Division',submitted_to_division:'Submitted to Division',
 retrieved_from_division:'Retrieved from Division',forwarded_to_district:'Forwarded to District',
 received_at_district:'Received at District',received_by_sender:'Completed',
 lost:'Lost',not_for_return:'Not for Return'}[s]||label(s);
}
async function loadCompliances(){
 const {data,error}=await db.rpc('i_track_compliance_list',{p_announcement:null});
 if(error)throw error;state.compliances=data||[];
}
async function loadSchoolSubmissionDocuments(){
 const {data,error}=await db.rpc('i_track_my_school_submission_documents');
 if(error)throw error;
 state.schoolSubmissionDocs=data||[];
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
window.addEventListener('itrack:school-submitted',async event=>{
 if(!active()||state.view!=='monitoring'||state.selectedId!==event.detail?.announcementId)return;
 try{
  await loadMonitor();
  const school=state.schools.find(x=>x.id===event.detail?.schoolId);
  const status=state.monitor.find(x=>x.school_name===school?.name)?.submission_status;
  if(!status)return;
  if(state.monitorSchool?.schoolId===event.detail.schoolId){
   state.monitorSchool.status=status;
   const badge=document.getElementById('monitor-school-current-status');
   if(badge)badge.innerHTML=pTag(status);
  }
  if(state.monitorSchool?.schoolId===event.detail.schoolId&&!isOic()&&!yesAdmin()){
   const {data,error}=await db.rpc('i_track_my_school_submission_documents');
   if(!error){
    state.monitorSchoolFiles=(data||[]).filter(f=>
      f.school_id===event.detail.schoolId&&f.announcement_id===event.detail.announcementId);
    const host=document.getElementById('monitor-visible-school-uploads');
    if(host)host.innerHTML=monitorSchoolVisibleFilesHtml();
   }
  }
  const row=document.querySelector('.status-school-row[data-school-id="'+event.detail.schoolId+'"]');
  const tag=row?.querySelector('.tag');
  if(tag)tag.outerHTML=pTag(status);
 }catch(error){console.warn('School status refresh pending',error);}
});
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
async function loadDocumentTypes(){
 const [catalog,suggestions]=await Promise.all([
  db.from('document_types').select('name').eq('is_active',true).order('name'),
  db.from('document_type_requests').select('id,requested_name,status,submitted_at').eq('suggested_by',state.session.user.id).order('submitted_at',{ascending:false}).limit(8)
 ]);
 if(catalog.error)throw catalog.error;
 if(suggestions.error)throw suggestions.error;
 state.docTypes=catalog.data||[];
 state.docTypeRequests=suggestions.data||[];
}
async function loadRecipients(){const {data,error}=await db.rpc('i_track_recipient_directory');if(error)throw error;state.recipients=data||[];}
async function openAnnouncementEditor(id){
 if(!yesAdmin()||!active())throw Error('District administrator required');
 const ann=state.announcements.find(x=>x.id===id);
 if(!ann)throw Error('Announcement not found');
 if(ann.status==='cancelled')throw Error('Cancelled announcements are retained as read-only records');
 await loadRecipients();
 const {data,error}=await db.rpc('i_track_announcement_editor_data',{p_announcement:id});
 if(error)throw error;
 if(!data||data.announcement_id!==id)throw Error('Unable to load announcement schools');
 state.announcementEditId=id;
 state.announcementEditorData=data;
 state.modal='edit-announcement';
 show();
}
async function loadMonitor(){if(!state.selectedId){state.monitor=[];return;}const {data,error}=await db.rpc('i_track_monitor',{p_announcement_id:state.selectedId});if(error)throw error;state.monitor=data||[];}
async function loadVerification(){
 if(!active()||(!yesAdmin()&&!state.approverAssignments.some(x=>x.user_id===state.session.user.id)))throw new Error('Assigned approver or administrator access required.');
 const announcements=state.announcements.filter(a=>['open','closed'].includes(a.status)&&
  (yesAdmin()||state.approverAssignments.some(x=>x.announcement_id===a.id&&x.user_id===state.session.user.id)));
 if(!state.reviewSelectedId||!announcements.some(a=>a.id===state.reviewSelectedId))
  state.reviewSelectedId=announcements[0]?.id||'';
 const requestedId=state.reviewSelectedId;
 if(!requestedId){
  state.reviewRows=[];state.reviewVersions=[];state.reviewRequired=0;
  return;
 }
 if(!yesAdmin()){
  state.reviewRows=[];state.reviewVersions=[];state.reviewRequired=0;
  const {data,error}=await db.rpc('i_track_compliance_list',{p_announcement:requestedId});
  if(error)throw error;state.reviewCompliances=data||[];return;
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
 const c=await db.rpc('i_track_compliance_list',{p_announcement:requestedId});if(c.error)throw c.error;
 state.reviewCompliances=c.data||[];
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

async function loadSchoolFiles(){
 if(!yesAdmin()||!active())throw new Error('District administrator access required.');
 // School and assignment identifiers only. Never fetch or expose private Drive IDs.
 // Include historical assignments so completed uploads remain visible even if an
 // administrator later removes an announcement requirement.
 const assignments=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('announcement_assignments')
   .select('id,announcement_id,school_id')
   .order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  assignments.push(...(data||[]));
  if(!data||data.length<500)break;
  if(offset>=999500)throw new Error('District assignment listing is too large to load.');
 }
 const byAssignment=new Map(assignments.map(a=>[a.id,a]));
 const schoolNames=new Map(state.schools.map(s=>[s.id,s.name]));
 const announcements=new Map(state.announcements.map(a=>[a.id,a]));
 const files=[];
 for(let i=0;i<assignments.length;i+=35){
  const ids=assignments.slice(i,i+35).map(a=>a.id);
  for(let offset=0;;offset+=250){
   const {data,error}=await db.from('submissions')
    .select('id,assignment_id,original_filename,content_type,file_size_bytes,first_received_at,stored_at,version_number,verification_status,verified_at,storage_status')
    .in('assignment_id',ids).in('storage_status',['uploaded','archived'])
    .order('first_received_at',{ascending:false}).order('id',{ascending:false})
    .range(offset,offset+249);
   if(error)throw error;
   for(const file of data||[]){
    const assignment=byAssignment.get(file.assignment_id);
    if(!assignment)continue;
    const announcement=announcements.get(assignment.announcement_id);
    files.push({...file,
      school_id:assignment.school_id,
      school_name:schoolNames.get(assignment.school_id)||'District / Individual',
      announcement_id:assignment.announcement_id,
      announcement_name:announcementName(announcement),
      deadline_at:announcement?.deadline_at||null
    });
   }
   if(!data||data.length<250)break;
   if(offset>=999750)throw new Error('District upload listing is too large to load.');
  }
 }
 // Version numbers belong to each assignment; another school's V1 is not a
 // revision of this school's V1. Never suppress older versions from the data.
 const latestVersion=new Map();
 for(const f of files){
  const current=latestVersion.get(f.assignment_id);
  if(!current||Number(f.version_number)>Number(current.version_number)||
     Number(f.version_number)===Number(current.version_number)&&
     new Date(f.first_received_at)>new Date(current.first_received_at))
   latestVersion.set(f.assignment_id,f);
 }
 for(const f of files)f.is_latest=latestVersion.get(f.assignment_id)?.id===f.id;
 state.schoolFiles=files.sort((a,b)=>new Date(b.first_received_at)-new Date(a.first_received_at)
  ||String(b.id).localeCompare(String(a.id)));
}
function schoolAttachmentsPage(){
 if(!yesAdmin()||!active())return '<div class="notice danger">District administrator access required.</div>';
 const all=state.schoolFiles||[];
 const activeSchools=new Set(all.map(f=>f.school_id).filter(Boolean));
 const activeAnnouncements=new Set(all.map(f=>f.announcement_id).filter(Boolean));
 const schoolOptions=state.schools.slice().sort((a,b)=>a.name.localeCompare(b.name))
  .map(s=>'<option value="'+esc(s.id)+'"'+(state.schoolFilesSchool===s.id?' selected':'')+'>'+
   esc(s.name)+(activeSchools.has(s.id)?' · uploaded':' · no uploads')+'</option>').join('');
 const announcementOptions=state.announcements.slice()
  .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))
  .map(a=>'<option value="'+esc(a.id)+'"'+(state.schoolFilesAnnouncement===a.id?' selected':'')+'>'+
   esc(announcementName(a))+(activeAnnouncements.has(a.id)?'':' · no uploads')+'</option>').join('');
 const selected=all.filter(f=>
  (!state.schoolFilesSchool||f.school_id===state.schoolFilesSchool)&&
  (!state.schoolFilesAnnouncement||f.announcement_id===state.schoolFilesAnnouncement)&&
  (state.schoolFilesVersions!=='latest'||f.is_latest));
 const rows=selected.map(f=>{
  const verify=['verified','pending','rejected'].includes(f.verification_status)?f.verification_status:'pending';
  return '<tr>'+
   '<td><strong>'+esc(f.school_name)+'</strong></td>'+
   '<td><span class="small">'+esc(f.announcement_name)+'</span></td>'+
   '<td class="school-files-name"><strong>'+esc(f.original_filename||'Unnamed attachment')+'</strong>'+
    '<div class="small muted">Version '+esc(f.version_number)+(f.is_latest?' · Latest':' · Previous')+
    ' · '+esc((Number(f.file_size_bytes||0)/1024).toFixed(1))+' KB</div></td>'+
   '<td><div class="school-files-date">'+esc(date(f.first_received_at))+'</div>'+
    '<div class="small muted">Saved '+esc(date(f.stored_at))+'</div></td>'+
   '<td><span class="verify-status verify-status-'+verify+'">'+esc(label(verify))+'</span>'+
    (f.storage_status==='archived'?'<div class="small muted">Archived</div>':'')+'</td>'+
   '<td class="school-files-actions">'+reviewFileActions(f,true)+'</td></tr>';
 });
 const noFiles=state.schoolFilesSchool||state.schoolFilesAnnouncement?
  'No attachments match these filters. Schools with no submissions remain listed in the school selector.':
  'No schools have uploaded attachments yet.';
 return '<div class="sectionhead"><div><div class="eyebrow">District administrator · secure records</div>'+
  '<h1>School Attachments</h1><p class="sub">Browse all submitted files from every school and announcement, including previous versions. File access is checked and recorded.</p></div>'+
  '<button type="button" class="btn alt" data-a="refresh-school-files">↻ Refresh</button></div>'+
  '<div class="school-files-metrics">'+
   '<div><strong>'+state.schools.length+'</strong><span>Schools in district</span></div>'+
   '<div><strong>'+activeSchools.size+'</strong><span>Schools with uploads</span></div>'+
   '<div><strong>'+all.length+'</strong><span>Attachments / versions</span></div>'+
   '<div><strong>'+selected.length+'</strong><span>Matching filters</span></div></div>'+
  '<section class="panel school-files-panel"><h3>Filter School Attachments</h3>'+
   '<div class="school-files-filters">'+
    '<div class="field"><label for="school-files-filter-school">School</label><select id="school-files-filter-school"><option value="">All schools</option>'+
     schoolOptions+'</select></div>'+
    '<div class="field"><label for="school-files-filter-ann">Announcement</label><select id="school-files-filter-ann"><option value="">All announcements</option>'+
     announcementOptions+'</select></div>'+
    '<div class="field"><label for="school-files-filter-versions">Files to show</label><select id="school-files-filter-versions">'+
     '<option value="all"'+(state.schoolFilesVersions!=='latest'?' selected':'')+'>All uploaded versions</option>'+
     '<option value="latest"'+(state.schoolFilesVersions==='latest'?' selected':'')+'>Latest versions only</option>'+
    '</select></div></div>'+
   '<p class="note">A school with no uploads has no attachment to open. View and Download require an active district administrator session. Archived SSD files have metadata only.</p>'+
   (rows.length?table(['School','Announcement','Attachment','Received (PHT)','Verification','Secure file'],rows):
    '<div class="empty">'+esc(noFiles)+'</div>')+
  '</section>';
}

function verificationPage(){
 if(!yesAdmin()&&!state.approverAssignments.some(x=>x.user_id===state.session.user.id))return '<div class="notice danger">Assigned approver or district administrator access required.</div>';
 const notices=state.announcements.filter(a=>['open','closed'].includes(a.status)&&(yesAdmin()||state.approverAssignments.some(x=>x.announcement_id===a.id&&x.user_id===state.session.user.id)));
 const options=notices.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===state.reviewSelectedId?' selected':'')+'>'+esc(announcementName(a))+'</option>').join('');
 const uploadedSchools=state.reviewRows.length;
 const complianceRows=(state.reviewCompliances||[]).map(c=>'<tr><td>'+esc(c.school_name)+'<div class="small muted">'+esc(c.number)+'</div></td><td>'+esc(c.has_attachment?'With attachment':'No attachment')+(c.current_submission_id?'<div class="verify-file-actions"><button type="button" class="btn tiny alt iu-file-action" data-mode="view" data-kind="announcement" data-id="'+esc(c.current_submission_id)+'" data-name="Submission attachment">View</button> <button type="button" class="btn tiny alt iu-file-action" data-mode="download" data-kind="announcement" data-id="'+esc(c.current_submission_id)+'" data-name="Submission attachment">Download</button></div>':'')+'</td><td>'+pTag(c.status)+'</td><td>'+(c.status==='pending_verification'?'<button class="btn tiny" data-a="compliance-verify" data-id="'+esc(c.id)+'">Approve</button> <button class="btn tiny alt" data-a="compliance-return" data-id="'+esc(c.id)+'">Return</button>':'<span class="small muted">'+esc(date(c.verified_at||c.submitted_at))+'</span>')+'</td></tr>');
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
 if(!yesAdmin())return '<div class="sectionhead"><div><div class="eyebrow">Assigned Approver</div><h1>Submission Verification</h1>'+
  '<p class="sub">Any one assigned approver may approve or return a pending school response. The other assigned approvers will see the outcome.</p></div>'+
  '<button class="btn alt" data-a="refresh-verification">↻ Refresh</button></div>'+
  '<section class="panel"><div class="field"><label>Announcement</label><select id="review-ann">'+options+'</select></div>'+
  '<p class="note">Only submissions for your assigned announcements are shown. Attachments are not required.</p>'+
  table(['School / Submission ID','Evidence','Status','Review'],complianceRows)+'</section>';
 return '<div class="sectionhead"><div><div class="eyebrow">District administrator</div>'+
  '<h1>Submission Verification</h1>'+
  '<p class="sub">Review the latest upload, compare it with the latest verified version, and inspect every earlier version.</p></div>'+
  '<button class="btn alt" data-a="refresh-verification">↻ Refresh</button></div>'+
  '<section class="panel"><h3>School Compliance Verification</h3><p class="note">Verify school responses with or without uploaded files. Every response has a permanent ID.</p>'+table(['School / Submission ID','Evidence','Status','Action'],complianceRows)+'</section>'+ 
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
 if(state.recoveryReady){window.ITRACK_CONTEXT=null;authPage();return;}
 if(!state.session){window.ITRACK_CONTEXT=null;authPage();return;}
 if(!state.profile){$.innerHTML='<div class="startup">Preparing account…</div>';return;}
 if(!active()){window.ITRACK_CONTEXT=null;pendingPage();return;}
 if(state.maintenance.enabled&&!yesAdmin()){window.ITRACK_CONTEXT=null;$.innerHTML='<div class="startup" style="max-width:580px;margin:12vh auto;padding:30px;text-align:center"><h2>🔧 SRII i-TRACK Maintenance</h2><p>'+esc(state.maintenance.message)+'</p><p class="note">Your account and saved documents remain unchanged.</p><button class="btn" data-a="maintenance-refresh">Check Again</button> <button class="btn alt" data-a="logout">Sign Out</button></div>';return;}
 appPage();
}

function queueClear(){
 state.queueTicket='';state.queueInfo=null;
 localStorage.removeItem('srii-registration-queue-ticket');
}
async function queueRead(){
 if(!state.queueTicket){state.authMode='register';show();return;}
 const {data,error}=await db.rpc('i_track_registration_queue_status',{p_ticket:state.queueTicket});
 if(error)throw error;
 const info=Array.isArray(data)?data[0]:data;
 if(!info){queueClear();state.authMode='register';show();throw Error('This queue ticket was not found. Please join again.');}
 state.queueInfo=info;
 state.authMode='queue';show();
}
function queueTimeText(x){
 if(!x)return '—';
 const remaining=Math.max(0,new Date(x).getTime()-Date.now());
 if(!remaining)return 'Now — tap Check Queue to refresh';
 const mins=Math.ceil(remaining/60000);
 return mins>=60?Math.floor(mins/60)+' hr '+(mins%60)+' min remaining':mins+' min remaining';
}
function queueCard(){
 const q=state.queueInfo;
 if(!q)return '<div class="notice">Loading the private queue ticket… <button type="button" class="btn tiny alt" data-a="queue-check">Check Queue</button></div>';
 const status=q.queue_status;
 const upcoming=status==='waiting';
 const ready=status==='ready';
 const claimed=status==='claimed';
 const completed=status==='registered';
 const expired=['expired','cancelled','failed'].includes(status);
 return '<div class="registration-queue-panel">'+
  '<div class="registration-queue-head"><span class="registration-queue-eyebrow">PRIVATE REGISTRATION TICKET</span>'+
   '<span class="registration-queue-number">#'+esc(q.queue_number)+'</span></div>'+
  '<p class="registration-queue-person"><strong>'+esc(q.full_name)+'</strong><span>'+esc(q.email)+'</span></p>'+
  '<div class="registration-queue-status '+(ready||claimed?'is-ready':'')+'">'+
   (ready?'It is your turn to register.':claimed?'Registration window open. Enter a password now.':
    completed?'Account created — check your confirmation email.':
    expired?'This queue window is no longer active. You may join again.':
    'Waiting for your registration window.')+'</div>'+
  (upcoming||ready||claimed?
   '<div class="registration-queue-times"><div><small>Current position</small><strong>'+
    (upcoming?esc(q.queue_position):'Your turn')+'</strong></div>'+
    '<div><small>Estimated registration time (PHT)</small><strong>'+
      esc(date(q.ready_at))+'</strong></div>'+
    '<div><small>Window closes (PHT)</small><strong>'+esc(date(q.expires_at))+'</strong></div></div>'+
   '<p class="registration-queue-countdown" data-queue-countdown role="status" aria-live="polite">'+esc(queueTimeText(q.ready_at))+'</p>':
   '')+
  '<p class="note">This ticket reserves a place in the registration waiting list, not an account or a confirmation email. Email sending still depends on Supabase availability. District approval happens after successful registration and verification.</p>'+
  '<div class="registration-queue-actions">'+
   ((ready||claimed)?'<button type="button" class="btn" data-a="queue-claim">Continue Registration</button>':'')+
   ((upcoming||ready||claimed)?'<button type="button" class="btn alt" data-a="queue-check">Check Queue</button>':'')+
   (upcoming?'<button type="button" class="btn alt" data-a="queue-reminder">Add Phone Reminder</button>':'')+
   (upcoming?'<button type="button" class="btn tiny alt" data-a="queue-cancel">Cancel Queue Place</button>':'')+
   (expired?'<button type="button" class="btn" data-a="queue-rejoin">Join a New Queue</button>':'')+
   (completed?'<button type="button" class="btn" data-a="back-to-login">Sign In</button>':'')+
  '</div>'+
  (upcoming?'<p class="small muted">The reminder is a calendar file with an alarm 5 minutes before the estimated time. Import it into your phone calendar and enable alerts. It cannot push notifications while this website is closed.</p>':'')+
 '</div>';
}
function queueReminder(){
 const q=state.queueInfo;
 if(!q||q.queue_status!=='waiting'||!q.ready_at)throw Error('No future registration time to remind you about.');
 const start=new Date(q.ready_at),finish=new Date(start.getTime()+30*60*1000);
 const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const pad=x=>String(x).replace(/[,;\r\n]/g,' ');
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SRII i-TRACK//Registration Queue//EN',
 'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
 'UID:queue-'+q.queue_number+'-'+utc(start)+'@srii-itrack',
 'DTSTAMP:'+utc(new Date()),'DTSTART:'+utc(start),'DTEND:'+utc(finish),
 'SUMMARY:SRII i-TRACK registration time (ticket '+pad('#'+q.queue_number)+')',
 'DESCRIPTION:Open https://jaymeetin.github.io/srii-itrack/ and check your registration queue ticket. Your time is an estimate; email sending may still be limited.',
 'BEGIN:VALARM','TRIGGER:-PT5M','ACTION:DISPLAY','DESCRIPTION:SRII i-TRACK registration queue window is approaching',
 'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n';
 const file=new Blob([ics],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(file),a=document.createElement('a');
 a.href=url;a.download='SRII-iTRACK-Registration-Reminder.ics';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function authPage(){
 const registering=state.authMode==='register',queued=state.authMode==='queue',
  completing=state.authMode==='queue-complete',resending=state.authMode==='resend',
  forgot=state.authMode==='forgot',recovering=state.recoveryReady;
 const heading=recovering?'Set a New Password':queued?'Registration Waiting List':
  completing?'Complete Registration':forgot?'Forgot Password':
  resending?'Resend Confirmation Email':registering?'Join the Registration Queue':'Sign In';
 const intro=recovering?'Use the secure link you received by email to choose a new password.':
  queued?'Your queue number and return time are saved on this device. No password was collected when joining.':
  completing?'Your registration window is open. Set your password to create an account.':
  forgot?'Enter your registered address to request a password-reset link.':
  resending?'Already registered but not verified? Request another confirmation email when sending is available.':
  registering?'We accept two registration attempts per hour while the default email service is limited. Join the district queue first; no password is stored.':
  'Use your registered email and password.';
 const signupFields=registering?field('Complete name','full_name')+
  '<div class="field"><label for="registration-type">Account type</label>'+
   '<select id="registration-type" name="registration_type">'+
    '<option value="school_user">School Personnel</option>'+
    '<option value="oic_psds">OIC-PSDS · District Oversight (Read Only)</option>'+
   '</select></div>'+
  field('Position / Designation','position_title','text','','Administrative Officer II')+
  '<div class="field" id="register-school-field"><label for="school">School</label>'+
   '<select id="school" name="school" required><option value="">Select your school</option>'+schoolOpts()+'</select></div>'+
  '<p class="note" id="oic-register-note" hidden>The OIC-PSDS account uses the District Office with no school assignment and requires Main Administrator approval.</p>':'';
 const formId=recovering?'set-password':completing?'queue-complete':
  registering?'queue-join':forgot?'forgot-password':resending?'resend-email':'login';
 const formContents=recovering?field('New password','new_password','password')+
   field('Confirm new password','confirm_password','password'):
  completing?'<p class="queue-complete-person"><strong>'+esc(state.queueInfo?.full_name||'Queued user')+
   '</strong><span>'+esc(state.queueInfo?.email||'')+'</span></p>'+
   field('Choose your password','password','password')+
   '<div class="notice">Your email must still be verified and your account approved by the District Administrator.</div>':
  signupFields+field('Email address','email','email',(resending||forgot)?state.lastSignupEmail:'')+
   (resending||forgot||registering?'':field('Password','password','password'));
 const actionLabel=recovering?'Update Password':completing?'Create Account':
  registering?'Get My Queue Number':forgot?'Request Reset Link':
  resending?'Resend Confirmation Email':'Sign In';
 const pendingText=resending&&Date.now()<state.emailRetryAt?
  '<div class="notice warn"><strong>Email sending is currently limited.</strong> Try again after approximately '+
   esc(date(new Date(state.emailRetryAt).toISOString()))+
   '. The wait is an estimate and does not guarantee delivery.</div>':'';
 const verificationNotice=state.authMode==='resend'&&state.emailHelpReason==='expired'?
  '<div class="notice warn" role="alert"><strong>This email link has expired or is invalid.</strong> Request a new confirmation email below, then open the newest link promptly. Do not register again; administrator approval is preserved. If the expired email was for a password reset, use Forgot Password instead.</div>':
  state.authMode==='resend'&&state.emailHelpReason==='unverified'?
  '<div class="notice warn" role="alert"><strong>Your account is not yet email-verified.</strong> Request a fresh confirmation email below and open its newest link. Administrator approval alone does not confirm an email; you do not need to register again.</div>':'';
 const footer=recovering?'<p class="note">Supabase must validate your recovery link before a password can be changed.</p>':
  queued?'<div class="switch"><button type="button" class="link-button" data-a="back-to-login">Back to Sign In</button></div>':
  completing?'<div class="switch"><button type="button" class="link-button" data-a="queue-check">Back to My Queue</button></div>':
  forgot?'<div class="switch"><button class="link-button" data-a="back-to-login">Back to Sign In</button></div>':
  resending?'<div class="switch"><button class="link-button" data-a="back-to-login">Sign In</button></div>':
  '<div class="switch">'+(registering?'Already registered?':'New personnel?')+
   ' <button class="link-button" data-a="switch">'+(registering?'Sign in':'Register here')+'</button></div>'+
  '<div class="switch"><button class="link-button" data-a="forgot-help">Forgot password?</button></div>'+
  '<div class="switch"><button class="link-button" data-a="resend-help">Did not receive the verification email?</button></div>'+
  (state.queueTicket?'<div class="switch"><button class="link-button" data-a="queue-check">Check My Registration Queue</button></div>':'');
 $.innerHTML='<div class="auth"><aside class="auth-aside">'+brand()+
  '<div><h1>Connecting Schools.<br><em>Tracking Documents.</em><br>Ensuring Accountability.</h1>'+
   '<p>San Remigio II District — integrated announcements, document routing and compliance monitoring.</p></div>'+
  '<small>SAN REMIGIO II · OFFICIAL WORKSPACE TRIAL</small></aside>'+
  '<main class="auth-content"><div class="auth-card">'+
   '<div class="auth-top"><button class="btn alt tiny" data-a="theme">◐ Light / Dark</button></div>'+
   '<div class="eyebrow">Welcome to SRII i-TRACK</div><h1>'+heading+'</h1><p class="sub">'+intro+'</p>'+
   pendingText+verificationNotice+
   (queued?queueCard():('<form id="'+formId+'">'+formContents+
    '<button type="submit" class="btn block">'+actionLabel+'</button></form>'))+
   footer+
   '<p class="note">Tap the district logo to save its original high-resolution image. Queue positions and alarm times are approximate. Passwords are never stored in the queue. Email confirmation and administrator approval remain separate requirements.</p>'+
  '</div></main></div>';
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
 const nav=[...menu,...(!isOic()?[['documents','▣ My Documents'],['division','▤ Division Transmittals'],['retrieval','✓ Division Retrieval']]:[]),...(districtOversight()?[['reports','▥ District Reports']]:[]),...(!yesAdmin()?[['settings','⚙ Personal Settings']]:[]),...((yesAdmin()||state.approverAssignments.some(x=>x.user_id===state.session.user.id))?[['verification','✓ Submission Verification']]:[]),...(yesAdmin()?[['school-files','▣ School Attachments'],['approvals','♙ Account Approvals'],['archive','▤ Archive Documents']]:[])].map(([id,title])=>`<button class="${state.view===id?'active':''}" data-a="nav" data-page="${id}">${title}</button>`).join('');
 const title={dashboard:'Home',announcements:'Announcements',monitoring:'Submission Monitoring',documents:'My Documents',division:'Division Transmittals',retrieval:'Division Retrieval',settings:'Personal Settings',reports:'District Reports','school-files':'School Attachments',verification:'Submission Verification',approvals:'Account Management',archive:'Document Archiving'}[state.view]||'Overview';
 const school=state.schools.find(x=>x.id===state.profile.school_id)?.name||'District Office';
 const name=state.profile.display_name||(isOic()?'OIC-PSDS':'District Administrator');
 let body={dashboard:dashboardPage,announcements:announcementPage,monitoring:monitorPage,documents:documentPage,division:divisionPage,retrieval:retrievalPage,settings:settingsPage,reports:districtReportPage,'school-files':schoolAttachmentsPage,verification:verificationPage,approvals:approvalPage,archive:archivePage}[state.view]?.()||dashboardPage();
 if(state.view==='dashboard'&&yesAdmin())body='<section class="panel" style="padding:20px;margin:16px 0;border:2px solid #d7bd6b"><h3>🔧 System Maintenance</h3><p class="note">Pause access for regular users while admins continue working.</p><p><strong>Status: '+(state.maintenance.enabled?'MAINTENANCE ON':'Running normally')+'</strong></p><button class="btn" data-a="maintenance-toggle">'+(state.maintenance.enabled?'Turn OFF Maintenance — Reopen App':'Turn ON Maintenance — Pause Users')+'</button></section>'+body;
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
 <div class="main"><header class="topbar"><div><h2>${esc(title)}</h2><div class="note">One District. One Direction.</div></div><div class="topbar-actions">${pTag('active')}<button class="desktop-signout" type="button" data-a="logout" title="Sign out of SRII i-TRACK">↩ Sign Out</button></div></header><div class="content">${body}</div></div></div>${state.modal?modalHtml():''}`;
}
function settingsPage(){
 const p=state.profile||{},d=state.privateDetails||{},pending=state.profileRequests||[];
 const schoolName=state.schools.find(x=>x.id===p.school_id)?.name||'District Office';
 const email=state.session?.user?.email||'';
 const verified=!!(state.session?.user?.email_confirmed_at||state.session?.user?.confirmed_at);
 const rows=pending.map(r=>'<div class="settings-request-row"><strong>'+esc(label(r.status))+'</strong><span>'+esc(date(r.submitted_at))+'</span><p>'+
   (r.requested_name?'Name: '+esc(r.requested_name)+' · ':'')+
   (r.requested_position?'Position: '+esc(r.requested_position)+' · ':'')+
   (r.requested_school_id?'School: '+esc(state.schools.find(s=>s.id===r.requested_school_id)?.name||'School requested'):'')+
   '</p>'+(r.reviewer_note?'<p class="note">Admin notes: '+esc(r.reviewer_note)+'</p>':'')+'</div>').join('')||'<p class="note">No profile change requests.</p>';
 const schools=state.schools.filter(x=>x.is_active||x.id===p.school_id).map(x=>'<option value="'+esc(x.id)+'"'+(x.id===p.school_id?' selected':'')+'>'+esc(x.name)+'</option>').join('');
 const input=(caption,name,value,type='text',extra='')=>'<div class="field"><label for="settings-'+esc(name)+'">'+esc(caption)+'</label><input id="settings-'+esc(name)+'" name="'+esc(name)+'" type="'+type+'" value="'+esc(value||'')+'" '+extra+'></div>';
 return '<div class="sectionhead"><div><div class="eyebrow">Your account</div><h1>Personal Settings</h1><p class="sub">Manage your security, personal details, and requests to correct official records.</p></div></div>'+
 (!isOic()?'<div class="toolbar"><button type="button" class="btn alt" data-a="nav" data-page="documents">My Documents</button><button type="button" class="btn alt" data-a="nav" data-page="division">Division Transmittals</button></div>':'')+
 '<div class="settings-grid"><section class="panel"><h3>Account Security</h3>'+
 '<p><strong>'+esc(email)+'</strong> · '+(verified?'Email verified':'Email verification pending')+'</p>'+
 '<form id="settings-email-form"><h4>Change email address</h4>'+input('New email','email','', 'email','autocomplete="email" required')+
 '<p class="note">Supabase may send confirmation links to your old and new addresses. The current address remains active until verification is complete.</p><button type="submit" class="btn alt">Request Email Change</button></form>'+
 '<form id="settings-password-form"><h4>Change password</h4>'+input('New password','new_password','','password','autocomplete="new-password" minlength="8" required')+
 input('Confirm new password','confirm_password','','password','autocomplete="new-password" minlength="8" required')+
 '<button type="submit" class="btn alt">Change Password</button><p class="note">You will be signed out after changing your password.</p></form></section>'+
 '<section class="panel"><h3>Official Profile</h3><p class="note">Current role: '+esc(label(p.role))+' · '+esc(schoolName)+'. Requested changes require District Administrator approval before they affect your account.</p>'+
 '<form id="settings-profile-form">'+input('Full name','full_name',p.display_name,'text','maxlength="160" required')+
 input('Position title','position_title',p.position_title,'text','maxlength="160"')+
 (!isOic()?'<div class="field"><label for="settings-school">School</label><select id="settings-school" name="school_id"><option value="">No school change</option>'+schools+'</select></div>':'<p class="note">OIC-PSDS accounts remain without a school assignment.</p>')+
 '<button type="submit" class="btn">Request Profile Change</button></form>'+
 '<h4>Recent requests</h4>'+rows+'</section>'+
 '<section class="panel settings-private"><h3>Optional Personal Information</h3><p class="note">Only your signed-in account can read or edit these optional details. Leave any field blank if you do not wish to provide it. Do not share passwords here.</p>'+
 '<form id="settings-private-form"><div class="settings-fields">'+
 input('Employee ID','employee_id',d.employee_id,'text','maxlength="60"')+
 input('Birth date','birthdate',d.birthdate,'date')+
 input('Plantilla item','plantilla_item',d.plantilla_item,'text','maxlength="150"')+
 input('Messenger profile link','messenger_url',d.messenger_url,'url','maxlength="500" placeholder="https://"')+
 input('PRC ID','prc_id',d.prc_id,'text','maxlength="80"')+
 input('Bachelor\'s degree','bachelors_degree',d.bachelors_degree,'text','maxlength="200"')+
 '</div><button type="submit" class="btn">Save Private Details</button></form></section>'+
 '<section class="panel settings-private"><h3>Report a Problem or Suggestion</h3><p class="note">Submit an issue or improvement request to the District Administrator. Do not include passwords, private documents, or personal identification numbers.</p><form id="settings-feedback-form"><div class="field"><label>Type</label><select name="category"><option value="problem">Problem / Bug</option><option value="suggestion">Improvement Suggestion</option></select></div><div class="field"><label>Subject</label><input name="subject" type="text" maxlength="180" required></div><div class="field"><label>Details</label><textarea name="message" required minlength="10" maxlength="4000" rows="4"></textarea></div><button class="btn" type="submit">Send Report</button></form><h4>Recent Reports</h4>'+
 (state.userFeedback||[]).map(f=>'<p class="note"><strong>'+esc(f.subject)+'</strong> · '+esc(label(f.status))+' · '+esc(date(f.submitted_at))+(f.admin_response?' · Response: '+esc(f.admin_response):'')+'</p>').join('')+
 '</section></div><div class="toolbar"><button type="button" class="btn alt" data-a="theme">Toggle Light / Dark Mode</button>'+
 '<button type="button" class="btn alt" data-a="logout">Sign Out</button></div>';
}

function documentNotificationPanel(){
 const notices=state.documentNotices||[];
 const unread=notices.filter(n=>!n.read_at).length;
 return '<section class="panel v2-board"><div class="panel-head"><h3>Document Notifications'+(unread?' ('+unread+' unread)':'')+'</h3></div>'+
 (notices.length?'<div class="v2-notice-list">'+notices.map(n=>
  '<div class="v2-notice-item"><div class="v2-notice-copy"><strong>'+esc(n.message)+'</strong><small>'+esc(date(n.created_at))+(n.read_at?' · Read':' · Unread')+'</small></div>'+
  (state.docs.some(d=>d.id===n.document_id)?'<button class="btn tiny alt" data-a="doc-notice-open" data-id="'+esc(n.document_id)+'">Review</button>':'')+
  (!n.read_at?'<button class="btn tiny alt" data-a="doc-notice-read" data-id="'+esc(n.id)+'" data-source="'+esc(n.source)+'">Mark Read</button>':'')+'</div>'
 ).join('')+'</div>':'<p class="note">No document notifications yet.</p>')+'</section>';
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
   if(ann&&ann.status!=="draft"&&ann.status!=="cancelled")byAnn.set(ann.id,{...ann,assignmentId:a.id});
  }
 }
 const mine=[...byAnn.values()];
 const latest=(admin||oversight?state.announcements.filter(a=>a.status!=="draft"):mine).slice(0,admin||oversight?5:3);
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
 const actionNeeded=!admin&&!oversight?state.docs.filter(d=>{const routes=documentRoutes(d.id),last=routes.at(-1);return last?.to_user_id===state.session.user.id&&(last.route_status==='awaiting_ack'||(last.route_status==='received'&&!last.processed_at));}).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,3):[];
 const actionNeededHtml=actionNeeded.map(d=>'<div class="v2-notice-item"><div class="v2-notice-copy"><strong>'+esc(d.subject)+'</strong><small>'+esc(d.tracking_number)+'</small></div><button class="btn tiny alt" data-a="detail" data-id="'+esc(d.id)+'">Review</button></div>').join('')||'<p class="note">No documents currently need your action.</p>';
 const upcoming=latest.filter(a=>a.deadline_at&&new Date(a.deadline_at)>new Date()&&a.status==="open")
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
  '<div class="v2-metrics">'+metricHtml+'</div>'+(!admin&&!oversight?documentNotificationPanel():'')+
  '<div class="v2-home-grid"><div class="v2-home-primary">'+
  '<section class="panel v2-board"><div class="panel-head"><h3>Latest Announcements</h3><button class="btn tiny alt" data-a="nav" data-page="announcements">View All</button></div><div class="v2-notice-list">'+announcements+'</div></section>'+
  '<section class="panel v2-board">'+(!admin&&!oversight?'<div class="panel-head"><h3>Documents Requiring Action</h3><button class="btn tiny alt" data-a="nav" data-page="documents">View All</button></div><div class="v2-notice-list">'+actionNeededHtml+'</div>':'')+'<h3>Quick Actions</h3>'+quick+'</section>'+
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
 const rows=state.announcements.map(a=>{
  const canManage=yesAdmin()&&a.status!=='cancelled';
  const actions='<button class="btn tiny alt" data-a="monitor" data-id="'+esc(a.id)+'">Monitor</button>'+
   (canManage?'<button class="btn tiny alt" data-a="edit-announcement" data-id="'+esc(a.id)+'">Edit</button>'+
    '<button class="btn tiny alt" data-a="manage-approvers" data-id="'+esc(a.id)+'">Approvers</button>'+
    '<button class="btn tiny danger" data-a="cancel-announcement" data-id="'+esc(a.id)+'">Cancel Announcement</button>':'');
  const cancellation=a.status==='cancelled'?'<div class="announcement-cancelled-note"><strong>Cancelled '+esc(date(a.cancelled_at))+'</strong> · '+esc(a.cancellation_reason||'Cancelled by district administrator')+'</div>':'';
  return '<tr><td><span class="ann-ref">'+esc(a.announcement_code||'')+'</span><strong>'+esc(a.title)+'</strong>'+
   '<div class="small muted">'+esc(a.description||'')+'</div>'+cancellation+'</td>'+
   '<td>'+pTag(a.status)+'</td><td>'+esc(short(a.deadline_at))+'</td>'+
   '<td><div class="announcement-admin-actions">'+actions+'</div></td></tr>';
 });
 return '<div class="sectionhead"><div><div class="eyebrow">District requirements</div><h1>Announcements</h1>'+
  '<p class="sub">Official school submission requests and deadlines. Cancelled announcements remain visible for reference, but no longer accept submissions.</p></div>'+
  (yesAdmin()?'<button class="btn" data-a="new-announcement">+ New Announcement</button>':'')+'</div>'+
  '<div class="panel"><h3>Announcement Board</h3>'+table(['Announcement','Status','Deadline','Actions'],rows)+'</div>';
}
function monitorPage(){
 const currentAnnouncement=state.announcements.find(a=>a.id===state.selectedId);
 const isCancelledAnnouncement=currentAnnouncement?.status==='cancelled';
 const opts=state.announcements.filter(a=>a.status!=='draft').map(a=>
  '<option value="'+esc(a.id)+'"'+(a.id===state.selectedId?' selected':'')+'>'+esc(announcementName(a))+'</option>').join('');
 const n=x=>state.monitor.filter(s=>s.submission_status===x).length;
 const rows=state.monitor.map(x=>{
  const status=String(x.submission_status||'Pending');
  const school=state.schools.find(s=>s.name===x.school_name);
  if(!school)return '';
  return '<button type="button" class="status-school-row" data-a="monitor-school" data-school-id="'+esc(school.id)+'" '+
   'aria-label="Open '+esc(school.name)+' — '+esc(status)+'">'+
   '<span class="status-school-name">'+esc(school.name)+'</span>'+pTag(status)+
   '<span class="status-school-chevron" aria-hidden="true">›</span></button>';
 }).join('');
 return '<div class="eyebrow">District-wide visibility</div><h1>Submission Monitoring</h1>'+
  '<p class="sub">Tap any school to view its submission status.'+
   (isAoII()?' As an approved AO II, you may submit for another school when its AO II is unavailable.':'')+
   ' Only district administrators and assigned approvers can verify submissions. File access remains restricted.</p>'+
  (yesAdmin()?'<div class="school-files-monitor-link"><button type="button" class="btn alt" data-a="nav" data-page="school-files">▣ View All School Attachments</button></div>':'')+
  '<div class="panel"><div class="field"><label for="pick-ann">Announcement</label><select id="pick-ann"><option value="">Choose an announcement</option>'+opts+'</select></div></div>'+
  (state.selectedId?(isCancelledAnnouncement?'<div class="notice warn"><strong>Cancelled announcement.</strong> '+esc(currentAnnouncement?.cancellation_reason||'This announcement was cancelled by the district administrator.')+' New submissions are disabled; existing records are retained.</div>':'')+'<div class="stats">'+(isCancelledAnnouncement?stat('Status','Cancelled','No pending compliance required')+stat('Previously assigned schools',state.monitor.length,'Historical record'):stat('Required Schools',state.monitor.length,'For selected announcement')+
   stat('Verified',n('Submitted')+n('Late'),'Admin approved')+stat('Awaiting Review',n('Pending Verification'),'Pending approval')+stat('Returned',n('Returned for Correction'),'Needs correction')+
   stat('Pending',n('Pending'),'Not yet submitted'))+'</div>'+
   '<div class="panel"><h3>School Status</h3><div class="status-school-list">'+(rows||'<p class="empty">No required schools found.</p>')+'</div></div>':
   '<div class="panel empty">Choose an announcement to view status.</div>')+
  '<div class="notice">Privacy: Everyone can see submission completion; file access remains restricted. Only district administrators and assigned approvers can verify submissions.</div>';
}
function monitorSchoolVisibleFilesHtml(){
 const files=state.monitorSchoolFiles||[];
 if(!files.length)return '<p class="note">No uploaded files are visible to this account for the selected school and announcement.</p>';
 return files.map(f=>
  '<div class="monitor-visible-file"><div><strong>'+esc(f.original_filename)+'</strong>'+
  '<div class="small muted">Uploaded by '+esc(f.uploader_name)+' · '+esc(f.uploader_school_name)+
  ' · '+esc(date(f.submitted_at))+' · '+esc(label(f.verification_status))+'</div></div>'+
  '<button class="btn tiny alt" type="button" data-a="monitor-open-school-file" data-id="'+esc(f.assignment_id)+'">View</button></div>'
 ).join('');
}
function monitorSchoolModal(){
 const item=state.monitorSchool;
 if(!item)return '<p class="notice">School status is not available.</p>';
 const info='<div class="monitor-file-summary">'+
  '<div><span class="small muted">School</span><strong>'+esc(item.schoolName)+'</strong></div>'+
  '<div><span class="small muted">Submission Status</span><span id="monitor-school-current-status">'+pTag(item.status)+'</span></div>'+
  '<div><span class="small muted">Announcement</span><strong>'+esc(item.announcementName)+'</strong></div>'+
  '<div><span class="small muted">Deadline</span><strong>'+esc(date(item.deadlineAt))+'</strong></div></div>';
 const adminButton=yesAdmin()&&['Submitted','Late'].includes(item.status)?
  '<div class="toolbar"><button class="btn alt" data-a="monitor-submission" data-school-id="'+esc(item.schoolId)+'">View Uploaded Files (Admin)</button></div>':'';
 const action=item.canSubmit?
  '<div class="panel"><h3>Submit Compliance</h3><p class="note">No attachment required. Administrator verification is still required.</p><button class="btn" data-a="mark-compliance" data-assignment="'+esc(item.assignmentId)+'">Mark as Submitted</button></div>'+ 
  '<div id="monitor-school-upload-host" data-announcement-id="'+esc(item.announcementId)+'" data-school-id="'+esc(item.schoolId)+'" data-assignment-id="'+esc(item.assignmentId)+'" data-school-name="'+esc(item.schoolName)+'"></div>'+
  '<p class="note">The actual uploader and represented school are recorded automatically. A submission requires district administrator verification; the represented school does not approve it.</p>':
  '<p class="note">'+(isOic()?'Oversight account: view status only.':
    item.announcementOpen?'Only approved AO II accounts and district administrators can submit for another school.':
    'This announcement is closed or cancelled; new submissions are unavailable.')+'</p>';
 const existing=!isOic()&&!yesAdmin()?'<section class="monitor-visible-files"><h4>Files You Can Access</h4>'+ 
  '<div id="monitor-visible-school-uploads">'+monitorSchoolVisibleFilesHtml()+'</div></section>':'';
 return info+adminButton+existing+action;
}
async function openMonitorSchool(schoolId){
 if(!active()||state.view!=='monitoring')throw new Error('Open Submission Monitoring first.');
 const school=state.schools.find(s=>s.id===schoolId);
 const ann=state.announcements.find(a=>a.id===state.selectedId);
 if(!school||!ann)throw new Error('School or announcement was not found.');
 const entry=state.monitor.find(x=>x.school_name===school.name);
 if(!entry)throw new Error('This school is not assigned to the selected announcement.');
 let assignmentId=null;
 if((yesAdmin()||isAoII())&&ann.status==='open'){
  const {data,error}=await db.rpc('i_track_status_school_upload_target',{p_announcement_id:ann.id,p_school_id:school.id});
  if(error)throw error;
  assignmentId=data?.[0]?.assignment_id||null;
 }
 state.monitorSchoolFiles=[];
 if(!isOic()&&!yesAdmin()){
  const {data,error}=await db.rpc('i_track_my_school_submission_documents');
  if(error)throw error;
  state.monitorSchoolFiles=(data||[]).filter(f=>f.school_id===school.id&&f.announcement_id===ann.id);
 }
 state.monitorSchool={schoolId:school.id,schoolName:school.name,announcementId:ann.id,
  announcementName:announcementName(ann),deadlineAt:ann.deadline_at,
  status:entry.submission_status||'Pending',assignmentId,
  canSubmit:!!assignmentId,announcementOpen:ann.status==='open'};
 state.modal='monitor-school';show();
}
async function openMonitorSubmission(schoolId){
 if(!yesAdmin()||!active()||state.view!=='monitoring')throw new Error('District administrator access required.');
 const school=state.schools.find(s=>s.id===schoolId);
 if(!school||!state.selectedId)throw new Error('Select an announcement and school first.');
 const ann=state.announcements.find(a=>a.id===state.selectedId);
 if(!ann)throw new Error('The announcement is no longer available.');
 // Query only the selected school and requirement. Database RLS independently
 // restricts access to active district administrators.
 const {data:assignments,error:assignmentError}=await db.from('announcement_assignments')
  .select('id').eq('announcement_id',ann.id).eq('school_id',school.id)
  .eq('obligation_status','required');
 if(assignmentError)throw assignmentError;
 if(!assignments?.length)throw new Error('No required assignment exists for this school.');
 const ids=assignments.map(a=>a.id),files=[];
 for(let offset=0;;offset+=200){
  const {data,error}=await db.from('submissions')
   .select('id,assignment_id,original_filename,content_type,file_size_bytes,first_received_at,stored_at,version_number,verification_status,verified_at,storage_status')
   .in('assignment_id',ids).in('storage_status',['uploaded','archived'])
   .order('first_received_at',{ascending:false}).order('id',{ascending:false})
   .range(offset,offset+199);
  if(error)throw error;
  files.push(...(data||[]));
  if(!data||data.length<200)break;
  if(offset>=9800)throw new Error('Submission history is too large to display in one panel.');
 }
 if(!files.length)throw new Error('No stored uploads were found for this school. Refresh monitoring.');
 state.monitorFiles=files.sort((a,b)=>Number(b.version_number)-Number(a.version_number)||
   new Date(b.first_received_at)-new Date(a.first_received_at));
 state.monitorDetail={schoolName:school.name,announcementName:announcementName(ann),deadlineAt:ann.deadline_at};
 state.modal='monitor-submission';show();
}
function monitorSubmissionModal(){
 if(!yesAdmin()||!state.monitorDetail)return '<div class="notice danger">District administrator access required.</div>';
 const detail=state.monitorDetail,files=state.monitorFiles||[];
 const first=files.reduce((old,f)=>!old||new Date(f.first_received_at)<new Date(old.first_received_at)?f:old,null);
 const status=first&&new Date(first.first_received_at)>new Date(detail.deadlineAt)?'Late':'Submitted';
 const newest=files[0];
 return '<div class="monitor-file-summary"><div><span class="small muted">School</span><strong>'+esc(detail.schoolName)+'</strong></div>'+
  '<div><span class="small muted">Announcement</span><strong>'+esc(detail.announcementName)+'</strong></div>'+
  '<div><span class="small muted">Current status</span>'+pTag(status)+'</div>'+
  '<div><span class="small muted">Official deadline</span><strong>'+esc(date(detail.deadlineAt))+'</strong></div>'+
  '<div><span class="small muted">First submission received</span><strong>'+esc(date(first?.first_received_at))+'</strong></div>'+
  '<div><span class="small muted">Latest upload</span><strong>'+esc(date(newest?.first_received_at))+'</strong></div></div>'+
  '<h3 class="monitor-file-heading">Uploaded Attachments ('+files.length+')</h3>'+
  '<p class="note">All submission versions are shown, newest first. Received times use Philippine time. A later revision does not change the original on-time or late status.</p>'+
  '<div class="monitor-file-list">'+files.map((f,i)=>{
   const vstatus=['verified','pending','rejected'].includes(f.verification_status)?f.verification_status:'pending';
   const name=String(f.original_filename||'Unnamed file');
   return '<section class="monitor-file-entry">'+
    '<div class="monitor-file-entry-head"><strong>Version '+esc(f.version_number)+(i===0?' · Latest':'')+'</strong>'+
    '<span class="verify-status verify-status-'+esc(vstatus)+'">'+esc(label(vstatus))+'</span></div>'+
    '<div class="monitor-file-name">'+esc(name)+'</div>'+
    '<div class="monitor-file-meta"><span>Received: '+esc(date(f.first_received_at))+'</span>'+
    '<span>Stored: '+esc(date(f.stored_at))+'</span>'+
    '<span>Size: '+esc((Number(f.file_size_bytes||0)/1024).toFixed(1))+' KB</span>'+
    (f.verified_at?'<span>Reviewed: '+esc(date(f.verified_at))+'</span>':'')+'</div>'+
    reviewFileActions(f,true)+'</section>';
  }).join('')+'</div>';
}

async function loadRoutingHistory(){
 const {data,error}=await db.rpc('i_track_document_route_history');
 if(error)throw error;
 const visible=new Set(state.docs.map(d=>d.id));
 state.routeHistory=(data||[]).filter(r=>visible.has(r.document_id));
}
function documentRoutes(id){return (state.routeHistory||[]).filter(r=>r.document_id===id)
 .sort((a,b)=>new Date(a.sent_at)-new Date(b.sent_at)||String(a.route_id).localeCompare(String(b.route_id)));}
function routeState(r){
 if(!r)return {label:'Not routed',kind:'muted'};
 if(r.route_status==='withdrawn')return {label:'Delivery withdrawn',kind:'muted'};
 if(r.processed_at)return {label:'Processed · See History',kind:'received'};
 if(r.route_status==='awaiting_ack')return {label:'Not yet received',kind:'pending'};
 if(r.route_status==='received')return {label:'Receipt acknowledged · Awaiting action',kind:'received'};
 return {label:label(r.route_status),kind:'muted'};
}
function routePerson(name,office){
 return '<strong>'+esc(name||'Unnamed personnel')+'</strong><span class="small muted">'+esc(office||'District Office')+'</span>';
}
function routingOverview(d){
 const steps=documentRoutes(d.id),last=steps.at(-1);
 const division=divisionStatusForDocument(d.id);
 if(division&&division.division_status!=='received_by_sender'&&d.status!=='completed')
  return '<div class="routing-overview"><span class="routing-status routing-status-received">'+esc(divisionStageLabel(division.division_status))+'</span>'+
   '<span class="small muted">Transmittal '+esc(division.transmittal_number)+' · Routing history remains available below.</span></div>';
 if(d.status==='completed')return '<div class="routing-overview"><span class="routing-status routing-status-received">Completed</span><span class="small muted">Document processing is complete. See history for previous routing and Division activity.</span></div>';
 if(d.status==='in_school')return '<div class="routing-overview"><span class="routing-status routing-status-received">In School</span><span class="small muted">Saved in My Documents. No recipient acknowledgment or transmittal is required. You may forward it later.</span></div>';
 if(!last)return '<div class="routing-overview"><span class="routing-status routing-status-received">No Recipient</span><span class="small muted">Use the Division Transmittals page if this document is intended for Division.</span></div>';
 const status=routeState(last);
 return '<div class="routing-overview"><span class="routing-status routing-status-'+status.kind+'">'+esc(status.label)+'</span>'+
  '<span class="small muted">'+esc(label(last.route_action))+' · '+esc(date(last.sent_at))+
  (steps.length>1?' · '+(steps.length-1)+' earlier handoff(s)':'')+'</span>'+
  '<div class="routing-people"><div><small>Sender</small>'+routePerson(last.sender_name,last.sender_office)+'</div>'+
  '<div><small>Recipient</small>'+routePerson(last.recipient_name,last.recipient_office)+'</div></div>'+
  (last.acknowledged_at?'<span class="small muted">Acknowledged '+esc(date(last.acknowledged_at))+'</span>':'')+'</div>';
}
function routingTimeline(routes,approvals=[],divisionEvents=[]){
 if(!routes.length&&!approvals.length&&!divisionEvents.length)return '<p class="note">No routing events recorded yet.</p>';
 const events=[];
 routes.forEach((r,i)=>{
  const sender=r.sender_name||'Unknown sender',recipient=r.recipient_name||'Unknown recipient';
  const action=r.route_action==='sent'?'Document sent':r.route_action==='forwarded'?'Document forwarded':r.route_action==='returned'?'Returned for correction':label(r.route_action);
  if(r.sent_at)events.push({when:r.sent_at,title:action,who:sender,detail:'To: '+recipient+(r.recipient_office?' · '+r.recipient_office:''),note:r.route_note||''});
  if(r.acknowledged_at)events.push({when:r.acknowledged_at,title:'Receipt acknowledged',who:recipient,detail:'Received from: '+sender,note:''});
  if(r.processed_at&&!approvals.some(a=>a.route_id===r.route_id))events.push({when:r.processed_at,title:r.route_status==='withdrawn'?'Pending delivery withdrawn':i<routes.length-1?'Routing processed':'Document processing recorded',who:r.route_status==='withdrawn'?sender:recipient,detail:'Route status: '+routeState(r).label,note:''});
 });
 approvals.forEach(a=>{const route=routes.find(r=>r.route_id===a.route_id);events.push({when:a.approved_at,title:'Document approved',who:route?.recipient_name||'Assigned recipient',detail:'Approval recorded and current route closed',note:a.remarks||''});});
 const divisionTitles={created:'Division transmittal prepared',accept:'Division assignment accepted',submit:'Submitted to Division',retrieve:'Retrieved from Division',forward:'Forwarded within district',district_ack:'District receipt acknowledged',district_receive:'Received by district',final_receive:'Received by sender',lost:'Document reported lost',recover:'Document recovered',not_for_return:'Marked not for return'};
 divisionEvents.forEach(e=>{if(e.happened_at)events.push({when:e.happened_at,title:divisionTitles[e.event_type]||('Division: '+label(e.event_type)),who:e.actor_name||'District personnel',detail:'Transmittal '+(e.transmittal_number||''),note:''});});
 events.sort((a,b)=>new Date(a.when).getTime()-new Date(b.when).getTime());
 return '<ol class="routing-timeline">'+events.map((e,i)=>
  '<li class="routing-step'+(i===events.length-1?' routing-step-current':'')+'">'+
  '<div class="routing-step-head"><strong>'+esc(e.title)+'</strong><span class="small muted">'+esc(date(e.when))+'</span></div>'+
  '<div class="routing-people"><div><small>Handled by</small>'+routePerson(e.who,'')+'</div><div><small>Details</small><span>'+esc(e.detail)+'</span></div></div>'+
  (e.note?'<p class="routing-note">'+esc(e.note)+'</p>':'')+'</li>'
 ).join('')+'</ol>';
}

function schoolSubmissionDetailModal(){
 const files=(state.schoolSubmissionDocs||[]).filter(f=>f.assignment_id===state.selectedSchoolSubmission)
  .sort((a,b)=>new Date(b.submitted_at)-new Date(a.submitted_at)||b.version_number-a.version_number);
 if(!files.length)return '<p class="notice">This submission is not available to your account. Reopen My Documents to refresh.</p>';
 const first=files[0];
 const relation=first.is_my_school?'This is a submission belonging to your school.':
  first.is_my_upload?'You uploaded this on behalf of another school.':'District submission record.';
 return '<div class="monitor-file-summary">'+
  '<div><span class="small muted">School Represented</span><strong>'+esc(first.school_name)+'</strong></div>'+
  '<div><span class="small muted">Announcement</span><strong>'+esc(first.announcement_title)+'</strong></div>'+
  '<div><span class="small muted">Reference</span><strong>'+esc(first.announcement_code||'School submission')+'</strong></div>'+
  '<div><span class="small muted">Versions Visible</span><strong>'+files.length+'</strong></div></div>'+
  '<p class="notice">'+esc(relation)+' The uploader is identified on every version. Only district administrators approve or reject submissions.</p>'+
  '<div class="school-doc-versions">'+files.map(f=>{
   const preview=['application/pdf','image/jpeg','image/png','image/webp'].includes(f.content_type);
   const available=f.storage_status==='uploaded';
   const name=f.original_filename||'Unnamed submitted file';
   const data=' data-kind="announcement" data-id="'+esc(f.submission_id)+'" data-name="'+esc(name)+'"';
   const actions=available?'<div class="doc-att-actions">'+
     (preview?'<button type="button" class="btn tiny alt iu-file-action" data-mode="view"'+data+'>View</button>':'')+
     '<button type="button" class="btn tiny alt iu-file-action" data-mode="download"'+data+'>Download</button></div>':
     '<span class="small muted">Archived offline · Ask the District Administrator</span>';
   const verification=f.verification_status==='verified'?'Verified by district administrator':
      f.verification_status==='rejected'?'Returned / Rejected by district administrator':
      'Pending district administrator verification';
   return '<section class="school-doc-version"><div class="school-doc-version-head"><strong>Version '+esc(f.version_number)+'</strong>'+
     pTag(f.verification_status||'pending')+'</div>'+
    '<p class="school-doc-filename">'+esc(name)+'</p>'+
    '<p class="school-doc-credit"><strong>Uploaded by '+esc(f.uploader_name)+'</strong>'+
     ' · '+esc(f.uploader_school_name||'District Office')+'</p>'+
    '<p class="small muted">Uploaded: '+esc(date(f.submitted_at))+' · '+esc(verification)+'</p>'+actions+
    '</section>';
  }).join('')+'</div>';
}
function documentPage(){
 const routed=[...state.docs].map(d=>{
  const last=documentRoutes(d.id).at(-1);
  const division=divisionStatusForDocument(d.id);
  const filterStatus=division?.division_status==='in_transmittal'?'in_transmittal':d.status==='in_school'?'in_school':last?.processed_at?'processed':last?.route_status||'none';
  return {when:d.created_at,markup:'<button type="button" class="compact-doc-row" data-document-row data-a="detail" data-id="'+esc(d.id)+'" '+
   'data-route-status="'+esc(filterStatus)+'" data-created="'+esc((d.created_at||'').slice(0,10))+'" '+
   'aria-label="Open files and routing history for '+esc(d.tracking_number)+' · '+esc(d.subject)+'">'+
   '<span class="compact-doc-id">'+esc(d.tracking_number)+'</span>'+
   '<span class="compact-doc-name" title="'+esc(d.subject)+'">'+esc(d.subject)+(division?'<span class="small muted doc-division-tag">'+esc(divisionStageLabel(division.division_status))+'</span>':'')+'</span>'+
   '<span class="compact-doc-arrow" aria-hidden="true">›</span></button>'};
 });
 const newestSchoolFiles=new Map();
 for(const f of (state.schoolSubmissionDocs||[])){
  if(!newestSchoolFiles.has(f.assignment_id))newestSchoolFiles.set(f.assignment_id,f);
 }
 const schoolRows=[...newestSchoolFiles.values()].map(f=>{
  const id=state.compliances.find(c=>c.assignment_id===f.assignment_id)?.number||f.announcement_code||'School Submission';
  const name=f.school_name+' · '+f.announcement_title;
  return {when:f.submitted_at,markup:'<button type="button" class="compact-doc-row" data-document-row '+
   'data-a="school-submission-detail" data-id="'+esc(f.assignment_id)+'" '+
   'data-route-status="submission" data-created="'+esc((f.submitted_at||'').slice(0,10))+'" '+
   'aria-label="Open submitted files for '+esc(name)+'">'+
   '<span class="compact-doc-id">'+esc(id)+'</span>'+
   '<span class="compact-doc-name" title="'+esc(name)+'">'+esc(name)+'</span>'+
   '<span class="compact-doc-arrow" aria-hidden="true">›</span></button>'};
 });
 const fileless=(state.compliances||[]).filter(c=>!newestSchoolFiles.has(c.assignment_id)).map(c=>({
  when:c.submitted_at,markup:'<button type="button" class="compact-doc-row" data-document-row data-a="open-compliance" data-id="'+esc(c.id)+'" data-route-status="submission" data-created="'+esc((c.submitted_at||'').slice(0,10))+'">'+
  '<span class="compact-doc-id">'+esc(c.number)+'</span><span class="compact-doc-name">'+esc(c.school_name+' · '+c.announcement_title+' · '+label(c.status))+'</span><span class="compact-doc-arrow">›</span></button>'
 }));
 const rows=[...routed,...schoolRows,...fileless].sort((a,b)=>new Date(b.when)-new Date(a.when)).map(r=>r.markup);
 return '<div class="sectionhead"><div><div class="eyebrow">Routing, files and school submissions</div><h1>My Documents</h1>'+
  '<p class="sub">One document per line. Tap a tracking number or school submission to see its files, uploader, and history.</p></div>'+
  '<button class="btn" data-a="send">+ Route Document</button></div>'+
  '<div class="panel compact-doc-panel"><h3>Documents and School Submissions</h3>'+
  '<div class="field"><label for="document-search">Search documents</label><input id="document-search" type="search" placeholder="Tracking number, document name or school" autocomplete="off"></div>'+
  '<div class="document-filter-row"><div class="field"><label for="document-status-filter">Document status</label>'+
  '<select id="document-status-filter"><option value="">All statuses</option><option value="submission">School submissions</option>'+
  '<option value="awaiting_ack">Awaiting acknowledgment</option>'+
  '<option value="received">Acknowledged · Awaiting action</option><option value="processed">Processed</option>'+
  '<option value="in_transmittal">In Transmittal to Division</option><option value="in_school">In School</option><option value="none">No route</option></select></div>'+
  '<div class="field"><label for="document-date-filter">Created on or after</label><input id="document-date-filter" type="date"></div>'+
  '<button type="button" class="btn alt tiny" data-a="clear-document-filters">Clear Filters</button></div>'+
  '<div id="document-search-count" class="small muted" aria-live="polite"></div>'+
  '<div class="compact-doc-list">'+(rows.join('')||'<p class="empty">No documents or school submissions found.</p>')+'</div></div>';
}

function retrievalPage(){return window.ITRACK_RETRIEVAL_VIEW?.(state,{esc,date,label,divisionStageLabel})||'<p class="note">Retrieval module did not load. Refresh the application.</p>';}
function divisionPage(){
 const data=state.divisionData||{},ts=data.transmittals||[],items=data.items||[],people=data.people||[];
 const activeId=state.divisionSelected&&ts.some(t=>t.id===state.divisionSelected)?state.divisionSelected:ts[0]?.id;
 const t=ts.find(x=>x.id===activeId);
 const activeItems=items.filter(i=>i.transmittal_id===activeId&&i.division_status!=='cancelled');
 const removedItems=items.filter(i=>i.transmittal_id===activeId&&i.division_status==='cancelled');
 const transmittalLocked=!!t&&(!!t.dispatched_at||t.status!=='draft'||
  activeItems.some(i=>i.submitted_at||i.division_status!=='in_transmittal'));
 const canEditDraft=!!t&&!transmittalLocked&&(t.prepared_by===state.profile.id||yesAdmin());
 const opts=people.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===state.session?.user?.id?'selected':'')+'>'+esc(p.name)+' — '+esc(p.position||'')+'</option>').join('');
 const eligible=(data.eligible||[]).map(d=>'<label style="display:block;padding:8px;border-bottom:1px solid #ddd"><input type="checkbox" class="division-pick" value="'+esc(d.id)+'"> '+esc(d.tracking_number)+' — '+esc(d.subject)+' ('+esc(d.document_type)+')</label>').join('');
 const compEligible=(data.eligible_compliances||[]).map(d=>'<label class="division-choice"><input type="checkbox" class="division-compliance-pick" value="'+esc(d.id)+'"><span><strong>'+esc(d.school_name)+'</strong> · '+esc(d.subject)+' <small>'+esc(d.tracking_number)+'</small></span></label>').join('');
 const rows=activeItems.map(i=>{
 const actions=[];
 if(t?.assigned_submitter===state.profile.id&&t.assignment_accepted_at&&i.division_status==='in_transmittal')actions.push('<button class="btn tiny" data-a="division-act" data-act="submit" data-id="'+esc(i.id)+'">Mark as Submitted to Division</button>');
 if(yesAdmin())actions.push('<button class="btn tiny alt" data-a="division-act" data-act="admin_received" data-id="'+esc(i.id)+'">Resolve Received</button><button class="btn tiny alt" data-a="division-act" data-act="lost" data-id="'+esc(i.id)+'">Lost</button><button class="btn tiny alt" data-a="division-act" data-act="not_for_return" data-id="'+esc(i.id)+'">Not for Return</button>'+(i.division_status==='lost'?'<button class="btn tiny alt" data-a="division-act" data-act="recovered" data-id="'+esc(i.id)+'">Recovered</button>':'')+(['lost','not_for_return','received_by_sender'].includes(i.division_status)?'<button class="btn tiny alt" data-a="division-act" data-act="correct" data-id="'+esc(i.id)+'">Correct</button>':''));
 if(canEditDraft&&state.transmittalEditing&&i.division_status==='in_transmittal')actions.unshift('<button class="btn tiny alt" data-a="transmittal-rename" data-id="'+esc(i.id)+'">Edit Name</button>');
 if(canEditDraft&&state.transmittalEditing)actions.unshift('<button class="btn tiny danger" data-a="draft-remove-item" data-id="'+esc(i.id)+'">Remove</button>');
 return '<tr><td>'+esc(i.tracking_number)+'</td><td>'+esc(i.document_label)+'</td><td>'+pTag(i.division_status==='received_by_sender'&&i.retrieved_from_division_at?'completed':i.division_status)+'</td><td>'+actions.join(' ')+'</td></tr>';
 });
 const draftControls=canEditDraft?
  '<div class="draft-edit-bar"><button class="btn alt" data-a="draft-toggle-edit">'+(state.transmittalEditing?'Finish Editing':'Edit Transmittal')+'</button>'+
   '<span class="small muted">Changes allowed only before the first physical Division submission.</span></div>'+
  (state.transmittalEditing?'<div class="panel draft-transmittal-editor" id="draft-transmittal-editor">'+
   '<div class="draft-included-header"><div><h4>Documents Already in This Transmittal ('+activeItems.length+')</h4>'+
   '<p class="note">These are the documents already attached to <strong>'+esc(t.transmittal_number)+'</strong>. Check the ones to remove.</p></div></div>'+
   '<div class="draft-current-list">'+
    (activeItems.map(i=>'<div class="draft-current-item"><label><input type="checkbox" class="draft-remove-pick" value="'+esc(i.id)+'" aria-label="Select '+esc(i.document_label)+' for removal">'+
     '<span class="draft-current-description"><strong>'+esc(i.document_label)+'</strong>'+
     '<small>'+esc(i.tracking_number||'No tracking ID')+' · '+esc(i.document_type||'Document')+'</small></span></label>'+
     '<button class="btn tiny alt" data-a="transmittal-rename" data-id="'+esc(i.id)+'">Edit Name</button></div>').join('')||
     '<p class="note">There are no documents attached to this draft. Choose from the available documents below.</p>')+'</div>'+
   (activeItems.length?'<button class="btn danger" data-a="draft-remove-selected">Remove Checked Documents</button>':'')+
   '<div class="draft-add-divider"></div><h4>Available Documents to Add</h4>'+
   '<p class="note">Only documents not currently assigned to an active transmittal appear here. If these lists are empty, your documents already attached above are <strong>not missing</strong>.</p>'+
   '<h5>Regular Division Documents</h5><div class="division-eligible-list">'+
    ((data.eligible||[]).map(d=>'<label class="division-choice"><input type="checkbox" class="draft-add-document" value="'+esc(d.id)+'"><span>'+esc(d.subject)+' <small>'+esc(d.tracking_number)+'</small></span></label>').join('')||'<p class="note">No additional regular documents available to add.</p>')+'</div>'+
   '<h5>Verified Announcement Submissions</h5><div class="division-eligible-list">'+
    ((data.eligible_compliances||[]).map(d=>'<label class="division-choice"><input type="checkbox" class="draft-add-compliance" value="'+esc(d.id)+'"><span>'+esc(d.school_name)+' · '+esc(d.subject)+' <small>'+esc(d.tracking_number)+'</small></span></label>').join('')||'<p class="note">No additional verified submissions available to add.</p>')+'</div>'+
   '<button class="btn" data-a="draft-add-items">Add Checked Documents</button></div>':'')
  :t?'<p class="note"><strong>Transmittal locked.</strong> Its first document has been marked Submitted to Division. Document names, signer details, and items can no longer be changed.</p>':'';
 const removedHistory=removedItems.length?'<details class="draft-removed-history"><summary>Removed before submission ('+removedItems.length+')</summary>'+
   removedItems.map(i=>'<p class="small muted">'+esc(i.tracking_number)+' — '+esc(i.document_label)+' (removed; eligible to add again)</p>').join('')+'</details>':'';
 const adminPanel=yesAdmin()?'<div class="panel"><h3>Administrator Document Search & Resolution</h3><p class="note">Search any tracking number or document title. A written reason is required for manual changes.</p><div class="toolbar"><input id="division-admin-query" placeholder="Tracking number or document name" value="'+esc(state.divisionQuery||'')+'"><button class="btn alt" data-a="division-admin-search">Search</button></div>'+table(['Tracking #','Document','Status','Resolution'],(state.divisionSearchResults||[]).map(d=>'<tr><td>'+esc(d.tracking_number)+'</td><td>'+esc(d.subject)+'</td><td>'+esc(d.resolution||d.status)+'</td><td>'+(['received','lost','not_for_return','recovered','corrected'].map(a=>'<button class="btn tiny alt" data-a="division-admin-resolve" data-id="'+esc(d.id)+'" data-act="'+a+'">'+esc(label(a))+'</button>').join(' '))+'</td></tr>'))+'</div>':'';
 return '<div class="sectionhead"><div><div class="eyebrow">Physical document custody</div><h1>Division Transmittals</h1><p class="sub">Prepare and submit documents to Division. Retrieval and final receipt are managed separately, with every tracking ID preserved.</p></div><button class="btn alt" data-a="division-refresh">Refresh</button></div>'+
 adminPanel+'<div class="panel"><h3>Division Retrieval</h3><p class="note">Physical pickup, turnover slips, District acknowledgment and final owner receipt are recorded in the separate Division Retrieval page. The original transmittal below remains the official outgoing record.</p><button class="btn alt" data-a="nav" data-page="retrieval">Open Division Retrieval</button></div>'+
 '<div class="panel"><h3>Notifications</h3>'+(state.divisionNotices||[]).map(n=>'<p class="note">'+esc(date(n.created_at))+' — '+esc(n.message)+'</p>').join('')+'</div>'+
 '<div class="panel"><h3>Create Transmittal</h3><p class="note">Select Division documents and verified announcement submissions. Recipient approval is not needed.</p><div class="field"><label>Assigned submitter</label><select id="division-submitter">'+opts+'</select></div><h4>Division Documents</h4><div class="division-eligible-list">'+(eligible||'<p class="note">No eligible documents.</p>')+'</div><h4>Verified School Submissions</h4><div class="division-eligible-list">'+(compEligible||'<p class="note">No verified submissions.</p>')+'</div><button class="btn" data-a="division-create">Create Transmittal</button></div>'+
 '<div class="panel"><h3>Transmittal</h3><div class="field"><label>Select transmittal</label><select id="division-current">'+ts.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===activeId?'selected':'')+'>'+esc(x.transmittal_number)+'</option>').join('')+'</select></div>'+
 (t?'<p><strong>'+esc(t.transmittal_number)+'</strong> · '+pTag(transmittalLocked?'dispatched':t.assignment_accepted_at?'accepted':'pending')+'</p>'+draftControls+
 '<div class="division-print-config"><h4>Official Forms</h4><p class="note">Transmittal ID stays in the app; the AO may write it on the back of the paper. Individual IDs print lightly beside titles.</p><div class="field"><label>Signatory Name</label><input id="trans-signer-name" value="'+esc(t.signer_name||'SHERILL E. CORTEJO, PhD')+'"'+(transmittalLocked?' disabled':'')+'></div><div class="field"><label>Position</label><input id="trans-signer-position" value="'+esc(t.signer_position||'School Principal II')+'"'+(transmittalLocked?' disabled':'')+'></div><div class="field"><label>Designation</label><input id="trans-signer-office" value="'+esc(t.signer_office||'OIC, Office of the Public Schools District Supervisor')+'"'+(transmittalLocked?' disabled':'')+'></div><div class="field"><label>Authorized School (Endorsement)</label><input id="trans-authorized-school" value="'+esc(t.authorized_school_name||'')+'" placeholder="Submitting AO II school"'+(transmittalLocked?' disabled':'')+'></div><button class="btn tiny alt" data-a="transmittal-save-signer"'+(transmittalLocked?' disabled':'')+'>Save Signatory</button><div class="field"><label>Choose forms to print</label><select id="division-print-kind"><option value="endorsement">Endorsement</option><option value="transmittal">Transmittal</option><option value="both" selected>Both</option></select></div><div class="toolbar"><button class="btn" data-a="division-print">Print / Save PDF</button><button class="btn alt" data-a="division-word">Editable Word</button></div></div><div class="toolbar">'+
 (t.assigned_submitter===state.profile.id&&!t.assignment_accepted_at?'<button class="btn" data-a="division-act" data-act="accept">Accept Assignment</button>':'')+
 (canEditDraft&&t.prepared_by===state.profile.id?'<select id="division-reassign">'+opts+'</select><button class="btn alt" data-a="division-act" data-act="reassign">Reassign</button>':'')+'</div>'+
 table(['Tracking #','Document','Physical Status','Action'],rows)+removedHistory:'<p class="note">No transmittal created yet.</p>')+'</div>';
}
function divisionPrintHtml(t,items,qrImage=''){
 const sorted=[...items].sort((a,b)=>String(a.document_type||'').localeCompare(String(b.document_type||''))||String(state.schools.find(s=>s.id===a.school_id)?.name||'').localeCompare(String(state.schools.find(s=>s.id===b.school_id)?.name||''))||String(a.tracking_number).localeCompare(String(b.tracking_number)));let heading='';const rows=sorted.map((i,n)=>{const section=(i.document_type||'Document')+' — '+(state.schools.find(s=>s.id===i.school_id)?.name||'School');const head=section===heading?'':'<tr><th colspan="4" style="background:#eee;text-align:left">'+esc(section)+'</th></tr>';heading=section;return head+'<tr><td>'+(n+1)+'</td><td>'+esc(i.tracking_number)+'</td><td>'+esc(i.document_label)+'</td><td>'+esc(i.division_status)+'</td></tr>';}).join('');
 return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(t.transmittal_number)+'</title><style>body{font:14px Arial;padding:30px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:9px}h1{color:#173e88}</style></head><body><h1>SRII i-TRACK — Division Transmittal</h1><h2>'+esc(t.transmittal_number)+'</h2><p>Prepared: '+esc(date(t.created_at))+'</p><p>QR / Live checklist link: '+esc(location.origin+location.pathname+'?view=division&transmittal='+encodeURIComponent(t.id))+'</p><table><tr><th>#</th><th>Tracking Number</th><th>Document</th><th>Status</th></tr>'+rows+'</table><p>Received by: _______________________ Date: ______________</p></body></html>';
}

function approvalPage(){
 if(!yesAdmin())return '<div class="notice danger">Administrator access required.</div>';
 const emailById=new Map(state.accountEmails.map(r=>[r.user_id,r]));
 const removedCount=state.profiles.filter(p=>p.account_status==='deleted').length;
 const rows=state.profiles.filter(p=>state.showRemovedAccounts||p.account_status!=='deleted').map(p=>{
  const oversight=p.role==='oic_psds';
  const school=oversight?'District Office (no school)':state.schools.find(s=>s.id===(p.school_id||p.requested_school_id))?.name||'Unassigned';
  const pending=p.account_status==='pending';
  const canReview=pending&&(!oversight||isMain());
  const emailRecord=emailById.get(p.id),email=emailRecord?.email||'';
  const canAssist=(p.role!=='main_admin'&&p.id!==state.session?.user?.id)&&
    (p.role!=='backup_admin'||isMain())&&(!oversight||isMain());
  const actions=[];
  if(canReview){
   actions.push('<button class="btn tiny" data-a="account-approve" data-id="'+esc(p.id)+'">Approve</button>');
   actions.push('<button class="btn tiny danger" data-a="reject" data-id="'+esc(p.id)+'">Reject</button>');
  }else if(pending&&oversight){
   actions.push('<span class="small muted">Main Administrator approval only</span>');
  }
  if(isMain()&&p.account_status==='active'&&p.role!=='main_admin'&&p.role!=='oic_psds')
   actions.push('<button class="btn tiny alt" data-a="backup" data-id="'+esc(p.id)+'" data-enable="'+(p.role==='backup_admin'?'false':'true')+'">'+
   (p.role==='backup_admin'?'Remove Backup':'Make Backup')+'</button>');
  const canDelete=(p.account_status!=='deleted'&&p.role!=='main_admin'&&p.id!==state.session?.user?.id)&&
    (isMain()||p.role==='school_user');
  if(canDelete)actions.push('<button type="button" class="btn tiny danger" data-a="admin-delete-user" data-id="'+esc(p.id)+'">Delete User</button>');
  if(canAssist&&email&&p.account_status!=='deleted'){
   actions.push('<button type="button" class="btn tiny alt" data-a="admin-password-reset" data-id="'+esc(p.id)+'">Send Password Reset</button>');
   if(emailRecord?.email_confirmed===false)
    actions.push('<button type="button" class="btn tiny alt" data-a="admin-email-confirmation" data-id="'+esc(p.id)+'">Resend Verification</button>');
  }
  const roleLabel=oversight?'OIC-PSDS · Read Only':label(p.role);
  const emailStatus=p.account_status==='deleted'?'<span class="small muted">Account access removed</span>':emailRecord?.email_confirmed===true?'<span class="account-email-state is-confirmed">Email verified</span>':
     emailRecord?.email_confirmed===false&&p.account_status==='active'?'<span class="account-email-state is-unconfirmed">Approved — Email verification pending</span>':
     emailRecord?.email_confirmed===false?'<span class="account-email-state is-unconfirmed">Email verification pending</span>':
     '<span class="small muted">Email status unavailable</span>';
  return '<tr><td><strong>'+esc(p.display_name||'Unnamed user')+'</strong>'+
   '<div class="small muted">'+esc(p.position_title||'')+'</div></td>'+
   '<td>'+esc(school)+'</td><td>'+pTag(p.account_status)+'</td>'+
   '<td>'+esc(roleLabel)+'</td><td><div class="account-email">'+
     (email?'<span>'+esc(email)+'</span>':'<span class="small muted">Email unavailable</span>')+
     emailStatus+'</div></td>'+
   '<td><div class="actionbuttons account-recovery-actions">'+actions.join('')+'</div></td></tr>';
 });
 return '<div class="eyebrow">Administrator controls</div><h1>Account Approvals</h1>'+
  '<p class="sub">Approve personnel, check who is awaiting email verification, or send a password-reset link. Resetting a password preserves all documents and account history. The Main Administrator approves OIC-PSDS accounts.</p>'+
  '<div class="notice warn"><strong>Approval and email verification are separate.</strong> An approved account marked “Email verification pending” cannot sign in until the user verifies their email. Use <strong>Resend Verification</strong> to request a fresh link if the previous one expired. Do not delete or recreate the account.</div>'+
  '<div class="notice">Delete User removes SRII i-TRACK access and retains the historical account ID, document routing, uploader attribution, and all Google Drive files. It does not erase the underlying Supabase Auth login record or free the email address. Do not use Delete User for forgotten passwords.</div>'+
  '<div class="account-delete-toolbar"><button type="button" class="btn alt tiny" data-a="toggle-removed-users">'+
   (state.showRemovedAccounts?'Hide Deleted Accounts':'Show Deleted Accounts ('+removedCount+')')+'</button></div>'+
  '<div class="panel">'+table(['Name','School / Office','Status','Role','Email verification','Actions'],rows)+'</div>'+
  '<section class="panel"><h3>Registration Email Queue</h3>'+
  '<p class="note">Waiting-list tickets are not registered accounts and cannot be approved here. These are estimated two-per-hour signup windows, not confirmed email deliveries. The provider email quota is also used for password resets and other messages.</p>'+
  table(['Queue #','Applicant / Email','School','Status','Estimated Time (PHT)'],
  state.adminRegistrationQueue.map(q=>{
   const current=String(q.queue_status||'waiting');
   const status=current==='waiting'&&new Date(q.ready_at)<=new Date()?'Ready to register':label(current);
   return '<tr><td><strong>#'+esc(q.queue_number)+'</strong></td>'+
    '<td><strong>'+esc(q.full_name)+'</strong><div class="small muted">'+esc(q.email)+'</div></td>'+
    '<td>'+esc(q.school_name)+'</td>'+
    '<td>'+esc(status)+'</td>'+
    '<td>'+esc(date(q.ready_at))+'</td></tr>';
  }))+'</section>';
}
function archivePage(){return `<div class="eyebrow">Administrator controls</div><h1>Archive Documents</h1><p class="sub">Two-month archival to an SSD after verification.</p><div class="panel"><div class="notice warn"><b>Not yet enabled.</b> This will prepare downloadable archives, verify copies, and require administrator confirmation before any Drive files are deleted.</div><button class="btn" disabled>Archive Documents</button><p class="note" style="margin-top:12px">Submission metadata and audit history will remain in Supabase after archiving.</p></div>`;}
function modalHtml(){
 const m=state.modal;let title='',body='',footer='';
 if(m==='new-announcement'){
  title='Create Announcement';
  body=`<form id="form-ann">${field('Title','title')}<div class="field"><label>Description / Instructions</label><textarea name="description" placeholder="What should schools submit?"></textarea></div>${field('Deadline (Philippine time)','deadline','datetime-local')}<div class="field"><label>Required schools</label><label class="small"><input type="checkbox" id="all-schools" checked> Select all schools</label><div class="school-grid">${state.schools.filter(x=>x.is_active).map(x=>`<label><input class="school-checkbox" type="checkbox" value="${x.id}" checked> ${esc(x.name)}</label>`).join('')}</div></div></form>`;
  body=body.replace('</form>','<div class="field"><label>Assigned Approvers (optional)</label>'+
   '<p class="note">Any one assigned approver may approve or return a school submission. District administrators retain oversight.</p>'+
   '<div class="approver-list">'+state.recipients.map(u=>'<label><input type="checkbox" class="announcement-approver-pick" value="'+esc(u.user_id)+'"> '+esc(u.display_name)+'</label>').join('')+'</div></div></form>');
  footer='<button class="btn alt" data-a="close">Cancel</button><button class="btn" type="submit" form="form-ann">Publish</button>';
 }else if(m==='edit-announcement'){
  const ann=state.announcements.find(x=>x.id===state.announcementEditId);
  const editor=state.announcementEditorData||{};
  const selected=new Set(editor.school_ids||[]);
  const protectedIds=new Set(editor.protected_school_ids||[]);
  const schools=state.schools.filter(x=>x.is_active);
  const allSelected=schools.length>0&&schools.every(x=>selected.has(x.id));
  title='Edit Announcement';
  body='<form id="form-ann-edit">'+
   '<p class="note"><strong>'+esc(ann?.announcement_code||'Announcement')+'</strong> · '+esc(ann?.status||'')+
   '. Editing preserves existing submission IDs, uploaded files, and the original publication history.</p>'+
   '<div class="field"><label for="edit-ann-title">Announcement Title</label><input id="edit-ann-title" name="title" type="text" maxlength="180" required value="'+esc(ann?.title||'')+'"></div>'+
   '<div class="field"><label for="edit-ann-description">Description / Instructions</label><textarea id="edit-ann-description" name="description" rows="4" maxlength="5000">'+esc(ann?.description||'')+'</textarea></div>'+
   '<div class="field"><label for="edit-ann-deadline">Submission Deadline (Philippine time)</label><input id="edit-ann-deadline" name="deadline" type="datetime-local" required value="'+esc(phtDatetimeLocal(ann?.deadline_at))+'"></div>'+
   '<p class="note">Original deadline: '+esc(date(ann?.original_deadline_at))+' (kept in the audit record). The announcement remains '+esc(ann?.status||'open')+' after editing.</p>'+
   '<div class="field"><label>Required Schools</label><label class="small"><input id="all-schools" type="checkbox"'+(allSelected?' checked':'')+'> Select all available schools</label>'+
   '<p class="note">Schools that already submitted are locked to protect their compliance. To stop an entire announcement, use Cancel Announcement instead.</p>'+
   '<div class="school-grid">'+schools.map(sc=>'<label><input type="checkbox" class="school-checkbox" value="'+esc(sc.id)+'"'+(selected.has(sc.id)?' checked':'')+(protectedIds.has(sc.id)?' disabled':'')+'> '+esc(sc.name)+(protectedIds.has(sc.id)?' <span class="small muted">(submitted — cannot remove)</span>':'')+'</label>').join('')+'</div></div>'+
   '<div class="field"><label>Assigned Approvers (optional)</label><p class="note">Any one assigned approver may approve a school submission. Administrators retain verification rights.</p>'+
   '<div class="approver-list">'+state.recipients.map(u=>'<label><input type="checkbox" class="announcement-approver-pick" value="'+esc(u.user_id)+'"'+((editor.approver_ids||[]).includes(u.user_id)?' checked':'')+'> '+esc(u.display_name)+'</label>').join('')+'</div></div>'+
   '</form>';
  footer='<button class="btn alt" data-a="close">Cancel</button><button class="btn" type="submit" form="form-ann-edit">Save Announcement Changes</button>';
 }else if(m==='cancel-announcement'){
  const ann=state.announcements.find(x=>x.id===state.announcementCancelId);
  title='Cancel Announcement';
  body='<div class="notice warn"><strong>Cancel '+esc(ann?.announcement_code||'this announcement')+'?</strong>'+
   '<p>School submissions will stop. The announcement, existing attachments, tracking IDs, and verification history will be preserved. Cancellation cannot be reversed here.</p></div>'+
   '<p><strong>'+esc(ann?.title||'Announcement')+'</strong></p>'+
   '<div class="field"><label for="cancel-ann-reason">Reason for Cancellation (required)</label>'+
   '<textarea id="cancel-ann-reason" rows="4" minlength="5" maxlength="1000" placeholder="State why this announcement is being cancelled"></textarea></div>';
  footer='<button class="btn alt" data-a="close">Keep Announcement</button><button class="btn danger" data-a="confirm-cancel-announcement">Confirm Cancellation</button>';
 }else if(m==='announcement-approvers'){
  const ann=state.announcements.find(a=>a.id===state.announcementApproverEditing);
  title='Manage Assigned Approvers';
  const assigned=new Set(state.approverAssignments.filter(x=>x.announcement_id===ann?.id).map(x=>x.user_id));
  body='<p class="note">Announcement: <strong>'+esc(ann?.title||'Selected announcement')+'</strong></p>'+
   '<p class="note">Any one assigned approver may verify or return a pending response. Only email-verified, approved, active accounts are eligible. District administrators retain oversight.</p>'+
   '<div class="approver-list">'+state.recipients.map(u=>'<label><input type="checkbox" class="announcement-approver-pick" value="'+esc(u.user_id)+'"'+(assigned.has(u.user_id)?' checked':'')+'> '+esc(u.display_name)+'</label>').join('')+'</div>';
  footer='<button class="btn alt" data-a="close">Cancel</button><button class="btn" data-a="save-approvers">Save Approvers</button>';
 }else if(m==='send'){
  title='Route Document';
  const recipientOptions=state.recipients.map(x=>
   '<option value="'+esc(x.user_id)+'">'+esc(x.display_name)+'</option>').join('');
  body='<p class="route-form-intro">Create a document record, send it to a colleague, or prepare it for Division submission.</p>'+
   '<form id="form-doc" class="route-document-form">'+
    '<div class="route-form-grid">'+field('Document Title','subject')+
    '<div class="field"><label for="doc-type">Document Type</label><select name="type" id="doc-type" required>'+
     '<option value="">Select document type</option>'+
     state.docTypes.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('')+
    '</select></div></div>'+
    '<div class="field route-recipient-field"><label for="doc-recipient">Recipient <span class="route-optional">(optional)</span></label>'+
     '<select name="recipient" id="doc-recipient"><option value="">No recipient — Save In School</option>'+
     recipientOptions+'</select>'+
     '<p class="route-field-note">Choose a verified, approved user. Selecting your own name or leaving this blank saves the document <strong>In School</strong>.</p></div>'+
    '<div class="route-destination" role="group" aria-labelledby="route-destination-label">'+
     '<div class="route-section-label" id="route-destination-label">Destination</div>'+
     '<div class="route-destination-grid">'+
      '<label class="route-destination-choice"><input type="radio" name="destination" value="school" checked>'+
       '<span><strong>School Only</strong><small>School-level record</small></span></label>'+
      '<label class="route-destination-choice"><input type="radio" name="destination" value="district">'+
       '<span><strong>District</strong><small>For district processing</small></span></label>'+
      '<label class="route-destination-choice"><input type="radio" name="destination" value="division">'+
       '<span><strong>Division</strong><small>Eligible for transmittal</small></span></label>'+
     '</div>'+
     '<p class="route-field-note">Division documents can appear in any authorized user’s transmittal immediately—no recipient approval needed.</p>'+
    '</div>'+
    '<div class="field route-instructions-field"><label for="doc-notes">Instructions / Remarks <span class="route-optional">(optional)</span></label>'+
     '<textarea name="notes" id="doc-notes" rows="3" placeholder="Type your instructions or other details here…"></textarea></div>'+
    '<div class="field route-attachment-field"><label for="doc-attachments">Attachments <span class="route-optional">(optional)</span></label>'+
     '<div class="route-attachment-picker"><input id="doc-attachments" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp">'+
      '<p id="doc-attachment-selection" class="route-field-note">PDF, Word or images · Up to 5 files, 4 MB each</p></div></div>'+
    '<p id="doc-save-message" class="route-save-message" role="status" aria-live="polite"></p>'+
   '</form>'+
   '<details class="route-type-suggestion"><summary>Missing a document type?</summary>'+
    '<div class="field"><label for="suggested-doc-type">Suggest a document type</label>'+
     '<input id="suggested-doc-type" type="text" maxlength="140" placeholder="Enter new document type"></div>'+
    '<button type="button" class="btn alt tiny" data-a="suggest-doc-type">Submit Type Suggestion</button>'+
    '<p id="type-suggestion-feedback" class="small muted" aria-live="polite">New types require District Administrator approval before use.</p></details>';
  footer='<button class="btn alt" data-a="close">Cancel</button>'+
   '<button class="btn" id="doc-submit-btn" type="submit" form="form-doc">Save / Route Document</button>';
 }else if(m==='school-submission-detail'){
  const selected=(state.schoolSubmissionDocs||[]).find(f=>f.assignment_id===state.selectedSchoolSubmission);
  title=selected?(selected.announcement_code||'School Submission')+' · '+selected.school_name:'School Submission';
  body=schoolSubmissionDetailModal();
  footer='<button type="button" class="btn alt" data-a="close">Close</button>';
 }else if(m==='monitor-school'){
  title='School Submission Status';
  body=monitorSchoolModal();
  footer='<button type="button" class="btn alt" data-a="close">Close</button>';
 }else if(m==='monitor-submission'){
  title='School Submission Details';
  body=monitorSubmissionModal();
  footer='<button type="button" class="btn alt" data-a="close">Close</button>';
 }else if(m==='detail'){
  const d=state.detail;title=d.tracking_number;
  const routes=state.routes,last=routes.at(-1),mine=last?.to_user_id===state.session.user.id;
  const canAck=mine&&last.route_status==='awaiting_ack';
  const canForward=mine&&last.route_status==='received'&&!last.processed_at;
  const awaitingDecision=mine&&last.route_status==='received'&&!last.processed_at;
  const canApprove=awaitingDecision;
  const canChangePending=!!last&&last.from_user_id===state.session.user.id&&last.route_status==='awaiting_ack'&&!last.acknowledged_at&&!last.processed_at;
  const canForwardSaved=d.status==='in_school'&&d.created_by===state.session.user.id;
  body='<h3>'+esc(d.subject)+'</h3><p class="sub">'+esc(d.document_type)+' · Created '+esc(date(d.created_at))+'</p>'+
   '<section class="routing-current-panel"><h3>Current Whereabouts / Responsible Handler</h3>'+routingOverview(d)+'</section>'+
   '<section class="doc-detail-attachments"><h3>Attached Files</h3><div data-doc-files="'+esc(d.id)+'">'+attachmentListHtml(d.id)+'</div></section>'+
   '<details class="routing-history-collapse" open><summary><strong>Routing History</strong><span class="small muted"> Routing, approval and Division events · Tap to view complete journey</span></summary>'+routingTimeline(routes,state.approvals,state.divisionHistory)+'</details>';
  if(d.status!=='completed'&&(d.created_by===state.session.user.id || (last?.to_user_id===state.session.user.id&&last.acknowledged_at)))body+='<div class="field"><label for="document-destination">Document Destination</label><select id="document-destination"><option value="school"'+(d.destination==='school'?' selected':'')+'>School Only</option><option value="district"'+(d.destination==='district'?' selected':'')+'>District</option><option value="division"'+(d.destination==='division'?' selected':'')+'>Division</option></select><button class="btn tiny alt" data-a="document-change-destination" data-id="'+esc(d.id)+'">Save Destination</button><p class="small muted">Forward to Division by selecting Division here. No recipient approval is required for transmittal eligibility.</p></div>';
  if(canAck)body+='<p class="notice">Acknowledging confirms that you received this document. It does not mean the document has been approved. Review the attachment and sender details before acknowledging.</p>';
  if(awaitingDecision)body+='<p class="notice">Receipt acknowledged. You may approve, forward, or return this document. Approval is recorded separately.</p>';
  if(canForward)body+='<div class="field"><label>Recipient for forwarding or return</label><p class="small muted">For Return for Correction, select the person who must correct the document (normally its original sender). For Forward, select the next handler.</p><select id="next-person"><option value="">Choose recipient</option>'+
    state.recipients.filter(x=>x.user_id!==state.session.user.id).map(x=>
     '<option value="'+esc(x.user_id)+'">'+esc(x.display_name)+' · '+esc(x.school_name)+'</option>').join('')+
    '</select></div><div class="field"><label>Remarks (required for Return for Correction)</label><input id="route-note" placeholder="Explain the correction needed, or add forwarding instructions"></div>';
  if(canChangePending||canForwardSaved)body+='<div class="field"><label for="pending-new-recipient">'+(canForwardSaved?'Recipient for Forwarding':'Change Pending Recipient')+'</label><select id="pending-new-recipient"><option value="">Choose approved recipient</option>'+state.recipients.filter(x=>x.user_id!==state.session.user.id).map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.display_name)+'</option>').join('')+'</select></div>';
  footer='<button class="btn alt" data-a="close">Close</button>'+ 
   (d.destination!=='division'&&d.status!=='completed'&&(d.created_by===state.session.user.id||(last?.to_user_id===state.session.user.id&&last?.acknowledged_at))?'<button class="btn alt" data-a="direct-division" data-id="'+esc(d.id)+'">Forward to Division</button>':'')+
   (canChangePending?'<button class="btn alt" data-a="pending-route-action" data-act="change" data-id="'+esc(d.id)+'">Change Recipient</button><button class="btn alt" data-a="pending-route-action" data-act="cancel" data-id="'+esc(d.id)+'">Cancel Sending</button>':'')+
   (canForwardSaved?'<button class="btn" data-a="pending-route-action" data-act="forward_saved" data-id="'+esc(d.id)+'">Forward Document</button>':'')+
   (canAck?'<button class="btn" data-a="ack" data-id="'+esc(last.route_id)+'">Acknowledge Receipt</button>':'')+
   (canApprove?'<button class="btn" data-a="document-approve" data-id="'+esc(last.route_id)+'">Approve Document</button>':'')+
   (canForward?'<button class="btn alt" data-a="route" data-id="'+esc(last.route_id)+'" data-return="true">Return for Correction</button>'+
    '<button class="btn" data-a="route" data-id="'+esc(last.route_id)+'" data-return="false">Forward</button>':'');

 }
 return `<div class="dialog-backdrop"><div class="dialog${m==='send'?' route-document-dialog':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><h2>${esc(title)}</h2>${m==='send'?'<p class="route-dialog-subtitle">Document Tracking · SRII i-TRACK</p>':''}</div><button class="btn alt tiny" data-a="close" aria-label="Close dialog">✕</button></header>${m==='send'?'<div class="route-dialog-content">'+body+'</div>':body}<footer>${footer}</footer></div></div>`;
}
async function openDetail(id){
 const d=state.docs.find(x=>x.id===id);if(!d)return;
 const [routes,approvals,division]=await Promise.all([
  db.rpc('i_track_document_route_history',{p_document_id:id}),
  db.rpc('i_track_document_approvals',{p_document_id:id}),
  db.rpc('i_track_document_division_events',{p_document_id:id})
 ]);
 if(routes.error)throw routes.error;
 if(approvals.error)throw approvals.error;
 if(division.error)throw division.error;
 state.detail=d;state.routes=routes.data||[];state.approvals=approvals.data||[];state.divisionHistory=division.data||[];
 await loadRecipients();state.modal='detail';show();
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
async function executeRetrievalAction(action,args,message){
 state.busy=true;
 try{
  const {data,error}=await db.rpc('i_track_retrieval_action',{p_action:action,...args});
  if(error)throw error;
  await load();
  pop(message||'Document custody updated.');
  return data;
 }finally{state.busy=false;}
}
function refreshRetrievalCheckboxCounters(){
 const pairs=[
  ['retrieval-pick-count','retrieval-pickup-btn',state.retrievalPicked],
  ['retrieval-turnover-count','retrieval-prepare-btn',state.retrievalTurnoverPicked],
  ['retrieval-district-count','retrieval-district-btn',state.retrievalDistrictPicked]
 ];
 for(const [textId,btnId,chosen] of pairs){
  const el=document.getElementById(textId),btn=document.getElementById(btnId);
  if(el)el.textContent=chosen.size+' checked';
  if(btn)btn.disabled=!chosen.size;
 }
}
function filterRetrievalAvailable(){
 const q=document.getElementById('retrieval-search')?.value.trim().toLowerCase()||'';
 state.retrievalSearch=q;
 document.querySelectorAll('#retrieval-available-list [data-retrieval-search]').forEach(el=>{
  el.hidden=!!q&&!el.dataset.retrievalSearch.includes(q);
 });
}
async function click(e){
 const t=e.target.closest('[data-a]');if(!t||state.busy)return;
 const a=t.dataset.a;
 try{
  if(a==='maintenance-refresh'){await readMaintenance();show();return;}
  if(a==='maintenance-toggle'){if(!yesAdmin())throw Error('Admin only');const next=!state.maintenance.enabled;if(!confirm(next?'Turn ON Maintenance Mode? Regular users will see a maintenance notice.':'Turn OFF Maintenance Mode and reopen the app for regular users?'))return;const {error}=await db.rpc('i_track_set_maintenance',{p_enabled:next});if(error)throw error;await readMaintenance();show();pop(next?'Maintenance Mode enabled.':'Maintenance Mode disabled.');return;}
  if(state.maintenance.enabled&&!yesAdmin()&&a!=='logout'){await readMaintenance();show();return;}
  if(a==='retrieval-refresh'){await load();return;}
  if(a==='retrieval-clear'){
   state.retrievalPicked.clear();state.retrievalSearch='';
   show();return;
  }
  if(a==='retrieval-check-visible'){
   document.querySelectorAll('#retrieval-available-list .retrieval-pick:not(:disabled)').forEach(c=>{
    if(!c.closest('tr')?.hidden){c.checked=true;state.retrievalPicked.add(c.value);}
   });
   refreshRetrievalCheckboxCounters();return;
  }
  if(a==='retrieval-pickup'){
   const items=state.retrievalData.available||[];
   const checked=[...state.retrievalPicked].filter(id=>items.some(x=>x.item_id===id));
   if(!checked.length)throw Error('Check at least one document currently submitted to Division.');
   if(!confirm('Confirm you physically collected '+checked.length+' document(s) from the Division Office? This cannot be undone by clicking Back.'))return;
   state.retrievalPicked.clear();
   await executeRetrievalAction('pickup',{p_item_ids:checked},'Retrieved '+checked.length+' document(s); a numbered retrieval batch was created.');
   return;
  }
  if(a==='retrieval-prepare'){
   const candidate=state.retrievalData.my_batch_items||[];
   const activeTurnover=new Set((state.retrievalData.turnover_items||[]).map(x=>x.item_id));
   const checked=[...state.retrievalTurnoverPicked].filter(id=>candidate.some(x=>x.item_id===id&&x.division_status==='retrieved_from_division'&&!activeTurnover.has(id)));
   if(!checked.length)throw Error('Check one or more documents in your retrieval batches.');
   const recipient=document.getElementById('retrieval-district-recipient')?.value;
   const district=state.retrievalData.district_recipients?.find(x=>x.id===recipient);
   if(!district)throw Error('Select an approved District receiving person.');
   if(!confirm('Prepare one turnover slip for '+checked.length+' selected document(s) addressed to '+district.name+'? No physical handoff is recorded yet.'))return;
   state.retrievalTurnoverPicked.clear();
   await executeRetrievalAction('prepare',{p_item_ids:checked,p_recipient:recipient},'Turnover slip prepared. Print it before confirming physical handoff.');
   return;
  }
  if(a==='retrieval-handoff'){
   const turnover=state.retrievalData.turnovers?.find(x=>x.id===t.dataset.id);
   if(!turnover||turnover.retriever_id!==state.session.user.id||turnover.status!=='prepared')throw Error('Only your prepared turnover can be handed over.');
   if(!confirm('Have you physically handed the documents on '+turnover.number+' to '+turnover.recipient_name+'? The District must acknowledge them separately.'))return;
   await executeRetrievalAction('handoff',{p_turnover:turnover.id},'Physical handoff recorded. Waiting for District acknowledgment.');
   return;
  }
  if(a==='retrieval-discard'){
   const turnover=state.retrievalData.turnovers?.find(x=>x.id===t.dataset.id);
   if(!turnover||turnover.retriever_id!==state.session.user.id||turnover.status!=='prepared')throw Error('Only your prepared slip can be discarded.');
   if(!confirm('Discard draft turnover slip '+turnover.number+'? Its documents remain with the retriever and can be selected again.'))return;
   await executeRetrievalAction('discard',{p_turnover:turnover.id},'Prepared slip discarded. Documents remain available for another slip.');
   return;
  }
  if(a==='retrieval-district-ack'){
   const current=state.retrievalData.district_queue||[];
   const checked=[...state.retrievalDistrictPicked].filter(id=>current.some(x=>x.item_id===id));
   if(!checked.length)throw Error('Check documents physically received at District.');
   if(!confirm('Acknowledge actual District custody of '+checked.length+' selected document(s)? They will still require rightful-owner receipt.'))return;
   state.retrievalDistrictPicked.clear();
   await executeRetrievalAction('district_ack',{p_item_ids:checked},'District receipt recorded for '+checked.length+' document(s).');
   return;
  }
  if(a==='retrieval-claim'){
   const item=state.retrievalData.claimable?.find(x=>x.item_id===t.dataset.id);
   if(!item)throw Error('Only your own claimable document can be confirmed.');
   if(!confirm('Confirm you personally received '+item.document_label+' ('+item.tracking_number+')? This completes the physical document routing.'))return;
   await executeRetrievalAction('claim',{p_item:item.item_id},'Final receipt confirmed. Document routing completed.');
   return;
  }
  if(a==='retrieval-set-owner'){
   const item=state.retrievalData.manageable_owners?.find(x=>x.item_id===t.dataset.id);
   if(!item)throw Error('You are not authorized to designate this document owner.');
   const ownerId=document.getElementById('retrieval-owner-'+item.item_id)?.value;
   const owner=state.retrievalData.claimant_accounts?.find(x=>x.id===ownerId);
   if(!owner)throw Error('Choose an approved registered rightful owner.');
   if(ownerId===item.owner_id)throw Error('That person is already the rightful owner.');
   if(!confirm('Designate '+owner.name+' as the rightful owner of '+item.tracking_number+'? They alone can confirm final receipt.'))return;
   await executeRetrievalAction('set_owner',{p_item:item.item_id,p_owner:ownerId},'Rightful owner updated; original sender and history remain unchanged.');
   return;
  }
  if(a==='retrieval-print'){
   const turnover=state.retrievalData.turnovers?.find(x=>x.id===t.dataset.id);
   if(!turnover)throw Error('Turnover slip not found. Refresh the list.');
   const list=(state.retrievalData.turnover_items||[]).filter(x=>x.turnover_id===turnover.id);
   if(!list.length)throw Error('No documents on this turnover slip.');
   if(!window.ITRACK_PRINT?.renderRetrievalSlip)throw Error('Retrieval print template not loaded. Refresh the app.');
   const html=window.ITRACK_PRINT.renderRetrievalSlip(turnover,list);
   const win=window.open('','_blank');
   if(!win)throw Error('Allow popups to print the turnover slip.');
   win.document.write(html);win.document.close();
   await Promise.all([...win.document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
    img.onload=resolve;img.onerror=resolve;setTimeout(resolve,3500);
   })));
   win.focus();win.print();return;
  }
  if(a==='division-admin-search'){if(!yesAdmin())throw Error('Admin only');const query=document.getElementById('division-admin-query')?.value?.trim()||'';if(query.length<2)throw Error('Enter at least two characters.');const {data,error}=await db.rpc('i_track_division_admin_find',{p_query:query});if(error)throw error;state.divisionQuery=query;state.divisionSearchResults=data||[];show();return;}
  if(a==='division-admin-resolve'){if(!yesAdmin())throw Error('Admin only');const d=state.divisionSearchResults.find(x=>x.id===t.dataset.id);if(!d)throw Error('Document not found');const reason=prompt('Reason for '+t.dataset.act+' (required)');if(!reason?.trim())return;if(!confirm('Apply '+t.dataset.act+' to '+d.tracking_number+'?'))return;const {error}=d.last_item_id?await db.rpc('i_track_division_action',{p_action:t.dataset.act==='received'?'admin_received':t.dataset.act==='corrected'?'correct':t.dataset.act,p_transmittal:d.last_transmittal_id,p_item:d.last_item_id,p_reason:reason.trim()}):await db.rpc('i_track_division_admin_resolve',{p_document:d.id,p_resolution:t.dataset.act,p_reason:reason.trim()});if(error)throw error;state.divisionSearchResults=[];await load();pop('Resolution recorded.');return;}
  if(a==='direct-division'){
   if(!confirm('Forward this document to Division transmittals? The tracking number will remain unchanged.'))return;
   const {error}=await db.rpc('i_track_change_document_destination',{p_document:t.dataset.id,p_destination:'division'});
   if(error)throw error;state.modal=null;await load();pop('Document is ready for any authorized Division transmittal.');return;
  }
  if(a==='document-change-destination'){
   const dest=document.getElementById('document-destination')?.value;
   const {error}=await db.rpc('i_track_change_document_destination',{p_document:t.dataset.id,p_destination:dest});
   if(error)throw error;state.modal=null;await load();pop('Destination updated.');return;
  }
  if(a==='division-forward'){if(!confirm('Forward this acknowledged document to the Division transmittal queue? Only its current recipient may do this.'))return;const {error}=await db.rpc('i_track_division_forward',{p_document:t.dataset.id});if(error)throw error;pop('Document forwarded to Division queue. Open Division Transmittals to prepare it.');return;}
  if(a==='open-self-division'){state.modal=null;rememberView('division');await load();return;}
  if(a==='division-refresh'){await load();return;}
  if(a==='transmittal-save-signer'){
   const t=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];
   if(!t)throw Error('Select a transmittal.');
   const args={p_transmittal:t.id,p_name:document.getElementById('trans-signer-name')?.value.trim(),p_position:document.getElementById('trans-signer-position')?.value.trim(),p_office:document.getElementById('trans-signer-office')?.value.trim(),p_school:document.getElementById('trans-authorized-school')?.value.trim()||null};
   const {error}=await db.rpc('i_track_edit_transmittal_signer',args);if(error)throw error;
   await load();pop('Signer information saved.');return;
  }
  if(a==='transmittal-rename'){
   const item=state.divisionData.items.find(x=>x.id===t.dataset.id);if(!item)throw Error('Transmittal item not found.');
   const newName=prompt('Edit the printed document name (tracking ID stays unchanged):',item.document_label);
   if(!newName||newName.trim()===item.document_label)return;
   const {error}=await db.rpc('i_track_edit_transmittal_item',{p_item:item.id,p_label:newName.trim()});if(error)throw error;
   await load();pop('Printed document name updated.');return;
  }
  if(a==='draft-toggle-edit'){
   state.transmittalEditing=!state.transmittalEditing;show();return;
  }
  if(a==='draft-remove-selected'){
   const trans=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];
   if(!trans)throw Error('Select a transmittal.');
   const selected=[...document.querySelectorAll('#draft-transmittal-editor .draft-remove-pick:checked')].map(x=>x.value);
   if(!selected.length)throw Error('Check at least one document under "Documents Already in This Transmittal" to remove it.');
   const valid=(state.divisionData.items||[]).filter(x=>x.transmittal_id===trans.id&&x.division_status==='in_transmittal');
   if(selected.some(id=>!valid.some(i=>i.id===id)))throw Error('A selected document is no longer editable. Refresh and check again.');
   if(!confirm('Remove '+selected.length+' checked document(s) from '+trans.transmittal_number+'? They will become available for other transmittals.'))return;
   state.busy=true;let removed=0;
   try{
    for(const id of selected){
     const {error}=await db.rpc('i_track_edit_draft_transmittal',{p_transmittal:trans.id,p_action:'remove',p_item:id});
     if(error)throw error;removed++;
    }
   }catch(ex){
    await load();throw Error(removed+' document(s) removed before an error: '+ex.message);
   }finally{state.busy=false;}
   await load();pop(removed+' document(s) removed. They are available for selection again.');return;
  }
  if(a==='draft-remove-item'){
   const trans=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];
   const item=state.divisionData.items.find(x=>x.id===t.dataset.id);
   if(!trans||!item||item.transmittal_id!==trans.id)throw Error('Item not found in selected transmittal.');
   if(!confirm('Remove '+item.document_label+' from this draft? It will become selectable in transmittals again.'))return;
   const {error}=await db.rpc('i_track_edit_draft_transmittal',{p_transmittal:trans.id,p_action:'remove',p_item:item.id});
   if(error)throw error;
   await load();pop('Removed from draft. The original tracking ID is unchanged.');return;
  }
  if(a==='draft-add-items'){
   const trans=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];
   if(!trans)throw Error('Select a transmittal.');
   const docIds=[...document.querySelectorAll('.draft-add-document:checked')].map(x=>x.value);
   const compIds=[...document.querySelectorAll('.draft-add-compliance:checked')].map(x=>x.value);
   if(!docIds.length&&!compIds.length)throw Error('Select an eligible document or submission.');
   if(!confirm('Add '+(docIds.length+compIds.length)+' selected item(s) to the draft?'))return;
   state.busy=true;
   let added=0;
   try{
    for(const id of docIds){
     const {error}=await db.rpc('i_track_edit_draft_transmittal',{p_transmittal:trans.id,p_action:'add_document',p_document:id});
     if(error)throw error;added++;
    }
    for(const id of compIds){
     const {error}=await db.rpc('i_track_edit_draft_transmittal',{p_transmittal:trans.id,p_action:'add_compliance',p_compliance:id});
     if(error)throw error;added++;
    }
   }catch(ex){
    await load();throw Error(added+' item(s) added before an error: '+ex.message);
   }finally{state.busy=false;}
   await load();pop(added+' item(s) added to the draft.');return;
  }
  if(a==='division-create'){
   const docs=[...document.querySelectorAll('.division-pick:checked')].map(x=>x.value),compliances=[...document.querySelectorAll('.division-compliance-pick:checked')].map(x=>x.value),submitter=document.getElementById('division-submitter')?.value;
   if(!docs.length&&!compliances.length)throw Error('Select a document or approved submission.');
   state.busy=true;try{const {data,error}=await db.rpc('i_track_create_mixed_transmittal',{p_documents:docs,p_compliances:compliances,p_submitter:submitter});if(error)throw error;state.divisionSelected=data.id;state.transmittalEditing=false;await load();pop('Transmittal created.');}finally{state.busy=false;}return;
  }
  if(a==='division-print'||a==='division-word'){
   const t=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];if(!t)throw Error('Choose a transmittal.');
   if(!state.divisionData.items.some(item=>item.transmittal_id===t.id&&item.division_status!=='cancelled'))throw Error('Add at least one document before printing the transmittal.');
   const edits={p_transmittal:t.id,p_name:document.getElementById('trans-signer-name')?.value?.trim()||t.signer_name,p_position:document.getElementById('trans-signer-position')?.value?.trim()||t.signer_position,p_office:document.getElementById('trans-signer-office')?.value?.trim()||t.signer_office,p_school:document.getElementById('trans-authorized-school')?.value?.trim()||null};
   if((edits.p_name!==t.signer_name||edits.p_position!==t.signer_position||edits.p_office!==t.signer_office||edits.p_school!==(t.authorized_school_name||null))&&!t.dispatched_at){
     const saved=await db.rpc('i_track_edit_transmittal_signer',edits);if(saved.error)throw saved.error;
     Object.assign(t,{signer_name:edits.p_name,signer_position:edits.p_position,signer_office:edits.p_office,authorized_school_name:edits.p_school});
   }
   let qrImage='';if(window.QRCode){const div=document.createElement('div');div.style.cssText='position:absolute;left:-9999px';document.body.append(div);try{new QRCode(div,{text:location.origin+location.pathname+'?view=division&transmittal='+encodeURIComponent(t.id),width:160,height:160,correctLevel:QRCode.CorrectLevel.M});qrImage=div.querySelector('canvas')?.toDataURL('image/png')||'';}finally{div.remove();}}const kind=document.getElementById('division-print-kind')?.value||'both';if(!window.ITRACK_PRINT?.render)throw Error('Official print templates are not loaded. Refresh SRII i-TRACK.');const html=window.ITRACK_PRINT.render(t,state.divisionData.items.filter(i=>i.transmittal_id===t.id),kind,state.divisionData.people||[],state.schools);
   if(a==='division-word'){const link=document.createElement('a'),url=URL.createObjectURL(new Blob(['\\ufeff'+html],{type:'application/msword'}));link.href=url;link.download=t.transmittal_number+'.doc';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}else{const w=window.open('','_blank');if(!w)throw Error('Allow popups for printing.');w.document.write(html);w.document.close();await Promise.all([...w.document.images].map(img=>img.complete?Promise.resolve():new Promise(done=>{img.onload=done;img.onerror=done;setTimeout(done,3500);})));w.focus();w.print();}return;
  }
  if(a==='division-act'){
   const action=t.dataset.act,trans=state.divisionData.transmittals.find(x=>x.id===state.divisionSelected)||state.divisionData.transmittals[0];if(!trans&&!t.dataset.trans)throw Error('Select a transmittal.');
   const args={p_action:action,p_transmittal:t.dataset.trans||trans.id};if(t.dataset.id)args.p_item=t.dataset.id;
   if(action==='submit'){const day=prompt('Actual date submitted (YYYY-MM-DD)',new Date().toLocaleDateString('en-CA'));if(!day)return;args.p_actual_date=day;}
   if(['reassign','forward'].includes(action)){const people=state.divisionData.people||[];const pick=action==='forward'?prompt('District recipient number:\n'+people.map((p,i)=>(i+1)+'. '+p.name+' — '+(p.position||'')).join('\n')):null;const selected=action==='reassign'?document.getElementById('division-reassign')?.value:people[Number(pick)-1]?.id;if(!selected)return;args[action==='reassign'?'p_submitter':'p_recipient']=selected;}
   if(['sender_received','admin_received','lost','not_for_return','recovered','correct'].includes(action)){const reason=prompt('Written reason (required)');if(!reason?.trim())return;args.p_reason=reason.trim();}
   if(!confirm('Confirm '+action.replaceAll('_',' ')+'? This action is recorded permanently.'))return;
   state.busy=true;try{const {error}=await db.rpc('i_track_division_action',args);if(error)throw error;await load();pop('Document status updated.');}finally{state.busy=false;}return;
  }
  if(a==='retry'){location.reload();return;}
  if(a==='switch'){
   if(state.authMode==='login'&&state.queueTicket){await queueRead();return;}
   state.authMode=state.authMode==='login'?'register':'login';show();return;
  }
  if(a==='queue-check'){await queueRead();return;}
  if(a==='queue-rejoin'){queueClear();state.authMode='register';show();return;}
  if(a==='queue-reminder'){queueReminder();pop('Calendar reminder prepared. Import it into your calendar and allow notifications.');return;}
  if(a==='queue-cancel'){
   if(!state.queueTicket)return;
   if(!confirm('Cancel your registration queue place? You will need to join again later.'))return;
   const {data,error}=await db.rpc('i_track_registration_queue_cancel',{p_ticket:state.queueTicket});
   if(error)throw error;
   if(!data)throw Error('This place is no longer cancelable. Check your queue status.');
   queueClear();state.authMode='register';show();pop('Queue place cancelled.');return;
  }
  if(a==='queue-claim'){
   if(!state.queueTicket)throw Error('Queue ticket is missing. Join the registration list again.');
   const {data,error}=await db.rpc('i_track_registration_queue_claim',{p_ticket:state.queueTicket});
   if(error){await queueRead();throw error;}
   if(data!==true)throw Error('This queue slot is not available yet.');
   await queueRead();state.authMode='queue-complete';show();return;
  }
  if(a==='resend-help'){state.authMode='resend';show();return;}
  if(a==='forgot-help'){state.emailHelpReason='';state.authMode='forgot';show();return;}
  if(a==='toggle-password'){
   const fieldId=t.dataset.for;
   const input=fieldId?document.getElementById(fieldId):null;
   if(!input||input.type!=='password'&&input.type!=='text')return;
   const visible=input.type==='password';
   input.type=visible?'text':'password';
   t.setAttribute('aria-pressed',String(visible));
   t.setAttribute('aria-label',(visible?'Hide ':'Show ')+(input.labels?.[0]?.textContent||'password').trim().toLowerCase());
   t.setAttribute('title',visible?'Hide password':'Show password');
   t.innerHTML=visible?eyeOffIcon:eyeIcon;
   input.focus({preventScroll:true});return;
  }
  if(a==='back-to-login'){state.emailHelpReason='';state.authMode='login';show();return;}
  if(a==='theme'){state.theme=state.theme==='dark'?'light':'dark';localStorage.setItem('srii-theme',state.theme);document.documentElement.dataset.theme=state.theme;show();return;}
  if(a==='logout'){await db.auth.signOut();state.session=null;state.profile=null;state.recoveryReady=false;rememberView('dashboard');localStorage.removeItem('srii-current-view');sessionStorage.removeItem('srii-last-announcement');sessionStorage.removeItem('srii-review-announcement');state.modal=null;state.schoolFiles=[];state.accountEmails=[];show();return;}
  if(a==='refresh'){await sync();return;}
  if(a==='export-district-report'){exportDistrictReport();pop('District compliance report prepared.');return;}
  if(a==='nav'){
   if(['school-files','approvals','archive'].includes(t.dataset.page)&&!yesAdmin())throw new Error('District administrator access required.');
   if(t.dataset.page==='verification'&&!yesAdmin()&&!state.approverAssignments.some(x=>x.user_id===state.session.user.id))throw new Error('Not an assigned approver.');
   if(t.dataset.page==='reports'&&!districtOversight())throw new Error('District oversight access required.');
   if(t.dataset.page==='settings'&&yesAdmin())throw new Error('Personal Settings in this redesign are for Normal User accounts.');
   if(isOic()&&!['dashboard','announcements','monitoring','reports','settings'].includes(t.dataset.page))throw new Error('This OIC-PSDS account is read-only.');
   rememberView(t.dataset.page);state.modal=null;
   await load();return;
  }
  if(a==='refresh-school-files'){
   if(!yesAdmin()||!active()||state.view!=='school-files')throw new Error('District administrator access required.');
   await loadSchoolFiles();show();pop('All school attachments refreshed.');return;
  }
  if(a==='refresh-verification'){
   if(!yesAdmin()&&!state.approverAssignments.some(x=>x.user_id===state.session.user.id))throw new Error('Assigned approver required.');
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
  if(a==='mark-compliance'){
   if(!confirm('Submit this school’s compliance? No attachment required.'))return;
   const {data,error}=await db.rpc('i_track_mark_compliance_submitted',{p_assignment:t.dataset.assignment});if(error)throw error;
   state.modal=null;await loadMonitor();show();pop('Submission '+data+' recorded. Awaiting verification.');return;
  }
  if(a==='compliance-verify'||a==='compliance-return'){
   if(!yesAdmin()&&!state.approverAssignments.some(x=>x.announcement_id===state.reviewSelectedId&&x.user_id===state.session.user.id))throw Error('Not an assigned approver');const reason=a==='compliance-return'?prompt('Reason for returning this submission:'):null;
   if(a==='compliance-return'&&!reason?.trim())return;
   if(a==='compliance-verify'&&!confirm('Approve school submission?'))return;
   const {error}=await db.rpc('i_track_verify_compliance',{p_compliance:t.dataset.id,p_approve:a==='compliance-verify',p_reason:reason||null});if(error)throw error;
   await loadVerification();show();pop(a==='compliance-verify'?'Submission verified.':'Submission returned.');return;
  }
  if(a==='monitor'){state.selectedId=t.dataset.id;rememberAnnouncement(state.selectedId);rememberView('monitoring');await load();return;}
  if(a==='open-compliance'){
    const c=state.compliances.find(x=>x.id===t.dataset.id);if(!c)throw Error('Submission not found.');
    state.selectedId=c.announcement_id;rememberAnnouncement(state.selectedId);rememberView('monitoring');
    await load();await openMonitorSchool(c.school_id);return;
  }
  if(a==='monitor-school'){await openMonitorSchool(t.dataset.schoolId);return;}
  if(a==='monitor-submission'){
   if(!yesAdmin()||state.view!=='monitoring')throw new Error('District administrator access required.');
   await openMonitorSubmission(t.dataset.schoolId);return;
  }
  if(a==='close'){const refreshStatus=state.modal==='monitor-school';state.modal=null;state.monitorSchool=null;state.monitorSchoolFiles=[];state.monitorDetail=null;state.monitorFiles=[];if(refreshStatus&&state.view==='monitoring')await loadMonitor();show();return;}
  if(a==='new-announcement'){state.modal='new-announcement';show();return;}
  if(a==='edit-announcement'){
   await openAnnouncementEditor(t.dataset.id);return;
  }
  if(a==='cancel-announcement'){
   if(!yesAdmin())throw Error('District administrator required');
   const ann=state.announcements.find(x=>x.id===t.dataset.id);
   if(!ann||ann.status==='cancelled')throw Error('Announcement is already cancelled or unavailable');
   state.announcementCancelId=ann.id;
   state.modal='cancel-announcement';show();return;
  }
  if(a==='confirm-cancel-announcement'){
   if(!yesAdmin())throw Error('District administrator required');
   const reason=clean(document.getElementById('cancel-ann-reason')?.value);
   if(reason.length<5||reason.length>1000)throw Error('Provide a cancellation reason between 5 and 1,000 characters.');
   const ann=state.announcements.find(x=>x.id===state.announcementCancelId);
   if(!ann||ann.status==='cancelled')throw Error('Announcement unavailable');
   if(!confirm('Cancel '+ann.title+'? New submissions will stop. Existing submissions and files will remain saved.'))return;
   const {data,error}=await db.rpc('i_track_cancel_announcement',{p_announcement:ann.id,p_reason:reason});
   if(error)throw error;
   state.modal=null;state.announcementCancelId=null;
   await load();pop('Announcement cancelled; '+(data?.preserved_responses||0)+' existing compliance record(s) preserved.');return;
  }

  if(a==='manage-approvers'){
   if(!yesAdmin())throw Error('District administrator required');
   state.announcementApproverEditing=t.dataset.id;state.modal='announcement-approvers';show();return;
  }
  if(a==='save-approvers'){
   if(!yesAdmin())throw Error('District administrator required');
   const chosen=[...document.querySelectorAll('.announcement-approver-pick:checked')].map(x=>x.value);
   const {error}=await db.rpc('i_track_set_announcement_approvers',{p_announcement:state.announcementApproverEditing,p_user_ids:chosen});
   if(error)throw error;state.modal=null;await load();pop('Assigned approvers updated.');return;
  }

  if(a==='suggest-doc-type'){
   if(!active()||isOic())throw new Error('Only active routing users may suggest document types.');
   const name=clean(document.getElementById('suggested-doc-type')?.value);
   if(name.length<2||name.length>140)throw new Error('Enter a document type between 2 and 140 characters.');
   if(state.docTypes.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw new Error('This document type already exists in the approved list.');
   if(state.docTypeRequests.some(x=>x.status==='pending'&&x.requested_name.toLowerCase()===name.toLowerCase()))throw new Error('You already suggested this type, and it is pending review.');
   const {error}=await db.from('document_type_requests').insert({suggested_by:state.session.user.id,requested_name:name});
   if(error)throw error;
   state.docTypeRequests.unshift({requested_name:name,status:'pending',submitted_at:new Date().toISOString()});
   const info=document.getElementById('type-suggestion-feedback');
   if(info)info.textContent='Suggestion submitted: '+name+'. It will appear in the dropdown only after administrator approval.';
   const field=document.getElementById('suggested-doc-type');if(field)field.value='';
   pop('Document type suggestion submitted for review.');return;
  }
  if(a==='send'){if(isOic())throw new Error('OIC-PSDS accounts cannot route documents.');await Promise.all([loadRecipients(),loadDocumentTypes()]);state.modal='send';show();return;}
  if(a==='doc-notice-read'){
   const source=t.dataset.source;
   if(!['routing','division'].includes(source))throw new Error('Unknown notification type.');
   const notice=(state.documentNotices||[]).find(n=>String(n.id)===t.dataset.id&&n.source===source);
   if(!notice)return;
   const tableName=source==='division'?'document_division_notifications':'document_notifications';
   const readAt=new Date().toISOString();
   const {error}=await db.from(tableName).update({read_at:readAt}).eq('id',notice.id);
   if(error)throw error;
   notice.read_at=readAt;show();return;
  }
  if(a==='doc-notice-open'){
   if(isOic())throw new Error('You cannot open private documents.');
   rememberView('documents');await load();
   if(!state.docs.some(d=>d.id===t.dataset.id))throw new Error('This document is not available to your account.');
   await openDetail(t.dataset.id);return;
  }
  if(a==='monitor-open-school-file'){
   const id=t.dataset.id;
   if(!(state.monitorSchoolFiles||[]).some(f=>f.assignment_id===id))
    throw new Error('This school submission is not available to your account.');
   state.modal=null;state.monitorSchool=null;state.monitorSchoolFiles=[];
   rememberView('documents');await load();
   if(!(state.schoolSubmissionDocs||[]).some(f=>f.assignment_id===id))
    throw new Error('You do not have permission to open those files.');
   state.selectedSchoolSubmission=id;state.modal='school-submission-detail';show();return;
  }
  if(a==='school-submission-detail'){
   if(isOic()||state.view!=='documents')throw new Error('This account cannot open private school submission files.');
   if(!(state.schoolSubmissionDocs||[]).some(f=>f.assignment_id===t.dataset.id))
    throw new Error('This submission is not available to your account.');
   state.selectedSchoolSubmission=t.dataset.id;state.modal='school-submission-detail';show();return;
  }
  if(a==='detail'){if(isOic())throw new Error('OIC-PSDS accounts cannot view private documents.');await openDetail(t.dataset.id);return;}
  if(a==='toggle-removed-users'){
   if(!yesAdmin()||state.view!=='approvals')throw new Error('Administrator access required.');
   state.showRemovedAccounts=!state.showRemovedAccounts;show();return;
  }
  if(a==='admin-delete-user'){
   if(!yesAdmin()||!active()||state.view!=='approvals')
     throw new Error('Only an active district administrator can remove an account.');
   const user=state.profiles.find(p=>p.id===t.dataset.id);
   if(!user)throw new Error('User not found. Refresh the accounts.');
   if(user.id===state.session.user.id||user.role==='main_admin')
     throw new Error('Your own account and Main Administrator are protected.');
   if(!isMain()&&user.role!=='school_user')
     throw new Error('Only the Main Administrator may remove privileged accounts.');
   if(user.account_status==='deleted')throw new Error('This user is already removed.');
   const labelName=user.display_name||'Unnamed account';
   const confirmation=prompt('DELETE USER: '+labelName+'\\n\\nThis removes access to SRII i-TRACK. Google Drive files, document history, and uploader records remain unchanged. The underlying Supabase Auth login record is retained for history, so this does NOT free the email for re-registration.\\n\\nType DELETE to confirm:');
   if(confirmation===null)return;
   if(confirmation!=='DELETE')throw new Error('Deletion canceled. You must type DELETE exactly.');
   if(!confirm('Remove SRII i-TRACK access for '+labelName+' now? You cannot use this to reset a password.'))return;
   state.busy=true;t.disabled=true;
   try{
    const {error}=await db.rpc('i_track_admin_remove_user',{p_target:user.id,p_confirm:'DELETE'});
    if(error)throw error;
    await load();pop('User access removed. Google Drive files and document history were preserved.');
   }finally{state.busy=false;t.disabled=false;}
   return;
  }
  if(a==='admin-password-reset'||a==='admin-email-confirmation'){
   if(!yesAdmin()||!active()||state.view!=='approvals')
    throw new Error('Administrator access required.');
   const target=state.profiles.find(p=>p.id===t.dataset.id);
   const record=state.accountEmails.find(p=>p.user_id===target?.id);
   if(!target||!record?.email)throw new Error('An account with a valid email must be selected.');
   if(target.id===state.session.user.id||target.role==='main_admin')
    throw new Error('Main Administrator and own-account resets must use Forgot Password.');
   if((target.role==='backup_admin'||target.role==='oic_psds')&&!isMain())
    throw new Error('Only the Main Administrator can assist this account.');
   if(a==='admin-email-confirmation'&&record.email_confirmed)
    throw new Error('This email is already confirmed.');
   const verify=a==='admin-email-confirmation';
   const labelText=verify?'verification':'password-reset';
   if(!confirm('Request a '+labelText+' email for '+(target.display_name||'this user')+
    ' at '+record.email+'? Email sending must be working. The administrator cannot view or change the password.'))return;
   state.busy=true;t.disabled=true;
   try{
    const url=location.origin+location.pathname;
    const {error}=verify?await db.auth.resend({
      type:'signup',email:record.email,options:{emailRedirectTo:url}
    }):await db.auth.resetPasswordForEmail(record.email,{redirectTo:url});
    if(error)throw emailQuotaError(error,verify?'Verification':'Password reset');
    if(!verify){
     const audit=await db.rpc('i_track_log_password_reset_request',{p_target_user_id:target.id});
     if(audit.error)console.warn('Password-reset request accepted; audit logging failed',audit.error);
    }
    pop((verify?'Verification':'Password reset')+
       ' email request accepted for '+record.email+'. Recipient should check Inbox and Spam; delivery depends on SMTP.');
   }finally{
    state.busy=false;t.disabled=false;
   }
   return;
  }
  if(a==='account-approve'||a==='reject'){
   const user=state.profiles.find(p=>p.id===t.dataset.id);if(!user)return;
   if(user.role==='oic_psds'&&!isMain())throw new Error('Only the Main Administrator can review OIC-PSDS registration.');
   if(!confirm(`${a==='account-approve'?'Approve':'Reject'} ${user.role==='oic_psds'?'the read-only OIC-PSDS District Office account':'this school user'}?`))return;
   const {error}=await db.rpc('i_track_review_account',{p_user_id:user.id,p_approve:a==='account-approve',p_school_id:user.requested_school_id||null});if(error)throw error;
   await load();
   if(a==='account-approve'&&state.accountEmails.some(r=>r.user_id===user.id&&r.email_confirmed===false))
    pop('Account approved. Email verification is still pending; use Resend Verification if the original link expired.');
   else pop('Account reviewed.');return;
  }
  if(a==='backup'){
   if(!confirm('Change Backup Administrator permissions?'))return;
   const {error}=await db.rpc('i_track_set_backup_admin',{p_user_id:t.dataset.id,p_enable:t.dataset.enable==='true'});if(error)throw error;
   await load();pop('Permissions updated.');return;
  }
  if(a==='clear-document-filters'){
   for(const id of ['document-search','document-status-filter','document-date-filter']){const field=document.getElementById(id);if(field)field.value='';}
   filterDocumentRegistry();return;
  }
  if(a==='pending-route-action'){
   const action=t.dataset.act,docId=t.dataset.id;
   const recipient=action==='cancel'?null:document.getElementById('pending-new-recipient')?.value;
   if(action!=='cancel'&&!recipient)throw Error('Choose a recipient.');
   const message=action==='cancel'?'Cancel this pending delivery? The document will return to In School.':
    action==='change'?'Change the recipient without changing the tracking number?':'Forward this saved document?';
   if(!confirm(message))return;
   state.busy=true;
   try{
    const {error}=await db.rpc('i_track_pending_route_action',{p_document:docId,p_action:action,p_recipient:recipient});
    if(error)throw error;
    state.modal=null;await load();pop(action==='cancel'?'Pending delivery canceled. Document is In School.':action==='change'?'Recipient changed. Tracking number retained.':'Document forwarded.');
   }finally{state.busy=false;}
   return;
  }
  if(a==='document-approve'){
   if(!confirm('Approve this document? This records your final approval and closes the current route.'))return;
   const {error}=await db.rpc('i_track_approve_route',{p_route_id:t.dataset.id});
   if(error)throw error;
   state.modal=null;await load();pop('Document approved.');return;
  }
  if(a==='ack'){
   const {error}=await db.rpc('i_track_acknowledge_route',{p_route_id:t.dataset.id});if(error)throw error;state.modal=null;await load();pop('Receipt acknowledged.');return;
  }
  if(a==='route'){
   const next=document.getElementById('next-person')?.value,note=document.getElementById('route-note')?.value||'';
   if(t.dataset.return==='true'&&!note.trim())throw new Error('Enter the reason for returning this document for correction.');
   if(!next)throw new Error('Select the recipient who will receive this document.');
   if(next===state.session.user.id)throw new Error('Select a different recipient.');
   if(!confirm(t.dataset.return==='true'?'Return this document for correction?':'Forward this document to the selected recipient?'))return;
   const {error}=await db.rpc('i_track_route_document',{p_route_id:t.dataset.id,p_next_user_id:next,p_return:t.dataset.return==='true',p_note:note});if(error)throw error;
   state.modal=null;await load();pop(t.dataset.return==='true'?'Document returned for correction.':'Document forwarded.');return;
  }
  if(a==='compress'){await compress();return;}
  if(a==='save-compressed'){
   const f=state.compressed;if(!f)return;
   const u=URL.createObjectURL(f),anchor=document.createElement('a');anchor.href=u;anchor.download=f.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;
  }
 }catch(e){err(e);}
}
async function uploadNewDocumentAttachment(documentId,file){
 const MIME={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
 const ext=file.name.split('.').pop().toLowerCase(),mime=MIME[ext];
 if(!mime)throw Error('Unsupported attachment format: '+file.name);
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session?.access_token)throw Error('Login expired while uploading. The document is already saved; sign in again and attach the file from My Documents.');
 const base64=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(',')[1]);
  reader.onerror=()=>reject(Error('Could not read '+file.name));
  reader.readAsDataURL(file);
 });
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),70000);
 try{
  const response=await fetch(window.ITRACK_CONFIG.url+'/functions/v1/itrack-upload',{
   method:'POST',headers:{'Content-Type':'application/json',apikey:window.ITRACK_CONFIG.publishableKey,
    Authorization:'Bearer '+session.access_token},
   body:JSON.stringify({target_type:'document',target_id:documentId,file_name:file.name,mime_type:mime,content_base64:base64}),
   signal:controller.signal
  });
  const answer=await response.json().catch(()=>({}));
  if(!response.ok||!answer.ok)throw Error(answer.error||'Upload was not accepted: HTTP '+response.status);
 }finally{clearTimeout(timeout);}
}
async function submit(e){
 const form=e.target;if(!['queue-join','queue-complete','login','resend-email','forgot-password','set-password','form-ann','form-ann-edit','form-doc','settings-email-form','settings-password-form','settings-profile-form','settings-private-form','settings-feedback-form'].includes(form.id))return;
 e.preventDefault();if(state.maintenance.enabled&&!yesAdmin()&&state.session){await readMaintenance();show();return;}if(state.busy)return;state.busy=true;form.querySelectorAll('button[type=submit]').forEach(x=>x.disabled=true);
 try{
  const fd=new FormData(form);
  if(form.id==='settings-feedback-form'){
   if(yesAdmin()||!state.session?.user?.id)throw new Error('Feedback form is available to active non-admin users.');
   const category=clean(fd.get('category')),subject=clean(fd.get('subject')),message=clean(fd.get('message'));
   if(!['problem','suggestion'].includes(category))throw new Error('Choose a report category.');
   if(subject.length<3||subject.length>180||message.length<10||message.length>4000)throw new Error('Complete the report subject and details.');
   const {error}=await db.from('user_feedback').insert({submitted_by:state.session.user.id,category,subject,message});
   if(error)throw error;
   await load();pop('Report submitted to the District Administrator.');return;
  }
  if(form.id==='settings-private-form'){
   if(yesAdmin()||!state.session?.user?.id)throw new Error('Personal settings are available to active non-admin users.');
   const columns=['employee_id','birthdate','plantilla_item','messenger_url','prc_id','bachelors_degree'];
   const values=Object.fromEntries(columns.map(name=>[name,clean(fd.get(name))||null]));
   if(values.messenger_url&&!/^https:\/\//i.test(values.messenger_url))throw new Error('Messenger link must begin with https://');
   if(values.birthdate&&new Date(values.birthdate)>new Date())throw new Error('Birth date cannot be in the future.');
   const {error}=await db.from('user_private_details').upsert({user_id:state.session.user.id,...values},{onConflict:'user_id'});
   if(error)throw error;
   await load();pop('Your private details were saved.');return;
  }
  if(form.id==='settings-profile-form'){
   if(yesAdmin()||!state.session?.user?.id)throw new Error('Account profile request is not available.');
   if((state.profileRequests||[]).some(r=>r.status==='pending'))throw new Error('A profile correction request is already pending administrator review.');
   const name=clean(fd.get('full_name')),position=clean(fd.get('position_title'));
   const school=isOic()?null:(clean(fd.get('school_id'))||state.profile.school_id);
   if(!name)throw new Error('Enter your full name.');
   const request={requested_by:state.session.user.id,
    requested_name:name!==clean(state.profile.display_name)?name:null,
    requested_position:position!==clean(state.profile.position_title)?position:null,
    requested_school_id:school!==state.profile.school_id?school:null};
   if(!request.requested_name&&!request.requested_position&&!request.requested_school_id)
    throw new Error('No changes were found in your official profile.');
   if(!confirm('Send these official profile changes to the District Administrator for review? They will not take effect immediately.'))return;
   const {error}=await db.from('profile_change_requests').insert(request);
   if(error)throw error;
   await load();pop('Profile change request submitted for administrator review.');return;
  }
  if(form.id==='settings-email-form'){
   if(yesAdmin()||!state.session?.user?.id)throw new Error('Account settings are not available.');
   const email=clean(fd.get('email')).toLowerCase();
   if(!email||!email.includes('@'))throw new Error('Enter a valid email address.');
   if(email===String(state.session.user.email||'').toLowerCase())throw new Error('This is already your registered email.');
   if(!confirm('Request a change of your login email address? You may need to verify it from email confirmation links.'))return;
   const {error}=await db.auth.updateUser({email},{emailRedirectTo:location.origin+location.pathname});
   if(error)throw emailQuotaError(error,'Email change');
   pop('Email change requested. Check your email accounts for confirmation instructions.');return;
  }
  if(form.id==='settings-password-form'){
   if(yesAdmin()||!state.session?.user?.id)throw new Error('Account settings are not available.');
   const password=String(fd.get('new_password')||'');
   if(password.length<8)throw new Error('New password must have at least 8 characters.');
   if(password!==String(fd.get('confirm_password')||''))throw new Error('Passwords do not match.');
   if(!confirm('Change your login password now? You will need to sign in again.'))return;
   const {error}=await db.auth.updateUser({password});if(error)throw error;
   const {error:signoutError}=await db.auth.signOut();
   if(signoutError)console.warn('Password changed but signout returned an error.',signoutError);
   state.session=null;state.profile=null;state.modal=null;rememberView('dashboard');show();
   pop('Password updated. Sign in again using your new password.');return;
  }
  if(form.id==='forgot-password'){
   const email=clean(fd.get('email'));
   if(!email)throw new Error('Enter your registered email address.');
   state.lastSignupEmail=email;
   const {error}=await db.auth.resetPasswordForEmail(email,{
    redirectTo:location.origin+location.pathname
   });
   if(error)throw emailQuotaError(error,'Password reset');
   state.authMode='login';show();
   pop('If this email belongs to a registered account and sending is available, a password reset link has been requested. Check Inbox and Spam.');return;
  }
  if(form.id==='set-password'){
   if(!state.recoveryReady||!state.session?.user?.id)
    throw new Error('The recovery link is missing or expired. Please request a new password-reset email.');
   const newPassword=String(fd.get('new_password')||''),
         confirmPassword=String(fd.get('confirm_password')||'');
   if(newPassword.length<8)throw new Error('The new password must be at least 8 characters.');
   if(newPassword!==confirmPassword)throw new Error('The two passwords must match.');
   const {error}=await db.auth.updateUser({password:newPassword});
   if(error)throw error;
   // Clearing the recovery session forces the owner to sign in explicitly
   // with the new password. Administrator approval and data remain untouched.
   state.recoveryReady=false;state.authMode='login';
   const {error:outError}=await db.auth.signOut();
   if(outError)console.warn('Password changed but signout was unsuccessful',outError);
   state.session=null;state.profile=null;show();
   pop('Your password was updated. Sign in with the new password.');return;
  }
  if(form.id==='resend-email'){
   const email=clean(fd.get('email'));
   if(!email)throw new Error('Enter your registered email address.');
   state.lastSignupEmail=email;
   if(Date.now()<state.emailRetryAt)
    throw new Error('The district email service reached its quota. Please wait until approximately '+
     date(new Date(state.emailRetryAt).toISOString())+
     ' to request confirmation again. Waiting does not guarantee delivery without custom SMTP.');
   const {error}=await db.auth.resend({
    type:'signup',email,options:{emailRedirectTo:location.origin+location.pathname}
   });
   if(error)throw emailQuotaError(error,'Verification');
   state.emailHelpReason='';
   state.authMode='login';show();
   pop('New verification email requested. Open the newest link promptly; older links may be expired. Your administrator approval stays intact. Check Inbox or Spam for delivery.');return;
  }
  if(form.id==='queue-join'){
   const email=clean(fd.get('email')),name=clean(fd.get('full_name')),
    school=clean(fd.get('school')),role=clean(fd.get('registration_type'))||'school_user';
   const position=clean(fd.get('position_title'));
   if(!email||!name||(role==='school_user'&&!school))throw Error('Complete your name, email, and school.');
   if(state.queueTicket)throw Error('You already have a queue ticket. Check your existing place first.');
   const {data,error}=await db.rpc('i_track_registration_queue_join',{
    p_email:email,p_full_name:name,p_position_title:position,p_registration_type:role,
    p_school_id:role==='oic_psds'?null:school
   });
   if(error)throw error;
   if(!data)throw Error('No registration ticket was created. Please try again.');
   state.queueTicket=String(data);
   localStorage.setItem('srii-registration-queue-ticket',state.queueTicket);
   state.lastSignupEmail=email;
   await queueRead();
   pop('Your queue number is saved on this device. Check your position or add a calendar reminder.');return;
  }
  if(form.id==='queue-complete'){
   const q=state.queueInfo;
   if(!q||!state.queueTicket||q.queue_status!=='claimed')
    throw Error('Your private registration slot is not active. Check the queue.');
   if(new Date(q.expires_at).getTime()<=Date.now()){
    await queueRead();throw Error('Your registration window expired. Join the queue again.');
   }
   const password=String(fd.get('password')||'');
   if(password.length<8)throw Error('Your password must contain at least 8 characters.');
   const {error}=await db.auth.signUp({
    email:q.email,password,
    options:{emailRedirectTo:location.origin+location.pathname,
     data:{full_name:q.full_name,position_title:q.position_title||'',
      registration_type:q.registration_type,requested_school_id:q.registration_type==='oic_psds'?null:q.school_id}}
   });
   if(error){
    if(error.code==='over_email_send_rate_limit'||error.status===429){
     // A failed Supabase email attempt still consumes the trial quota.
     // Put the applicant back into a later numbered slot, without saving
     // or resending the password.
     const retry=await db.rpc('i_track_registration_queue_retry',{p_ticket:state.queueTicket});
     if(retry.error)throw Error('Email sending was limited and the queue could not be rebooked: '+retry.error.message);
     state.queueTicket=String(retry.data);
     localStorage.setItem('srii-registration-queue-ticket',state.queueTicket);
     await queueRead();
     pop('Supabase email sending is still limited. A new queue place was assigned; your password was not retained.',true);
     return;
    }
    if(error.code==='email_address_not_authorized'){
     await queueRead();
     throw Error('Supabase’s built-in sender cannot deliver to this address. The District Administrator must configure SMTP. Your password was not saved in the queue.');
    }
    throw error;
   }
   const finished=await db.rpc('i_track_registration_queue_finish',{p_ticket:state.queueTicket});
   if(finished.error)console.warn('Signup succeeded; queue finalization will reconcile later',finished.error);
   queueClear();state.authMode='login';show();
   pop('Account created. Check your email for verification, then wait for district approval.');return;
  }
  if(form.id==='login'){
   const email=clean(fd.get('email'));
   const {error}=await db.auth.signInWithPassword({email,password:String(fd.get('password')||'')});
   if(error){
    if(error.code==='email_not_confirmed'||/email not confirmed/i.test(error.message||'')){
     state.lastSignupEmail=email;
     state.emailHelpReason='unverified';
     state.authMode='resend';show();return;
    }
    throw error;
   }
   state.emailHelpReason='';
   await sync();pop('Signed in.');return;
  }
  if(form.id==='form-ann-edit'){
   if(!yesAdmin())throw Error('District administrator required');
   const ann=state.announcements.find(x=>x.id===state.announcementEditId);
   if(!ann||ann.status==='cancelled')throw Error('This announcement is cancelled or unavailable');
   const title=clean(fd.get('title')),description=clean(fd.get('description'));
   if(title.length<2||title.length>180)throw Error('Enter a title between 2 and 180 characters.');
   if(description.length>5000)throw Error('Description must be at most 5,000 characters.');
   const selected=[...form.querySelectorAll('.school-checkbox:checked')].map(c=>c.value);
   if(!selected.length)throw Error('At least one school must remain assigned.');
   const locked=state.announcementEditorData?.protected_school_ids||[];
   if(locked.some(id=>!selected.includes(id)))throw Error('Schools with existing submissions cannot be removed.');
   const raw=clean(fd.get('deadline'));
   if(!raw)throw Error('Enter the deadline.');
   const deadline=new Date(raw+'+08:00');
   if(Number.isNaN(deadline.getTime()))throw Error('Invalid Philippine-time deadline.');
   const approvers=[...form.querySelectorAll('.announcement-approver-pick:checked')].map(c=>c.value);
   const {data,error}=await db.rpc('i_track_update_announcement',{
    p_announcement:ann.id,p_title:title,p_description:description,
    p_deadline_at:deadline.toISOString(),p_school_ids:selected,p_approver_ids:approvers
   });
   if(error)throw error;
   state.modal=null;state.announcementEditId=null;state.announcementEditorData=null;
   await load();
   pop('Announcement updated. '+(data?.required_school_count||selected.length)+' school(s) assigned; previous submissions preserved.');
   return;
  }
  if(form.id==='form-ann'){
   const selected=[...form.querySelectorAll('.school-checkbox:checked')].map(c=>c.value);
   if(!selected.length)throw new Error('Select at least one school.');
   const raw=clean(fd.get('deadline'));if(!raw)throw new Error('Enter a deadline.');
   const localTime=new Date(raw+'+08:00');if(Number.isNaN(localTime.getTime()))throw new Error('Invalid deadline.');
   const approvers=[...form.querySelectorAll('.announcement-approver-pick:checked')].map(x=>x.value);
   const {error}=await db.rpc('i_track_create_announcement_with_approvers',{p_title:clean(fd.get('title')),p_description:clean(fd.get('description')),p_deadline_at:localTime.toISOString(),p_school_ids:selected,p_approver_ids:approvers});if(error)throw error;
   state.modal=null;rememberView('announcements');await load();pop('Announcement created.');return;
  }
  if(form.id==='form-doc'){
   const params={p_subject:clean(fd.get('subject')),p_document_type:clean(fd.get('type')),
    p_recipient_id:clean(fd.get('recipient'))||null,p_destination:clean(fd.get('destination'))||'school',p_notes:clean(fd.get('notes'))};
   if(params.p_recipient_id===state.session.user.id)params.p_recipient_id=null; // Choosing your own name saves In School, without a self-directed route.
   if(!params.p_subject||!params.p_document_type)throw Error('Enter the document title and type.');
   if(!state.docTypes.some(x=>x.name===params.p_document_type))throw Error('Choose an approved document type.');
   if(!['school','district','division'].includes(params.p_destination))throw Error('Choose a destination.');
   const files=[...(form.querySelector('#doc-attachments')?.files||[])];
   const allowed=/\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i;
   if(files.length>5)throw Error('Select no more than 5 attachments.');
   for(const file of files)if(file.size<1||file.size>4*1024*1024||!allowed.test(file.name))throw Error('Each file must be a supported PDF, Word document or image of 1 byte to 4 MB.');
   let tracking=form.dataset.savedTracking||'';
   const report=form.querySelector('#doc-save-message');
   if(!tracking){
    const recipientName=state.recipients.find(x=>x.user_id===params.p_recipient_id)?.display_name;
    if(!confirm(params.p_recipient_id?'Route this document to '+recipientName+'?':'Save this document In School with no recipient?'))return;
    if(report)report.textContent='Saving document and tracking number…';
    const {data,error}=await db.rpc('i_track_create_document',params);
    if(error)throw error;
    tracking=data;
    form.dataset.savedTracking=tracking;
   }
   if(report)report.textContent='Saved as '+tracking+'. Preparing attachments…';
   let docId=form.dataset.savedDocumentId;
   if(!docId){
    const found=await db.from('documents').select('id').eq('tracking_number',tracking).eq('created_by',state.session.user.id).single();
    if(found.error)throw Error('Document '+tracking+' was saved, but its ID could not be loaded. Please use My Documents to add any remaining attachments. '+found.error.message);
    docId=found.data.id;form.dataset.savedDocumentId=docId;
   }
   if(!form._uploadedAttachments)form._uploadedAttachments=new Set();
   for(let n=0;n<files.length;n++){
    const file=files[n],key=n+':'+file.name+':'+file.size;
    if(form._uploadedAttachments.has(key))continue;
    if(report)report.textContent='Document '+tracking+' saved. Uploading attachment '+(n+1)+' of '+files.length+': '+file.name;
    await uploadNewDocumentAttachment(docId,file);
    form._uploadedAttachments.add(key);
   }
   state.modal=null;rememberView('documents');await load();
   pop('Document '+tracking+' saved'+(files.length?' with '+files.length+' attachment(s)':'')+'.');
   return;
  }
 }catch(e){err(e);}finally{state.busy=false;form.querySelectorAll('button[type=submit]').forEach(x=>{x.disabled=false;});}
}
$.addEventListener('click',click);
$.addEventListener('submit',submit);
function filterDocumentRegistry(){
 const input=document.getElementById('document-search');
 if(!input)return;
 const query=input.value.trim().toLocaleLowerCase();
 const status=document.getElementById('document-status-filter')?.value||'';
 const dateMin=document.getElementById('document-date-filter')?.value||'';
 let visible=0;
 input.closest('.panel')?.querySelectorAll('[data-document-row]').forEach(row=>{
  const match=(!query||row.textContent.toLocaleLowerCase().includes(query))&&(!status||row.dataset.routeStatus===status)&&(!dateMin||row.dataset.created>=dateMin);
  row.hidden=!match;
  if(match)visible++;
 });
 const count=document.getElementById('document-search-count');
 if(count)count.textContent=visible+' matching document(s)';
}
$.addEventListener('input',e=>{
 if(['document-search','document-date-filter'].includes(e.target.id))filterDocumentRegistry();
 if(e.target.id==='retrieval-search')filterRetrievalAvailable();
});
$.addEventListener('change',async e=>{
 if(state.view==='retrieval'&&e.target.matches('input[type="checkbox"].retrieval-check')){
  const cls=e.target.classList;
  const store=cls.contains('retrieval-pick')?state.retrievalPicked:
              cls.contains('retrieval-turnover-pick')?state.retrievalTurnoverPicked:
              cls.contains('retrieval-district-pick')?state.retrievalDistrictPicked:null;
  if(store){
   if(e.target.checked)store.add(e.target.value);else store.delete(e.target.value);
   refreshRetrievalCheckboxCounters();return;
  }
 }
 if(['document-status-filter','document-date-filter'].includes(e.target.id)){filterDocumentRegistry();return;}
 if(e.target.id==='doc-attachments'){
  const files=[...(e.target.files||[])],message=document.getElementById('doc-attachment-selection');
  if(message)message.textContent=files.length?files.map(f=>f.name+' ('+(f.size/1024/1024).toFixed(2)+' MB)').join(' · '):'No attachments selected.';
  return;
 }
 if(e.target.id==='division-current'){state.divisionSelected=e.target.value;state.transmittalEditing=false;show();return;}
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
 if(e.target.id==='all-schools')document.querySelectorAll('.school-checkbox:not(:disabled)').forEach(c=>c.checked=e.target.checked);
 if(e.target.id==='pick-ann'){state.selectedId=e.target.value;rememberAnnouncement(state.selectedId);try{await loadMonitor();show();}catch(ex){err(ex);}}
 if(['school-files-filter-school','school-files-filter-ann','school-files-filter-versions'].includes(e.target.id)&&yesAdmin()&&state.view==='school-files'){
  if(e.target.id==='school-files-filter-school')state.schoolFilesSchool=e.target.value;
  if(e.target.id==='school-files-filter-ann')state.schoolFilesAnnouncement=e.target.value;
  if(e.target.id==='school-files-filter-versions')state.schoolFilesVersions=e.target.value;
  show();return;
 }
 if(e.target.id==='review-ann'&&(yesAdmin()||state.approverAssignments.some(x=>x.user_id===state.session.user.id))){state.reviewSelectedId=e.target.value;rememberAnnouncement(state.reviewSelectedId,true);try{await loadVerification();show();}catch(ex){err(ex);}}
 if(e.target.id==='image-file'){state.file=e.target.files?.[0]||null;state.compressed=null;state.fileNote=state.file?`Selected ${state.file.name} — ${(state.file.size/1024).toFixed(0)} KB`:'';const note=document.getElementById('file-status');if(note)note.textContent=state.fileNote;}
});
// A gentle live countdown works while the registration page is open.
// Returning after the reminder remains the user's choice; browser timers and
// notifications cannot be relied on when a mobile PWA is closed.
let queueBoundaryChecked='';
setInterval(()=>{
 if(state.authMode!=='queue'||!state.queueInfo||state.session)return;
 const remaining=document.querySelector('[data-queue-countdown]');
 if(remaining)remaining.textContent=queueTimeText(state.queueInfo.ready_at);
 if(state.queueInfo.queue_status==='waiting' &&
   new Date(state.queueInfo.ready_at).getTime()<=Date.now() &&
   queueBoundaryChecked!==state.queueTicket){
   queueBoundaryChecked=state.queueTicket;
   queueRead().catch(e=>console.warn('Queue time reached; use Check Queue to refresh',e));
 }
},15000);
setInterval(async()=>{if(!state.session||!active())return;const was=state.maintenance.enabled;await readMaintenance();if(was!==state.maintenance.enabled)show();},20000);
initial();
})();
