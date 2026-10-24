# SRII i-TRACK — Routed Document Folder Reorganization (Trial)

## Status
The migration has been PREPARED, **not yet executed in Google Drive**. The Apps Script project's source is not connected to this ChatGPT session. Do not merge or activate the staged Supabase upload-code change before updating the Apps Script bridge.

This package changes **routed documents only**. There is no action on announcement folders or files.

## Exact destination
Inside the existing Drive root identified by the Apps Script `ROOT_FOLDER_ID`:

```
SRII i-TRACK DOCUMENTS/
  School Documents/
    SINUNDOLAN ES/
      Loyalty Pay Requirements/
        SRII-2026-000003/
          (existing file — same Google Drive file ID)
```

The top-level `School Documents` folder is new. School Name is the **document's originating school**, NEVER the assisting uploader's school. Document ID means the readable `tracking_number` (e.g. `SRII-2026-000003`), not a random UUID.

## Package files
- `RoutedDocumentFolders.gs` — Apps Script *add-on* with a new-path helper, a verified dry-run preview and an idempotent move.
- `Routed_Migration_Manifest.json` — private manifest for the existing 6 routed-document attachments.
- `Routed_Migration_Script_Property_Value.txt` — same manifest on one line for convenient copy into Apps Script Script Properties.
- `Migration_Inventory.csv` — the expected destination for each of the six routed-document attachments.
- `README.txt` — these instructions.

**Do not commit either manifest to a public repository.** They contain private Drive file IDs and checksums.

## Existing-file migration (no deletion)
1. In the *existing* Google Apps Script project used by SRII i-TRACK, add a new script file named `RoutedDocumentFolders.gs` and paste the supplied code. Do **not** replace `SecureUpload.gs` or its `doPost(e)`.
2. In **Project Settings → Script Properties**, add `SRII_ROUTED_MIGRATION_MANIFEST`. Paste the exact one-line contents of `Routed_Migration_Script_Property_Value.txt` as its value.
3. Run `iTrackPreviewRoutedMigration` from Apps Script. This reads and verifies files without changing any folder or file. The expected result with the updated private manifest is **6 READY**, **0 held for missing originating school**. If the count differs or any file check fails, stop.
4. Only after inspecting the preview, add Script Property `SRII_ROUTED_MIGRATION_CONFIRMATION` with exact value `MOVE_ROUTED_FILES_ONLY`, and run `iTrackRunRoutedMigration`.
5. Re-run the preview; all six files should now show `ALREADY CORRECT`. Test View and Download in SRII i-TRACK. They should continue to work because the Drive file IDs did not change.

### District Office document confirmed by owner
Tracking `SRII-2026-000001` (Memorandum) belongs to **DISTRICT OFFICE**. All three attachments now appear in the updated private migration manifest under `School Documents / DISTRICT OFFICE / Memorandum / SRII-2026-000001`. Its originating school ID remains `NULL` because the District Office is not one of the schools; the creator was verified as the Main Administrator. Do not assign an invented school ID or use the school of an assisting uploader.

### Unconfirmed upload on October 23
Tracking `SRII-2026-000007` has an upload attempt marked `failed` with no Drive file ID, despite a report that the file may exist in Drive. It cannot be safely relocated by ID until it is located and reconciled. Do not delete or blindly reupload it.

## New uploads — bridge integration after migration
The Supabase Edge source for the new routed layout is staged on a development branch, NOT deployed to live. Its new path is behind the `ITRACK_ROUTED_FOLDER_LAYOUT=school_v2` environment flag; without that flag it preserves the current upload behavior.

The signed payload still uses `category: "Documents"` (so Announcements are unaffected), but for routed documents it uses a verified, signed `folderLabel` of
`RD2::<URL-ENCODED DOCUMENT TYPE>::<TRACKING NUMBER>` and `schoolName` from the document's `origin_school_id`.

In the **existing** `SecureUpload.gs`, AFTER the existing signed-request verification and immediately BEFORE sending the successful upload response, insert a call for the saved file:

```javascript
iTrackPutRoutedFile_(p, savedFile); // change savedFile to your actual DriveApp File variable
```

If you only have the resulting file ID variable, use `DriveApp.getFileById(savedFileId)`. The function does nothing for Announcements and legacy routed uploads. It moves only signed `RD2::` uploads to the new target folder. It never deletes or reuploads files.

Because `SecureUpload.gs` is not available in this repository, the exact variable name and insertion point must be checked in that script before this line is installed. Do not add a second `doPost`.

After deploying the Apps Script as a new version, and confirming it can process an RD2 upload without breaking announcement uploads, deploy the staged Edge source with the environment flag set. **Not yet ready to enable for District Office uploads:** the staged Edge version currently requires an originating school ID. Before activation, it must be updated to recognize district-admin-created documents with no school ID as `DISTRICT OFFICE`; the source is not enabled on the live service. For school-origin documents, the source never substitutes the uploader's school.

## Safety
- Only `public.document_attachments` IDs were included; there are **zero** announcement-submission IDs in this manifest.
- Move in Drive preserves file IDs, checksums and app links.
- Script refuses files outside `ROOT_FOLDER_ID` and any file with an `Announcements` folder in its ancestor chain.
- No file or folder is trashed; old empty folders are left intact.
- No Supabase document or attachment records are deleted or updated by migration.
- Two administrator steps (dry-run preview, then explicit move confirmation) prevent accidental bulk movement.

## Activation checklist for future uploads (Apps Script deployment required)

The six existing routed-document attachments have ALREADY been moved in Google Drive. Do not run the earlier migration manifest again.

1. Open the EXISTING SecureUpload.gs source in the Apps Script project that owns the ITRACK_APPS_SCRIPT_URL deployment.
2. Add apps-script/RoutedDocumentFolders.gs from this PR. If you previously installed the migration package's RoutedDocumentFolders.gs, do NOT install another definition of iTrackPutRoutedFile_.
3. After verifying the existing upload request HMAC, after creating the DriveApp File, and before returning success, invoke iTrackPutRoutedFile_(p, savedFile), using your actual variables. Do not add a second doPost.
4. Deploy a NEW version of the existing Google Apps Script web app, preserving the deployment endpoint and Google Drive permissions.
5. Only AFTER verifying the bridge update should the staged Edge Function be deployed and ITRACK_ROUTED_FOLDER_LAYOUT set to school_v2.
6. Test a school document, a District Office document, and an ANNOUNCEMENT. Verify paths, Drive file IDs and that announcements are unmodified.

The Google Drive connector can move files and create folders but DOES NOT support editing/redeploying Apps Script project source. Thus this last activation cannot be performed through that connector alone.
