/* SRII i-TRACK School-to-District transmittals: the same three steps as Division.
 *   1 Choose documents   2 Print the slip   3 Confirm submitted to District
 * Presentation only; every change still goes through i_track_district_action.
 */
(()=>{
'use strict';
const icon=(name)=>typeof window.ITRACK_ICON==='function'?window.ITRACK_ICON(name):'';
window.ITRACK_DISTRICT_VIEW=function(state,{esc,date,label}){
 const data=state.districtData||{},schools=(state.schools||[]).filter(x=>x.is_active);
 const mine=state.profile?.id;
 const admin=['main_admin','backup_admin'].includes(state.profile?.role);
 const schoolId=state.districtSchoolId||state.profile?.school_id||schools[0]?.id;
 const school=schools.find(s=>s.id===schoolId);
 const eligible=(data.eligible||[]).filter(d=>d.school_id===schoolId);
 const trans=data.transmittals||[],items=data.items||[],claims=data.claimable||[];
 const selectedId=trans.some(x=>x.id===state.districtSelected)?state.districtSelected:trans[0]?.id;
 const chosen=trans.find(x=>x.id===selectedId);
 const creating=state.districtNew||!trans.length;
 const current=items.filter(i=>i.transmittal_id===selectedId&&i.item_status!=='cancelled');
 const draft=current.filter(i=>i.item_status==='in_transmittal');
 const pending=current.filter(i=>i.item_status==='submitted_for_return');
 const stageLabel={in_transmittal:'Not yet submitted',submitted_for_return:'At District · For Return',
  ready_for_owner:'Back from District · Ready for Owner',filed_at_district:'Completed · Filed at District',
  received_by_owner:'Completed · Returned to Owner'};
 const stageTone={in_transmittal:'warn',submitted_for_return:'info',ready_for_owner:'warn',filed_at_district:'good',received_by_owner:'good'};
 const empty=text=>'<p class="empty">'+esc(text)+'</p>';
 const pickRow=(d,cls,picked,note)=>'<label class="rt-item"><input type="checkbox" class="'+cls+'" value="'+esc(d.id)+'"'+
  (picked.has(d.id)?' checked':'')+' aria-label="Select '+esc(d.document_label||d.subject)+'">'+
  '<span class="rt-item-main"><strong>'+esc(d.document_label||d.subject)+'</strong><small>'+esc(d.tracking_number)+' · '+
  (d.return_required?'For Return':'No Return')+'</small></span>'+(note||'')+'</label>';
 const step=(no,title,hint,body,open,done)=>'<details class="panel rt-panel rt-stepcard'+(done?' is-done':'')+'"'+(open?' open':'')+'>'+
  '<summary><span class="rt-step-no">'+(done?icon('check'):no)+'</span><span class="rt-step-title"><strong>'+title+'</strong><small>'+hint+'</small></span></summary>'+
  '<div class="rt-step-body">'+body+'</div></details>';

 /* documents waiting for the signed-in owner come first: they need one tap */
 const claimPanel=claims.length?'<section class="panel rt-panel"><h3>Returned from District: for me to receive</h3>'+
  '<p class="note">Press <strong>Confirm Final Receipt</strong> only when the paper document is in your hands.</p>'+
  '<div class="rt-rows">'+claims.map(i=>'<div class="rt-row"><div class="rt-item-main"><strong>'+esc(i.document_label)+'</strong><small>'+
   esc(i.tracking_number)+' · '+esc(i.transmittal_number)+'</small></div>'+
   '<div class="rt-row-actions"><button class="btn" data-a="district-claim" data-id="'+esc(i.id)+'">'+icon('check')+'Confirm Final Receipt</button></div></div>').join('')+'</div></section>':'';

 const count=id=>items.filter(i=>i.transmittal_id===id&&i.item_status!=='cancelled').length;
 const myList='<section class="panel rt-panel"><div class="panel-head"><h3>My District transmittals</h3>'+
  '<button class="btn'+(creating?' alt':'')+'" data-a="district-new">+ New Transmittal</button></div>'+
  (trans.length?'<div class="rt-list">'+trans.map(t=>{const n=count(t.id);
   return '<button type="button" class="rt-item rt-pick'+(!creating&&t.id===selectedId?' is-current':'')+'" data-a="district-open" data-id="'+esc(t.id)+'">'+
    '<span class="rt-item-main"><strong>'+esc(t.number)+'</strong><small>'+esc(t.school_name)+' · '+n+' document'+(n===1?'':'s')+' · '+esc(date(t.created_at))+'</small></span>'+
    '<span class="tag" data-tone="'+(t.status==='draft'?'warn':'info')+'">'+esc(label(t.status))+'</span>'+
    '<span class="compact-doc-arrow" aria-hidden="true">'+icon('chevronRight')+'</span></button>';}).join('')+'</div>':
   empty('No transmittal yet. Start with step 1 below.'))+'</section>';

 const defaultAddress=school?.postal_address||((school?.name||'School')+', San Remigio, Antique');
 const createForm='<p class="note">Choose the school, then tick its District-bound documents. No Return documents complete automatically once submission is confirmed.</p>'+
  '<div class="field"><label for="district-school">Originating School</label><select id="district-school">'+
  schools.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===schoolId?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></div>'+
  '<div class="rt-list">'+(eligible.map(d=>pickRow(d,'district-eligible-pick',state.districtPicked)).join('')||empty('No District-bound documents for this school.'))+'</div>'+
  '<div class="field rt-reassign"><label for="district-address">School Address (printed in footer)</label>'+
  '<input id="district-address" value="'+esc(defaultAddress)+'" maxlength="250">'+
  '<p class="small muted">The school name is always included. Add the barangay or exact address if needed.</p></div>'+
  '<div class="rt-confirm"><span class="small muted" id="district-pick-count">'+state.districtPicked.size+' selected</span>'+
  '<button class="btn" data-a="district-create" id="district-create-btn"'+(!state.districtPicked.size?' disabled':'')+'>Create School Transmittal</button></div>';

 let body;
 if(creating){
  body=step(1,'Choose documents','Pick the school and what goes to the District Office',createForm,true,false)+
   step(2,'Print the slip','Available after the transmittal is created','<p class="note">Create the transmittal first.</p>',false,false)+
   step(3,'Confirm submitted to District','Available after the transmittal is created','<p class="note">Create the transmittal first.</p>',false,false);
 }else{
  const canManage=chosen.prepared_by===mine||admin;
  const docRows=current.map(i=>'<div class="rt-row"><div class="rt-item-main"><strong>'+esc(i.document_label)+'</strong><small>'+
   esc(i.tracking_number)+' · '+(i.return_required?'For Return':'No Return')+' · Owner: '+esc(i.owner_name||'Original sender')+'</small></div>'+
   '<span class="tag" data-tone="'+(stageTone[i.item_status]||'neutral')+'">'+esc(stageLabel[i.item_status]||label(i.item_status))+'</span>'+
   '<div class="rt-row-actions">'+
   (i.item_status==='submitted_for_return'&&canManage?'<button class="btn tiny" data-a="district-ready" data-id="'+esc(i.id)+'">Ready for Owner</button>':'')+
   (['in_transmittal','submitted_for_return','ready_for_owner'].includes(i.item_status)&&canManage?'<button class="btn tiny alt" data-a="district-assign-owner" data-id="'+esc(i.id)+'">Set Rightful Owner</button>':'')+
   (i.item_status==='in_transmittal'&&chosen.prepared_by===mine?'<button class="btn tiny danger" data-a="district-cancel-item" data-id="'+esc(i.id)+'">Remove</button>':'')+
   '</div></div>').join('');
  const step1=current.length?'<div class="rt-rows">'+docRows+'</div>'+
    (pending.length?'<p class="note rt-after">When a document is physically back from District, press <strong>Ready for Owner</strong>. The rightful owner then confirms final receipt.</p>':''):
   empty('No active documents in this transmittal.');
  const step2='<p class="note">One A4 slip signed by the preparer, up to 20 documents per page. Printing never changes a document\'s status.</p>'+
   '<div class="rt-facts"><div><small>Signed by</small><strong>'+esc(chosen.signer_name)+'</strong><span>'+esc(chosen.signer_position)+'</span></div>'+
   '<div><small>School</small><strong>'+esc(chosen.school_name)+'</strong><span>'+current.length+' active document'+(current.length===1?'':'s')+'</span></div></div>'+
   '<div class="rt-confirm rt-confirm-start"><button class="btn" data-a="district-print" data-id="'+esc(chosen.id)+'">'+icon('file')+'Print Transmittal Slip</button></div>';
  const step3=draft.length?'<p class="note">Tick the documents actually handed to the District Office, then confirm. Each receiver signs beside the document on the printed slip.</p>'+
    '<div class="rt-list">'+draft.map(d=>pickRow(d,'district-submit-pick',state.districtSubmitPicked)).join('')+'</div>'+
    '<div class="rt-handover-controls rt-after"><label class="retrieval-recipient">Actual Submission Date<input id="district-actual-date" type="date" value="'+
    new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10)+'"></label>'+
    '<span class="small muted" id="district-submit-count">'+state.districtSubmitPicked.size+' selected</span>'+
    '<button class="btn" data-a="district-submit" id="district-submit-btn"'+(!state.districtSubmitPicked.size?' disabled':'')+'>Confirm Submitted to District</button></div>':
   '<div class="notice">Every document on this transmittal has been submitted to District. Their progress is shown in step 1.</div>';
  body='<div class="rt-current"><div><span class="small muted">Selected transmittal</span><strong>'+esc(chosen.number)+'</strong></div>'+
    '<span class="tag" data-tone="'+(chosen.status==='draft'?'warn':'info')+'">'+esc(label(chosen.status))+'</span></div>'+
   step(1,'Documents',current.length+' document'+(current.length===1?'':'s')+' · status and actions',step1,true,current.length>0&&!draft.length)+
   step(2,'Print the slip','Signed by the preparing user',step2,current.length>0,false)+
   step(3,'Confirm submitted to District',draft.length?draft.length+' waiting to be handed over':'All submitted',step3,draft.length>0,!draft.length);
 }
 return '<div class="sectionhead"><div><div class="eyebrow">School Documents · District Office</div>'+
  '<h1>District Transmittals</h1><p class="sub">Three steps: choose the documents, print the slip, then confirm they were handed to the District Office.</p></div></div>'+
  claimPanel+myList+body;
};
})();
