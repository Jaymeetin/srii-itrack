/* SRII i-TRACK requirement checklists for common personnel claims.
 * Copied from the District's checklist sheet. The list is information only;
 * samples are shared per document (see "docs"), so a sample of, for example,
 * the Oath of Office appears under every claim that needs one.
 * Each item: [document key, name as written on the sheet, note].
 * "personal" documents are records each person gets for themselves
 * (payslip, birth certificate, bank or agency records); no samples are
 * collected for them, to keep private details private.
 */
(()=>{
'use strict';
const docs={
 'form-7':{label:'Form 7'},
 'dtr':{label:'DTR (Daily Time Record)'},
 'accomplishment-report':{label:'Accomplishment Report'},
 'appointment':{label:'Appointment (CSC approved)'},
 'oath-of-office':{label:'Oath of Office'},
 'assumption-to-duty':{label:'Assumption to Duty'},
 'saln':{label:'SALN (Assets and Liabilities)',personal:true},
 'bir-forms':{label:'BIR / TIN forms',personal:true},
 'gsis-msp':{label:'BP number / MSP',personal:true},
 'philhealth-mdr':{label:'PhilHealth MDR',personal:true},
 'pagibig-mdf':{label:'Pag-IBIG MDF',personal:true},
 'atm-deposit-slip':{label:'ATM / Deposit Slip',personal:true},
 'clp':{label:'Certificate of Last Payment'},
 'payslip':{label:'Payslip',personal:true},
 'clearance':{label:'Clearance'},
 'clp-computation':{label:'CLP Computation'},
 'service-record':{label:'Service Record'},
 'lawop':{label:'LAWOP'},
 'second-indorsement':{label:'2nd Indorsement'},
 'nosi':{label:'NOSI'},
 'so-maternity-leave':{label:'S.O. – Maternity Leave'},
 'form-6':{label:'Form 6'},
 'cs-form-41':{label:'CS Form 41 (Medical Certificate)'},
 'so-return-to-duty':{label:'S.O. – Return to Duty'},
 'letter-of-intent':{label:'Letter of Intent'},
 'medical-fit-to-work':{label:'Medical Certificate – Fit to Work'},
 'birth-certificate':{label:'Birth Certificate of the Child',personal:true},
 'individual-form':{label:'Teacher/Employee Individual Form'},
 'plantilla':{label:'Plantilla'},
 'differential-computation':{label:'Computation (step differential)'}
};
const sets=[
 {id:'first-salary-claim',title:'First Salary Claim',subtitle:'Newly hired personnel',copies:'3 sets',deadline:'On or before the 5th of the month',items:[
  ['form-7','Form 7','complete signatories · c/o District'],
  ['dtr','DTR','original signature'],
  ['accomplishment-report','Accomplishment Report','if applicable'],
  ['appointment','Approved Appointment',''],
  ['oath-of-office','Oath of Office',''],
  ['assumption-to-duty','Assumption to Duty',''],
  ['saln','Assets and Liabilities (SALN)',''],
  ['bir-forms','BIR 1902/2305/2316','for transferee'],
  ['gsis-msp','BP number/MSP',''],
  ['philhealth-mdr','PhilHealth (MDR)',''],
  ['pagibig-mdf','Pag-IBIG (MDF)',''],
  ['atm-deposit-slip','ATM/Deposit Slip','current account'],
  ['clp','Certificate of Last Payment','for transferee'],
  ['payslip','Latest Payslip','for transferee'],
  ['clearance','School Clearance','for transferee']]},
 {id:'certificate-of-last-payment',title:'Certificate of Last Payment',subtitle:'',copies:'3 sets',deadline:'',items:[
  ['clp-computation','CLP Computation',''],
  ['service-record','Signed Service Record',''],
  ['lawop','Signed LAWOP',''],
  ['second-indorsement','2nd Indorsement',''],
  ['payslip','Payslip',''],
  ['nosi','Signed NOSI','all step claimed']]},
 {id:'loyalty-pay',title:'Loyalty Pay',subtitle:'',copies:'3 sets',deadline:'',items:[
  ['appointment','Approved Appointment','1st'],
  ['service-record','Updated Service Record',''],
  ['lawop','LAWOP','']]},
 {id:'maternity-leave',title:'Maternity Leave (Double Pay)',subtitle:'',copies:'3 sets',deadline:'',items:[
  ['so-maternity-leave','S.O. – Maternity Leave',''],
  ['form-6','Approved Form 6',''],
  ['cs-form-41','CS Form 41','Medical Certificate'],
  ['clearance','Clearance',''],
  ['so-return-to-duty','S.O. – Return to Duty',''],
  ['letter-of-intent','Letter of Intent',''],
  ['medical-fit-to-work','Medical Certificate – Fit to Work',''],
  ['birth-certificate','Birth Certificate of the Child',''],
  ['payslip','Payslip','']]},
 {id:'salary-integration-rpsu',title:'Salary Integration',subtitle:'Division Paid to RPSU Paid',copies:'1 copy',deadline:'',items:[
  ['individual-form','Teacher/Employee Individual Form',''],
  ['appointment','CSC Approved Appointment',''],
  ['appointment','Previous Appointment','transferee'],
  ['oath-of-office','Oath of Office',''],
  ['assumption-to-duty','Assumption to Duty',''],
  ['gsis-msp','BP number/MSP',''],
  ['pagibig-mdf','Pag-IBIG MDF',''],
  ['bir-forms','TIN ID/1902/1905/2305',''],
  ['philhealth-mdr','PhilHealth MDR',''],
  ['atm-deposit-slip','ATM/Deposit Slip','current account'],
  ['plantilla','Plantilla','c/o Division Office']]},
 {id:'salary-integration-promotion',title:'Salary Integration',subtitle:'Promotion/Reclass',copies:'1 copy',deadline:'',items:[
  ['appointment','CSC Approved Appointment',''],
  ['payslip','Latest Payslip',''],
  ['gsis-msp','Updated MSP',''],
  ['assumption-to-duty','Assumption to Duty',''],
  ['lawop','LAWOP',''],
  ['service-record','Updated Service Record',''],
  ['plantilla','Plantilla','c/o Division Office']]},
 {id:'salary-differential-promotion',title:'Salary Differential',subtitle:'Promotion/Reclass',copies:'3 sets',deadline:'',items:[
  ['appointment','CSC Approved Appointment',''],
  ['payslip','Payslip','before and after integration'],
  ['gsis-msp','Updated MSP',''],
  ['assumption-to-duty','Assumption to Duty',''],
  ['lawop','Latest LAWOP',''],
  ['service-record','Updated Service Record','']]},
 {id:'step-differential',title:'Step Differential',subtitle:'',copies:'3 sets',deadline:'5th of the month',items:[
  ['nosi','Approved NOSI','all STEP to be claimed'],
  ['appointment','CSC Approved Appointment',''],
  ['service-record','Updated Service Record',''],
  ['gsis-msp','Updated MSP',''],
  ['lawop','LAWOP',''],
  ['payslip','Payslip','before and after integration'],
  ['differential-computation','Computation','c/o ADAS-III/AO-II']]},
 {id:'step-integration',title:'Step Integration',subtitle:'',copies:'1 set only',deadline:'5th of the month',items:[
  ['nosi','Approved NOSI','current STEP'],
  ['appointment','CSC Approved Appointment',''],
  ['service-record','Updated Service Record',''],
  ['gsis-msp','Updated MSP',''],
  ['lawop','LAWOP',''],
  ['payslip','Latest Payslip',''],
  ['plantilla','Plantilla','c/o Division Office']]}
];
const freeze=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(o);};
window.ITRACK_REQUIREMENTS=freeze({docs,sets});
})();
