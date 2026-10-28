/* SRII i-TRACK faithful A4 print layouts. IDs belong to items, never to the visible transmittal heading. */
(()=>{
'use strict';
const seal='https://www.depedantique.ph/ss_theme/DivisionLogo.jpg';
const matatag='https://deped-ddo.com/deped_matatag.png';
const logos='https://training.deped.gov.ph/pluginfile.php/5015292/coursecat/description/%5BLOGO%5D%20DepEd-Bagong%20Pilipinas%20-_Colored%20%281%29.png?time=1747709247717';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=x=>new Date(x||Date.now()).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'}).toUpperCase();
const CSS=`@page{size:A4;margin:12mm 16mm}*{box-sizing:border-box}body{margin:0;font:10.1pt Arial,sans-serif;color:#181818}
.sheet{height:272mm;position:relative;page-break-after:always;break-after:page;overflow:hidden}
.sheet:last-child{page-break-after:auto;break-after:auto}
.letterhead{text-align:center;font-size:9pt;line-height:1.25;margin:0 auto 10px}
.letterhead .deped{font-size:17pt;font-family:Georgia,serif;font-weight:700}
.letterhead .division{font-size:10pt;font-weight:700}
.letterhead .district{font-size:9pt}
.logo-head{display:block;object-fit:contain;width:55px;height:55px;margin:0 auto 5px}
.separator{border-top:2px solid #444;margin:6px 0 18px}
h1{font-size:12pt;margin:12px 0;text-align:center}
h2{font-size:11.3pt;margin:19px 0 12px;text-align:center}
.doc-date{text-align:center;margin:7px 0 22px;font-size:9.3pt}
.intro{line-height:1.54;text-align:justify;text-indent:22px;margin:0 6px 20px}
.category{font-weight:700;margin:16px 0 5px;font-size:9.5pt}
.item{line-height:1.6;padding-left:16px;break-inside:avoid}
.item strong{font-weight:600}
.item-id{font-size:8pt;color:#89929e;font-weight:400;margin-left:7px;white-space:nowrap}
.signature{position:absolute;left:50%;right:auto;transform:translateX(-50%);bottom:38mm;text-align:center;width:66%;line-height:1.16;font-size:9pt}
.signature strong{display:block;text-decoration:underline;font-size:9pt}
.sign-date{text-align:center;margin-top:30px;font-size:9pt}
.footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #333;display:flex;align-items:center;gap:9px;padding-top:6px;height:18mm;font-size:8.5pt;line-height:1.3}
.footer img{object-fit:contain;flex-shrink:0}
.footer .brand-pair{height:14mm;width:22mm;max-width:22mm}
.footer .seal{height:15mm;width:15mm}
.footer .address{flex:1}
@media screen{body{background:#dedede;padding:14px}.sheet{width:210mm;padding:12mm 16mm;background:white;margin:0 auto 20px;box-shadow:0 2px 14px #0002;height:297mm}.footer{left:16mm;right:16mm;bottom:12mm}.signature{left:50%;right:auto;transform:translateX(-50%)}}
`;
function header(withSeal){return '<div class="letterhead">'+(withSeal?'<img class="logo-head" src="'+seal+'">':'')+
'<div>Republic of the Philippines</div><div class="deped">Department of Education</div>'+
'<div>Region VI – Western Visayas</div><div class="division">SCHOOLS DIVISION OF ANTIQUE</div>'+
(!withSeal?'<div class="district">San Remigio II District</div><div>San Remigio, Antique</div>':'')+
'</div><div class="separator"></div>';}
function footer(kind,school){return '<div class="footer">'+(kind==='endorsement'?'<img class="brand-pair" src="'+matatag+'"><img class="brand-pair" src="'+logos+'">':'')+
'<img class="seal" src="'+seal+'"><div class="address"><b>Address:</b> '+
(kind==='endorsement'?'Bugo, San Remigio, Antique':'Binirayan Hills, San Jose, Antique')+
(kind==='transmittal'?'<div><b>Contact Information:</b> (036) 540 9837 / 0917 566 4491 / 0998 981 9337</div>':'')+
'</div></div>';}
function render(t,items,kind,people=[],schools=[]){
 const signer=esc(t.signer_name||'SHERILL E. CORTEJO, PhD'),position=esc(t.signer_position||'School Principal II'),office=esc(t.signer_office||'OIC, Office of the Public Schools District Supervisor');
 const submitter=people.find(p=>p.id===t.assigned_submitter)||{};
 const school=t.authorized_school_name||submitter.school_name||'San Remigio II District';
 const schoolAddress=school+', San Remigio, Antique';
 const sorted=[...items].filter(i=>i.division_status!=='cancelled').sort((a,b)=>String(a.document_type||'').localeCompare(String(b.document_type||''))||String(a.document_label||'').localeCompare(String(b.document_label||'')));
 const pages=[];
 for(const type of (kind==='both'?['endorsement','transmittal']:[kind])){
  const chunks=[];for(let i=0;i<sorted.length;i+=12)chunks.push(sorted.slice(i,i+12));if(!chunks.length)chunks.push([]);
  chunks.forEach((list,idx)=>{
   let lastCat='',number=idx*12;
   const body=list.map(i=>{
    const cat=String(i.document_type||'DOCUMENTS').toUpperCase();
    const category=cat===lastCat?'':'<div class="category">'+esc(cat)+'</div>';lastCat=cat;
    const origin=schools.find(s=>s.id===i.school_id)?.name||'';
    return category+'<div class="item">'+(++number)+'. <strong>'+esc(origin?origin+' — '+i.document_label:i.document_label)+'</strong><span class="item-id">'+esc(i.tracking_number||'')+'</span></div>';
   }).join('');
   const signature=idx===chunks.length-1?'<div class="signature"><strong>'+signer+'</strong>'+position+'<div>'+office+'</div>'+(type==='transmittal'?'<div class="sign-date">'+dt(t.created_at)+'<div>Date</div></div>':'')+'</div>':'';
   const content=type==='endorsement'?
    '<h1>ENDORSEMENT</h1><div class="doc-date">Date: '+dt(t.created_at)+'</div><p class="intro">Respectfully forwarded from the District of San Remigio II to the Schools Division Office, herein authorizing <strong>'+esc(submitter.name||'________________')+'</strong>, '+esc(submitter.position||'Administrative Officer II')+' of <strong>'+esc(school)+'</strong>, San Remigio, Antique the following documents:</p>':
    '<h2>Transmittal of Documents for Submission to the Division Office</h2><p class="intro">This is to certify that I personally checked the documents coming from our school/district for submission to the Division Office. This ensures that the undersigned did the document checking/examination in terms of completeness and accuracy, utilization of SDO prescribed templates/forms, and schedule of submission of documents, to wit:</p><div class="category">LIST OF DOCUMENTS FOR SUBMISSION:</div>';
   pages.push('<section class="sheet">'+header(type==='transmittal')+content+body+signature+footer(type,schoolAddress)+'</section>');
  });
 }
 return '<!doctype html><html><head><meta charset="utf-8"><title>Official Forms — SRII i-TRACK</title><style>'+CSS+'</style></head><body>'+pages.join('')+'</body></html>';
}
// Retrieval slip mirrors the existing official form's exact logos, heading
// structure and Bugo footer; physical receivers sign separately per document.
const RETRIEVAL_CSS=`
.rslip-head{margin-bottom:9px}
.rslip-title{text-align:center;font-size:12pt;font-weight:700;margin:8px 0 7px}
.rslip-subtitle{text-align:center;font-size:8pt;margin:0 0 11px;color:#444}
.rslip-meta{display:flex;justify-content:space-between;gap:10px;font-size:8pt;margin:7px 0 10px}
.rslip-intro{font-size:8.2pt;line-height:1.2;margin:0 0 10px;text-align:justify}
.rslip-list{border-collapse:collapse;width:100%;table-layout:fixed}
.rslip-list th,.rslip-list td{border:1px solid #666;padding:2px 6px}
.rslip-list th{font-size:8.2pt;background:#f1f1f1;height:7mm}
.rslip-list td{height:7.3mm;vertical-align:middle;font-size:8.2pt;line-height:1.14}
.rslip-list td:first-child{width:69%}
.rslip-list td:last-child,.rslip-list th:last-child{width:31%;text-align:center}
.rslip-item-line{display:flex;align-items:baseline;gap:7px;min-width:0;overflow:hidden}
.rslip-item-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rslip-item-id{font-size:7pt;color:#555;white-space:nowrap;flex-shrink:0}
.rslip-sigline{border-top:1px solid #555;margin:3mm 7px 0}
.rslip-retriever{position:absolute;bottom:23mm;left:50%;transform:translateX(-50%);width:61%;text-align:center;font-size:8.4pt}
.rslip-retriever .line{border-top:1px solid #222;margin:9mm 0 4px}
.rslip-retriever strong{display:block;font-size:9pt}
.rslip-retriever .tiny{font-size:7.4pt;margin-top:3px}
.rslip-pages{font-size:7.5pt;color:#666;text-align:center;position:absolute;right:0;bottom:20mm}
@media screen{.rslip-retriever{left:50%;transform:translateX(-50%)}.rslip-pages{right:16mm;bottom:32mm}}
`;
function renderRetrievalSlip(turnover,items){
 if(!turnover||!Array.isArray(items)||!items.length)throw Error('A turnover slip needs at least one document.');
 const picked=items.filter(i=>i.division_status!=='cancelled');
 if(!picked.length)throw Error('No active documents are on this turnover slip.');
 const pages=[];
 for(let start=0;start<picked.length;start+=20){
  const group=picked.slice(start,start+20);
  const pageIndex=Math.floor(start/20)+1,totalPages=Math.ceil(picked.length/20);
  const docRows=group.map((i,idx)=>
   '<tr><td><div class="rslip-item-line"><span>'+(start+idx+1)+'.</span>'+
   '<span class="rslip-item-title">'+esc(i.document_label||'Document')+'</span>'+
   '<span class="rslip-item-id">'+esc(i.tracking_number||'')+'</span></div></td>'+
   '<td><div class="rslip-sigline"></div></td></tr>').join('');
  const retriever='<div class="rslip-retriever"><div>Retrieved / Handed Over By:</div>'+
   '<div class="line"></div><strong>'+esc(turnover.retriever_name||'________________________')+'</strong>'+
   '<div>'+esc(turnover.retriever_position||'Retriever')+'</div>'+
   '<div class="tiny">Signature over Printed Name</div><div class="tiny">Date: ___________________</div></div>';
  pages.push('<section class="sheet">'+header(true)+
   '<h1 class="rslip-title">DOCUMENT TURNOVER AND RELEASE SLIP</h1>'+
   '<p class="rslip-subtitle">San Remigio II District · Schools Division of Antique</p>'+
   '<div class="rslip-meta"><span><b>Turnover No.:</b> '+esc(turnover.number||turnover.turnover_number||'—')+'</span>'+
   '<span><b>Date:</b> '+dt(turnover.created_at)+'</span></div>'+
   '<p class="rslip-intro">The following documents were retrieved from the Division Office and recorded for turnover and release. Each person receiving a document signs beside the corresponding entry.</p>'+
   '<table class="rslip-list"><thead><tr><th>DOCUMENT / TRACKING ID</th>'+
   '<th>RECEIVER\'S SIGNATURE</th></tr></thead><tbody>'+docRows+'</tbody></table>'+
   retriever+(totalPages>1?'<div class="rslip-pages">Page '+pageIndex+' of '+totalPages+'</div>':'')+
   footer('endorsement')+'</section>');
 }
 return '<!doctype html><html><head><meta charset="utf-8"><title>District Document Turnover and Release Slip</title>'+
  '<style>'+CSS+RETRIEVAL_CSS+'</style></head><body>'+pages.join('')+'</body></html>';
}
window.ITRACK_PRINT={render,renderRetrievalSlip};
})();