(() => {
"use strict";
const config=window.ITRACK_CONFIG;
const status=document.getElementById("review-status");
const content=document.getElementById("review-content");
const account=document.getElementById("review-account");
const chooser=document.getElementById("review-announcement");
const rows=document.getElementById("review-rows");
const summary=document.getElementById("review-summary");
const refresh=document.getElementById("review-refresh");
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const when=x=>x?new Date(x).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"}):"—";
let db,verifiedAdmin=false,loading=false,allAnnouncements=[],schools=[],submissions=[];
function message(s,kind=""){status.className="review-status"+(kind?" "+kind:"");status.textContent=s;}
function errorMessage(e){console.error("Administrator review error",e);message("Could not complete the action: "+(e?.message||String(e)),"error");}
async function fetchOrThrow(query,context){const {data,error}=await query;if(error)throw new Error(context+": "+error.message);return data||[];}
async function init(){
 try{
  if(!config?.url||!config.publishableKey||!window.supabase)throw new Error("Supabase is unavailable. Reload the page.");
  db=window.supabase.createClient(config.url,config.publishableKey,{
    auth:{persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}
  });
  const {data:{user},error:uError}=await db.auth.getUser();
  if(uError||!user){message("Sign in as the Main Administrator in this same Chrome window, then reopen this page.","error");return;}
  const profile=await fetchOrThrow(db.from("profiles").select("display_name,role,account_status").eq("id",user.id).single(),"Account check");
  if(profile.account_status!=="active"||!["main_admin","backup_admin"].includes(profile.role)){
    message("Administrator approval and role required. School accounts cannot access this review page.","error");return;
  }
  verifiedAdmin=true;
  account.textContent=(profile.display_name||"District Administrator")+" ("+profile.role.replaceAll("_"," ")+")";
  schools=await fetchOrThrow(db.from("schools").select("id,name"),"School list");
  const anns=await fetchOrThrow(db.from("announcements").select("id,title,status,deadline_at").in("status",["open","closed"]),"Announcement list");
  allAnnouncements=anns.filter(x=>x.title.toUpperCase().startsWith("SYSTEM TEST"));
  if(!allAnnouncements.length){message("No SYSTEM TEST announcement found for this pilot.","error");return;}
  chooser.innerHTML=allAnnouncements.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
  chooser.addEventListener("change",load);
  refresh.addEventListener("click",load);
  rows.addEventListener("click",handleReview);
  content.hidden=false;
  await load();
 }catch(e){errorMessage(e);content.hidden=true;}
}
async function load(){
 if(!verifiedAdmin||loading)return;
 loading=true;refresh.disabled=true;
 try{
  const ann=allAnnouncements.find(x=>x.id===chooser.value);
  if(!ann)throw new Error("Select a SYSTEM TEST announcement.");
  const assignments=await fetchOrThrow(db.from("announcement_assignments")
   .select("id,school_id,assigned_user_id")
   .eq("announcement_id",ann.id)
   .eq("obligation_status","required"),"Assignments");
  if(!assignments.length){
    rows.innerHTML='<tr><td colspan="5">No required assignments found.</td></tr>';
    summary.textContent="No submissions yet.";
    message("Test announcement loaded.");
    return;
  }
  const data=await fetchOrThrow(db.from("submissions")
   .select("id,assignment_id,original_filename,file_size_bytes,first_received_at,version_number,verification_status,verified_at,drive_file_id,storage_status")
   .in("assignment_id",assignments.map(x=>x.id))
   .in("storage_status",["uploaded","archived"])
   .order("version_number",{ascending:false})
   .order("first_received_at",{ascending:false}),"Uploaded submissions");
  const seen=new Set();
  submissions=data.filter(s=>{
    if(seen.has(s.assignment_id))return false;
    seen.add(s.assignment_id);
    return true;
  }).map(s=>{
    const a=assignments.find(x=>x.id===s.assignment_id);
    return {...s,school_name:schools.find(sc=>sc.id===a?.school_id)?.name||"Individual assignment"};
  });
  rows.innerHTML=submissions.length?submissions.map(s=>{
    const canOpen=/^[A-Za-z0-9_-]{10,200}$/.test(s.drive_file_id||"");
    const link=canOpen?'<a class="review-link" target="_blank" rel="noopener noreferrer" href="https://drive.google.com/file/d/'+encodeURIComponent(s.drive_file_id)+'/view">Open in Drive ↗</a>':'Drive reference unavailable';
    const statusText=["pending","verified","rejected"].includes(s.verification_status)?s.verification_status:"pending";
    const actions=statusText==="pending"?
      '<div class="review-actions"><button class="review-btn" data-action="verify" data-id="'+esc(s.id)+'">Verify</button><button class="review-btn danger" data-action="reject" data-id="'+esc(s.id)+'">Reject</button></div>':
      '<span class="review-small">Reviewed '+esc(when(s.verified_at))+'</span>';
    return '<tr><td><b>'+esc(s.school_name)+'</b></td><td>'+esc(s.original_filename)+
      '<div class="review-small">Version '+esc(s.version_number)+' · '+(s.file_size_bytes/1024).toFixed(1)+' KB</div>'+
      '<div>'+link+'</div></td><td>'+esc(when(s.first_received_at))+
      '</td><td><span class="review-pill '+esc(statusText)+'">'+esc(statusText.toUpperCase())+
      '</span></td><td>'+actions+'</td></tr>';
  }).join(""):'<tr><td colspan="5">No stored submissions yet.</td></tr>';
  const pending=submissions.filter(x=>x.verification_status==="pending").length;
  summary.textContent=submissions.length+" school submissions · "+pending+" awaiting review · "+assignments.length+" required assignments";
  message("Review list loaded. Open the actual file in Google Drive before verifying.","success");
 }catch(e){errorMessage(e);}
 finally{loading=false;refresh.disabled=false;}
}
async function handleReview(e){
 const button=e.target.closest("button[data-action]");
 if(!button||!verifiedAdmin||loading)return;
 const s=submissions.find(x=>x.id===button.dataset.id);
 if(!s||s.verification_status!=="pending"){message("This submission is no longer awaiting review. Refresh first.","error");return;}
 const approve=button.dataset.action==="verify";
 if(!approve&&button.dataset.action!=="reject")return;
 const prompt=approve?
  "Have you opened and inspected "+s.original_filename+" from "+s.school_name+" in Google Drive? Confirm VERIFICATION of this submission?":
  "Reject "+s.original_filename+" from "+s.school_name+"? The original stays recorded; the school must submit a corrected version.";
 if(!confirm(prompt))return;
 loading=true;refresh.disabled=true;
 rows.querySelectorAll("button").forEach(b=>b.disabled=true);
 message("Saving administrator review. Please wait…");
 try{
  const {error}=await db.rpc("i_track_verify_submission",{p_submission_id:s.id,p_approved:approve});
  if(error)throw error;
  loading=false;
  await load();
  message(approve?"Submission verified successfully.":"Submission rejected. A new version will be required.","success");
 }catch(e){loading=false;await load();errorMessage(e);}
 finally{refresh.disabled=false;}
}
init();
})();