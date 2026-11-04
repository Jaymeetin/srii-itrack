/* SRII i-TRACK 30 MB attachment handling; no external image-compression service. */
(() => {
"use strict";
const LIMIT = 30 * 1024 * 1024;
const fmt = bytes => bytes >= 1024 * 1024 ? (bytes / 1048576).toFixed(2) + " MB" : (bytes / 1024).toFixed(1) + " KB";
const TYPES = {pdf:"application/pdf",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"};
const mimeFor = file => TYPES[(file.name.split(".").pop() || "").toLowerCase()] || "";
const PDF_URL = "https://www.ilovepdf.com/compress_pdf";
function sizeError(files, existingBytes = 0) {
 const size = files.reduce((sum, f) => sum + f.size, existingBytes);
 if (size <= LIMIT) return "";
 return "The combined attachment size is " + fmt(size) + ", exceeding the 30 MB limit. " +
   (files.some(f => mimeFor(f) === "application/pdf") ?
   "Compress your PDF at " + PDF_URL + " and select the smaller PDF again. " : "Remove or reduce some attachments. ") +
   "Existing files are not deleted.";
}
async function optimizeImage(file) {
 if (!mimeFor(file).startsWith("image/") || file.size === 0) return file;
 let bitmap;
 try {
  bitmap = await createImageBitmap(file, {imageOrientation:"from-image"});
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", {alpha:false});
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.90));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "").slice(0,145) + "-compressed.webp", {type:"image/webp",lastModified:file.lastModified});
 } catch (error) {
  console.warn("Local image compression unavailable; keeping original:",error);
  return file;
 } finally { if (bitmap && typeof bitmap.close === "function") bitmap.close(); }
}
async function prepare(files, onProgress) {
 const output=[];
 for (let i=0;i<files.length;i++) {
  const file=files[i];
  if (!mimeFor(file) || file.size < 1) throw Error("Unsupported or empty attachment: " + file.name);
  onProgress?.({index:i,total:files.length,name:file.name,phase:"compressing"});
  output.push(await optimizeImage(file));
 }
 return output;
}
function upload({file,targetType,targetId,token,url,apikey,onProgress}) {
 return new Promise((resolve,reject) => {
  if (!token) {reject(Error("Sign in again before uploading."));return;}
  const reader=new FileReader();
  reader.onerror=()=>reject(Error("Could not prepare " + file.name + " for upload."));
  reader.onprogress=e=>{if(e.lengthComputable)onProgress?.({phase:"reading",percent:Math.round(e.loaded/e.total*100)});};
  reader.onload=()=>{
   const xhr=new XMLHttpRequest();
   xhr.open("POST",url+"/functions/v1/itrack-upload",true);
   xhr.timeout=190000;
   xhr.setRequestHeader("Content-Type","application/json");
   xhr.setRequestHeader("apikey",apikey);
   xhr.setRequestHeader("Authorization","Bearer "+token);
   xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.({phase:"transferring",percent:Math.min(100,Math.round(e.loaded/e.total*100))});};
   xhr.upload.onload=()=>onProgress?.({phase:"confirming",percent:null});
   xhr.onerror=()=>reject(Error("Network error. Verify the file history before retrying; the server may have received the file."));
   xhr.ontimeout=()=>reject(Error("Upload timed out. Check the submission history before retrying to avoid duplicates."));
   xhr.onabort=()=>reject(Error("Upload was interrupted. Check the submission history before retrying."));
   xhr.onload=()=>{
    let answer={};
    try{answer=JSON.parse(xhr.responseText||"{}");}catch{}
    if(xhr.status < 200 || xhr.status >= 300 || !answer.ok) {
     reject(Error(answer.error || "The upload was not confirmed (HTTP "+xhr.status+")."));return;
    }
    resolve(answer);
   };
   xhr.send(JSON.stringify({target_type:targetType,target_id:targetId,file_name:file.name,mime_type:mimeFor(file),content_base64:String(reader.result).split(",")[1]}));
  };
  reader.readAsDataURL(file);
 });
}
function progressDialog(title) {
 let overlay=document.getElementById("srii-upload-overlay");
 if (overlay) overlay.remove();
 overlay=document.createElement("div");
 overlay.id="srii-upload-overlay";
 overlay.className="srii-upload-overlay";
 overlay.setAttribute("role","dialog");
 overlay.setAttribute("aria-modal","true");
 overlay.setAttribute("aria-label","Upload in progress");
 overlay.innerHTML='<div class="srii-upload-dialog"><div class="srii-upload-symbol" aria-hidden="true">↑</div><h2></h2><p class="srii-upload-step" role="status" aria-live="polite"></p><div class="srii-upload-meter"><div class="srii-upload-meter-fill"></div></div><strong class="srii-upload-percent"></strong><p class="srii-upload-explain">Please keep this page open. Do not click Route again.</p></div>';
 document.body.append(overlay);
 overlay.querySelector("h2").textContent=title||"Uploading document";
 const step=overlay.querySelector(".srii-upload-step");
 const fill=overlay.querySelector(".srii-upload-meter-fill");
 const percent=overlay.querySelector(".srii-upload-percent");
 return {
  update(label, pct=null) {
   step.textContent=label;
   fill.style.width=pct==null?"100%":Math.max(0,Math.min(100,pct))+"%";
   fill.classList.toggle("indeterminate",pct==null);
   percent.textContent=pct==null?"Processing securely…":Math.max(0,Math.min(100,Math.round(pct)))+"% transferred";
  },
  close(){overlay.remove();}
 };
}
window.ITRACK_UPLOAD = Object.freeze({LIMIT,fmt,mimeFor,PDF_URL,sizeError,prepare,optimizeImage,upload,progressDialog});
})();