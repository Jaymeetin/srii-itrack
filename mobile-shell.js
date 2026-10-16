/* SRII i-TRACK mobile-only interface enhancement.
 * The existing desktop application owns all navigation, authentication and data.
 * This file only mirrors its already-authorized actions on a touch-friendly shell.
 */
(() => {
"use strict";
const root=document.getElementById("app");
if(!root)return;
const icons={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>',
 notices:'<path d="m3 10 18-6v15L3 13z"/><path d="M7 14v6a2 2 0 0 0 4 0v-5"/>',
 status:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 17v-5m4 5V7m4 10v-8"/>',
 reports:'<path d="M3 3h18v18H3z"/><path d="M7 17v-4m5 4V7m5 10v-7"/>',
 docs:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
 more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>'
};
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function icon(which){
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">'+icons[which]+'</svg>';
}
const tabs=[
 {page:"dashboard",label:"Home",icon:"home"},
 {page:"announcements",label:"Notices",icon:"notices"},
 {page:"monitoring",label:"Status",icon:"status"},
 {page:"documents",label:"Documents",icon:"docs"}
];
let appNode=null;
function identity(app){
 const node=app.querySelector(".user-mini");
 const name=(node?.firstChild?.textContent||"District User").trim()||"District User";
 const detail=(node?.lastChild?.textContent||"Authorized account").trim();
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s.charAt(0)).join("").toUpperCase().slice(0,2)||"SR";
 return {name,detail,initials};
}
function closeMore(){
 const panel=root.querySelector(".mobile-more-overlay");
 panel?.remove();
 document.body.style.overflow="";
 root.querySelectorAll('[data-mobile="more"]').forEach(b=>b.setAttribute("aria-expanded","false"));
}
function makeShell(app){
 const head=app.querySelector(".topbar");
 if(!head)return;
 const user=identity(app);
 if(!head.querySelector(".mobile-header")){
  head.insertAdjacentHTML("afterbegin",
   '<div class="mobile-header">'+
    '<div class="mobile-header-left">'+
      '<span class="mobile-mark" aria-hidden="true"><img class="mobile-logo-image" src="./assets/srii-mark-v17.svg" alt="" width="46" height="43"></span>'+
      '<span class="mobile-wordmark"><small>SAN REMIGIO II DISTRICT</small><strong>SRII <em>i-TRACK</em></strong></span>'+
    '</div>'+
    '<div class="mobile-header-right"><span class="mobile-trial">TRIAL</span>'+
      '<button class="mobile-avatar" type="button" data-mobile="more" aria-label="Open account menu" aria-expanded="false">'+safe(user.initials)+'</button>'+
    '</div>'+
   '</div>');
 }
 if(!app.querySelector(".mobile-bottom-nav")){
  const nav=document.createElement("nav");
  nav.className="mobile-bottom-nav";
  nav.setAttribute("aria-label","Primary mobile navigation");
  const active=app.querySelector(".sidebar nav button.active")?.getAttribute("data-page")||"dashboard";
  const hasDocuments=!!app.querySelector('.sidebar nav button[data-page="documents"]');
  const visibleTabs=hasDocuments?tabs:
   [...tabs.filter(t=>t.page!=="documents"),{page:"reports",label:"Reports",icon:"reports"}];
  nav.style.gridTemplateColumns="repeat("+(visibleTabs.length+1)+",minmax(0,1fr))";
  nav.innerHTML=visibleTabs.map(t=>
    '<button type="button" class="mobile-tab" data-mobile="navigate" data-page="'+t.page+'"'+
      (active===t.page?' aria-current="page"':'')+'>'+
    icon(t.icon)+'<span>'+t.label+'</span></button>').join("")+
    '<button type="button" class="mobile-tab" data-mobile="more" aria-label="More options" aria-expanded="false">'+icon("more")+'<span>More</span></button>';
  app.appendChild(nav);
 }
 const content=app.querySelector(".content");
 if(content){
  const h=content.querySelector("h1");
  content.classList.toggle("mobile-monitoring",h?.textContent?.trim()==="Submission Monitoring");
  content.querySelectorAll("table.data").forEach(table=>{
   const cols=[...table.querySelectorAll("thead th")].map(x=>x.textContent.trim());
   table.querySelectorAll("tbody tr").forEach(tr=>{
    [...tr.children].forEach((td,index)=>{
      const label=cols[index]||"";
      td.setAttribute("data-label",label);
      if(!label)td.classList.add("mobile-action-cell");
    });
   });
  });
 }
}
function openMore(){
 const app=root.querySelector(".app");
 if(!app)return;
 if(root.querySelector(".mobile-more-overlay")){closeMore();return;}
 const user=identity(app);
 const admin=app.querySelector('.sidebar nav button[data-page="approvals"]');
 const reports=app.querySelector('.sidebar nav button[data-page="reports"]');
 const verification=app.querySelector('.sidebar nav button[data-page="verification"]');
 const archive=app.querySelector('.sidebar nav button[data-page="archive"]');
 const accountActions=[
  verification?'<button type="button" class="mobile-menu-button" data-mobile="navigate" data-page="verification">Submission Verification <small>›</small></button>':"",
  reports?'<button type="button" class="mobile-menu-button" data-mobile="navigate" data-page="reports">District Reports <small>›</small></button>':"",
  admin?'<button type="button" class="mobile-menu-button" data-mobile="navigate" data-page="approvals">Account Management <small>›</small></button>':"",
  archive?'<button type="button" class="mobile-menu-button" data-mobile="navigate" data-page="archive">Document Archiving <small>›</small></button>':""
 ].join("");
 const section=accountActions?'<span class="mobile-sheet-label">DISTRICT ADMINISTRATION</span>'+accountActions:"";
 const sheet=document.createElement("div");
 sheet.className="mobile-more-overlay";
 sheet.setAttribute("role","presentation");
 sheet.innerHTML=
 '<div class="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Account and app options">'+
  '<div class="mobile-sheet-handle" aria-hidden="true"></div>'+
  '<div class="mobile-more-top"><strong>More options</strong><button type="button" class="mobile-close" data-mobile="close" aria-label="Close menu">×</button></div>'+
  '<div class="mobile-identity"><span class="mobile-avatar" aria-hidden="true">'+safe(user.initials)+'</span><div><strong>'+safe(user.name)+'</strong><small>'+safe(user.detail)+'</small></div></div>'+
  section+
  (admin||app.querySelector('.sidebar nav button[data-page="documents"]')?
   '<span class="mobile-sheet-label">SYSTEM TEST TOOLS</span>'+
   '<button type="button" class="mobile-menu-button" data-mobile="link" data-href="./upload-test.html">Test Google Drive Upload <small>›</small></button>':'')+
  '<span class="mobile-sheet-label">PREFERENCES</span>'+
  '<button type="button" class="mobile-menu-button" data-mobile="theme">◐ &nbsp; Switch Light / Dark Mode <small>›</small></button>'+
  '<button type="button" class="mobile-menu-button danger" data-mobile="logout">↩ &nbsp; Sign Out <small>›</small></button>'+
 '</div>';
 sheet.addEventListener("click",e=>{if(e.target===sheet)closeMore();});
 app.appendChild(sheet);
 document.body.style.overflow="hidden";
 root.querySelectorAll('[data-mobile="more"]').forEach(b=>b.setAttribute("aria-expanded","true"));
 sheet.querySelector(".mobile-close")?.focus({preventScroll:true});
}
function handle(e){
 const button=e.target.closest("button[data-mobile]");
 if(!button)return;
 e.preventDefault();
 const action=button.dataset.mobile;
 if(action==="close"){closeMore();return;}
 if(action==="more"){openMore();return;}
 const page=button.dataset.page;
 const href=button.dataset.href;
 closeMore();
 if(action==="link"){
  if(href==="./upload-test.html")window.location.href=href;
  return;
 }
 if(action==="navigate"){
  const original=page?root.querySelector('.sidebar nav button[data-page="'+page+'"]'):null;
  original?.click();
 }else if(action==="theme"||action==="logout"){
  root.querySelector('.sidebar-footer button[data-a="'+action+'"]')?.click();
 }
}
root.addEventListener("click",handle);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMore();});
window.addEventListener("resize",()=>{if(window.innerWidth>820)closeMore();});
function render(){
 const app=root.querySelector(".app");
 if(!app){if(appNode){appNode=null;closeMore();}return;}
 appNode=app;
 makeShell(app);
}
const observer=new MutationObserver(render);
observer.observe(root,{childList:true});
render();
})();