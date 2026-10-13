# SRII i-TRACK — Trial Website
San Remigio II District Document Tracking System (alpha).

The frontend is intentionally lightweight: plain HTML, CSS and JavaScript hosted by GitHub Pages. Supabase powers user authentication, role-specific permissions, announcement compliance, and routed-document records.

## Status
- Supabase project configured, 26 schools listed, Main Administrator active.
- New AO II personnel may register and request school assignment, subject to district approval.
- Admin announcements, school status-only monitoring, routing and acknowledgement are implemented as trial interfaces.
- Google Apps Script -> DepEd Drive was tested separately; **web uploads remain disabled until a protected, verified bridge is built**.
- File compression is local only; SSD archiving and production-grade testing are not yet complete.
- Do not submit real confidential records until role and access tests with multiple accounts have passed.

## Publish
In GitHub repository Settings → Pages, select Deploy from a branch → main → /(root) → Save.
Expected Pages URL: https://jaymeetin.github.io/srii-itrack/

In Supabase dashboard → Authentication → URL Configuration:
- Set Site URL to https://jaymeetin.github.io/srii-itrack/
- Add Redirect URL https://jaymeetin.github.io/srii-itrack/
Then test the login, email confirmation, and a new pending school user.

## Security
The browser needs only the *publishable* Supabase key (in config.js). Do not commit service_role keys, Apps Script deployment secrets, tokens or private Drive links.
All app tables have RLS enabled. Uploaded documents stay off until protected transfer and Drive permissions are implemented and tested.
