import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const metricSource=fs.readFileSync('srm-metrics.js','utf8');
const uiSource=fs.readFileSync('srm-workflow.js','utf8');
const h=(key,month,status,company='인천약품')=>({
 key,month,sourceMonth:'2026-06',nextMonth:'2026-07',
 outlet:company,businessNo:key.split('|||')[1],businessName:{
  '인천약품|||A':'그린팜약품-GP(1)','인천약품|||B':'서울약업-용마택배',
  '타권역|||C':'타권역 거래처'
 }[key],
 entities:['대웅제약'],startOx:'X/X/X',endOx:'O/O/O',
 masterAction:{reasonCode:'06',plan:'마스터 일괄 계획',status},
 partnerAction:{reasonCode:'06',plan:'업체 일괄 계획',status,editedFields:['reasonCode','plan','status']}
});
const historical=[
 h('인천약품|||A','2026-06','IN_PROGRESS'),h('인천약품|||B','2026-06','IN_PROGRESS'),
 h('타권역|||C','2026-06','IN_PROGRESS','타권역'),
 h('인천약품|||A','2026-07','DONE'),h('인천약품|||B','2026-07','DONE')
];
const data=historical.map(v=>({
 month:v.month,outlet:v.outlet,businessNo:v.businessNo,businessName:v.businessName,
 manager:'배영훈',statuses:{대웅제약:v.month==='2026-06'?'X':'O',대웅바이오:null,한올바이오:null}
})).concat([{month:'2026-09',outlet:'인천약품',businessNo:'LATEST',businessName:'최신월',
 statuses:{대웅제약:'X',대웅바이오:null,한올바이오:null}}]);
