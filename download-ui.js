/* SRII i-TRACK secure download UI.
 * Browser never receives the private Drive ID, Google credentials, or shared secret.
 * The server checks RLS permissions and logs every successful retrieval.
 */
(() => {
"use strict";
const root=document.getElementById("app");
const cfg=window.ITRACK_CONFIG;
// Reuse the same authenticated client as the main district application.
const db=window.ITRACK_DB;
if(!root||!db||!cfg?.url||!cfg.publishableKey)return;
const FILE_MAX=4*1024*1024;
let inProgress=false;
const activeButtons=()=>[...root.querySelectorAll(".iu-file-action")];
function notify(panel,text,success=false){
 const area=panel?.querySelector(".iu-message");
 if(!area||!panel?.isConnected)return;
 area.hidden=false;
 area.className="iu-message "+(success?"success":"error");
 area.textContent=text;
}
async function perform(button){
 if(inProgress||button.disabled)return;
 const kind=button.dataset.kind;
 const id=button.dataset.id;
 const name=button.dataset.name||"document";
 const mode=button.dataset.mode;
 if(!["document","announcement"].includes(kind)||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||
    !["view","download"].includes(mode))return;
 const panel=button.closest(".itrack-upload");
 // Open immediately on a real click to avoid pop-up blocking on iPhone.
 const preview=mode==="view"?window.open("about:blank","_blank"):null;
 if(mode==="view"&&!preview){
  notify(panel,"Preview was blocked by your browser. Use Download instead.");
  return;
 }
 if(preview){
  try{
   preview.document.title="SRII i-TRACK • Secure preview";
   preview.document.body.textContent="Checking document access. Please wait…";
  }catch{}
 }
 inProgress=true;
 activeButtons().forEach(b=>{b.disabled=true;});
 const originalLabel=button.textContent;
 button.textContent=mode==="view"?"Opening…":"Downloading…";
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),65000);
 try{
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.access_token)throw Error("Your login expired. Sign in again.");
  const response=await fetch(cfg.url+"/functions/v1/itrack-download",{
   method:"POST",cache:"no-store",
   headers:{
    "Content-Type":"application/json",
    "apikey":cfg.publishableKey,
    "Authorization":"Bearer "+session.access_token
   },
   body:JSON.stringify({kind,id}),
   signal:controller.signal
  });
  if(!response.ok){
   const failed=await response.json().catch(()=>({}));
   throw Error(failed.error||"Access request failed (HTTP "+response.status+")");
  }
  const blob=await response.blob();
  if(blob.size<1||blob.size>FILE_MAX)throw Error("Downloaded file failed its size check.");
  const fileUrl=URL.createObjectURL(blob);
  if(mode==="view"&&preview){
   try{preview.location.replace(fileUrl);}
   catch{
    URL.revokeObjectURL(fileUrl);
    throw Error("Could not open the preview. Try Download instead.");
   }
   notify(panel,"Preview opened. Access was checked and recorded.",true);
  }else{
   const anchor=document.createElement("a");
   anchor.style.display="none";
   anchor.href=fileUrl;
   anchor.download=name;
   document.body.appendChild(anchor);
   anchor.click();
   anchor.remove();
   notify(panel,"Download started: "+name+". Your authorized access was recorded.",true);
  }
  // Delay revocation while a mobile PDF viewer or download is still reading.
  setTimeout(()=>URL.revokeObjectURL(fileUrl),180000);
 }catch(err){
  try{if(preview&&!preview.closed)preview.close();}catch{}
  const message=err?.name==="AbortError"?
   "The secure request timed out. Try again later or report the error to your administrator.":
   (err?.message||String(err));
  notify(panel,"Could not "+(mode==="view"?"view":"download")+" "+name+": "+message);
 }finally{
  clearTimeout(timeout);
  inProgress=false;
  activeButtons().forEach(b=>{b.disabled=false;});
  button.textContent=originalLabel;
 }
}
root.addEventListener("click",event=>{
 const button=event.target.closest("button.iu-file-action");
 if(!button||!root.contains(button))return;
 event.preventDefault();
 perform(button);
});
})();