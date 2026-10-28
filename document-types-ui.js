/* Administrator-only document-type management. Server RPC enforces permissions. */
(()=>{
'use strict';
window.ITRACK_TYPES_VIEW=function(state,{esc,date}){
 const data=state.adminDocumentTypes||{},pending=data.requests||[],types=data.types||[];
 const pendingRows=pending.map(x=>'<div class="type-admin-row"><div><strong>'+esc(x.name)+'</strong>'+
  '<div class="small muted">Suggested by '+esc(x.requester_name)+' · '+esc(date(x.submitted_at))+'</div></div>'+
  '<div class="type-admin-buttons"><button class="btn tiny" data-a="types-review" data-decision="approve" data-id="'+esc(x.id)+'">Approve</button>'+
  '<button class="btn tiny alt" data-a="types-review" data-decision="reject" data-id="'+esc(x.id)+'">Reject</button></div></div>').join('')||
  '<p class="note">No pending document-type suggestions.</p>';
 const typeRows=types.map(t=>'<div class="type-admin-row"><div><strong>'+esc(t.name)+'</strong>'+
  '<div class="small muted">'+(t.active?'Approved / Active':'Inactive')+
  ' · '+esc(date(t.approved_at))+'</div></div>'+
  '<button class="btn tiny '+(t.active?'alt':'')+'" data-a="types-toggle" data-name="'+esc(t.name)+'" data-act="'+
  (t.active?'deactivate':'reactivate')+'">'+(t.active?'Deactivate':'Reactivate')+'</button></div>').join('')||
  '<p class="note">No document types exist.</p>';
 return '<div class="sectionhead"><div><div class="eyebrow">District Administration</div><h1>Document Types</h1>'+
  '<p class="sub">Approve suggestions, add types directly and deactivate old types without deleting historical documents.</p></div>'+
  '<button class="btn alt" data-a="types-refresh">Refresh</button></div>'+
  '<div class="panel"><h3>Pending Requests ('+pending.length+')</h3>'+pendingRows+'</div>'+
  '<div class="panel"><h3>Add Approved Document Type</h3>'+
  '<p class="note">Administrators can add a type immediately. It becomes available in the document creation dropdown after refresh.</p>'+
  '<div class="toolbar"><input id="types-new-name" type="text" maxlength="140" placeholder="e.g., School Form 6" style="flex:1 1 250px;border:1px solid var(--line);border-radius:9px;padding:10px;color:var(--text);background:var(--paper)">'+
  '<button class="btn" data-a="types-add">+ Add Document Type</button></div></div>'+
  '<div class="panel"><h3>Approved & Inactive Types ('+types.length+')</h3><p class="note">Deactivation only hides a type from new documents. Old document tracking IDs and history are kept.</p>'+typeRows+'</div>';
};
})();