const actions=[
 // Matches the existing bug: one genuinely entered IN_PROGRESS,
 // plus two (or more) visible IN_PROGRESS rows from monthly defaults.
 {key:'인천약품|||A',outlet:'인천약품',businessNo:'A',businessName:'그린팜약품-GP(1)',
  masterAction:{reasonCode:'02',plan:'실제 마스터 계획',status:'IN_PROGRESS'},
  partnerAction:{editedFields:[]}},
 {key:'인천약품|||B',outlet:'인천약품',businessNo:'B',
  masterAction:{reasonCode:'',plan:'',status:'TODO'},
  partnerAction:{editedFields:[]}}
];
const shownJune=[
 {key:'인천약품|||A',masterStatus:'IN_PROGRESS',partnerStatus:'IN_PROGRESS',monthlyHistorical:true},
 {key:'인천약품|||B',masterStatus:'IN_PROGRESS',partnerStatus:'IN_PROGRESS',monthlyHistorical:true}
];
const shownJuly=[
 {key:'인천약품|||A',masterStatus:'DONE',partnerStatus:'DONE',monthlyHistorical:true},
 {key:'인천약품|||B',masterStatus:'DONE',partnerStatus:'DONE',monthlyHistorical:true}
];
function directMetrics(){
 const sandbox={};sandbox.window=sandbox;vm.createContext(sandbox);
 vm.runInContext(metricSource,sandbox);
 const build=sandbox.DCMSRMAggregate.build;
 const a=build({actions,history:historical.filter(h=>h.month==='2026-06'),
  month:'2026-06',latestMonth:'2026-09',viewRows:shownJune});
 assert.equal(a.stats.total,2,'Other partner/outlet must not leak into monthly SRM');
 assert.equal(a.stats.displayProgress,2,'Both visible IN_PROGRESS rows must count');
 assert.equal(a.stats.progress,1,'Only one historical merchant has actual progress evidence');
 assert.equal(a.stats.projectedProgress,1,'Projected status must be shown separately');
 assert.equal(a.records.filter(r=>r.displayProgress).length,2);
 assert.ok(a.records.every(r=>r.boardStates.master==='IN_PROGRESS'&&r.boardStates.partner==='IN_PROGRESS'));
 assert.equal(a.stats.displayDone,0);
 const replaced=build({actions,history:historical.filter(h=>h.month==='2026-06'),
  month:'2026-06',latestMonth:'2026-09',
  viewRows:[shownJune[0],{...shownJune[1],masterStatus:'DONE',partnerStatus:'DONE'}]});
 assert.equal(replaced.stats.displayProgress,1,
  'One DONE merchant must no longer be counted as IN_PROGRESS');
 assert.equal(replaced.stats.displayDone,1);
 const awaiting=build({actions,history:historical.filter(h=>h.month==='2026-06'),
  month:'2026-06',latestMonth:'2026-09',
  viewRows:[shownJune[0],{...shownJune[1],masterStatus:'TODO',partnerStatus:'TODO'}]});
 assert.equal(awaiting.stats.displayProgress,2,
  'Every managed case without a completed status belongs in progress');
 assert.equal(awaiting.stats.displayDone,0);
 const july=build({actions,history:historical.filter(h=>h.month==='2026-07'),
  month:'2026-07',latestMonth:'2026-09',viewRows:shownJuly});
 assert.equal(july.stats.displayDone,2,'Both visible DONE merchants should be in the displayed DONE count');
 assert.equal(july.stats.done,0,'Generated DONE must NOT be classified as verified real completion');
 assert.equal(july.stats.projectedDone,2);
 assert.equal(july.stats.displayProgress,0);
 const onlyA=build({actions,history:historical.filter(h=>h.month==='2026-06'),
  month:'2026-06',latestMonth:'2026-09',viewRows:[shownJune[0]]});
 assert.equal(onlyA.stats.total,1,'Outlet/manager-scope board filter must also narrow SRM');
 assert.equal(onlyA.stats.displayProgress,1);
}
function uiFlow(partner){
 let month='2026-06',visible=shownJune;
 let mounted=false;
 const controls=new Map();
 const get=id=>{
  if(!controls.has(id))controls.set(id,{
   innerHTML:'',textContent:'',value:id==='month'?month:id==='outlet'?'인천약품':'',
   hidden:false,disabled:false,dataset:{},
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(){},scrollIntoView(){},reset(){},
   closest(){return {parentNode:host,nextSibling:null};}
  });
  return controls.get(id);
 };
 const host={insertBefore(){mounted=true},appendChild(){mounted=true}};
 const doc={readyState:'complete',head:{appendChild(){}},body:host,
  getElementById:id=>id==='srmWorkflow'&&!mounted?null:get(id),
  querySelector:()=>host,addEventListener(){},
  createElement(tag){return tag==='style'?{textContent:''}:{
   id:'',innerHTML:'',parentNode:host,querySelector:()=>({}),insertAdjacentHTML(){}
  };}
 };
 const ctx={document:doc,console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  addEventListener(){}};
 ctx.window=ctx;ctx.globalThis=ctx;
 ctx.DCM_MONTHLY_ACTION_HISTORY={refresh(){},forMonth:m=>historical.filter(h=>h.month===m)};
 const shared={rows:()=>data,actionRows:()=>actions,viewRows:()=>visible,
  isAuthenticated:()=>false,name:()=> '인천약품'};
 if(partner)ctx.DCMPartnerSRM=shared;
 else{
  ctx.DCMActionSync={srmRows:shared.rows,srmActions:shared.actionRows,isConnected:shared.isAuthenticated};
  ctx.DCMUnifiedAction={viewRows:shared.viewRows};
 }
 vm.createContext(ctx);
 vm.runInContext(metricSource,ctx);
 vm.runInContext(uiSource,ctx);
 const shown=()=>get('srmBody').innerHTML;
 assert.equal(get('srmManaged').textContent,'2');
 assert.equal(get('srmOpen').textContent,'2',
  'Screenshot regression: SRM showed 1 although two Incheon merchant status cells were IN_PROGRESS');
 assert.equal(get('srmDone').textContent,'0');
 assert.equal(get('srmSourceNote').textContent,'');
 assert.match(shown(),/그린팜약품-GP\(1\)/);
 assert.match(shown(),/서울약업-용마택배/);
 assert.doesNotMatch(shown(),/타권역 거래처/);
 get('srmFilter').onchange({target:{value:'progress'}});
 assert.match(get('srmCount').textContent,/2026-06 · 2처 \/ 관리 2처/);
 assert.equal((shown().match(/<tr\b/g)||[]).length,2);
 get('srmFilter').onchange({target:{value:'all'}});
 // The same selector change must recalculate both the Board and the SRM in the new month.
 month='2026-07';visible=shownJuly;get('month').value=month;ctx.DCMSRM.update();
 assert.equal(get('srmOpen').textContent,'0');
 assert.equal(get('srmDone').textContent,'2');
 assert.equal(get('srmSourceNote').textContent,'');
 get('srmFilter').onchange({target:{value:'done'}});
 assert.match(get('srmCount').textContent,/2026-07 · 2처 \/ 관리 2처/);
 assert.equal((shown().match(/<tr\b/g)||[]).length,2);
}
function actualIncheonVolumeRegression(){
 const sandbox={};sandbox.window=sandbox;vm.createContext(sandbox);
 vm.runInContext(metricSource,sandbox);
 // Shape taken from the observed June 2026 Incheon discrepancy:
 // 24 monthly proposed progress rows, only 1 actual Action status in progress.
 // Use synthetic merchant keys, not customer identifiers.
 const many=Array.from({length:24},(_,i)=>h('인천약품|||'+String(1000+i),'2026-06','IN_PROGRESS'));
 const views=many.map(r=>({key:r.key,masterStatus:'IN_PROGRESS',partnerStatus:'IN_PROGRESS'}));
 const real=[{key:many[0].key,outlet:'인천약품',businessNo:many[0].businessNo,
  masterAction:{reasonCode:'02',plan:'실제 입력',status:'IN_PROGRESS'},partnerAction:{editedFields:[]}}];
 const result=sandbox.DCMSRMAggregate.build({
  actions:real,history:many,month:'2026-06',latestMonth:'2026-09',viewRows:views
 });
 assert.equal(result.stats.total,24);
 assert.equal(result.stats.displayProgress,24,'June Incheon board-status count must be 24');
 assert.equal(result.stats.progress,1,'Confirmed saved progress is a distinct metric, only 1');
 assert.equal(result.stats.projectedProgress,23);
 assert.equal(result.stats.displayDone,0);
 assert.equal(result.records.filter(r=>r.displayProgress).length,result.stats.displayProgress);
}
function screenshotJuly73Regression(){
 const sandbox={};sandbox.window=sandbox;vm.createContext(sandbox);
 vm.runInContext(metricSource,sandbox);
 // Screenshot acceptance test: 73 managed = 14 progress + 59 completed
 // and independently 49 follow-up + 24 improved.
 const list=Array.from({length:73},(_,i)=>{
  const row=h('인천약품|||J'+i,'2026-07',i<59?'DONE':'IN_PROGRESS');
  row.type=i<24?'X2O':'SUPPLY_STOP';
  return row;
 });
 const views=list.map((r,i)=>({key:r.key,masterStatus:i<59?'DONE':'IN_PROGRESS',
  partnerStatus:i<59?'DONE':'IN_PROGRESS',monthlyHistorical:true}));
 const value=sandbox.DCMSRMAggregate.build({
  history:list,month:'2026-07',latestMonth:'2026-09',viewRows:views
 });
 for(const [key,expected] of Object.entries({
  total:73,displayProgress:14,displayDone:59,needsAction:49,verified:24,recorded:73
 })){
  assert.equal(value.stats[key],expected,'July screenshot KPI reconciliation: '+key);
 }
 assert.equal(value.stats.displayProgress+value.stats.displayDone,value.stats.total);
 assert.equal(value.stats.needsAction+value.stats.verified,value.stats.total);
 assert.equal(value.records.filter(r=>r.displayProgress).length,14);
 assert.equal(value.records.filter(r=>r.displayDone).length,59);
 assert.equal(value.records.filter(r=>r.needsAction).length,49);
 assert.equal(value.records.filter(r=>r.verified).length,24);
 assert.ok(value.records.every(r=>r.recordSource==='마스터 입력 · 업체 입력'&&
  ['진행중','완료'].includes(r.statusLabel)&&
  !/일괄 제안|월별 일괄|실행 미확인|표시/.test(r.nextAction)));
}
directMetrics();
screenshotJuly73Regression();
actualIncheonVolumeRegression();
uiFlow(false);
uiFlow(true);
console.log('PASS SRM ACTION PARITY: June Incheon 2 visible progress vs 1 actual, no double count, exact partner/outlet scope, July 2 displayed DONE vs 0 confirmed, KPI equals filter rows');
