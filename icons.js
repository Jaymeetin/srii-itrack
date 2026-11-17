/* SRII i-TRACK interface icons and status tones.
 * Presentation only: no data, permissions or navigation logic lives here.
 * Each icon is a simple line drawing on a 24 x 24 grid that inherits the
 * surrounding text colour, so it works in the light and the dark theme.
 */
(() => {
"use strict";
const shapes={
 camera:'<path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2.2l1.6-2.3h5.4l1.6 2.3h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
 home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.2V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.2"/><path d="M9.5 21v-6.5h5V21"/>',
 megaphone:'<path d="M3 10.6v2.8a1 1 0 0 0 .7 1L18 19V5L3.7 9.6a1 1 0 0 0-.7 1z"/><path d="M7.5 15.6V18a2.4 2.4 0 0 0 4.8 0v-.9"/><path d="M21 9.8v4.4"/>',
 bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.5H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
 chart:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 16.5v-4M12 16.5v-9M16 16.5v-6"/>',
 file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
 fileText:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
 send:'<path d="M21 3 10.2 13.8"/><path d="M21 3l-6.6 18-4.2-7.2L3 9.6z"/>',
 building:'<path d="M3 21h18"/><path d="M5.5 21V10.5M10 21V10.5M14 21V10.5M18.5 21V10.5"/><path d="M12 3 3 8.3v2.2h18V8.3z"/>',
 inbox:'<path d="M3 13.5 5.7 5.8a2 2 0 0 1 1.9-1.3h8.8a2 2 0 0 1 1.9 1.3L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13.5h5l1.5 3h5l1.5-3h5"/>',
 barChart:'<path d="M4 20.5h16"/><path d="M7.5 20.5V13M12 20.5V5M16.5 20.5V9.5"/>',
 history:'<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1L3.6 8.4"/><path d="M3.6 4v4.4H8"/><path d="M12 7.6V12l3 1.9"/>',
 message:'<path d="M20 15.5a2 2 0 0 1-2 2H9l-5 4v-15a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8.5 9.5h7M8.5 13h4.5"/>',
 sliders:'<path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
 clipboardCheck:'<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5"/><path d="m8.8 13 2.3 2.3 4.2-4.5"/>',
 paperclip:'<path d="M20 11.4 12.2 19.2a5 5 0 0 1-7.1-7.1l8.3-8.3a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
 user:'<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
 userCheck:'<circle cx="9.5" cy="8" r="3.6"/><path d="M3 20.5a6.5 6.5 0 0 1 13 0"/><path d="m16.5 11.6 2 2 3.5-3.9"/>',
 tag:'<path d="M3.5 12.3V5A1.5 1.5 0 0 1 5 3.5h7.3a2 2 0 0 1 1.4.6l6.7 6.7a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-7.3-7.1a2 2 0 0 1-.6-1.4z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
 archive:'<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
 trash:'<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.3-4.3L3.5 9"/><path d="M3.5 4.5V9H8"/><path d="M4 13a8 8 0 0 0 14.3 4.3l2.2-2.3"/><path d="M20.5 19.5V15H16"/>',
 contrast:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
 logout:'<path d="M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9.5"/>',
 listChecks:'<path d="m3.5 6.6 1.7 1.7L8.3 5"/><path d="m3.5 13.6 1.7 1.7 3.1-3.3"/><path d="M12 6.5h8.5M12 13.5h8.5M4 19.5h16.5"/>',
 school:'<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.2c0 1.2 2.5 2.7 5.5 2.7s5.5-1.5 5.5-2.7v-4.2"/><path d="M21.5 9.5v5"/>',
 folder:'<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 checkCircle:'<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.3 2.4 2.4 4.8-5"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.9"/>',
 alert:'<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5"/><path d="M12 17.1v.1"/>',
 info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.7v.1"/>',
 upload:'<path d="M12 15.5V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
 download:'<path d="M12 4v11.5"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 chevronRight:'<path d="m9 5.5 6.5 6.5L9 18.5"/>',
 chevronLeft:'<path d="M15 5.5 8.5 12l6.5 6.5"/>',
 chevronDown:'<path d="m5.5 9 6.5 6.5L18.5 9"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 external:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
 wrench:'<path d="M15.2 3.9a5 5 0 0 0-5.9 6.6l-5.7 5.7a2.1 2.1 0 0 0 3 3l5.7-5.7a5 5 0 0 0 6.6-5.9l-3.2 3.2-2.6-.6-.6-2.6z"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
 arrowUp:'<path d="M12 19.5V5"/><path d="m6 10.5 6-6 6 6"/>',
 arrowLeft:'<path d="M19.5 12H5"/><path d="m10.5 6-6 6 6 6"/>',
 more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
};
/** One icon per application page, shared by the desktop sidebar and the mobile menu. */
window.ITRACK_NAV_ICONS=Object.freeze({dashboard:'home',announcements:'megaphone',templates:'folder',notifications:'bell',monitoring:'chart',documents:'fileText',division:'send',district:'building',retrieval:'inbox',reports:'barChart','system-recovery':'history','feedback-admin':'message',feedback:'message',settings:'sliders',verification:'clipboardCheck','school-files':'paperclip',approvals:'userCheck','document-types':'tag',archive:'archive','document-control':'trash','system-updates':'refresh'});
/** Returns inline SVG markup for a named icon, or an empty string if unknown. */
window.ITRACK_ICON=function(name,extraClass){
 const body=shapes[name];
 if(!body)return "";
 return '<svg class="ico'+(extraClass?" "+extraClass:"")+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
};
/** Colour family for a status label. Display only; it never changes the status itself. */
window.ITRACK_TONE=function(value){
 const text=String(value??"").replace(/_/g," ").trim().toLowerCase();
 if(!text)return "neutral";
 if(/\b(late|rejected|cancelled|canceled|disabled|deleted|removed|lost|failed|expired|inactive|not confirmed)\b/.test(text))return "bad";
 if(/\b(pending|awaiting|draft|reviewing|review|returned|correction|waiting|unconfirmed|claimed|not yet|ready)\b/.test(text))return "warn";
 if(/\b(unread|in transmittal|in school|dispatched|forwarded|retrieved|submitted (to|for)|school submission|recovery|update|owner assignment)\b/.test(text))return "info";
 if(/\b(verified|submitted|active|open|received|completed|approved|processed|resolved|registered|stored|accepted|available|filed|confirmed|on time)\b/.test(text))return "good";
 return "neutral";
};
})();
