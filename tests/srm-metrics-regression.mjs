import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync('srm-metrics.js','utf8');const env={};env.window=env;vm.createContext(env);vm.runInContext(code,env);
const M=env.DCMSRMAggregate;
const a=(key,fields)=>({key,outlet:key.split('|||')[0],businessNo:key.split('|||')[1],businessName:key,...fields});
const actions=[
 a('A|||1',{reasonCode:'03',plan:'ERP 연동 기술 협의 예정',status:'TODO'}),
 a('A|||2',{partnerAction:{reasonCode:'04',plan:'거래처 요청',dueDate:'2026-09-01',status:'IN_PROGRESS',editedFields:['reasonCode','plan','dueDate','status']}}),
 a('A|||3',{reasonCode:'01',plan:'old',status:'TODO'})
];
const history=[
 a('A|||3',{month:'2026-09',type:'X2O',masterAction:{reasonCode:'06',plan:'ERP업체 소통하여 정상 연동 조치',dueDate:'2026-09-30',status:'DONE'},partnerAction:{reasonCode:'06',plan:'거래처 요청 및 대웅 협조',dueDate:'2026-09-30',status:'DONE'},entities:['대웅제약']}),
 a('B|||4',{month:'2026-09',type:'SUPPLY_STOP',masterAction:{},partnerAction:{reasonCode:'04',plan:'공급 중단',dueDate:'2026-09-30',status:'DONE'},entities:['대웅제약']})
];
const events=[{key:'A|||1',status:'ERP_WAIT',entity:'대웅제약',erpVendor:'테스트 ERP',nextAction:'재시험'}];
const fail=m=>{throw Error('SRM KPI regression: '+m)};
const out=M.build({actions,history,events,month:'2026-09',latestMonth:'2026-09',today:'2026-10-14'});
const s=out.stats;
if(s.total!==4||s.master!==2||s.partner!==3||s.verified!==1||s.done!==2||s.overdue!==1||s.stopped!==1||s.srm!==1)fail(JSON.stringify(s));
if(!out.records.find(r=>r.key==='A|||1').erpRelated)fail('ERP related Action not included');
if(out.records.find(r=>r.key==='B|||4').verified)fail('supply stop falsely counted as verified X-to-O');
if(out.records.filter(r=>r.key==='A|||3').length!==1)fail('historical record double counted');
const old=M.build({actions,history:history.filter(x=>x.month==='2026-08'),month:'2026-08',latestMonth:'2026-09'});
if(old.stats.total!==0)fail('live timeless Action leaked into past month');
const noInput=M.build({actions:[a('A|||5',{status:'TODO'})],month:'2026-09',latestMonth:'2026-09'});
if(noInput.stats.total!==0)fail('untouched TODO should not be a managed record');
console.log('PASS SRM METRICS: existing master/partner fields, ERP related, past months, historical completed, stop vs verified, de-dup');