/* SRII i-TRACK charts: a status donut and stacked status rows.
 * Pure SVG/HTML strings, no library. Colours come from theme.css
 * (--ch-ontime, --ch-late, --ch-missed, --ch-waiting) so light and dark
 * mode each use their own validated steps. Every value shown on hover is
 * also printed in the legend or the row text, so nothing depends on hover.
 */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-PH');
const pct=(n,total)=>total?Math.round(n/total*100):0;

/* The four submission states, in ring order. Red and aqua are kept apart. */
const STATES=[
 {key:'ontime',label:'On time',hint:'Received by the deadline'},
 {key:'late',label:'Late',hint:'Received after the deadline'},
 {key:'missed',label:'Overdue',hint:'Deadline passed, nothing received yet'},
 {key:'waiting',label:'Not yet due',hint:'Still open, not yet received'}
];

/* Split report rows (required/on time/late/pending + deadline) into the four states. */
function totals(rows,now=Date.now()){
 const t={ontime:0,late:0,missed:0,waiting:0};
 for(const r of rows||[]){
  t.ontime+=Number(r.ontime??r.submitted_count??0);
  t.late+=Number(r.late??r.late_count??0);
  const pending=Number(r.pending??r.pending_count??0);
  const past=r.deadline_at&&new Date(r.deadline_at).getTime()<now;
  if(past)t.missed+=pending;else t.waiting+=pending;
 }
 return t;
}

/* Donut with the completion rate in the centre and a legend that lists every count. */
function donut(t,{title='Submission status',centerLabel='submitted',unit='school requirement',empty='Nothing to show yet.'}={}){
 const total=STATES.reduce((n,s)=>n+Number(t[s.key]||0),0);
 if(!total)return '<div class="ch-card ch-empty"><p class="empty">'+esc(empty)+'</p></div>';
 const done=Number(t.ontime||0)+Number(t.late||0);
 const R=52,C=2*Math.PI*R,GAP=2;
 const parts=STATES.filter(s=>Number(t[s.key]||0)>0);
 const gap=parts.length>1?GAP:0;
 let offset=0;
 const arcs=parts.map(s=>{
  const v=Number(t[s.key]);
  const len=v/total*C;
  const drawn=Math.max(len-gap,0.5);
  const tip=s.label+': '+fmt(v)+' ('+pct(v,total)+'%)';
  const arc='<circle class="ch-arc ch-'+s.key+'" r="'+R+'" cx="70" cy="70" fill="none" stroke-width="18" '+
   'stroke-dasharray="'+drawn.toFixed(2)+' '+(C-drawn).toFixed(2)+'" stroke-dashoffset="'+(-offset).toFixed(2)+'" '+
   'data-tip="'+esc(tip)+'"><title>'+esc(tip)+'</title></circle>';
  offset+=len;
  return arc;
 }).join('');
 const summary=title+': '+parts.map(s=>s.label+' '+fmt(t[s.key])).join(', ')+'. '+pct(done,total)+'% '+centerLabel+'.';
 const legend=STATES.map(s=>{
  const v=Number(t[s.key]||0);
  return '<li class="ch-key'+(v?'':' is-zero')+'"><span class="ch-swatch ch-'+s.key+'" aria-hidden="true"></span>'+
   '<span class="ch-key-text"><strong>'+esc(s.label)+'</strong><small>'+esc(s.hint)+'</small></span>'+
   '<span class="ch-key-value"><strong>'+fmt(v)+'</strong><small>'+pct(v,total)+'%</small></span></li>';
 }).join('');
 return '<div class="ch-card ch-donut-card">'+
  '<figure class="ch-donut" role="img" aria-label="'+esc(summary)+'">'+
   '<svg viewBox="0 0 140 140" aria-hidden="true"><circle class="ch-track" r="'+R+'" cx="70" cy="70" fill="none" stroke-width="18"></circle>'+
   '<g transform="rotate(-90 70 70)">'+arcs+'</g></svg>'+
   '<figcaption class="ch-center"><strong>'+pct(done,total)+'%</strong><span>'+esc(centerLabel)+'</span></figcaption>'+
  '</figure>'+
  '<div class="ch-side"><p class="ch-total">'+fmt(done)+' of '+fmt(total)+' '+esc(unit)+(total===1?'':'s')+'</p>'+
   '<ul class="ch-legend">'+legend+'</ul></div></div>';
}

/* One stacked bar per announcement on a shared scale (the largest requirement count). */
function stackedRows(rows,{action='',limit=8,now=Date.now()}={}){
 const list=(rows||[]).slice(0,limit);
 if(!list.length)return '';
 const max=Math.max(1,...list.map(r=>Number(r.required_schools||0)));
 const body=list.map(r=>{
  const t=totals([r],now);
  const req=Number(r.required_schools||0);
  const done=t.ontime+t.late;
  const segs=STATES.filter(s=>t[s.key]>0).map(s=>{
   const tip=s.label+': '+fmt(t[s.key])+' of '+fmt(req);
   return '<span class="ch-seg ch-'+s.key+'" style="flex-grow:'+t[s.key]+'" data-tip="'+esc(tip)+'" title="'+esc(tip)+'"></span>';
  }).join('');
  const name=(r.announcement_code?r.announcement_code+' · ':'')+(r.title||'Announcement');
  const tag=action?'button type="button" data-a="'+esc(action)+'" data-id="'+esc(r.announcement_id)+'"':'div';
  const close=action?'button':'div';
  return '<'+tag+' class="ch-row"><span class="ch-row-name"><strong>'+esc(name)+'</strong>'+
   '<small>'+fmt(done)+' of '+fmt(req)+' submitted'+(t.missed?' · '+fmt(t.missed)+' overdue':'')+'</small></span>'+
   '<span class="ch-row-track" aria-hidden="true"><span class="ch-row-bar" style="width:'+(req/max*100).toFixed(1)+'%">'+segs+'</span></span>'+
   '<span class="ch-row-pct">'+pct(done,req)+'%</span></'+close+'>';
 }).join('');
 const legend='<ul class="ch-legend ch-legend-inline">'+STATES.map(s=>'<li class="ch-key"><span class="ch-swatch ch-'+s.key+'" aria-hidden="true"></span>'+esc(s.label)+'</li>').join('')+'</ul>';
 return '<div class="ch-rows">'+legend+body+'</div>';
}

/* One shared hover tooltip for every [data-tip] mark inside a chart. */
let tipEl=null;
function tip(){
 if(tipEl)return tipEl;
 tipEl=document.createElement('div');
 tipEl.className='ch-tooltip';tipEl.setAttribute('role','presentation');tipEl.hidden=true;
 document.body.append(tipEl);
 return tipEl;
}
document.addEventListener('pointerover',e=>{
 const mark=e.target.closest?.('.ch-card [data-tip], .ch-rows [data-tip]');
 if(!mark)return;
 const el=tip();el.textContent=mark.getAttribute('data-tip');el.hidden=false;
 mark.classList.add('is-hot');
});
document.addEventListener('pointermove',e=>{
 if(!tipEl||tipEl.hidden)return;
 const x=Math.min(e.clientX+14,window.innerWidth-tipEl.offsetWidth-8);
 tipEl.style.transform='translate('+x+'px,'+(e.clientY+16)+'px)';
});
document.addEventListener('pointerout',e=>{
 const mark=e.target.closest?.('[data-tip]');
 if(!mark)return;
 mark.classList.remove('is-hot');
 if(tipEl)tipEl.hidden=true;
});

window.ITRACK_CHARTS={STATES,totals,donut,stackedRows};
})();
