/* SRII i-TRACK Division Retrieval v5 — compact rows, existing document IDs. */
(()=>{
'use strict';
window.ITRACK_RETRIEVAL_VIEW=function(state,{esc,date,label,divisionStageLabel}){
 const data=state.retrievalData||{};
 const available=data.available||[], batches=data.my_batches||[], myItems=data.my_batch_items||[];
 const turnovers=data.turnovers||[], turnoverItems=data.turnover_items||[];
 const district=data.district_queue||[], claims=data.claimable||[];
 const manageable=data.manageable_owners||[], recipients=data.district_recipients||[], users=data.claimant_accounts||[];
 const activeTurnoverItems=new Set(turnoverItems.map(x=>x.item_id));
 const eligibility=new Set(myItems.filter(x=>x.division_status==='retrieved_from_division'&&!activeTurnoverItems.has(x.item_id)).map(x=>x.item_id));
 function docRow(i,kind,selected=new Set(),disabled=false){
  const name=esc(i.document_label||'Document');
  const tracking=esc(i.tracking_number||'');
  const status=i.division_status||'submitted_to_division';
  const srch=esc([i.document_label,i.tracking_number,i.school_name,i.transmittal_number].join(' ').toLowerCase());
  return '<tr class="retrieval-doc-row" data-retrieval-search="'+srch+'">'+
   '<td class="retrieval-check-cell"><input class="retrieval-check '+kind+'" type="checkbox" value="'+esc(i.item_id)+'"'+
     (selected.has(i.item_id)?' checked':'')+(disabled?' disabled':'')+' aria-label="Select '+name+'"></td>'+
   '<td class="retrieval-tracking" title="'+tracking+'">'+tracking+'</td>'+
   '<td title="'+name+'"><strong class="retrieval-name">'+name+'</strong></td>'+
   '<td class="retrieval-school" title="'+esc(i.school_name||'')+'">'+esc(i.school_name||'District Office')+'</td>'+
   '<td class="retrieval-status" title="'+esc(divisionStageLabel(status))+'">'+esc(divisionStageLabel(status))+'</td></tr>';
 }
 function table(rows,kind,selected=new Set(),disabled=new Set()){
  return '<div class="retrieval-table-scroll"><table class="retrieval-table"><thead><tr><th class="retrieval-check-cell">✓</th>'+
   '<th>Tracking ID</th><th>Document</th><th class="retrieval-school">School</th><th class="retrieval-status">Status</th></tr></thead>'+
   '<tbody>'+(rows.length?rows.map(i=>docRow(i,kind,selected,disabled.has(i.item_id))).join(''):
    '<tr><td class="retrieval-empty" colspan="5">No documents to display.</td></tr>')+'</tbody></table></div>';
 }
 const batchesMarkup=batches.map(b=>{
  const list=myItems.filter(i=>i.batch_id===b.id);
  const selectable=list.filter(i=>eligibility.has(i.item_id)).length;
  return '<details class="retrieval-batch"'+(selectable?' open':'')+'><summary><strong>'+esc(b.number)+'</strong>'+
   '<span class="small muted">'+list.length+' document(s) · '+esc(date(b.created_at))+' · '+selectable+' ready for turnover</span></summary>'+
   table(list,'retrieval-turnover-pick',state.retrievalTurnoverPicked,
    new Set(list.filter(i=>!eligibility.has(i.item_id)).map(i=>i.item_id)))+'</details>';
 }).join('')||'<p class="note">No retrieval batches yet. Select and confirm physical pickup above.</p>';
 const turns=turnovers.map(v=>{
  const docs=turnoverItems.filter(i=>i.turnover_id===v.id);
  const own=v.retriever_id===state.session?.user?.id;
  return '<div class="retrieval-slip-row"><div><strong>'+esc(v.number)+'</strong> · <span class="small muted">'+
   esc(label(v.status))+' · '+docs.length+' documents</span>'+
   '<div class="small muted">Retriever: '+esc(v.retriever_name)+' · District: '+esc(v.recipient_name)+
   ' · '+esc(date(v.created_at))+'</div></div><div class="retrieval-slip-buttons">'+
   '<button class="btn tiny alt" data-a="retrieval-print" data-id="'+esc(v.id)+'">Print Slip</button>'+
   (v.status==='prepared'&&own?'<button class="btn tiny" data-a="retrieval-handoff" data-id="'+esc(v.id)+'">Confirm Physical Handoff</button>'+
    '<button class="btn tiny danger" data-a="retrieval-discard" data-id="'+esc(v.id)+'">Discard Draft</button>':'')+'</div></div>';
 }).join('')||'<p class="note">No turnover slips yet. Print a slip before handing documents to District.</p>';
 const claiming=claims.map(i=>'<div class="retrieval-claim-row"><span class="retrieval-tracking">'+esc(i.tracking_number||'')+'</span>'+
   '<strong class="retrieval-name">'+esc(i.document_label||'Document')+'</strong>'+
   '<button class="btn tiny" data-a="retrieval-claim" data-id="'+esc(i.item_id)+'">'+
   (i.division_status==='retrieved_from_division'?'Claim My Document':'Confirm Final Receipt')+'</button></div>').join('')||
   '<p class="note">No documents are waiting for your final receipt.</p>';
 const ownerList=manageable.map(i=>'<div class="retrieval-owner-row"><div><strong>'+esc(i.tracking_number)+'</strong>'+
   '<div class="small muted">'+esc(i.document_label)+' · Current: '+esc(i.owner_name)+'</div></div>'+
   '<select id="retrieval-owner-'+esc(i.item_id)+'" aria-label="Select rightful owner of '+esc(i.tracking_number)+'">'+
    '<option value="">Choose owner</option>'+users.map(p=>'<option value="'+esc(p.id)+'"'+
     (i.owner_id===p.id?' selected':'')+'>'+esc(p.name||'Registered account')+' — '+esc(p.position||'')+'</option>').join('')+
   '</select><button class="btn tiny alt" data-a="retrieval-set-owner" data-id="'+esc(i.item_id)+'">Save Owner</button></div>').join('')||
   '<p class="note">No documents available for rightful-owner assignment.</p>';
 return '<div class="sectionhead"><div><div class="eyebrow">Physical document custody</div><h1>Division Retrieval</h1>'+
  '<p class="sub">One line per document. Every pickup, turnover and final claim stays connected to the original tracking ID.</p></div>'+
  '<button class="btn alt" data-a="retrieval-refresh">Refresh</button></div>'+
  '<div class="panel retrieval-panel"><div class="retrieval-panel-head"><h3>1. Retrieve from Division</h3>'+
  '<span class="small muted">'+available.length+' at Division</span></div>'+
  '<div class="toolbar retrieval-search-bar"><input type="search" id="retrieval-search" placeholder="Search tracking ID, document, or school" value="'+esc(state.retrievalSearch||'')+'">'+
  '<button class="btn tiny alt" data-a="retrieval-check-visible">Check Visible</button>'+
  '<button class="btn tiny alt" data-a="retrieval-clear">Clear</button></div>'+
  '<p class="note">Check only documents physically handed to you. You can collect documents from multiple original transmittals.</p>'+
  '<div id="retrieval-available-list">'+table(available,'retrieval-pick',state.retrievalPicked)+'</div>'+
  '<div class="retrieval-bottom-bar"><span id="retrieval-pick-count" class="small muted">'+state.retrievalPicked.size+' checked</span>'+
  '<button class="btn" id="retrieval-pickup-btn" data-a="retrieval-pickup"'+(!state.retrievalPicked.size?' disabled':'')+'>Retrieve Selected</button></div></div>'+
  '<div class="panel retrieval-panel"><div class="retrieval-panel-head"><h3>2. My Retrieval Batches</h3>'+
  '<span class="small muted">'+batches.length+' batch(es)</span></div>'+
  '<p class="note">Check collected documents for District handoff; the official slip prints up to 20 rows per A4 page.</p>'+
  batchesMarkup+'<div class="retrieval-bottom-bar"><label class="retrieval-recipient">District receiving personnel'+
  '<select id="retrieval-district-recipient"><option value="">Choose recipient</option>'+
  recipients.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||'District personnel')+' — '+esc(p.position||'')+'</option>').join('')+
  '</select></label><span id="retrieval-turnover-count" class="small muted">'+state.retrievalTurnoverPicked.size+' checked</span>'+
  '<button class="btn" id="retrieval-prepare-btn" data-a="retrieval-prepare"'+(!eligibility.size?' disabled':'')+'>Prepare Turnover Slip</button></div></div>'+
  '<div class="panel retrieval-panel"><h3>3. Turnover Slips</h3><p class="note">Print before handoff. Printing does not change custody; confirm physical handoff afterward.</p>'+
  turns+'</div>'+
  '<div class="panel retrieval-panel"><div class="retrieval-panel-head"><h3>4. District Receiving</h3>'+
  '<span class="small muted">'+district.length+' awaiting acknowledgment</span></div>'+
  '<p class="note">Only the assigned District recipient can check and acknowledge the documents actually received. Partial receipt is supported.</p>'+
  table(district,'retrieval-district-pick',state.retrievalDistrictPicked)+
  '<div class="retrieval-bottom-bar"><span id="retrieval-district-count" class="small muted">'+state.retrievalDistrictPicked.size+' checked</span>'+
  '<button class="btn" id="retrieval-district-btn" data-a="retrieval-district-ack"'+(!state.retrievalDistrictPicked.size?' disabled':'')+'>Acknowledge Checked</button></div></div>'+
  '<div class="panel retrieval-panel"><h3>5. My Documents for Final Receipt</h3>'+
  '<p class="note">Only the designated rightful owner can complete a document. Default owner is the original sender. Collection by someone else never completes it.</p>'+
  '<div class="retrieval-claim-list">'+claiming+'</div></div>'+
  '<details class="panel retrieval-owners"><summary><strong>Designate / Change Rightful Owner</strong> <span class="small muted">(Original sender or administrator)</span></summary>'+
  '<p class="note">Select an approved registered account before the final receipt. Original sender is the default when none is designated.</p>'+ownerList+'</details>';
};
})();
