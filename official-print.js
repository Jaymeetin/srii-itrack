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
h2{font-size:11.3pt;margin:19px 0 12px;text-align:left}
.doc-date{text-align:center;margin:7px 0 22px;font-size:9.3pt}
.intro{line-height:1.54;text-align:justify;text-indent:22px;margin:0 6px 20px}
.category{font-weight:700;margin:16px 0 5px;font-size:9.5pt}
.item{line-height:1.6;padding-left:16px;break-inside:avoid}
.item strong{font-weight:600}
.item-id{font-size:8pt;color:#89929e;font-weight:400;margin-left:7px;white-space:nowrap}
.signature{position:absolute;right:0;bottom:38mm;text-align:center;width:58%;line-height:1.16;font-size:9pt}
.signature strong{display:block;text-decoration:underline;font-size:9pt}
.sign-date{text-align:center;margin-top:30px;font-size:9pt}
.footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #333;display:flex;align-items:center;gap:9px;padding-top:6px;height:18mm;font-size:8.5pt;line-height:1.3}
.footer img{object-fit:contain;flex-shrink:0}
.footer .brand-pair{height:14mm;width:22mm;max-width:22mm}
.footer .seal{height:15mm;width:15mm}
.footer .address{flex:1}
@media screen{body{background:#dedede;padding:14px}.sheet{width:210mm;padding:12mm 16mm;background:white;margin:0 auto 20px;box-shadow:0 2px 14px #0002;height:297mm}.footer{left:16mm;right:16mm;bottom:12mm}.signature{right:16mm}}
`;
function header(withSeal){return '<div class="letterhead">'+(withSeal?'<img class="logo-head" src="'+seal+'">':'')+
'<div>Republic of the Philippines</div><div class="deped">Department of Education</div>'+
'<div>Region VI – Western Visayas</div><div class="division">SCHOOLS DIVISION OF ANTIQUE</div>'+
(!withSeal?'<div class="district">San Remigio II District</div><div>San Remigio, Antique</div>':'')+
'</div><div class="separator"></div>';}
function footer(kind,school){return '<div class="footer">'+(kind==='endorsement'?'<img class="brand-pair" src="'+matatag+'"><img class="brand-pair" src="'+logos+'">':'')+
'<img class="seal" src="'+seal+'"><div class="address"><b>Address:</b> '+
(kind==='endorsement'?esc(school||'San Remigio, Antique'):'Binirayan Hills, San Jose, Antique')+
(kind==='transmittal'?'<div><b>Contact Information:</b> (036) 540 9837 / 0917 566 4491 / 0998 981 9337</div>':'')+
'</div></div>';}
function render(t,items,kind,people=[],schools=[]){
 const signer=esc(t.signer_name||'SHERILL E. CORTEJO, PhD'),position=esc(t.signer_position||'School Principal II'),office=esc(t.signer_office||'OIC, Office of the Public Schools District Supervisor');
 const submitter=people.find(p=>p.id===t.assigned_submitter)||{};
 const school=t.authorized_school_name||submitter.school_name||'San Remigio II District';
 const schoolAddress=school+', San Remigio, Antique';
 const sorted=[...items].sort((a,b)=>String(a.document_type||'').localeCompare(String(b.document_type||''))||String(a.document_label||'').localeCompare(String(b.document_label||'')));
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
window.ITRACK_PRINT={render};
})();