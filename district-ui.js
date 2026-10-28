/* SRII i-TRACK School-to-District transmittal, compact one-line checklist. */
(()=>{
'use strict';
window.ITRACK_DISTRICT_VIEW=function(state,{esc,date,label}){
 const data=state.districtData||{},schools=(state.schools||[]).filter(x=>x.is_active);
 const schoolId=state.districtSchoolId||state.profile?.school_id||schools[0]?.id;
 const school=schools.find(s=>s.id===schoolId);
 const eligible=(data.eligible||[]).filter(d=>d.school_id===schoolId);
 const trans=data.transmittals||[],items=data.items||[],people=data.people||[];
 const selectedId=trans.some(x=>x.id===state.districtSelected)?state.districtSelected:trans[0]?.id;
 const chosen=trans.find(x=>x.id===selectedId);
 const current=items.filter(i=>i.transmittal_id===selectedId&&i.item_status!=='cancelled');
 const draft=current.filter(i=>i.item_status==='in_transmittal');
 const pending=current.filter(i=>i.item_status==='submitted_for_return');
 const completed=current.filter(i=>i.item_status==='filed_at_district'||i.item_status==='received_by_owner');
 const schoolOpts=schools.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===schoolId?' selected':'')+'>'+esc(s.name)+'</option>').join('');
 function listing(list,checkboxClass,selection,showStatus=true){
  return '<div class="district-list-scroll"><table class="district-list"><thead><tr>'+
   '<th class="district-check-col">✓</th><th>Tracking ID</th><th>Document Name</th>'+
   '<th class="district-return-col">Completion Rule</th>'+(showStatus?'<th class="district-status-col">Status</th>':'')+
   '</tr></thead><tbody>'+
   (list.map(d=>'<tr><td class="district-check-col"><input class="'+checkboxClass+'" type="checkbox" value="'+esc(d.id)+'"'+
     (selection.has(d.id)?' checked':'')+' aria-label="Select '+esc(d.document_label||d.subject)+'"></td>'+
    '<td class="district-tracking">'+esc(d.tracking_number)+'</td><td class="district-name" title="'+esc(d.document_label||d.subject)+'">'+
    '<strong>'+esc(d.document_label||d.subject)+'</strong></td>'+
    '<td class="district-return-col">'+(d.return_required?'For Return':'No Return')+'</td>'+
    (showStatus?'<td class="district-status-col">'+esc(label(d.item_status||'Ready'))+'</td>':'')+
    '</tr>').join('')||'<tr><td colspan="5" class="district-empty">No documents in this section.</td></tr>')+
   '</tbody></table></div>';
 }
 const options=(data.transmittals||[]).map(t=>'<option value="'+esc(t.id)+'"'+(t.id===selectedId?' selected':'')+'>'+esc(t.number)+' · '+esc(t.school_name)+'</option>').join('');
 const actions=current.map(i=>'<div class="district-action-row"><div><strong>'+esc(i.tracking_number)+'</strong>'+
  ' · '+esc(i.document_label)+'<div class="small muted">'+esc(label(i.item_status))+
  ' · '+(i.return_required?'For Return':'No Return')+
  ' · Owner: '+esc(i.owner_name||'Original sender')+'</div></div><div class="district-action-buttons">'+
  (i.item_status==='in_transmittal'&&chosen?.prepared_by===state.profile.id?
   '<button class="btn tiny danger" data-a="district-cancel-item" data-id="'+esc(i.id)+'">Remove Draft</button>':'')+
  (i.item_status==='submitted_for_return'&&(chosen?.prepared_by===state.profile.id||['main_admin','backup_admin'].includes(state.profile.role))?
   '<button class="btn tiny alt" data-a="district-ready" data-id="'+esc(i.id)+'">Ready for Owner</button>':'')+
  ((i.item_status==='in_transmittal'||i.item_status==='submitted_for_return'||i.item_status==='ready_for_owner')&&
    (chosen?.prepared_by===state.profile.id||['main_admin','backup_admin'].includes(state.profile.role))?
   '<button class="btn tiny alt" data-a="district-assign-owner" data-id="'+esc(i.id)+'">Set Rightful Owner</button>':'')+
  '</div></div>').join('');
 const claims=(data.claimable||[]).map(i=>'<div class="district-action-row"><div><strong>'+
  esc(i.tracking_number)+'</strong> · '+esc(i.document_label)+'<div class="small muted">'+
  esc(i.transmittal_number)+'</div></div><button class="btn tiny" data-a="district-claim" data-id="'+esc(i.id)+'">Confirm Final Receipt</button></div>').join('')||
  '<p class="note">There are no District documents waiting for your final receipt.</p>';
 const defaultAddress=school?.postal_address||((school?.name||'School')+', San Remigio, Antique');
 return '<div class="sectionhead"><div><div class="eyebrow">School Documents · District Office</div>'+
  '<h1>District Transmittals</h1><p class="sub">One document per line. Print one transmittal signed by the preparing user.</p></div>'+
  '<button class="btn alt" data-a="district-refresh">Refresh</button></div>'+
  '<div class="panel"><h3>1. Prepare School Transmittal</h3>'+
  '<p class="note">Select a school, then check District-bound documents belonging to that school. No Return documents complete automatically upon confirmed submission.</p>'+
  '<div class="field"><label for="district-school">Originating School</label>'+
  '<select id="district-school">'+schoolOpts+'</select></div>'+
  '<div class="field"><label for="district-address">School Address (printed in footer)</label>'+
  '<input id="district-address" value="'+esc(defaultAddress)+'" maxlength="250">'+
  '<p class="small muted">The school name is always included. Add the barangay or exact school address if needed.</p></div>'+
  listing(eligible,'district-eligible-pick',state.districtPicked,false)+
  '<div class="district-bottom"><span class="small muted" id="district-pick-count">'+state.districtPicked.size+' selected</span>'+
  '<button class="btn" data-a="district-create" id="district-create-btn"'+(!state.districtPicked.size?' disabled':'')+'>Create School Transmittal</button></div></div>'+
  '<div class="panel"><h3>2. My District Transmittals</h3>'+
  '<div class="field"><label for="district-current">Select Transmittal</label><select id="district-current"><option value="">Choose transmittal</option>'+
  options+'</select></div>'+
  (chosen?'<p class="small muted"><strong>'+esc(chosen.number)+'</strong> · '+esc(chosen.school_name)+
   ' · '+esc(label(chosen.status))+' · '+esc(date(chosen.created_at))+'</p>'+
   '<p class="small muted">Signatory: <strong>'+esc(chosen.signer_name)+'</strong>, '+esc(chosen.signer_position)+'</p>'+
   '<div class="district-bottom"><button class="btn alt" data-a="district-print" data-id="'+esc(chosen.id)+'">Print / Save A4 PDF</button>'+
   '<span class="small muted">'+current.length+' active document(s) · Up to 20 per page</span></div>'+
   '<h4 style="margin-top:14px">Awaiting Physical Submission ('+draft.length+')</h4>'+
   listing(draft,'district-submit-pick',state.districtSubmitPicked)+
   '<div class="district-bottom"><label>Actual Submission Date <input id="district-actual-date" type="date" value="'+
   new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10)+'"></label>'+
   '<span class="small muted" id="district-submit-count">'+state.districtSubmitPicked.size+' selected</span>'+
   '<button class="btn" data-a="district-submit" id="district-submit-btn"'+(!draft.length?' disabled':'')+'>Confirm Submitted to District</button></div>'+
   '<p class="note">This is the preparer\'s recorded confirmation of actual physical submission. Each receiver signs beside the corresponding document on the printed slip.</p>'+
   (pending.length?'<h4>Expected to Return ('+pending.length+')</h4><p class="note">When a document is physically back from District, use Ready for Owner. The rightful owner then confirms final receipt.</p>':'')+
   '<h4>Document Status and Actions</h4>'+actions+
   (completed.length?'<p class="small muted">'+completed.length+' already completed document(s) in this transmittal.</p>':'')
   :'<p class="note">No school-to-District transmittal yet. Create one using the checklist above.</p>')+
  '</div>'+
  '<div class="panel"><h3>3. My District Documents Ready for Final Receipt</h3>'+
  '<p class="note">Only the designated rightful owner can confirm physical receipt of a document returned from District.</p>'+
  claims+'</div>';
};
})();
