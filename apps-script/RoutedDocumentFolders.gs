/**
 * SRII i-TRACK — Google Apps Script routed-upload folder bridge.
 * Install into the EXISTING Apps Script project alongside SecureUpload.gs.
 * Must be called ONLY AFTER SecureUpload.gs verifies the complete HMAC-signed
 * upload request, and AFTER creating the Drive file, before success response.
 *
 * In SecureUpload.gs (where `file` is the DriveApp File):
 *     iTrackPutRoutedFile_(p, file);
 *
 * For Announcements and legacy uploads this is deliberately a NO-OP.
 * Do not add a second doPost(e). Do not change ROOT_FOLDER_ID or permissions.
 * If you already installed RoutedDocumentFolders.gs from the migration ZIP,
 * use its existing iTrackPutRoutedFile_ function; do NOT add this duplicate.
 */
function iTrackPutRoutedFile_(p, file) {
  if (!p || p.category !== 'Documents') return false;
  var label = String(p.folderLabel || '');
  if (label.indexOf('RD2::') !== 0) return false;

  var parts = label.split('::');
  if (parts.length !== 3 || parts[0] !== 'RD2')
    throw Error('Invalid routed folder label');
  var type;
  try { type = decodeURIComponent(parts[1]); }
  catch (_) { throw Error('Invalid document type encoding'); }
  var tracking = parts[2];
  var school = p.schoolName;
  if (!/^[a-f0-9-]{36}$/i.test(String(p.documentId || '')))
    throw Error('Invalid signed document ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/.test(String(tracking)))
    throw Error('Invalid tracking number');
  [school,type].forEach(function(name) { iTrackValidateRoutedSegment_(name); });

  var rootId = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (!rootId) throw Error('ROOT_FOLDER_ID missing');
  var root = DriveApp.getFolderById(rootId);
  if (!file || !file.getParents || !file.moveTo || !file.getId)
    throw Error('Existing DriveApp File required');

  // This bridge cannot be used to move an external file into the private root,
  // or to touch an announcement upload even if the category was mislabelled.
  var ancestry = iTrackRoutedAncestry_(file,root.getId());
  if (!ancestry.withinRoot) throw Error('Routed file is outside district Drive root');
  if (ancestry.inAnnouncements) throw Error('Announcements must never be moved');

  var initialId = file.getId();
  var dest = root;
  ['School Documents',school,type,tracking].forEach(function(part) {
    dest = iTrackEnsureRoutedFolder_(dest,part);
  });
  file.moveTo(dest);
  if (file.getId() !== initialId) throw Error('Drive file ID changed during move');
  var parents=file.getParents(), verified=false;
  while (parents.hasNext()) if (parents.next().getId()===dest.getId()) verified=true;
  if (!verified) throw Error('Destination folder verification failed');
  return true;
}

function iTrackValidateRoutedSegment_(name) {
  var value=String(name==null?'':name).trim();
  if (!value || value.length>150 || value==='.' || value==='..' ||
      value.indexOf('/')>=0 || value.indexOf(String.fromCharCode(92))>=0 ||
      Array.from(value).some(function(ch){return ch.charCodeAt(0)<32;}))
    throw Error('Unsafe routed document folder segment');
  return value;
}
function iTrackEnsureRoutedFolder_(parent,name) {
  var safe=iTrackValidateRoutedSegment_(name);
  var matches=parent.getFoldersByName(safe);
  if (matches.hasNext()) {
    var folder=matches.next();
    if (matches.hasNext()) throw Error('Duplicate same-name Drive folders found');
    return folder;
  }
  return parent.createFolder(safe);
}
function iTrackRoutedAncestry_(file,rootId) {
  var pending=[],seen={},steps=0,withinRoot=false,inAnnouncements=false;
  var p=file.getParents();
  while(p.hasNext())pending.push(p.next());
  while(pending.length && steps++<80) {
    var folder=pending.shift(),id=folder.getId();
    if(seen[id])continue;
    seen[id]=true;
    if(id===rootId){withinRoot=true;continue;}
    if(String(folder.getName()).toLowerCase()==='announcements')
      inAnnouncements=true;
    var higher=folder.getParents();
    while(higher.hasNext())pending.push(higher.next());
  }
  return {withinRoot:withinRoot,inAnnouncements:inAnnouncements};
}
