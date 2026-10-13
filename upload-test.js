(() => {
"use strict";
const cfg=window.ITRACK_CONFIG;
const statusEl=document.getElementById("pilot-status");
const controls=document.getElementById("pilot-controls");
const accountEl=document.getElementById("pilot-account");
const select=document.getElementById("pilot-target");
const gen=document.getElementById("make-test");
const preview=document.getElementById("pilot-preview");
const submit=document.getElementById("pilot-submit");
const info=document.getElementById("pilot-file-info");
const message=document.getElementById("pilot-message");
const client=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let testFile=null;let currentSession=null;let user=null;let profile=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function say(s,bad=false,success=false){message.className="pilot-message"+(bad?" error":success?" success":"");message.textContent=s;}
function problem(s){statusEl.textContent=s;statusEl.style.color="#b33240";controls.hidden=true;}
function assert(data,error,description){if(error)throw new Error(description+": "+error.message);return data;}
async function start(){
 if(!client){problem("Supabase client did not load. Check internet access.");return;}
 try{
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token){problem("Sign in to your approved i-TRACK account in this browser first. Return to the dashboard, sign in, then reopen this test page.");return;}
 currentSession=session;user=session.user;
 const p=await client.from("profiles").select("id,display_name,account_status,school_id,role").eq("id",user.id).single();
 profile=assert(p.data,p.error,"Cannot read account");
 if(profile.account_status!=="active") {problem("This account has not been approved.");return;}
 const admin=["main_admin","backup_admin"].includes(profile.role);
 const a=await client.from("announcements").select("id,title,status").eq("status","open").order("created_at",{ascending:false});
 const announcements=assert(a.data,a.error,"Cannot read announcements");
 const aa=await client.from("announcement_assignments").select("id,announcement_id,school_id,assigned_user_id,obligation_status");
 const assignments=assert(aa.data,aa.error,"Cannot read school assignments");
 let targets=[];
 for(const item of assignments){
   if(item.obligation_status!=="required" ||
      !(item.assigned_user_id===user.id || (profile.school_id && item.school_id===profile.school_id)))continue;
   const announcement=announcements.find(x=>x.id===item.announcement_id && x.title.toUpperCase().startsWith("SYSTEM TEST"));
   if(announcement) targets.push({kind:"announcement",id:item.id,title:"TEST ANNOUNCEMENT — "+announcement.title});
 }
 const d=await client.from("documents").select("id,subject,tracking_number").order("created_at",{ascending:false});
 const docs=assert(d.data,d.error,"Cannot read documents");
 for(const doc of docs.filter(x=>x.subject.toUpperCase().startsWith("TEST DOCUMENT"))){
   targets.push({kind:"document",id:doc.id,title:"TEST DOCUMENT — "+doc.tracking_number});
 }
 if(!targets.length){
  problem("No authorized SYSTEM TEST announcement or TEST DOCUMENT is available for this account.");return;
 }
 select.innerHTML=targets.map(t=>'<option value="'+esc(t.kind+":"+t.id)+'">'+esc(t.title)+'</option>').join("");
 accountEl.innerHTML='<p><b>'+esc(profile.display_name||user.email)+'</b> · '+esc(profile.role.replaceAll("_"," "))+'</p>';
 statusEl.textContent="Approved test account connected. This pilot only accepts generated, non-sensitive test images.";
 controls.hidden=false;
 gen.addEventListener("click",generate);
 submit.addEventListener("click",()=>send(targets));
 }catch(e){problem("Could not prepare the pilot: "+(e?.message||String(e)));}
}
function generate(){
 const canvas=document.createElement("canvas");canvas.width=760;canvas.height=420;
 const c=canvas.getContext("2d");
 c.fillStyle="#ffffff";c.fillRect(0,0,760,420);
 c.fillStyle="#173e88";c.fillRect(0,0,760,116);
 c.fillStyle="#fff";c.font="bold 36px Arial";c.fillText("SRII i-TRACK",40,72);
 c.fillStyle="#173e88";c.font="bold 30px Arial";c.fillText("SYSTEM UPLOAD TEST",40,198);
 c.font="22px Arial";c.fillStyle="#343b48";c.fillText("This file contains no official or personal records.",40,257);
 c.fillText("It is safe to delete after the integration test.",40,295);
 c.fillStyle="#bf8224";c.fillRect(40,344,680,5);
 canvas.toBlob(blob=>{
  if(!blob){say("Could not create the test image.",true);return;}
  const name="TEST_SRII_UPLOAD.png";
  testFile=new File([blob],name,{type:"image/png"});
  preview.src=URL.createObjectURL(blob);preview.hidden=false;
  info.textContent=name+" — "+(testFile.size/1024).toFixed(1)+" KB";
  submit.disabled=false;
  say("Test image generated. This has not been uploaded.");
 },"image/png");
}
async function send(targets){
 const target=targets.find(t=>t.kind+":"+t.id===select.value);
 if(!target||!testFile) {say("Generate an image and choose a destination.",true);return;}
 if(!confirm("Send ONLY the generated test image to your DepEd Google Drive?"))return;
 submit.disabled=true;gen.disabled=true;select.disabled=true;
 say("Checking authorization and transferring the test image. Please wait...");
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw new Error("Your login expired. Sign in again.");
  const b64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]);
    reader.onerror=()=>reject(new Error("Unable to read generated image"));
    reader.readAsDataURL(testFile);
  });
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),65000);
  let reply;
  try{
    reply=await fetch(cfg.url+"/functions/v1/itrack-upload",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.publishableKey,
        "Authorization":"Bearer "+session.access_token
      },
      body:JSON.stringify({
       target_type:target.kind,target_id:target.id,file_name:testFile.name,
       mime_type:testFile.type,content_base64:b64
      }),
      signal:abort.signal
    });
  }finally{clearTimeout(timeout);}
  let body;
  try{body=await reply.json();}catch{throw new Error("The server returned an invalid response.");}
  if(!reply.ok||!body?.ok)throw new Error(body?.error||"Upload failed ("+reply.status+").");
  say("SUCCESS: File saved and recorded. Upload receipt: "+body.upload_id+"; Received: "+new Date(body.received_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})+".",false,true);
  submit.textContent="Test Upload Completed";
 }catch(e){
  say("Upload was not confirmed: "+(e?.name==="AbortError"?"The request timed out; verify Drive and database before trying again.":e?.message||String(e)),true);
  submit.disabled=false;
 }finally{gen.disabled=false;select.disabled=false;}
}
start();
})();