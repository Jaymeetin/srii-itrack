
(() => {
'use strict';
const C=window.ITRACK_CONFIG;
const $=document.getElementById('app');
const toast=document.getElementById('toast');
const db=window.supabase?.createClient(C.url,C.publishableKey,{auth:{persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
// Reuse one authenticated client across tracking, upload and download screens.
// Multiple clients refreshing the same mobile session can reset upload forms.
window.ITRACK_DB=db;
const state={session:null,profile:null,schools:[],announcements:[],profiles:[],docs:[],recipients:[],monitor:[],selectedId:'',view:'dashboard',authMode:'login',modal:null,detail:null,routes:[],theme:localStorage.getItem('srii-theme')||'light',busy:false,file:null,compressed:null,fileNote:'',counts:null,issue:null};
document.documentElement.dataset.theme=state.theme;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}):'—';
const short=x=>x?new Date(x).toLocaleDateString('en-PH',{dateStyle:'medium',timeZone:'Asia/Manila'}):'—';
const clean=x=>String(x||'').trim();
const yesAdmin=()=>['main_admin','backup_admin'].includes(state.profile?.role);
const isMain=()=>state.profile?.role==='main_admin';
const active=()=>state.profile?.account_status==='active';
const label=x=>String(x||'').replaceAll('_',' ');
const pTag=x=>`<span class="tag ${['active','submitted','received','open','Submitted'].includes(x)?'good':['pending','awaiting_ack','Pending','returned'].includes(x)?'warn':['Late','disabled'].includes(x)?'bad':'info'}">${esc(label(x))}</span>`;
const table=(cols,rows)=>rows.length?`<div class="tablewrap"><table class="data"><thead><tr>${cols.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<div class="empty">No records available yet.</div>';
const field=(caption,name,type='text',value='',placeholder='')=>`<div class="field"><label for="${esc(name)}">${esc(caption)}</label><input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${type==='password'?'minlength="8"':''} required></div>`;
const schoolOpts=()=>state.schools.filter(s=>s.is_active).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
function pop(message,error=false){toast.textContent=message;toast.style.background=error?'#a43142':'#173d80';toast.classList.add('show');clearTimeout(pop.timer);pop.timer=setTimeout(()=>toast.classList.remove('show'),5000);}
function brand(){return `<div class="brand"><div class="brandmark">i<span>•</span></div><div>SRII i-TRACK<small>DOCUMENT TRACKING SYSTEM</small></div></div>`;}
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
  if(active())await load();else show();
 }catch(e){state.issue=e.message;show();}
}
async function load(){
 if(!active()){show();return;}
 try{
  const tasks=[];
  if(['dashboard','announcements','monitoring'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('announcements').select('id,title,description,status,deadline_at,original_deadline_at,created_at').order('created_at',{ascending:false});if(error)throw error;state.announcements=data||[];if(!state.selectedId||!state.announcements.some(x=>x.id===state.selectedId))state.selectedId=state.announcements.find(x=>x.status!=='draft')?.id||'';})());
  }
  if(['dashboard','documents'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('documents').select('id,tracking_number,subject,document_type,status,created_by,origin_school_id,created_at').order('created_at',{ascending:false}).limit(200);if(error)throw error;state.docs=data||[];})());
  }
  if(yesAdmin()&&['dashboard','approvals'].includes(state.view)){
   tasks.push((async()=>{const {data,error}=await db.from('profiles').select('id,display_name,school_id,requested_school_id,position_title,role,account_status,created_at').order('created_at',{ascending:false});if(error)throw error;state.profiles=data||[];})());
  }
  if(state.view==='dashboard')tasks.push((async()=>{const {data,error}=await db.rpc('i_track_registration_counts');if(!error)state.counts=Array.isArray(data)?data[0]:data;})());
  await Promise.all(tasks);
  if(state.view==='monitoring')await loadMonitor();
  if(state.view==='documents')await loadRecipients();
  show();
 }catch(e){err(e);show();}
}
async function loadRecipients(){const {data,error}=await db.rpc('i_track_recipient_directory');if(error)throw error;state.recipients=data||[];}
async function loadMonitor(){if(!state.selectedId){state.monitor=[];return;}const {data,error}=await db.rpc('i_track_monitor',{p_announcement_id:state.selectedId});if(error)throw error;state.monitor=data||[];}
function show(){
 if(state.issue){$.innerHTML=`<div class="startup"><h2>Connection problem</h2><p>${esc(state.issue)}</p><button class="btn" data-a="retry">Retry</button></div>`;return;}
 if(!state.session){authPage();return;}
 if(!state.profile){$.innerHTML='<div class="startup">Preparing account…</div>';return;}
 if(!active()){pendingPage();return;}
 appPage();
}
function authPage(){
 const registering=state.authMode==='register';
 $.innerHTML=`<div class="auth">
 <aside class="auth-aside">${brand()}<div><h1>Connecting Schools.<br><em>Tracking Documents.</em><br>Ensuring Accountability.</h1><p>San Remigio II District — integrated announcements, document routing and compliance monitoring.</p></div><small>SAN REMIGIO II · OFFICIAL WORKSPACE TRIAL</small></aside>
 <main class="auth-content"><div class="auth-card"><div class="auth-top"><button class="btn alt tiny" data-a="theme">◐ Light / Dark</button></div>
 <div class="eyebrow">Welcome to SRII i-TRACK</div><h1>${registering?'Create an Account':'Sign In'}</h1><p class="sub">${registering?'Use your DepEd or personal Gmail account. District approval is required.':'Use your registered email and password.'}</p>
 <form id="${registering?'register':'login'}">
 ${registering?field('Complete name','full_name')+field('Position / Designation','position_title','text','','Administrative Officer II')+`<div class="field"><label for="school">School</label><select id="school" name="school" required><option value="">Select your school</option>${schoolOpts()}</select></div>`:''}
 ${field('Email address','email','email')}${field('Password','password','password')}<button type="submit" class="btn block">${registering?'Register Account':'Sign In'}</button></form>
 <div class="switch">${registering?'Already registered?':'New personnel?'} <button class="link-button" data-a="switch">${registering?'Sign in':'Register here'}</button></div>
 <p class="note">Your password is handled by Supabase Authentication; never send it to the district administrator.</p></div></main></div>`;
}
function pendingPage(){
 $.innerHTML=`<div class="pending">${brand()}<h2 style="margin-top:24px">${state.profile.account_status==='pending'?'Waiting for Approval':'Account Not Active'}</h2><p class="sub">${state.profile.account_status==='pending'?'Your registration needs approval and school assignment by the District Administrator.':'Contact the District Administrator if you believe this is a mistake.'}</p>${pTag(state.profile.account_status)}<p></p><div class="toolbar"><button class="btn" data-a="refresh">Check Again</button><button class="btn alt" data-a="logout">Sign Out</button></div></div>`;
}
const menu=[['dashboard','▤ Dashboard'],['announcements','▣ Announcements'],['monitoring','◉ Submission Monitoring'],['documents','⇄ My Documents']];
function appPage(){
 const nav=[...menu,...(yesAdmin()?[['approvals','♙ Account Approvals'],['archive','▤ Archive Documents']]:[])].map(([id,title])=>`<button class="${state.view===id?'active':''}" data-a="nav" data-page="${id}">${title}</button>`).join('');
 const title={dashboard:'District Overview',announcements:'Announcements',monitoring:'Submission Monitoring',documents:'My Documents',approvals:'Account Management',archive:'Document Archiving'}[state.view]||'Overview';
 const school=state.schools.find(x=>x.id===state.profile.school_id)?.name||'District Office';
 const name=state.profile.display_name||'District Administrator';
 const body={dashboard:dashboardPage,announcements:announcementPage,monitoring:monitorPage,documents:documentPage,approvals:approvalPage,archive:archivePage}[state.view]?.()||dashboardPage();
 $.innerHTML=`<div class="app"><aside class="sidebar">${brand()}<nav>${nav}</nav><div class="sidebar-footer"><button data-a="theme">◐ Light / Dark Mode</button><button data-a="logout">↩ Sign Out</button><div class="user-mini">${esc(name)}<br>${esc(label(state.profile.role))} · ${esc(school)}</div></div></aside>
 <div class="main"><header class="topbar"><div><h2>${esc(title)}</h2><div class="note">Connecting Schools. Tracking Documents. Ensuring Accountability.</div></div>${pTag('active')}</header><div class="content">${body}</div></div></div>${state.modal?modalHtml():''}`;
}
function dashboardPage(){
 const total=state.schools.filter(s=>s.is_active).length;
 const open=state.announcements.filter(a=>a.status==='open').length;
 const pending=state.profiles.filter(p=>p.account_status==='pending').length;
 const stats=stat('Schools with Approved Accounts',state.counts?.schools_with_approved_accounts??'—',`${total} schools in district`)+stat('Open Announcements',open,'Requirements currently open')+stat('Visible Documents',state.docs.length,'Routed documents on your account')+stat(yesAdmin()?'Pending Approvals':'Account Status',yesAdmin()?pending:'Active',yesAdmin()?'Users awaiting approval':'Approved user');
 const an=state.announcements.slice(0,6).map(x=>`<tr><td>${esc(x.title)}</td><td>${pTag(x.status)}</td><td>${short(x.deadline_at)}</td><td><button class="btn tiny alt" data-a="monitor" data-id="${x.id}">View</button></td></tr>`);
 const dox=state.docs.slice(0,6).map(x=>`<tr><td>${esc(x.tracking_number)}</td><td>${esc(x.subject)}</td><td>${pTag(x.status)}</td><td><button class="btn tiny alt" data-a="detail" data-id="${x.id}">View</button></td></tr>`);
 return `<div class="eyebrow">San Remigio II District</div><h1>Welcome to your district workspace</h1><p class="sub">Announcements, compliance, and document routing in one place.</p><div class="hero"><div><h2>Track with clarity. Submit with confidence.</h2><p>Your district's secure document tracking portal.</p></div><div class="seal">SRII</div></div>
 <div class="stats">${stats}</div><div class="grid2"><div><div class="panel"><div class="panel-head"><h3>Recent Announcements</h3><button class="btn tiny alt" data-a="nav" data-page="announcements">View all</button></div>${table(['Announcement','Status','Deadline',''],an)}</div><div class="panel"><div class="panel-head"><h3>Recent Documents</h3><button class="btn tiny alt" data-a="nav" data-page="documents">View all</button></div>${table(['Tracking #','Subject','Status',''],dox)}</div></div>
 <div><div class="panel"><h3>Quick Actions</h3><div class="toolbar">${yesAdmin()?'<button class="btn" data-a="new-announcement">+ Announcement</button>':''}<button class="btn alt" data-a="nav" data-page="documents">Route Document</button><button class="btn alt" data-a="nav" data-page="monitoring">Monitor Submissions</button></div></div><div class="panel"><h3>Connections</h3><p>${pTag('active')} Supabase login and database</p><p>${pTag('Pending')} Google Drive web uploads</p><p class="note">DepEd Google Drive access was tested separately using Apps Script. Uploads are disabled here until secure authorization is implemented.</p></div></div></div>`;
}
function announcementPage(){
 const rows=state.announcements.map(a=>`<tr><td><strong>${esc(a.title)}</strong><div class="small muted">${esc(a.description||'')}</div></td><td>${pTag(a.status)}</td><td>${short(a.deadline_at)}</td><td><button class="btn tiny alt" data-a="monitor" data-id="${a.id}">Monitor</button></td></tr>`);
 return `<div class="sectionhead"><div><div class="eyebrow">District requirements</div><h1>Announcements</h1><p class="sub">Official school submission requests and deadlines.</p></div>${yesAdmin()?'<button class="btn" data-a="new-announcement">+ New Announcement</button>':''}</div><div class="panel"><h3>Announcement Board</h3>${table(['Announcement','Status','Deadline',''],rows)}</div>`;
}
function monitorPage(){
 const opts=state.announcements.filter(a=>a.status!=='draft').map(a=>`<option value="${a.id}" ${a.id===state.selectedId?'selected':''}>${esc(a.title)}</option>`).join('');
 const n=x=>state.monitor.filter(s=>s.submission_status===x).length;
 const rows=state.monitor.map(x=>`<tr><td>${esc(x.school_name)}</td><td>${pTag(x.submission_status)}</td></tr>`);
 return `<div class="eyebrow">District-wide visibility</div><h1>Submission Monitoring</h1><p class="sub">All users see school status only. Documents and other schools' submission dates remain private.</p>
 <div class="panel"><div class="field"><label>Announcement</label><select id="pick-ann"><option value="">Choose an announcement</option>${opts}</select></div></div>
 ${state.selectedId?`<div class="stats">${stat('Required Schools',state.monitor.length,'For selected announcement')}${stat('Submitted',n('Submitted'),'On time')}${stat('Late',n('Late'),'After deadline')}${stat('Pending',n('Pending'),'Not yet submitted')}</div><div class="panel"><h3>School Status</h3>${table(['School','Status'],rows)}</div>`:'<div class="panel empty">Choose an announcement to view status.</div>'}
 <div class="notice">Privacy: this view does not show other schools' files, upload dates, names of submitters, or download links.</div>`;
}
function documentPage(){
 const rows=state.docs.map(d=>`<tr><td><b>${esc(d.tracking_number)}</b></td><td>${esc(d.subject)}</td><td>${esc(d.document_type)}</td><td>${pTag(d.status)}</td><td><button class="btn tiny alt" data-a="detail" data-id="${d.id}">Open</button></td></tr>`);
 return `<div class="sectionhead"><div><div class="eyebrow">Routing and acknowledgment</div><h1>My Documents</h1><p class="sub">Permanent tracking numbers, receipt acknowledgment, forwarding and returns.</p></div><button class="btn" data-a="send">+ Route Document</button></div><div class="panel"><h3>Document Registry</h3>${table(['Tracking #','Subject','Type','Status',''],rows)}</div>
 <div class="panel"><h3>Compress a Screenshot</h3><div class="notice">Image compression works locally and is free. Online Google Drive file uploads are not connected yet.</div><div class="filebox"><input id="image-file" type="file" accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx"><p id="file-status" class="note" style="margin:9px 0 0">${esc(state.fileNote||'Choose a screenshot, PDF, or Word document.')}</p></div><div class="toolbar" style="margin-top:13px"><button class="btn alt" data-a="compress">Compress File</button>${state.compressed?'<button class="btn alt" data-a="save-compressed">Download Compressed Image</button>':''}<button class="btn" disabled>Upload to Drive — Coming Soon</button></div></div>`;
}
function approvalPage(){
 if(!yesAdmin())return '<div class="notice danger">Administrator access required.</div>';
 const rows=state.profiles.map(p=>{const school=state.schools.find(s=>s.id===(p.school_id||p.requested_school_id))?.name||'Unassigned';
 return `<tr><td>${esc(p.display_name||'Unnamed user')}<div class="small muted">${esc(p.position_title||'')}</div></td><td>${esc(school)}</td><td>${pTag(p.account_status)}</td><td>${esc(label(p.role))}</td><td><div class="actionbuttons">${p.account_status==='pending'?`<button class="btn tiny" data-a="approve" data-id="${p.id}">Approve</button><button class="btn tiny danger" data-a="reject" data-id="${p.id}">Reject</button>`:''}${isMain()&&p.account_status==='active'&&p.role!=='main_admin'?`<button class="btn tiny alt" data-a="backup" data-id="${p.id}" data-enable="${p.role==='backup_admin'?'false':'true'}">${p.role==='backup_admin'?'Remove Backup':'Make Backup'}</button>`:''}</div></td></tr>`}).join('');
 return `<div class="eyebrow">Administrator controls</div><h1>Account Approvals</h1><p class="sub">Confirm a user's requested school before activating their account. Only Main Administrator can manage Backup Administrators.</p><div class="panel">${table(['Name','School','Status','Role','Action'],state.profiles.map(p=>{const school=state.schools.find(s=>s.id===(p.school_id||p.requested_school_id))?.name||'Unassigned';return `<tr><td>${esc(p.display_name||'Unnamed user')}</td><td>${esc(school)}</td><td>${pTag(p.account_status)}</td><td>${esc(label(p.role))}</td><td><div class="actionbuttons">${p.account_status==='pending'?`<button class="btn tiny" data-a="approve" data-id="${p.id}">Approve</button><button class="btn tiny danger" data-a="reject" data-id="${p.id}">Reject</button>`:''}${isMain()&&p.account_status==='active'&&p.role!=='main_admin'?`<button class="btn tiny alt" data-a="backup" data-id="${p.id}" data-enable="${p.role==='backup_admin'?'false':'true'}">${p.role==='backup_admin'?'Remove Backup':'Make Backup'}</button>`:''}</div></td></tr>`}))}</div>`;
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
  body=`<h3>${esc(d.subject)}</h3><p class="sub">${esc(d.document_type)} · ${pTag(d.status)} · ${date(d.created_at)}</p><h3>Routing History</h3><div class="timeline">${routes.map(r=>`<div class="event"><strong>${esc(label(r.route_action))} · ${esc(label(r.status))}</strong><span class="small muted">${date(r.sent_at)}</span>${r.note?`<p>${esc(r.note)}</p>`:''}${r.acknowledged_at?`<p class="note">Acknowledged: ${date(r.acknowledged_at)}</p>`:''}</div>`).join('')}</div>`;
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
  if(a==='nav'){state.view=t.dataset.page;state.modal=null;await load();return;}
  if(a==='monitor'){state.selectedId=t.dataset.id;state.view='monitoring';await load();return;}
  if(a==='close'){state.modal=null;show();return;}
  if(a==='new-announcement'){state.modal='new-announcement';show();return;}
  if(a==='send'){await loadRecipients();state.modal='send';show();return;}
  if(a==='detail'){await openDetail(t.dataset.id);return;}
  if(a==='approve'||a==='reject'){
   const user=state.profiles.find(p=>p.id===t.dataset.id);if(!user)return;
   if(!confirm(`${a==='approve'?'Approve':'Reject'} this user?`))return;
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
   if(password.length<8)throw new Error('Password must have at least 8 characters.');
   if(!name||!school)throw new Error('Complete your name and school.');
   const {error}=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{full_name:name,position_title:clean(fd.get('position_title')),requested_school_id:school}}});if(error)throw error;
   state.authMode='login';show();pop('Registration received. Please verify email and wait for district approval.');return;
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
 if(e.target.id==='all-schools')document.querySelectorAll('.school-checkbox').forEach(c=>c.checked=e.target.checked);
 if(e.target.id==='pick-ann'){state.selectedId=e.target.value;try{await loadMonitor();show();}catch(ex){err(ex);}}
 if(e.target.id==='image-file'){state.file=e.target.files?.[0]||null;state.compressed=null;state.fileNote=state.file?`Selected ${state.file.name} — ${(state.file.size/1024).toFixed(0)} KB`:'';const note=document.getElementById('file-status');if(note)note.textContent=state.fileNote;}
});
initial();
})();
