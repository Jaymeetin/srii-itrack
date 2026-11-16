/* SRII i-TRACK Division Retrieval: three plain tabs.
 *   At Division        tick what you physically collected, then confirm
 *   With me            documents you carry for someone else, slips, District handover
 *   For me to receive  confirm documents that were handed to you
 * Presentation only. Every custody change still goes through the same
 * i_track_retrieval_action checks in the database; nothing is decided here.
 */
(()=>{
'use strict';
const icon=(name)=>typeof window.ITRACK_ICON==='function'?window.ITRACK_ICON(name):'';
window.ITRACK_RETRIEVAL_VIEW=function(state,{esc,date,label,divisionStageLabel}){
 const data=state.retrievalData||{};
 const mine=state.session?.user?.id;
 const all=data.available||[];
 const myItems=data.my_batch_items||[];
 const turnovers=data.turnovers||[], turnoverItems=data.turnover_items||[];
 const districtQueue=data.district_queue||[], claims=data.claimable||[];
 const manageable=data.manageable_owners||[], recipients=data.district_recipients||[], accounts=data.claimant_accounts||[];
 const onSlip=new Set(turnoverItems.map(x=>x.item_id));
 // Documents I collected for someone else and still hold (not yet on a District turnover slip).
 const carrying=myItems.filter(x=>x.division_status==='retrieved_from_division'&&!onSlip.has(x.item_id));
 const withMeCount=carrying.length+turnovers.filter(v=>v.status==='prepared'&&v.retriever_id===mine).length;
 const receiveCount=claims.length+districtQueue.length;
 const tabs=[['division','At Division',all.length],['mine','With me',withMeCount],['receive','For me to receive',receiveCount]];
 const tab=tabs.some(x=>x[0]===state.retrievalTab)?state.retrievalTab:'division';
 const tabBar='<div class="rt-tabs" role="tablist" aria-label="Division Retrieval sections">'+tabs.map(([id,name,count])=>
  '<button type="button" role="tab" class="rt-tab'+(tab===id?' is-active':'')+'" aria-selected="'+(tab===id)+'" data-a="retrieval-tab" data-tab="'+id+'">'+
  esc(name)+'<span class="rt-tab-count'+(count&&id!=='division'?' is-due':'')+'">'+count+'</span></button>').join('')+'</div>';
 const select=(id,options,value)=>'<select id="'+id+'">'+options.map(o=>
  '<option value="'+esc(o[0])+'"'+(value===o[0]?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
 const meta=(x)=>[x.tracking_number,x.school_name||'District Office',x.transmittal_number].filter(Boolean).map(esc).join(' · ');
 // One checklist row: the whole line is the label, so tapping anywhere ticks the box.
 const pickRow=(x,cls,picked,note,disabled)=>
  '<label class="rt-item'+(disabled?' is-disabled':'')+'" data-retrieval-search="'+esc([x.tracking_number,x.document_label,x.school_name,x.transmittal_number].join(' ').toLowerCase())+'">'+
  '<input type="checkbox" class="retrieval-check '+cls+'" value="'+esc(x.item_id)+'"'+(picked?.has(x.item_id)?' checked':'')+(disabled?' disabled':'')+'>'+
  '<span class="rt-item-main"><strong>'+esc(x.document_label||'Document')+'</strong><small>'+meta(x)+'</small></span>'+
  (note?'<span class="rt-item-note">'+note+'</span>':'')+'</label>';
 const empty=(text)=>'<p class="empty">'+esc(text)+'</p>';

 /* ---------- 1. At Division ---------- */
 const scope=state.retrievalScope||'all', sort=state.retrievalOrder||'recent', trans=state.retrievalTransmittal||'';
 const q=(state.retrievalSearch||'').trim().toLowerCase();
 const rows=all.filter(x=>
  (scope==='all'||(scope==='mine'?x.owner_id===mine:x.owner_id!==mine))&&
  (!trans||x.transmittal_number===trans)&&
  (!q||[x.tracking_number,x.document_label,x.school_name,x.transmittal_number].join(' ').toLowerCase().includes(q))
 ).sort((a,b)=>
  sort==='transmittal'?String(a.transmittal_number||'').localeCompare(String(b.transmittal_number||''))||
     String(a.tracking_number||'').localeCompare(String(b.tracking_number||'')):
  sort==='id'?String(a.tracking_number||'').localeCompare(String(b.tracking_number||'')):
  new Date(b.submitted_at||0)-new Date(a.submitted_at||0)||
     String(b.tracking_number||'').localeCompare(String(a.tracking_number||'')));
 const transmittals=[...new Set(all.map(x=>x.transmittal_number).filter(Boolean))].sort();
 const recent=(state.retrievalRecent||[]).filter(id=>myItems.some(x=>x.item_id===id));
 const recentBanner=recent.length?'<div class="rt-done" role="status">'+
  '<div><strong>'+recent.length+' document'+(recent.length===1?'':'s')+' retrieved.</strong> '+
  '<span>Yours are already Completed. Documents for other people are now under <em>With me</em> until you hand them over.</span></div>'+
  '<div class="rt-done-actions"><button type="button" class="btn" data-a="retrieval-print-pickup" data-recent="1">'+icon('file')+'Print retrieval slip</button>'+
  '<button type="button" class="btn alt" data-a="retrieval-dismiss-recent">Done</button></div></div>':'';
 const ownerList=manageable.map(i=>'<div class="rt-owner"><div class="rt-item-main"><strong>'+esc(i.document_label)+'</strong>'+
   '<small>'+esc(i.tracking_number)+' · Current owner: '+esc(i.owner_name)+'</small></div>'+
   '<select id="retrieval-owner-'+esc(i.item_id)+'" aria-label="Select rightful owner of '+esc(i.tracking_number)+'">'+
    '<option value="">Choose owner</option>'+accounts.map(p=>'<option value="'+esc(p.id)+'"'+
     (i.owner_id===p.id?' selected':'')+'>'+esc(p.name||'Registered account')+' — '+esc(p.position||'')+'</option>').join('')+
   '</select><button class="btn tiny alt" data-a="retrieval-set-owner" data-id="'+esc(i.item_id)+'">Save Owner</button></div>').join('');
 const division=recentBanner+
  '<section class="panel rt-panel"><div class="rt-step"><span class="rt-step-no">1</span><div><h3>Tick the documents you collected</h3>'+
  '<p class="note">Only documents already marked Submitted to Division appear here. You may collect documents for other people.</p></div></div>'+
  '<div class="toolbar retrieval-search-bar"><input type="search" id="retrieval-search" placeholder="Search by tracking ID, title, school or transmittal" value="'+esc(state.retrievalSearch||'')+'">'+
  '<button class="btn alt" data-a="retrieval-check-visible">Select all shown</button>'+
  '<button class="btn alt" data-a="retrieval-clear">Clear</button></div>'+
  '<div class="toolbar retrieval-quick-filters">'+
   '<label>Show '+select('retrieval-scope',[['all','All documents'],['mine','My documents'],['others','Other owners']],scope)+'</label>'+
   '<label>Sort by '+select('retrieval-order',[['recent','Most recent'],['transmittal','Transmittal'],['id','Tracking ID']],sort)+'</label>'+
   '<label>Transmittal '+select('retrieval-transmittal',[['','All transmittals'],...transmittals.map(t=>[t,t])],trans)+'</label></div>'+
  '<p class="small muted rt-count">'+rows.length+' shown · '+all.length+' at Division</p>'+
  '<div id="retrieval-available-list" class="rt-list">'+(rows.map(x=>pickRow(x,'retrieval-pick',state.retrievalPicked,
    x.owner_id===mine?'<span class="tag" data-tone="good">Mine</span>':'<span class="tag" data-tone="neutral">Other owner</span>')).join('')||
    empty(all.length?'No documents match these filters.':'No documents are waiting at Division.'))+'</div>'+
  '<div class="rt-step rt-step-action"><span class="rt-step-no">2</span><div><h3>Confirm the pickup</h3>'+
  '<p class="note">Your own documents become Completed right away. Documents for others stay with you until you hand them over.</p></div>'+
  '<div class="rt-confirm"><span class="small muted" id="retrieval-pick-count">'+(state.retrievalPicked?.size||0)+' checked</span>'+
  '<button class="btn" id="retrieval-pickup-btn" data-a="retrieval-pickup"'+(!state.retrievalPicked?.size?' disabled':'')+'>Confirm Physical Retrieval</button></div></div></section>'+
  (manageable.length?'<details class="panel rt-panel"><summary><strong>Change the rightful owner of a document</strong><span class="small muted">Original sender or administrator</span></summary>'+
   '<p class="note">The rightful owner is the person who confirms final receipt. It is the original sender unless you choose someone else here.</p>'+ownerList+'</details>':'');

 /* ---------- 2. With me ---------- */
 const slipRows=turnovers.map(v=>{
  const docs=turnoverItems.filter(i=>i.turnover_id===v.id);
  const own=v.retriever_id===mine;
  return '<div class="rt-row"><div class="rt-item-main"><strong>'+esc(v.number)+' · '+docs.length+' document'+(docs.length===1?'':'s')+'</strong>'+
   '<small>To '+esc(v.recipient_name)+' · '+esc(date(v.created_at))+'</small></div>'+
   '<span class="tag" data-tone="'+(v.status==='prepared'?'warn':'info')+'">'+esc(v.status==='prepared'?'Not yet handed over':label(v.status))+'</span>'+
   '<div class="rt-row-actions"><button class="btn tiny alt" data-a="retrieval-print" data-id="'+esc(v.id)+'">Print</button>'+
   (v.status==='prepared'&&own?'<button class="btn tiny" data-a="retrieval-handoff" data-id="'+esc(v.id)+'">Confirm Physical Handoff</button>'+
    '<button class="btn tiny danger" data-a="retrieval-discard" data-id="'+esc(v.id)+'">Discard</button>':'')+'</div></div>';
 }).join('');
 const history=[...myItems].sort((a,b)=>new Date(b.retrieved_at||0)-new Date(a.retrieved_at||0));
 const withMe=
  '<section class="panel rt-panel"><h3>Documents I am carrying for others</h3>'+
  '<p class="note"><strong>Giving it straight to the owner?</strong> Just hand it over. The owner then presses <em>Document Received</em> on their own account, and it leaves this list.</p>'+
  (carrying.length?'<div class="rt-list">'+carrying.map(x=>pickRow(x,'retrieval-turnover-pick',state.retrievalTurnoverPicked,
     '<span class="tag" data-tone="warn">With me</span>')).join('')+'</div>'+
   '<div class="rt-handover"><h4>Leaving them at the District Office instead?</h4>'+
   '<p class="note">Tick the documents above, choose who receives them at District, and prepare one turnover slip.</p>'+
   '<div class="rt-handover-controls"><label class="retrieval-recipient">District receiving personnel'+
   '<select id="retrieval-district-recipient"><option value="">Choose recipient</option>'+
   recipients.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||'District personnel')+' — '+esc(p.position||'')+'</option>').join('')+
   '</select></label><span id="retrieval-turnover-count" class="small muted">'+state.retrievalTurnoverPicked.size+' checked</span>'+
   '<button class="btn" id="retrieval-prepare-btn" data-a="retrieval-prepare"'+(!state.retrievalTurnoverPicked.size?' disabled':'')+'>Prepare Turnover Slip</button></div></div>':
   empty('You are not carrying any documents for other people.'))+'</section>'+
  (turnovers.length?'<section class="panel rt-panel"><h3>District turnover slips</h3>'+
   '<p class="note">Printing does not change anything. Press Confirm Physical Handoff only after the documents are actually at District.</p>'+
   '<div class="rt-rows">'+slipRows+'</div></section>':'')+
  '<details class="panel rt-panel"><summary><strong>Print a retrieval slip again</strong><span class="small muted">'+history.length+' retrieved by you</span></summary>'+
  '<p class="note">Tick any documents you retrieved before. Printing never changes a document\'s status.</p>'+
  (history.length?'<div class="toolbar"><button type="button" class="btn tiny alt" data-a="retrieval-slip-my">Select mine</button>'+
   '<button type="button" class="btn tiny alt" data-a="retrieval-slip-others">Select other owners</button>'+
   '<button type="button" class="btn tiny alt" data-a="retrieval-slip-clear">Clear</button></div>'+
   '<div class="rt-list">'+history.map(x=>pickRow(x,'retrieval-slip-pick',state.retrievalSlipPicked,
     '<span class="tag" data-tone="'+(x.division_status==='received_by_sender'?'good':'warn')+'">'+
     esc(x.division_status==='received_by_sender'?'Completed':x.owner_id===mine?'Mine':'With me')+'</span>')).join('')+'</div>'+
   '<div class="rt-confirm"><span id="retrieval-slip-count" class="small muted">'+(state.retrievalSlipPicked?.size||0)+' checked</span>'+
   '<button type="button" class="btn" id="retrieval-slip-print-btn" data-a="retrieval-print-pickup"'+(!state.retrievalSlipPicked?.size?' disabled':'')+'>'+icon('file')+'Print retrieval slip</button></div>':
   empty('You have not retrieved any documents yet.'))+'</details>';

 /* ---------- 3. For me to receive ---------- */
 const claimRows=claims.map(x=>'<div class="rt-row"><div class="rt-item-main"><strong>'+esc(x.document_label||'Document')+'</strong>'+
   '<small>'+meta(x)+'</small></div><span class="tag" data-tone="warn">'+esc(divisionStageLabel(x.division_status))+'</span>'+
   '<div class="rt-row-actions"><button type="button" class="btn" data-a="retrieval-claim" data-id="'+esc(x.item_id)+'">'+icon('check')+'Document Received</button></div></div>').join('');
 const receive=
  '<section class="panel rt-panel"><h3>My documents brought back from Division</h3>'+
  '<p class="note">Press <strong>Document Received</strong> only when the paper document is actually in your hands. That completes it.</p>'+
  (claims.length?'<div class="rt-rows">'+claimRows+'</div>':empty('Nothing is waiting for you. Documents you retrieve yourself are completed automatically.'))+'</section>'+
  (districtQueue.length?'<section class="panel rt-panel"><h3>Handed to me at the District Office</h3>'+
   '<p class="note">Tick only the documents you actually received. The rightful owner still confirms final receipt afterwards.</p>'+
   '<div class="rt-list">'+districtQueue.map(x=>pickRow(x,'retrieval-district-pick',state.retrievalDistrictPicked,
     '<span class="tag" data-tone="warn">Awaiting acknowledgment</span>')).join('')+'</div>'+
   '<div class="rt-confirm"><span id="retrieval-district-count" class="small muted">'+state.retrievalDistrictPicked.size+' checked</span>'+
   '<button class="btn" id="retrieval-district-btn" data-a="retrieval-district-ack"'+(!state.retrievalDistrictPicked.size?' disabled':'')+'>Acknowledge Checked</button></div></section>':'');

 return '<div class="sectionhead"><div><div class="eyebrow">Physical document custody</div><h1>Division Retrieval</h1>'+
  '<p class="sub">Collect documents from Division, hand them over, and confirm what was returned to you.</p></div>'+
  '<button class="btn alt" data-a="retrieval-refresh">'+icon('refresh')+'Refresh</button></div>'+
  tabBar+'<div role="tabpanel">'+(tab==='division'?division:tab==='mine'?withMe:receive)+'</div>';
};
})();
