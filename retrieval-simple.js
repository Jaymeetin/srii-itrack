/* SRII i-TRACK: simplified Division pickup and optional printable retrieval slip. */
(()=>{
 'use strict';
 const oldView=window.ITRACK_RETRIEVAL_VIEW;
 if(typeof oldView!=='function')return;
 window.ITRACK_RETRIEVAL_VIEW=function(state,tools){
  const {esc,date,divisionStageLabel}=tools;
  const data=state.retrievalData||{}, all=data.available||[];
  const mine=state.session?.user?.id;
  const scope=state.retrievalScope||'all';
  const sort=state.retrievalOrder||'recent';
  const trans=state.retrievalTransmittal||'';
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
  const select=(id,options,value)=>'<select id="'+id+'">'+options.map(o=>
     '<option value="'+esc(o[0])+'"'+(value===o[0]?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
  const toolsHtml='<div class="toolbar retrieval-quick-filters">'+
   '<label>Documents '+select('retrieval-scope',[['all','All'],['mine','My Documents'],['others','Other Owners']],scope)+'</label>'+
   '<label>Sort '+select('retrieval-order',[['recent','Most Recent'],['transmittal','By Transmittal'],['id','Tracking ID']],sort)+'</label>'+
   '<label>Transmittal '+select('retrieval-transmittal',[['','All Transmittals'],...transmittals.map(t=>[t,t])],trans)+'</label></div>';
  const pickupRows=rows.map(x=>{
   const status=x.owner_id===mine?'Mine — completes automatically':'Other owner — with retriever';
   return '<tr class="retrieval-doc-row" data-retrieval-search="'+esc([x.tracking_number,x.document_label,x.school_name,x.transmittal_number].join(' ').toLowerCase())+'">'+
    '<td class="retrieval-check-cell"><input type="checkbox" class="retrieval-check retrieval-pick" value="'+esc(x.item_id)+'"'+(state.retrievalPicked?.has(x.item_id)?' checked':'')+'></td>'+
    '<td class="retrieval-tracking">'+esc(x.tracking_number||'')+'</td>'+
    '<td><strong class="retrieval-name">'+esc(x.document_label||'Document')+'</strong><small class="retrieval-extra">'+esc(x.transmittal_number||'')+'</small></td>'+
    '<td class="retrieval-school">'+esc(x.school_name||'District Office')+'</td>'+
    '<td class="retrieval-status">'+esc(status)+'</td></tr>';
  }).join('')||'<tr><td colspan="5" class="retrieval-empty">No documents match these filters.</td></tr>';
  const pickup='<section class="panel retrieval-panel"><div class="retrieval-panel-head"><h3>Documents at Division</h3>'+
   '<span class="small muted">'+rows.length+' shown · '+all.length+' available</span></div>'+
   '<div class="toolbar retrieval-search-bar"><input type="search" id="retrieval-search" placeholder="Search by tracking ID, title, school or transmittal" value="'+esc(state.retrievalSearch||'')+'">'+
   '<button class="btn tiny alt" data-a="retrieval-check-visible">Check Visible</button>'+
   '<button class="btn tiny alt" data-a="retrieval-clear">Clear</button></div>'+toolsHtml+
   '<p class="note">Check documents physically collected at Division. Your own documents become Completed automatically. Documents for others remain With Retriever until handed over.</p>'+
   '<div id="retrieval-available-list"><div class="retrieval-table-scroll"><table class="retrieval-table">'+
   '<thead><tr><th>✓</th><th>Tracking ID</th><th>Document / Transmittal</th><th>School</th><th>When retrieved</th></tr></thead>'+
   '<tbody>'+pickupRows+'</tbody></table></div></div>'+
   '<div class="retrieval-bottom-bar"><span class="small muted" id="retrieval-pick-count">'+(state.retrievalPicked?.size||0)+' checked</span>'+
   '<button class="btn" id="retrieval-pickup-btn" data-a="retrieval-pickup"'+(!state.retrievalPicked?.size?' disabled':'')+'>Confirm Physical Retrieval</button></div></section>';
  const slipItems=[...(data.my_batch_items||[])].sort((a,b)=>new Date(b.retrieved_at||0)-new Date(a.retrieved_at||0));
  const slipRows=slipItems.map(x=>
   '<label class="retrieval-slip-choice"><input type="checkbox" class="retrieval-check retrieval-slip-pick" value="'+esc(x.item_id)+'"'+(state.retrievalSlipPicked?.has(x.item_id)?' checked':'')+'>'+
   '<span><strong>'+esc(x.tracking_number||'')+'</strong> · '+esc(x.document_label||'Document')+
   '<small>'+esc(x.transmittal_number||'')+' · '+(x.owner_id===mine?'My document':'Other owner')+
   ' · '+esc(x.division_status==='received_by_sender'?'Completed':divisionStageLabel(x.division_status))+'</small></span></label>'
  ).join('')||'<p class="note">You have no recorded retrievals yet.</p>';
  const slip='<details class="panel retrieval-panel retrieval-optional"><summary><strong>Optional: Print a Retrieval Slip</strong><span class="small muted">Not required to finish retrieval</span></summary>'+
   '<p class="note">Select any previously retrieved documents, including completed documents you own. Leave yours unchecked to exclude them. Printing never changes document status.</p>'+
   '<div class="toolbar"><button type="button" class="btn tiny alt" data-a="retrieval-slip-my">Select My Documents</button>'+
   '<button type="button" class="btn tiny alt" data-a="retrieval-slip-others">Select Other Documents</button>'+
   '<button type="button" class="btn tiny alt" data-a="retrieval-slip-clear">Clear Selection</button></div>'+
   '<div class="retrieval-slip-pick-list">'+slipRows+'</div>'+
   '<div class="retrieval-bottom-bar"><span id="retrieval-slip-count" class="small muted">'+(state.retrievalSlipPicked?.size||0)+' selected</span>'+
   '<button type="button" class="btn" id="retrieval-slip-print-btn" data-a="retrieval-print-pickup"'+(!state.retrievalSlipPicked?.size?' disabled':'')+'>Print Selected Retrieval Slip</button></div></details>';
  const legacy=oldView(state,tools);
  const advancedStart=legacy.indexOf('<div class="panel retrieval-panel"><div class="retrieval-panel-head"><h3>2. My Retrieval Batches</h3>');
  const advanced=advancedStart===-1?'':legacy.slice(advancedStart);
  return '<div class="sectionhead"><div><div class="eyebrow">Physical document custody</div><h1>Division Retrieval</h1>'+
   '<p class="sub">All submitted documents in one searchable list. Print a retrieval slip only if needed.</p></div>'+
   '<button class="btn alt" data-a="retrieval-refresh">Refresh</button></div>'+
   pickup+slip+
   (advanced?'<details class="panel retrieval-panel retrieval-advanced"><summary><strong>Advanced: District Handoffs & Final Receipt</strong><span class="small muted">Open only if needed</span></summary>'+
    '<p class="note">Use this section only for physical transfers to District or confirmation by someone else. Turnover records are separate from optional retrieval slips.</p>'+
    advanced+'</details>':'');
 };
})();