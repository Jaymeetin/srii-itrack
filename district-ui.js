/* SRII i-TRACK School-to-District transmittals, guided one step at a time:
 *   1 Choose documents   2 Print the slip   3 Hand over
 * Documents start included; tapping one leaves it out. Presentation only;
 * every change still goes through i_track_district_action.
 */
(()=>{
'use strict';
const icon=(name)=>typeof window.ITRACK_ICON==='function'?window.ITRACK_ICON(name):'';
window.ITRACK_DISTRICT_VIEW=function(state,{esc,date,label}){
 const data=state.districtData||{},schools=(state.schools||[]).filter(x=>x.is_active);
 const mine=state.profile?.id;
 const admin=['main_admin','backup_admin'].includes(state.profile?.role);
 // Default to my own school, or else the first school that has documents waiting.
 const withDocs=[...new Set((data.eligible||[]).map(d=>d.school_id))];
 const ownSchool=schools.find(s=>s.id===state.profile?.school_id)?.id;
 const schoolId=schools.some(s=>s.id===state.districtSchoolId)?state.districtSchoolId:
  (ownSchool&&(withDocs.includes(ownSchool)||!withDocs.length)?ownSchool:withDocs.find(id=>schools.some(s=>s.id===id))||ownSchool||schools[0]?.id);
 const chooseSchool=admin||withDocs.some(id=>id!==ownSchool);
 state.districtSchoolId=schoolId;
 const school=schools.find(s=>s.id===schoolId);
 const eligible=(data.eligible||[]).filter(d=>d.school_id===schoolId);
 const trans=data.transmittals||[],items=data.items||[],claims=data.claimable||[];
 const selectedId=trans.some(x=>x.id===state.districtSelected)?state.districtSelected:trans[0]?.id;
 const chosen=trans.find(x=>x.id===selectedId);
 const creating=state.districtNew||!trans.length;
 const current=items.filter(i=>i.transmittal_id===selectedId&&i.item_status!=='cancelled');
 const draft=current.filter(i=>i.item_status==='in_transmittal');
 const pending=current.filter(i=>i.item_status==='submitted_for_return');
 const plural=(n,word)=>n+' '+word+(n===1?'':'s');
 const today=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
 const stageLabel={in_transmittal:'Not yet handed over',submitted_for_return:'At District · For Return',
  ready_for_owner:'Back from District · Ready for Owner',filed_at_district:'Completed · Filed at District',
  received_by_owner:'Completed · Returned to Owner'};
 const stageTone={in_transmittal:'warn',submitted_for_return:'info',ready_for_owner:'warn',filed_at_district:'good',received_by_owner:'good'};
 const tag=s=>'<span class="tag" data-tone="'+(stageTone[s]||'neutral')+'">'+esc(stageLabel[s]||label(s))+'</span>';

 // Everything starts included; the sets are refilled whenever the list itself changes.
 const createKey=schoolId+':'+eligible.map(d=>d.id).join(',');
 if(state.districtPickKey!==createKey){state.districtPicked=new Set(eligible.map(d=>d.id));state.districtPickKey=createKey;}
 const submitKey=selectedId+':'+draft.map(d=>d.id).join(',');
 if(state.districtSubmitKey!==submitKey){state.districtSubmitPicked=new Set(draft.map(d=>d.id));state.districtSubmitKey=submitKey;}

 const pickCard=(d,cls,picked)=>'<label class="pick-card"><input type="checkbox" class="'+cls+'" value="'+esc(d.id)+'"'+(picked.has(d.id)?' checked':'')+'>'+
  '<span class="pick-tick" aria-hidden="true">'+icon('check')+'</span>'+
  '<span class="pick-main"><strong>'+esc(d.document_label||d.subject)+'</strong><small>'+esc(d.tracking_number)+' · '+
  (d.return_required?'For Return':'No Return, completes once handed over')+'</small></span></label>';
 const pickBar=(countId,on,total,scope)=>'<div class="pick-toolbar"><span id="'+countId+'">'+on+' of '+total+' included</span>'+
  '<span class="pick-toolbar-links"><button type="button" class="link-button" data-a="pick-all" data-scope="'+scope+'">Include all</button>'+
  '<button type="button" class="link-button" data-a="pick-none" data-scope="'+scope+'">Leave all out</button></span></div>';
 const foot=(left,right)=>'<div class="guide-foot">'+(left||'<span></span>')+right+'</div>';
 const back=n=>'<button type="button" class="btn alt" data-a="district-step" data-step="'+n+'">'+icon('chevronLeft')+'Back</button>';

 /* documents waiting for the signed-in owner come first: they need one tap */
 const claimPanel=claims.length?'<section class="panel rt-panel guide-claims"><h3>Back from District: for you to receive</h3>'+
  '<p class="note">Press <strong>Received</strong> only when the paper document is in your hands.</p>'+
  '<div class="rt-rows">'+claims.map(i=>'<div class="rt-row"><div class="rt-item-main"><strong>'+esc(i.document_label)+'</strong><small>'+
   esc(i.tracking_number)+' · '+esc(i.transmittal_number)+'</small></div>'+
   '<div class="rt-row-actions"><button class="btn" data-a="district-claim" data-id="'+esc(i.id)+'">'+icon('check')+'Received</button></div></div>').join('')+'</div></section>':'';

 const count=id=>items.filter(i=>i.transmittal_id===id&&i.item_status!=='cancelled').length;
 const listState=t=>{
  const its=items.filter(i=>i.transmittal_id===t.id&&i.item_status!=='cancelled');
  if(its.length&&its.every(i=>['filed_at_district','received_by_owner'].includes(i.item_status)))return ['Completed','good'];
  if(its.some(i=>i.item_status==='in_transmittal'))return ['Not yet handed over','warn'];
  return ['Handed to District','info'];
 };
 const myList='<section class="panel rt-panel"><div class="panel-head"><h3>My District transmittals</h3>'+
  '<button class="btn'+(creating?' alt':'')+'" data-a="district-new">'+icon('plus')+'New Transmittal</button></div>'+
  (trans.length?'<div class="rt-list guide-list">'+trans.map(t=>{const n=count(t.id);const [text,tone]=listState(t);
   return '<button type="button" class="rt-item rt-pick'+(!creating&&t.id===selectedId?' is-current':'')+'" data-a="district-open" data-id="'+esc(t.id)+'">'+
    '<span class="rt-item-main"><strong>'+esc(t.number)+'</strong><small>'+esc(t.school_name)+' · '+plural(n,'document')+' · '+esc(date(t.created_at))+'</small></span>'+
    '<span class="tag" data-tone="'+tone+'">'+text+'</span>'+
    '<span class="compact-doc-arrow" aria-hidden="true">'+icon('chevronRight')+'</span></button>';}).join('')+'</div>':
   '<p class="empty">No transmittal yet. The steps below start your first one.</p>')+'</section>';

 const printed=!!state.districtPrinted?.[selectedId];
 const step=creating?1:Math.min(3,Math.max(1,Number(state.districtStep?.[selectedId])||(!draft.length&&current.length?3:printed?3:2)));
 const done=n=>!creating&&(n===1?current.length>0:n===2?(printed||!draft.length):current.length>0&&!draft.length);
 const stepper='<ol class="guide-steps" aria-label="Steps">'+[[1,'Choose documents'],[2,'Print the slip'],[3,'Hand over']].map(([n,name])=>
  '<li><button type="button" class="guide-step'+(n===step?' is-current':'')+(done(n)?' is-done':'')+'" data-a="district-step" data-step="'+n+'"'+
  (creating&&n>1?' disabled':'')+(n===step?' aria-current="step"':'')+'><span class="guide-step-no">'+(done(n)&&n!==step?icon('check'):n)+'</span>'+
  '<span class="guide-step-name">'+name+'</span></button></li>').join('')+'</ol>';

 let head,body;
 if(creating){
  const defaultAddress=school?.postal_address||((school?.name||'School')+', San Remigio, Antique');
  const on=eligible.filter(d=>state.districtPicked.has(d.id)).length;
  head='<div class="guide-head"><div><span class="small muted">Starting a</span><strong>New District transmittal</strong></div></div>';
  body=(schools.length>1&&chooseSchool?'<div class="field guide-field"><label for="district-school">School sending the documents</label><select id="district-school">'+
    schools.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===schoolId?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></div>':
    '<input type="hidden" id="district-school" value="'+esc(schoolId||'')+'">')+
   (eligible.length?
    '<p class="guide-lead">'+plural(eligible.length,'document')+' from <strong>'+esc(school?.name||'this school')+'</strong> '+(eligible.length===1?'is':'are')+' ready for the District Office, and '+
     (eligible.length===1?'it is':'all are')+' included. <strong>Tap a document to leave it out.</strong></p>'+
    pickBar('district-pick-count',on,eligible.length,'#district-create-list')+
    '<div class="pick-list" id="district-create-list" data-count="district-pick-count" data-button="district-create-btn">'+
     eligible.map(d=>pickCard(d,'district-eligible-pick',state.districtPicked)).join('')+'</div>'+
    '<details class="pick-change guide-address"><summary>School address on the slip: <strong>'+esc(defaultAddress)+'</strong> <span>Change</span></summary>'+
     '<input id="district-address" value="'+esc(defaultAddress)+'" maxlength="250" aria-label="School address printed on the slip"></details>'+
    foot('','<button class="btn" data-a="district-create" id="district-create-btn"'+(!on?' disabled':'')+'>Create transmittal <span class="pick-n">('+on+')</span>'+icon('chevronRight')+'</button>'):
    '<div class="guide-empty">'+icon('inbox')+'<div><strong>Nothing to send to the District Office yet</strong>'+
    '<span>Documents routed to the District for '+esc(school?.name||'this school')+' appear here automatically.</span></div></div>');
 }else{
  const [text,tone]=listState(chosen);
  const canManage=chosen.prepared_by===mine||admin;
  head='<div class="guide-head"><div><span class="small muted">District transmittal</span><strong>'+esc(chosen.number)+'</strong></div>'+
   '<span class="tag" data-tone="'+tone+'">'+text+'</span></div>';
  const docRow=(i,actions)=>'<div class="rt-row"><div class="rt-item-main"><strong>'+esc(i.document_label)+'</strong><small>'+
   esc(i.tracking_number)+' · '+(i.return_required?'For Return':'No Return')+' · Returns to '+esc(i.owner_name||'the original sender')+'</small></div>'+
   tag(i.item_status)+(actions?'<div class="rt-row-actions">'+actions+'</div>':'')+'</div>';
  if(step===1){
   const rows=current.map(i=>docRow(i,
    (['in_transmittal','submitted_for_return','ready_for_owner'].includes(i.item_status)&&canManage?'<button class="btn tiny alt" data-a="district-assign-owner" data-id="'+esc(i.id)+'">Change owner</button>':'')+
    (i.item_status==='in_transmittal'&&chosen.prepared_by===mine?'<button class="btn tiny danger" data-a="district-cancel-item" data-id="'+esc(i.id)+'">Remove</button>':''))).join('');
   body='<p class="guide-lead">'+(draft.length?'Check the list. You can still remove a document or change who it returns to.':'These documents were handed to the District Office.')+'</p>'+
    (current.length?'<div class="rt-rows">'+rows+'</div>':'<p class="empty">No active documents in this transmittal.</p>')+
    foot('',current.length?'<button class="btn" data-a="district-step" data-step="2">Next: print the slip'+icon('chevronRight')+'</button>':'');
  }else if(step===2){
   body='<p class="guide-lead">Print one A4 slip (up to 20 documents per page), sign it, and bring it with the documents. Printing never changes a document\'s status.</p>'+
    '<div class="sign-grid"><div class="sign-card"><small>Signed by</small><strong>'+esc(chosen.signer_name)+'</strong><span>'+esc(chosen.signer_position)+'</span></div>'+
    '<div class="sign-card"><small>School</small><strong>'+esc(chosen.school_name)+'</strong><span>'+plural(current.length,'document')+'</span></div></div>'+
    foot(back(1),'<button class="btn" data-a="district-print" data-id="'+esc(chosen.id)+'">'+icon('file')+'Print transmittal slip</button>')+
    '<details class="rt-more rt-more-block"><summary>Already printed?</summary><div class="toolbar"><button class="btn alt" data-a="district-step" data-step="3">Go to hand over'+icon('chevronRight')+'</button></div></details>';
  }else{
   const handed=current.filter(i=>i.item_status!=='in_transmittal');
   const comingBack=pending.length&&canManage?'<h4 class="pick-group">Coming back from District</h4>'+
    '<p class="note">When a For Return document is physically back from the District Office, press <strong>Back from District</strong>. Its owner then confirms receipt.</p>'+
    '<div class="rt-rows">'+pending.map(i=>docRow(i,'<button class="btn tiny" data-a="district-ready" data-id="'+esc(i.id)+'">Back from District</button>')).join('')+'</div>':'';
   const others=handed.filter(i=>!(pending.includes(i)&&canManage));
   if(!draft.length){
    body=(current.length?'<div class="guide-success">'+icon('checkCircle')+'<div><strong>All '+plural(current.length,'document')+' were handed to the District Office.</strong>'+
     '<span>No Return documents are complete. For Return documents come back to their owners.</span></div></div>':'<p class="empty">No active documents in this transmittal.</p>')+
     comingBack+(others.length?'<div class="rt-rows">'+others.map(i=>docRow(i,'')).join('')+'</div>':'');
   }else if(chosen.prepared_by!==mine){
    body='<div class="notice guide-notice"><span>Only <strong>'+esc(chosen.signer_name||'the preparer')+'</strong>, who prepared this transmittal, records the handover.</span></div>'+
     '<div class="rt-rows">'+current.map(i=>docRow(i,'')).join('')+'</div>'+comingBack;
   }else{
    const on=draft.filter(d=>state.districtSubmitPicked.has(d.id)).length;
    body='<p class="guide-lead">After you hand the documents to the District Office, record it here. '+
     (draft.length>1?'<strong>All '+draft.length+' are included</strong>; leave out any that you did not hand over yet.':'')+'</p>'+
     (draft.length>1?pickBar('district-submit-count',on,draft.length,'#district-submit-list'):'')+
     '<div class="pick-list" id="district-submit-list" data-count="district-submit-count" data-button="district-submit-btn">'+
      draft.map(d=>pickCard(d,'district-submit-pick',state.districtSubmitPicked)).join('')+'</div>'+
     foot('<label class="guide-date">Date handed over<input id="district-actual-date" type="date" value="'+today+'" max="'+today+'"></label>',
      '<button class="btn" data-a="district-submit" id="district-submit-btn"'+(!on?' disabled':'')+'>'+icon('check')+'Record handover <span class="pick-n">('+on+')</span></button>')+
     comingBack+(others.length?'<h4 class="pick-group">Already handed over</h4><div class="rt-rows">'+others.map(i=>docRow(i,'')).join('')+'</div>':'');
   }
  }
 }
 return '<div class="sectionhead"><div><div class="eyebrow">School Documents · District Office</div>'+
  '<h1>District Transmittals</h1><p class="sub">The app guides you through three steps: choose the documents, print the slip, then record the handover.</p></div></div>'+
  claimPanel+myList+'<section class="panel guide">'+head+stepper+'<div class="guide-body">'+body+'</div></section>';
};
})();
