/* Official school-to-District form; no SDO Antique or MATATAG logos. */
(()=>{
'use strict';
const depedSeal='https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Department_of_Education.svg/250px-Department_of_Education.svg.png';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=s=>new Date(s||Date.now()).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'});
const css=`@page{size:A4;margin:12mm 16mm}*{box-sizing:border-box}body{font:9pt Arial,Helvetica,sans-serif;color:#171717;margin:0}
.sheet{position:relative;box-sizing:border-box;width:178mm;height:273mm;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
.letterhead{text-align:center;line-height:1.24;margin-bottom:8px;font-size:8.4pt}
.letterhead img{width:52px;height:52px;object-fit:contain;display:block;margin:0 auto 4px}
.letterhead .dept{font:700 16pt Georgia,serif}
.letterhead .division{font-weight:700}
.letterhead .school{font-size:9.3pt;font-weight:800;letter-spacing:.15px}
.rule{border-top:2px solid #333;margin:7px 0}
h1{margin:7px 0 8px;font-size:11.2pt;text-align:center;line-height:1.2}
.meta{display:flex;justify-content:space-between;gap:6px;font-size:8pt;margin:9px 0}
.intro{margin:8px 0 12px;line-height:1.25;text-align:justify;font-size:8.2pt}
table{border-collapse:collapse;table-layout:fixed;width:100%}
th,td{border:1px solid #6c6c6c;padding:2px 6px}
th{font-size:8pt;background:#f4f4f4;height:7mm}
td{height:7.35mm;vertical-align:middle;overflow:hidden}
th:first-child,td:first-child{width:69%}
th:last-child,td:last-child{width:31%;text-align:center}
.doc-row{display:flex;gap:7px;align-items:baseline;min-width:0;overflow:hidden}
.doc-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.tracking{white-space:nowrap;font-size:7pt;color:#555;flex-shrink:0}
.sigline{border-top:1px solid #666;margin:3.2mm 7px 0}
.signer{position:absolute;left:20%;right:20%;bottom:22mm;text-align:center;font-size:8.2pt;line-height:1.15}
.signer-line{margin:8.5mm auto 3px;border-top:1px solid #222;width:100%}
.signer strong{font-size:9pt;display:block}
.signer small{display:block;margin-top:3px;font-size:7.5pt}
.footer{position:absolute;left:0;right:0;bottom:0;border-top:1px solid #444;padding-top:6px;min-height:13mm;font-size:8pt;line-height:1.3}
.footer strong{font-weight:700}
.page{position:absolute;right:0;bottom:17mm;color:#666;font-size:7.2pt}
@media screen{body{background:#e5e5e5;padding:15px}.sheet{width:210mm;height:297mm;background:white;margin:0 auto 20px;padding:12mm 16mm;box-shadow:0 3px 18px #0002}.signer{left:28%;right:28%;bottom:34mm}.footer{left:16mm;right:16mm;bottom:12mm}.page{right:16mm;bottom:29mm}}
`;
function renderDistrict(t,items){
 if(!t||!Array.isArray(items))throw Error('Invalid District transmittal');
 const selected=items.filter(i=>i.item_status!=='cancelled');
 if(!selected.length)throw Error('District transmittal has no active documents');
 const pages=[];
 for(let start=0;start<selected.length;start+=20){
  const group=selected.slice(start,start+20);
  const rows=group.map((i,j)=>'<tr><td><div class="doc-row"><span>'+(start+j+1)+'.</span>'+
   '<span class="doc-title">'+esc(i.document_label||'Document')+'</span>'+
   '<span class="tracking">'+esc(i.tracking_number||'')+'</span></div></td>'+
   '<td><div class="sigline"></div></td></tr>').join('');
  const school=esc(t.school_name||'School');
  const header='<div class="letterhead"><img src="'+depedSeal+'" alt="Department of Education official seal">'+
   '<div>Republic of the Philippines</div><div class="dept">Department of Education</div>'+
   '<div>Region VI – Western Visayas</div><div class="division">SCHOOLS DIVISION OF ANTIQUE</div>'+
   '<div class="school">'+school.toUpperCase()+'</div></div><div class="rule"></div>';
  const signer='<div class="signer"><div>Prepared and Submitted By:</div><div class="signer-line"></div>'+
   '<strong>'+esc(t.signer_name||'Registered User')+'</strong>'+
   '<div>'+esc(t.signer_position||'School Personnel')+'</div>'+
   '<small>Signature over Printed Name</small><small>Date: __________________</small></div>';
  const pageNum=Math.floor(start/20)+1,totalPages=Math.ceil(selected.length/20);
  const footer='<div class="footer"><strong>Address:</strong> '+esc(t.school_address||t.school_name+', San Remigio, Antique')+'</div>';
  pages.push('<section class="sheet">'+header+
   '<h1>TRANSMITTAL OF DOCUMENTS TO THE DISTRICT OFFICE</h1>'+
   '<div class="meta"><span><b>Transmittal No.:</b> '+esc(t.number||t.transmittal_number)+'</span>'+
   '<span><b>Date:</b> '+dt(t.created_at)+'</span></div>'+
   '<p class="intro">Respectfully submitted from <strong>'+school+
   '</strong> to San Remigio II District Office are the following documents. The receiving personnel shall sign beside each document actually received.</p>'+
   '<table><thead><tr><th>DOCUMENT / TRACKING ID</th><th>RECEIVER\'S SIGNATURE</th></tr></thead><tbody>'+
   rows+'</tbody></table>'+signer+(totalPages>1?'<div class="page">Page '+pageNum+' of '+totalPages+'</div>':'')+
   footer+'</section>');
 }
 return '<!doctype html><html><head><meta charset="utf-8"><title>School-to-District Transmittal</title><style>'+css+
 '</style></head><body>'+pages.join('')+'</body></html>';
}
window.ITRACK_DISTRICT_PRINT={render:renderDistrict};
})();