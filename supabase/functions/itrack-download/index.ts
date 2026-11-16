import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN="https://jaymeetin.github.io";
const MAX_BYTES=4*1024*1024;
const ALLOWED_MIME=new Set([
  "image/jpeg","image/png","image/webp","application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DRIVE_ID=/^[a-zA-Z0-9_-]{10,200}$/;
function headers(){
  return {
    "Access-Control-Allow-Origin": SITE_ORIGIN,
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Expose-Headers":"content-disposition",
    "Cache-Control":"private, no-store, max-age=0",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff"
  };
}
function fail(message:string,status=400){
  return new Response(JSON.stringify({error:message}),{status,headers:{...headers(),"Content-Type":"application/json"}});
}
function toB64url(data:Uint8Array){
  let out="";
  for(let i=0;i<data.length;i++)out+=String.fromCharCode(data[i]);
  return btoa(out).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function getFileName(name:string){
  // Avoid quoting, control characters, traversal, or header injection.
  return name.replace(/[\x00-\x1f\x7f\\"/]/g,"_").replace(/^\.+/,"_").slice(0,150)||"document";
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers()});
  if(req.method!=="POST")return fail("Method not allowed",405);
  if(req.headers.get("origin")!==SITE_ORIGIN)return fail("Origin not allowed",403);
  if(Number(req.headers.get("content-length")||"0")>2048)return fail("Invalid request size",413);
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return fail("Sign in required",401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const publishKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const privateKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const secret=Deno.env.get("ITRACK_UPLOAD_SHARED_SECRET")||"";
  const bridgeUrl=Deno.env.get("ITRACK_APPS_SCRIPT_URL")||"";
  if(!url||!publishKey||!privateKey||secret.length<32||
     !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(bridgeUrl))
    return fail("Secure file download is not configured",503);

  let body:Record<string,unknown>;
  try{
    const raw=await req.text();
    if(raw.length>2048)return fail("Invalid request size",413);
    body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body))return fail("Invalid request");
  }catch{return fail("Invalid request");}
  const kind=body.kind;
  const id=body.id;
  if((kind!=="document"&&kind!=="announcement")||typeof id!=="string"||!UUID.test(id))
    return fail("Invalid attachment reference",400);

  const auth=createClient(url,publishKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:authErr}=await auth.auth.getUser(token);
  if(authErr||!session.user)return fail("Your session has expired. Sign in again.",401);
  const uid=session.user.id;
  const service=createClient(url,privateKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const scoped=createClient(url,publishKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  try{
    const {data:profile,error:pErr}=await service.from("profiles")
      .select("role,account_status,school_id,position_title").eq("id",uid).single();
    if(pErr||!profile||profile.account_status!=="active")
      return fail("Account is not approved",403);
    const admin=profile.role==="main_admin"||profile.role==="backup_admin";
    // Any approved member of the represented school may access its
    // announcement files. Actual delegated uploaders may access their own
    // files. The user-JWT-scoped submissions RLS enforces both rules.
    if(!admin){
      if(profile.role!=="school_user"||!profile.school_id)
        return fail("Account is not permitted to open files",403);
      const {data:school,error:sErr}=await service.from("schools")
        .select("name,is_active").eq("id",profile.school_id).single();
      if(sErr||!school?.is_active)return fail("School account is inactive",403);

    }

    // Apply database row-level security WITH this user's own JWT.
    // A document attachment is readable only to involved participants/admins.
    // An announcement submission is readable only to the assigned school/admins.
    const table=kind==="document"?"document_attachments":"submissions";
    const fields=kind==="document"?
      "id,document_id,drive_file_id,original_filename,content_type,file_size_bytes":
      "id,assignment_id,drive_file_id,original_filename,content_type,file_size_bytes,storage_status";
    const {data:file,error:fileErr}=await scoped.from(table).select(fields).eq("id",id).maybeSingle();
    if(fileErr||!file)return fail("File not found or access denied",404);
    if(kind==="announcement"&&file.storage_status!=="uploaded")
      return fail("This file is no longer in online storage",410);
    if(!DRIVE_ID.test(file.drive_file_id)||!ALLOWED_MIME.has(file.content_type)||
       !Number.isInteger(Number(file.file_size_bytes))||
       Number(file.file_size_bytes)<1||Number(file.file_size_bytes)>MAX_BYTES)
      return fail("Invalid file metadata",422);

    // Confirm this exact file was stored by our signed upload pipeline.
    // The integrity hash comes from a server-only upload receipt.
    const {data:receipt,error:receiptErr}=await service.from("upload_attempts")
      .select("sha256,file_size_bytes,content_type,status")
      .eq("drive_file_id",file.drive_file_id).eq("status","recorded").maybeSingle();
    if(receiptErr||!receipt||
       receipt.file_size_bytes!==Number(file.file_size_bytes)||
       receipt.content_type!==file.content_type||
       !/^[A-Za-z0-9_-]{43}$/.test(receipt.sha256))
      return fail("File integrity information is unavailable",422);

    const {count,error:rateErr}=await service.from("audit_log")
      .select("id",{head:true,count:"exact"})
      .eq("actor_user_id",uid).eq("action","file_downloaded")
      .gte("created_at",new Date(Date.now()-3600000).toISOString());
    if(rateErr)throw Error("Could not check access limits");
    if((count??0)>=30)return fail("Hourly download limit reached",429);

    const timestamp=Date.now(),nonce=crypto.randomUUID().replace(/-/g,"");
    const signedMessage=[
      "download-v1",String(timestamp),nonce,file.drive_file_id,
      file.content_type,String(file.file_size_bytes),receipt.sha256
    ].join("\n");
    const hmac=await crypto.subtle.importKey(
      "raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=toB64url(new Uint8Array(await crypto.subtle.sign(
      "HMAC",hmac,new TextEncoder().encode(signedMessage))));
    const bridge=await fetch(bridgeUrl,{
      method:"POST",redirect:"follow",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        operation:"download",version:1,timestamp,nonce,
        fileId:file.drive_file_id,mimeType:file.content_type,
        byteLength:Number(file.file_size_bytes),sha256:receipt.sha256,signature
      }),
      signal:AbortSignal.timeout(55000)
    });
    if(!bridge.ok)throw Error("Google Drive bridge unavailable");
    const dataText=await bridge.text();
    if(dataText.length>5_800_000)throw Error("Google Drive response exceeds allowed size");
    let data:Record<string,unknown>;
    try{data=JSON.parse(dataText);}catch{throw Error("Invalid Drive response");}
    if(data.success!==true||typeof data.contentBase64!=="string"||
       data.mimeType!==file.content_type||
       data.byteLength!==Number(file.file_size_bytes)||
       data.contentBase64.length>5_700_000)
      throw Error("File not available through secure bridge");
    let bytes:Uint8Array;
    try{
      const decoded=atob(data.contentBase64);
      bytes=Uint8Array.from(decoded,x=>x.charCodeAt(0));
    }catch{throw Error("Invalid file encoding");}
    if(bytes.byteLength!==Number(file.file_size_bytes))throw Error("File size check failed");
    const digest=toB64url(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
    if(digest!==receipt.sha256)throw Error("File integrity check failed");

    // Record file access before releasing the bytes.
    const {error:auditErr}=await service.from("audit_log").insert({
      actor_user_id:uid,action:"file_downloaded",
      entity_type:kind==="document"?"document_attachment":"submission",
      entity_id:id,
      details:{file_size:bytes.byteLength}
    });
    if(auditErr)throw Error("Access log could not be recorded");
    const safeName=getFileName(file.original_filename);
    return new Response(bytes,{
      status:200,
      headers:{
        ...headers(),
        "Content-Type":file.content_type,
        "Content-Length":String(bytes.byteLength),
        "Content-Disposition":'attachment; filename="'+safeName+'"; filename*=UTF-8\'\''+encodeURIComponent(safeName)
      }
    });
  }catch(err){
    console.error("i-TRACK secure download denied:",err instanceof Error?err.message:"unknown");
    return fail("File retrieval failed. Please contact your district administrator.",502);
  }
});