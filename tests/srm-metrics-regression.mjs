import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('srm-metrics.js','utf8');
const env={};env.window=env;vm.createContext(env);vm.runInContext(source,env);
const M=env.DCMSRMAggregate;
const fail=message=>{throw Error('SRM KPI regression: '+message)};
const a=(key,fields)=>({key,outlet:key.split('|||')[0],businessNo:key.split('|||')[1],businessName:key,...fields});
const actions=[
 a('A|||1',{reasonCode:'03',plan:'ERP 연동 기술 협의 예정',status:'TODO'}),
 a('A|||2',{partnerAction:{reasonCode:'04',plan:'거래처 요청',dueDate:'2026-09-01',status:'IN_PROGRESS',editedFields:['reasonCode','plan','dueDate','status']}}),
 a('A|||3',{reasonCode:'01',plan:'기존 계획',status:'TODO'})
];
const history=[
 a('A|||3',{month:'2026-09',sourceMonth:'2026-08',type:'X2O',startOx:'X/—/—',endOx:'O/—/—',
   masterAction:{reasonCode:'06',plan:'ERP업체 소통하여 정상 연동 조치',dueDate:'2026-09-30',status:'DONE'},
   partnerAction:{reasonCode:'06',plan:'거래처 요청 및 대웅 협조',status:'DONE'},entities:['대웅제약']}),
 a('B|||4',{month:'2026-09',sourceMonth:'2026-08',type:'SUPPLY_STOP',
   masterAction:{},partnerAction:{reasonCode:'04',plan:'공급 중단',dueDate:'2026-09-30',status:'DONE'}})
];
const events=[{key:'A|||1',status:'ERP_WAIT',entity:'대웅제약',erpVendor:'검증 ERP 업체',nextAction:'재시험'}];
const result=M.build({actions,history,events,month:'2026-09',latestMonth:'2026-09'});
const s=result.stats;
for(const [key,value] of Object.entries({total:4,master:2,partner:1,retrospective:2,
 srm:1,needsAction:3,progress:2,done:0,verified:1,stopped:1,erp:1})){
 if(s[key]!==value)fail(key+' should be '+value+', got '+JSON.stringify(s));
}
if('overdue' in s)fail('Retired due-date metric still exists');
const converted=result.records.find(r=>r.key==='A|||3');
if(!converted?.verified||converted?.done||converted?.source!=='live'||converted?.masterAction.plan!=='기존 계획')
 fail('Actual live Action must win over synthetic historical notes; X-to-O is not proof of completed work');
const stopped=result.records.find(r=>r.key==='B|||4');
if(!stopped?.needsAction||stopped?.done||stopped?.masterFilled||stopped?.partnerFilled||
 stopped.erpRelated||stopped.verified||stopped.nextAction!=='조치 근거 확인 필요')
 fail('Automatic supply stop must not count as proved action or ERP discussion');
const erpFromPlan=result.records.find(r=>r.key==='A|||3');
if(erpFromPlan.erpRelated)fail('ERP wording in a plan is not evidence of vendor contact');

const fabricated=Array.from({length:41},(_,i)=>a('RETRO|||'+i,{month:'2026-06',sourceMonth:'2026-06',type:'X2O',
 masterAction:{reasonCode:'06',plan:'ERP업체 소통하여 정상 연동 조치',status:'IN_PROGRESS',dueDate:'2026-06-30'},
 partnerAction:{reasonCode:'06',plan:'거래처 요청 및 대웅 협조',status:'IN_PROGRESS',dueDate:'2026-06-30'}}));
const inferred=M.build({history:fabricated,month:'2026-06',latestMonth:'2026-09'});
for(const [key,value] of Object.entries({total:41,retrospective:41,master:0,partner:0,
 progress:0,done:0,erp:0,srm:0,needsAction:41})){
 if(inferred.stats[key]!==value)fail('41 synthetic historical cases wrongly counted as real '+key);
}
if(inferred.records.some(r=>r.progress||r.done||r.erpRelated||r.masterFilled||r.partnerFilled))
 fail('Retrospective status fabricated a confirmed activity');

const completed=M.build({history:[a('X|||1',{month:'2026-09',type:'X2O',masterAction:{status:'DONE'}})],
 month:'2026-09',latestMonth:'2026-09'});
if(completed.stats.verified!==1||completed.stats.done!==0||completed.stats.needsAction!==0)
 fail('Observed X-to-O improvement is not an audited completed action');
const logged=M.build({actions:[a('C|||5',{status:'DONE',reasonCode:'04',partnerAction:{reasonCode:'01',status:'DONE'}})],
 events:[{key:'C|||5',status:'DONE',contactTarget:'ERP 업체'}],month:'2026-09',latestMonth:'2026-09'});
if(logged.stats.done!==1||logged.stats.erp!==1||logged.stats.dispute!==1)
 fail('Actual recorded action/ERP conversation must still be counted');
if(M.meaningful({dueDate:'2026-09-30',status:'TODO'}))fail('A retired due date cannot create an active SRM case');
const older=M.build({actions,history:[],month:'2026-08',latestMonth:'2026-09'});
if(older.stats.total!==0)fail('Timeless actions leaked into a previous month');
console.log('PASS SRM METRICS: no fabricated action/ERP claims, no deadline, verified DCM vs actual completed, live editing evidence preserved');
