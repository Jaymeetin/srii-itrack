
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN = "https://jaymeetin.github.io";
const FILE_LIMIT = 4 * 1024 * 1024;
// Off until the existing Google Apps Script bridge is updated and migration verified.
const ROUTED_FOLDER_V2 = Deno.env.get("ITRACK_ROUTED_FOLDER_LAYOUT") === "school_v2";
const ACCEPTED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function response(body: Record<string, unknown>, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

function base64url(b: Uint8Array): string {
  let str = "";
  for (let i=0; i<b.length; i++) str+=String.fromCharCode(b[i]);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function sanitizedName(s: string): string {
  return s.replace(/[\r\n]/g,"_").trim().slice(0,180);
}

function validFileMagic(b: Uint8Array, mime: string): boolean {
  if (mime === "application/pdf") return b.length>=5 && String.fromCharCode(...b.slice(0,5))==="%PDF-";
  if (mime === "image/png") return b.length>=8 && b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71;
  if (mime === "image/jpeg") return b.length>=3 && b[0]===255 && b[1]===216 && b[2]===255;
  if (mime === "image/webp") return b.length>=12 && String.fromCharCode(...b.slice(0,4))==="RIFF" && String.fromCharCode(...b.slice(8,12))==="WEBP";
  if (mime === "application/msword") return b.length>=8 && [208,207,17,224,161,177,26,225].every((x,i)=>b[i]===x);
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return b.length>=4 && b[0]===80 && b[1]===75 && [3,5,7].includes(b[2]) && [4,6,8].includes(b[3]);
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response({ok:true});
  if (req.method !== "POST") return response({error:"Method not allowed"},405);
  const origin=req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return response({error:"Origin not allowed"},403);
  const header=req.headers.get("authorization")||"";
  const jwt=header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return response({error:"Sign in required"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const uploadSecret=Deno.env.get("ITRACK_UPLOAD_SHARED_SECRET")||"";
  const scriptUrl=Deno.env.get("ITRACK_APPS_SCRIPT_URL")||"";
  if (!url||!anon||!serviceKey||uploadSecret.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(scriptUrl)) {
    return response({error:"Secure uploads are not configured yet"},503);
  }

  const verifier=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:verified,error:verifyError}=await verifier.auth.getUser(jwt);
  if (verifyError||!verified.user) return response({error:"Session expired. Please sign in again."},401);
  const uid=verified.user.id;
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  let uploadId: string|null=null;
  let driveSaved=false;
  let bridgeHttpStatus: number|null=null;
  try {
    const contentLength=Number(req.headers.get("content-length")||0);
    if (contentLength>6_000_000) return response({error:"File exceeds the upload limit"},413);
    const text=await req.text();
    if (text.length>6_000_000) return response({error:"File exceeds the upload limit"},413);
    const input=JSON.parse(text);
    if (!input || typeof input!=="object") return response({error:"Invalid upload"},400);
    // Live upload pilot: approved district admins, SINUNDOLAN ES and BUGO CS only.
    const targetType=input.target_type;
    const targetId=input.target_id;
    const mime=input.mime_type;
    const name=input.file_name;
    const b64=input.content_base64;
    if (!["announcement","document"].includes(targetType) ||
        typeof targetId!=="string" || !/^[a-f0-9-]{36}$/i.test(targetId) ||
        typeof name!=="string" || name.length<1 || name.length>180 ||
        typeof mime!=="string" || !ACCEPTED_MIME.has(mime) ||
        typeof b64!=="string" || b64.length>5_600_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      return response({error:"Invalid file or upload target"},400);
    }

    const {data:profile,error:profileError}=await db.from("profiles")
      .select("id,role,account_status,school_id,position_title")
      .eq("id",uid).single();
    if (profileError || profile?.account_status!=="active")
      return response({error:"Your account is not approved"},403);

    // AO II accounts may submit announcement requirements on behalf of any
    // assigned school. Routed-document uploads are allowed for any active school
    // user who created, sent, or received that document (checked below).
    const pilotSchoolIds=new Set(["68ece6a5-941c-4385-8062-5e4223877b60","d526729d-ee5e-4c1a-87f9-77f513c8778b"]);
    const admin=profile.role==="main_admin" || profile.role==="backup_admin";
    const aoII=profile.role==="school_user" &&
      /^(?:(?:administrative|administration)\s+officer\s+(?:ii|2)|ao\s*(?:ii|2))$/i.test((profile.position_title||"").trim());
    if (!admin) {
      if (profile.role!=="school_user" || !profile.school_id)
        return response({error:"This account cannot upload school files"},403);
      const {data:school,error:schoolError}=await db.from("schools")
        .select("name,is_active").eq("id",profile.school_id).single();
      if (schoolError || !school?.is_active)
        return response({error:"Your account must belong to an active school"},403);
      if (targetType==="announcement" && !aoII && !pilotSchoolIds.has(profile.school_id))
        return response({error:"Announcement uploads require an approved AO II account"},403);
    }
    // Block unusually frequent uploads to protect the district Drive quota.
    const {count:recent,error:limitError}=await db.from("upload_attempts")
      .select("id",{count:"exact",head:true}).eq("uploaded_by",uid)
      .gte("first_received_at",new Date(Date.now()-3600000).toISOString());
    if (limitError) throw new Error("Could not verify upload limit");
    if ((recent??0)>=12) return response({error:"Hourly upload limit reached. Please wait before uploading again."},429);
    const extensionRules:Record<string,RegExp>={
      "image/jpeg":/\.(jpg|jpeg)$/i,
      "image/png":/\.png$/i,
      "image/webp":/\.webp$/i,
      "application/pdf":/\.pdf$/i,
      "application/msword":/\.doc$/i,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":/\.docx$/i
    };
    if (!extensionRules[mime]?.test(name)||/[/\\\x00-\x1f]/.test(name)||/^\.+$/.test(name))
      return response({error:"File name or extension does not match the file type"},400);
    let folderLabel="",schoolId: string|null=profile.school_id;

    let schoolName="DISTRICT OFFICE";
    if (targetType==="announcement") {
      const {data:aa,error:aErr}=await db.from("announcement_assignments")
        .select("id,announcement_id,school_id,assigned_user_id,obligation_status")
        .eq("id",targetId).single();
      const ownAssignment=aa && (aa.assigned_user_id===uid || (!!aa.school_id && aa.school_id===profile.school_id));
      const delegatedAssignment=aa && !!aa.school_id && (admin || aoII);
      if (aErr || !aa || aa.obligation_status!=="required" || !(ownAssignment || delegatedAssignment)) {
        return response({error:"Only the assigned school, an approved AO II, or a district administrator may submit this requirement"},403);
      }
      const {data:ann,error:annErr}=await db.from("announcements")
        .select("title,status").eq("id",aa.announcement_id).single();
      if (annErr || ann?.status!=="open") return response({error:"Announcement not open"},403);
      folderLabel=ann.title;
      schoolId=aa.school_id||profile.school_id;
      if (!schoolId) return response({error:"No approved school assignment"},403);
    } else {
      const {data:d,error:dErr}=await db.from("documents")
        .select("id,tracking_number,subject,created_by,document_type,origin_school_id").eq("id",targetId).single();
      if (dErr || !d) return response({error:"Document unavailable"},404);
      let allowed=(profile.role==="main_admin"||profile.role==="backup_admin"||d.created_by===uid);
      if (!allowed) {
        const {data:routes,error:rErr}=await db.from("document_routes")
         .select("id").eq("document_id",targetId)
         .or("from_user_id.eq."+uid+",to_user_id.eq."+uid).limit(1);
        if (rErr) throw new Error("Document routing lookup failed");
        allowed=!!routes?.length;
      }
      if (!allowed) return response({error:"You cannot attach to this document"},403);
      if (ROUTED_FOLDER_V2) {
        const docType=String(d.document_type||"").trim();
        // The document's ORIGINAL school governs the Drive destination; never
        // substitute the school of a forwarding or assisting uploader.
        if (!d.origin_school_id)
          return response({error:"This document has no originating school. An administrator must correct its school before a file can be placed in the new folder layout."},409);
        if (!docType || docType.length>150 || /[\\/\\\\\\x00-\\x1f]/.test(docType) ||
            docType==="." || docType==="..")
          return response({error:"Invalid document type for the Google Drive folder"},409);
        if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/.test(d.tracking_number))
          return response({error:"Invalid document tracking number for the Drive folder"},409);
        schoolId=d.origin_school_id;
        // The signed folderLabel is parsed only for Documents by
        // RoutedDocumentFolders.gs, after the existing Apps Script HMAC check.
        folderLabel="RD2::"+encodeURIComponent(docType)+"::"+d.tracking_number;
      } else {
        folderLabel=d.tracking_number;
      }
    }

    if (schoolId) {
      const {data:school,error:schoolError}=await db.from("schools")
        .select("name,is_active").eq("id",schoolId).single();
      if (schoolError || !school?.is_active) return response({error:"School is inactive"},403);
      schoolName=school.name;
    }

    const decoded=atob(b64);
    if (decoded.length<1 || decoded.length>FILE_LIMIT)
      return response({error:"File must be 4 MB or smaller"},413);
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    if (!validFileMagic(bytes,mime))
      return response({error:"File does not match its declared type"},400);

    const sha=base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
    uploadId=crypto.randomUUID();
    const cleanFilename=sanitizedName(name);
    const {data:attempt,error:insErr}=await db.from("upload_attempts").insert({
      id:uploadId,uploaded_by:uid,school_id:schoolId,
      assignment_id:targetType==="announcement"?targetId:null,
      document_id:targetType==="document"?targetId:null,
      original_filename:cleanFilename,content_type:mime,
      file_size_bytes:bytes.length,sha256:sha,status:"processing"
    }).select("first_received_at").single();
    if(insErr||!attempt) throw new Error("Could not record securely received time");

    // Reserve the human-readable Drive filename transactionally. The database
    // locks the assignment, generates a stable ANN-YYYY-NNN code and selects the
    // next submission version before files are sent to Google Drive.
    const {data:storedFilename,error:namingError}=await db.rpc(
      "i_track_reserve_upload_filename",{p_upload_id:uploadId});
    if(namingError||typeof storedFilename!=="string"||storedFilename.length<8
       ||storedFilename.length>180){
      throw new Error("Upload naming failed: "+(namingError?.message||"No filename reserved"));
    }

    const timestamp=Date.now();
    const nonce=crypto.randomUUID().replace(/-/g,"");
    const message=[
      "v1",String(timestamp),nonce,uploadId,
      targetType==="announcement"?targetId:"",
      targetType==="document"?targetId:"",
      targetType==="announcement"?"Announcements":"Documents",
      schoolName,folderLabel,storedFilename,mime,String(bytes.length),sha
    ].join("\n");
    const hmacKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(uploadSecret),
      {name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=base64url(new Uint8Array(await crypto.subtle.sign("HMAC",hmacKey,new TextEncoder().encode(message))));
    const signedPayload={
      version:1,timestamp,nonce,uploadId,
      assignmentId:targetType==="announcement"?targetId:"",
      documentId:targetType==="document"?targetId:"",
      category:targetType==="announcement"?"Announcements":"Documents",
      schoolName,folderLabel,fileName:storedFilename,mimeType:mime,
      byteLength:bytes.length,sha256:sha,signature,contentBase64:b64
    };

    const gas=await fetch(scriptUrl,{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(signedPayload),
      redirect:"follow",signal:AbortSignal.timeout(55000)});
    if (!gas.ok) {
      bridgeHttpStatus=gas.status;
      const host=new URL(gas.url).hostname;
      console.error("Google Drive bridge returned an unsuccessful HTTP response",{
        http_status:gas.status,final_host:host,
        content_type:gas.headers.get("content-type")||"unknown"
      });
      throw new Error("Google Drive bridge request failed (HTTP "+gas.status+")");
    }
    let result:Record<string,unknown>;
    try{result=await gas.json();}catch{throw new Error("Drive returned an invalid response");}
    if(result.success!==true||typeof result.fileId!=="string"||
       !/^[A-Za-z0-9_-]{10,200}$/.test(result.fileId))
      throw new Error("Drive could not store the document");
    driveSaved=true;
    const fileId=result.fileId;
    const {error:markError}=await db.from("upload_attempts")
      .update({status:"drive_saved",drive_file_id:fileId,stored_at:new Date().toISOString()})
      .eq("id",uploadId).eq("status","processing");
    if(markError) throw new Error("Drive saved file but receipt update needs recovery");
    const {data:recordId,error:doneError}=await db.rpc("i_track_finalize_drive_upload",
      {p_upload_id:uploadId,p_drive_file_id:fileId});
    if(doneError||!recordId) throw new Error("Drive saved file but final database recording needs recovery");
    return response({
      ok:true,upload_id:uploadId,record_id:recordId,
      received_at:attempt.first_received_at,
      file_name:cleanFilename,
      stored_file_name:storedFilename,
      status:"recorded"
    },201);
  }catch(e){
    console.error("SRII secure upload failure:",e instanceof Error?e.message:"Unknown");
    if(uploadId&&!driveSaved){
      await db.from("upload_attempts").update({
        status:"failed",error_code:bridgeHttpStatus===null?"upload_transfer_failed":"drive_http_"+bridgeHttpStatus,updated_at:new Date().toISOString()
      }).eq("id",uploadId).eq("status","processing");
    }
    return response({error:driveSaved?
      "The file reached Google Drive, but saving its receipt failed. Ask the district administrator to review it before retrying.":
      bridgeHttpStatus!==null?
      "Google Drive bridge returned HTTP "+bridgeHttpStatus+". The upload was not confirmed. Ask the district administrator to check the Drive bridge and existing files before retrying.":
      "The upload was not confirmed. Ask the district administrator to check the upload log and Drive folder before retrying.",
      upload_reference:uploadId?uploadId.slice(0,8):null},502);
  }
});
