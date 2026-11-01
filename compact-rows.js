/* SRII i-TRACK compact record lists. Presentation only; original controls and data stay intact. */
(function(){
'use strict';
const root=document.getElementById('app');
if(!root)return;
let sequence=0,scheduled=false;
const groupNames=new WeakMap();
function groupFor(parent){
 if(!groupNames.has(parent))groupNames.set(parent,'itrack-rows-'+(++sequence));
 return groupNames.get(parent);
}
function labelText(node){return (node?.textContent||'').replace(/\s+/g,' ').trim();}
function chip(value){
 const el=document.createElement('span');el.className='itrack-row-status';
 el.textContent=String(value||'').trim();return el;
}
function summary(name,status){
 const el=document.createElement('summary');el.className='itrack-row-summary';
 const title=document.createElement('span');title.className='itrack-row-title';title.textContent=name||'Untitled record';
 const right=document.createElement('span');right.className='itrack-row-right';
 if(status)right.appendChild(status);
 const arrow=document.createElement('span');arrow.className='itrack-row-chevron';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');
 right.appendChild(arrow);el.append(title,right);return el;
}
function addCount(list,count){
 const head=document.createElement('div');head.className='itrack-row-count';
 head.textContent=count+' '+(count===1?'entry':'entries');list.appendChild(head);
}
function compactTables(){
 root.querySelectorAll('table.data').forEach(table=>{
  if(table.closest('.itrack-row-detail'))return;
  const trs=Array.from(table.querySelectorAll('tbody > tr'));
  const heads=Array.from(table.querySelectorAll('thead > tr > th')).map(labelText);
  if(!trs.length||!heads.length||trs.some(tr=>tr.cells.length!==heads.length||Array.from(tr.cells).some(td=>td.colSpan!==1)))return;
  const list=document.createElement('div');list.className='itrack-compact-list';
  addCount(list,trs.length);
  const group='itrack-table-'+(++sequence);
  const nameIx=heads.findIndex(h=>/^(name|school|document|applicant|announcement|file)/i.test(h));
  const titleIx=nameIx<0?0:nameIx;
  const statusIx=heads.findIndex(h=>/status|verification|completion|state/i.test(h));
  trs.forEach(tr=>{
   const cells=Array.from(tr.cells);
   const first=cells[titleIx]||cells[0];
   const preferred=first.querySelector('.connected-ann-title,.school-files-name strong,.retrieval-name,strong');
   const name=labelText(preferred)||labelText(first)||'Record';
   const statusCell=statusIx>=0?cells[statusIx]:null;
   const statusBadge=statusCell?.querySelector('.tag,.verify-status,.account-email-state');
   const status=statusBadge?statusBadge.cloneNode(true):(statusCell?chip(labelText(statusCell)):null);
   const details=document.createElement('details');details.className='itrack-compact-entry';details.name=group;
   details.appendChild(summary(name,status));
   const body=document.createElement('div');body.className='itrack-row-detail';
   cells.forEach((td,idx)=>{
    const field=document.createElement('div');field.className='itrack-row-field';
    const key=document.createElement('div');key.className='itrack-row-field-name';key.textContent=heads[idx]||'Details';
    const val=document.createElement('div');val.className='itrack-row-field-value';
    while(td.firstChild)val.appendChild(td.firstChild);
    field.append(key,val);body.appendChild(field);
   });
   details.appendChild(body);list.appendChild(details);
  });
  const holder=table.closest('.tablewrap');
  if(holder)holder.replaceWith(list);else table.replaceWith(list);
 });
}
const configs=[
 ['.feedback-entry',function(el){
   const meta=labelText(el.querySelector('.feedback-entry-heading .small'));
   const match=meta.match(/(?:Submitted by:|Referenced personnel:)\s*([^·]+)/i);
   return match?.[1]?.trim()||labelText(el.querySelector('.feedback-entry-heading strong'));
  },function(el){return el.querySelector('.tag')?.cloneNode(true)||chip('Submitted');}],
 ['.verify-global-entry',el=>labelText(el.querySelector('.verify-global-main strong')),el=>el.querySelector('.verify-status')?.cloneNode(true)||chip('Awaiting review')],
 ['.type-admin-row',el=>labelText(el.querySelector('strong')),el=>chip(/Pending/.test(labelText(el.parentElement?.previousElementSibling))?'Pending':(/Inactive/i.test(labelText(el))?'Inactive':/Active/i.test(labelText(el))?'Active':'Pending'))],
 ['.district-action-row',function(el){
  const container=el.firstElementChild;const id=labelText(container?.querySelector('strong'));
  return labelText(container).replace(id,'').replace(/^[\s·–-]+/,'').split(' · ')[0]||id;
 },el=>chip(labelText(el.querySelector('.small')).split(' · ')[0]||'Document')],
 ['.retrieval-slip-row',el=>labelText(el.querySelector('strong')),el=>chip(labelText(el.querySelector('.small')).split(' · ')[0]||'Slip')],
 ['.retrieval-claim-row',el=>labelText(el.querySelector('.retrieval-name'))||labelText(el.querySelector('strong')),el=>chip('Awaiting receipt')],
 ['.retrieval-owner-row',el=>labelText(el.querySelector('.small')).split(' · ')[0]||labelText(el.querySelector('strong')),el=>chip('Owner assignment')],
 ['.settings-request-row',el=>'Profile change request',el=>chip(labelText(el.querySelector('strong')))],
 ['.version-row',el=>labelText(el.querySelector('.version-row-heading strong'))||'System update',el=>chip('Update')],
 ['.itrack-notice-row',el=>labelText(el.querySelector('.v2-notice-copy strong'))||'Notification',el=>chip(el.classList.contains('itrack-unread')?'Unread':'Notice')],
 ['.monitor-visible-file',el=>labelText(el.querySelector('strong'))||'File',el=>chip('Upload')],
 ['.monitor-file-entry',el=>labelText(el.querySelector('.monitor-file-entry-head strong'))||'File version',el=>el.querySelector('.verify-status')?.cloneNode(true)||chip('Upload')],
 ['.school-doc-version',el=>labelText(el.querySelector('.school-doc-version-head strong'))||'File version',el=>chip('Version')]
];
function compactCards(){
 for(const [selector,getTitle,getStatus] of configs){
  root.querySelectorAll(selector).forEach(el=>{
   if(el.matches('details')||el.closest('summary')||el.closest('.itrack-row-detail'))return;
   const parent=el.parentElement;if(!parent)return;
   const title=getTitle(el),status=getStatus(el);
   const details=document.createElement('details');
   details.className='itrack-compact-entry itrack-compact-card';
   details.name=groupFor(parent);
   details.appendChild(summary(title,status));
   const content=document.createElement('div');content.className='itrack-row-detail';
   while(el.firstChild)content.appendChild(el.firstChild);
   details.appendChild(content);el.replaceWith(details);
  });
 }
}
const docStatuses={
 submission:'School submission',awaiting_ack:'Awaiting receipt',received:'Received',
 processed:'Processed',in_transmittal:'In transmittal',district_draft:'District draft',
 district_submitted:'Submitted to District',in_school:'In school',none:'Not routed'
};
function compactExistingRows(){
 root.querySelectorAll('.compact-doc-row:not(.itrack-row-ready)').forEach(el=>{
  el.classList.add('itrack-row-ready');
  const id=el.querySelector('.compact-doc-id');if(id)id.hidden=true;
  const status=chip(docStatuses[el.dataset.routeStatus]||'Document');
  status.classList.add('itrack-doc-status');
  const arrow=el.querySelector('.compact-doc-arrow');if(arrow)el.insertBefore(status,arrow);
 });
 // The school detail window already contains submission time, uploader, and files.
 root.querySelectorAll('.status-school-row .oversight-upload-time').forEach(el=>{el.hidden=true;});
}
function compactSelectableTables(){
 root.querySelectorAll('.district-list tbody tr,.retrieval-table tbody tr').forEach(tr=>{
  if(tr.classList.contains('itrack-selectable-row')||tr.querySelector('td[colspan]'))return;
  tr.classList.add('itrack-selectable-row');tr.tabIndex=0;
  tr.setAttribute('aria-label','Select row or press Enter to view additional document details');
  tr.addEventListener('click',function(ev){
   if(ev.target.closest('input,button,select,label,a'))return;
   tr.classList.toggle('itrack-selectable-expanded');
  });
  tr.addEventListener('keydown',function(ev){
   if((ev.key==='Enter'||ev.key===' ')&&ev.target===tr){
    ev.preventDefault();tr.classList.toggle('itrack-selectable-expanded');
   }
  });
 });
}
function compact(){
 if(!root.querySelector('.app'))return;
 compactTables();compactCards();compactExistingRows();compactSelectableTables();
}
function schedule(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;compact();});
}
const watcher=new MutationObserver(schedule);
watcher.observe(root,{childList:true,subtree:true});
schedule();
})();