# SRII i-TRACK — District Document Tracking System
San Remigio II District document tracking and submission monitoring PWA. In active district deployment with ongoing maintenance and improvement.

The frontend is intentionally lightweight: plain HTML, CSS and JavaScript hosted by GitHub Pages. Supabase powers user authentication, role-specific permissions, announcement compliance, and routed-document records.

## Status
- Supabase authentication and data services are configured; school assignments and active personnel are maintained by the district administrator.
- New AO II personnel may register and request school assignment, subject to district approval.
- Admin announcements, submission monitoring, document routing and acknowledgement are supported workflows.
- The authenticated upload and download Edge Functions are deployed. Google Drive access remains subject to the active server-side authorization and Google Apps Script connector.
- Image compression runs locally. SSD archiving is planned but not enabled in the current interface.
- Only authorized records should be uploaded. Role-based access, user account approval, upload history, and file verification should be reviewed with real approved accounts during maintenance.

## Publish
In GitHub repository Settings → Pages, select Deploy from a branch → main → /(root) → Save.
Expected Pages URL: https://jaymeetin.github.io/srii-itrack/

In Supabase dashboard → Authentication → URL Configuration:
- Set Site URL to https://jaymeetin.github.io/srii-itrack/
- Add Redirect URL https://jaymeetin.github.io/srii-itrack/
Then test the login, email confirmation, and a new pending school user.

## Security
The browser needs only the *publishable* Supabase key (in config.js). Do not commit service_role keys, Apps Script deployment secrets, tokens or private Drive links.
Access is guarded using database permissions, RLS, authenticated Edge Functions, and authorized Drive transfer. Recheck access policies and file permissions whenever the schema or functions change.
