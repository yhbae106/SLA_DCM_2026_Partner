import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const metricSource=fs.readFileSync('srm-metrics.js','utf8');
const viewSource=fs.readFileSync('srm-workflow.js','utf8');
const historical=Array.from({length:41},(_,i)=>({
 month:'2026-06',sourceMonth:'2026-06',nextMonth:'2026-07',
 key:'RETRO|||'+i,outlet:'RETRO',businessNo:String(i),businessName:'검증 거래처 '+i,
 entities:['대웅제약'],startOx:'X/—/—',endOx:'O/—/—',
 masterAction:{reasonCode:'06',plan:'자동 생성 ERP 협의',status:'IN_PROGRESS',dueDate:'2026-06-30'},
 partnerAction:{reasonCode:'06',plan:'자동 생성 업체 협의',status:'IN_PROGRESS',dueDate:'2026-06-30'}
}));
const data=historical.map((h,i)=>({month:'2026-06',outlet:'RETRO',
 businessNo:String(i),businessName:h.businessName,manager:'테스트 담당',
 statuses:{'대웅제약':'X','대웅바이오':null,'한올바이오':null}}));
const edits=[
 {key:'RETRO|||0',outlet:'RETRO',businessNo:'0',businessName:'검증 거래처 0',
  reasonCode:'02',plan:'마스터 조치계획 작성',status:'TODO',
  partnerAction:{reasonCode:'03',plan:'업체 조치계획 작성',status:'TODO',editedFields:['reasonCode','plan']}},
 {key:'RETRO|||2',outlet:'RETRO',businessNo:'2',businessName:'검증 거래처 2',
  partnerAction:{plan:'업체 단독 조치 내용',status:'TODO',editedFields:['plan']}}
];
async function verify(partner){
 let authenticated=false,requests=0;const payloads=[];
 const listeners=new Map(),nodes=new Map(),css=[];
 let mounted=false;
 const host={insertBefore(){mounted=true;},appendChild(){mounted=true;}};
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,{
   textContent:'',innerHTML:'',value:id==='month'?'2026-06':'',
   hidden:false,disabled:false,dataset:{},
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(){},insertAdjacentHTML(){},scrollIntoView(){},reset(){},
   closest(){return {parentNode:host,nextSibling:null};}
  });
  return nodes.get(id);
 };
 const doc={
  readyState:'complete',head:{appendChild(node){css.push(node.textContent);}},body:host,
  getElementById:id=>id==='srmWorkflow'&&!mounted?null:element(id),
  querySelector:()=>host,addEventListener(){},
  createElement(tag){return tag==='style'?{textContent:''}:{
   id:'',className:'',innerHTML:'',parentNode:host,querySelector:q=>element(q),insertAdjacentHTML(){}
  };}
 };
 const response={ok:true,events:[{key:'RETRO|||1',entity:'대웅제약',
  status:'ERP_WAIT',contactTarget:'ERP 업체',erpVendor:'확인된 업체',nextAction:'재시험 요청'}]};
 const fetcher=async payload=>{requests++;payloads.push(payload);return payload.type==='srmAppend'?{ok:true,saved:true}:response;};
 const ctx={document:doc,console,localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  addEventListener(name,fn){listeners.set(name,fn);},
  setTimeout(){},clearTimeout(){}};
 ctx.window=ctx;ctx.globalThis=ctx;
 ctx.DCM_MONTHLY_ACTION_HISTORY={refresh(){},forMonth:()=>historical};
 if(partner)ctx.DCMPartnerSRM={rows:()=>data,actionRows:()=>edits,
  name:()=> '테스트 업체',isAuthenticated:()=>authenticated,request:fetcher};
 else ctx.DCMActionSync={srmRows:()=>data,srmActions:()=>edits,
  isConnected:()=>authenticated,srmRequest:fetcher};
 vm.createContext(ctx);
 vm.runInContext(metricSource,ctx);
 vm.runInContext(viewSource,ctx);
 const body=element('srmBody');
 const rowCount=()=>{
  const rows=body.innerHTML.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)||[];
  return rows.length;
 };
 const validateRows=count=>{
  assert.equal(rowCount(),count);
  for(const row of body.innerHTML.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)||[])
   assert.equal((row.match(/<td\b/g)||[]).length,5,'SRM table has only five columns');
  assert.doesNotMatch(body.innerHTML,/2026-06-30|실제 조치 완료 입증/);
  if(count>1)assert.match(body.innerHTML,/일괄 제안: 자동 생성 업체 협의/);
 };
 assert.equal(element('srmManaged').textContent,'41');
 assert.equal(element('srmConsulted').textContent,'41','Bulk-entered historical notes are visibly recorded without being completed');
 assert.equal(element('srmNeedsAction').textContent,'41');
 assert.equal(element('srmOpen').textContent,'41','All 41 bulk-visible IN_PROGRESS cases must be counted once');
 assert.equal(element('srmDone').textContent,'0');
 assert.equal(element('srmVerified').textContent,'0');
 assert.match(element('srmSourceNote').textContent,/조치 이력 41처/);
 assert.match(element('srmSourceNote').textContent,/일괄기재만 39처/);
 assert.match(element('srmSourceNote').textContent,/실제 마스터·업체 입력\/추가 협의 2처/);
 assert.match(element('srmSourceNote').textContent,/추가 SRM 협의 기록 미조회/);
 assert.equal(element('srmRefresh').disabled,true);
 assert.match(body.innerHTML,/월별 일괄기재\(실행 미확인\).*마스터 입력.*업체 입력/);
 assert.match(body.innerHTML,/마스터: 마스터 조치계획 작성 \/ 업체: 업체 조치계획 작성/);
 validateRows(41);

 const cssText=css.join('\n');
 assert.match(cssText,/table-layout:fixed/);
 assert.match(cssText,/overflow-x:hidden/);
 assert.match(cssText,/@media\(max-width:920px\)/);
 assert.match(cssText,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(viewSource,/id="srm-reason"|id="srm-owner"|srm-dueDate|srmOverdue|기한 초과/);
 for(const id of ['srm-kind','srm-detail','srm-nextAction','srm-contactTarget','srm-baselineMonth'])
  assert.match(viewSource,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(viewSource,/id="srm-status"|id="srm-eventType"/,
  'Redundant per-SRM status should be derived from one activity choice');

 await ctx.DCMSRM.refresh();
 assert.equal(requests,0,'Unauthorized extra history request must never hit Apps Script');
 assert.doesNotMatch(element('srmMsg').textContent,/공유키를 입력해 주세요|서버 연결 또는 Apps Script 배포 확인 필요/);
 assert.match(element('srmMsg').textContent,/로그인 후 조회/);
 assert.equal(element('srmConsulted').textContent,'41');

 authenticated=true;
 await ctx.DCMSRM.refresh();
 assert.equal(requests,1);
 assert.equal(element('srmRefresh').disabled,false);
 assert.equal(element('srmConsulted').textContent,'41','Real ERP event updates actual count but not overall bulk-record count');
 assert.equal(element('srmOpen').textContent,'41','Adding one ERP event must not double-count an already visible progress case');
 assert.equal(element('srmDone').textContent,'0');
 assert.doesNotMatch(element('srmSourceNote').textContent,/미조회/);
 validateRows(41);
 element('srmFilter').onchange({target:{value:'recorded'}});
 validateRows(41);
 assert.match(element('srmCount').textContent,/41처 \/ 관리 41처/);
 element('srmFilter').onchange({target:{value:'progress'}});
 assert.equal(element('srmOpen').textContent,'41');
 assert.match(element('srmCount').textContent,/41처 \/ 관리 41처/);
 validateRows(41);
 element('srmFilter').onchange({target:{value:'consulted'}});
 validateRows(1);
 assert.match(body.innerHTML,/재시험 요청/);
 element('srmFilter').onchange({target:{value:'all'}});
 validateRows(41);

 // A short optional SRM event must save without re-entering Action reasons/plans.
 ctx.DCMSRM.open('RETRO|||0','대웅제약');
 element('srm-kind').value='contact';
 element('srm-contactTarget').value='ERP 업체';
 element('srm-erpVendor').value='확인된 ERP 서비스';
 element('srm-detail').value='실제 업체 담당자와 시스템 접속 점검';
 element('srm-nextAction').value='';
 await element('srmForm').onsubmit({preventDefault(){}});
 const append=payloads.find(p=>p.type==='srmAppend');
 assert.ok(append,'Optional SRM entry was not saved to the authenticated adapter');
 for(const [key,value] of Object.entries({status:'CHECKING',eventType:'CONTACT',
   detail:'실제 업체 담당자와 시스템 접속 점검',contactTarget:'ERP 업체',
   erpVendor:'확인된 ERP 서비스',reason:'',owner:''})){
  assert.equal(append[key],value,'Unexpected supplementary SRM field '+key);
 }
 assert.ok(!Object.hasOwn(append,'dueDate'),'Retired date must not be sent');
 element('srm-kind').value='verify';
 element('srm-baselineMonth').value='2026-06';
 element('srm-detail').value='연동 검증 요청';
 const count=requests;
 await element('srmForm').onsubmit({preventDefault(){}});
 assert.equal(requests,count,'X-to-O verification with no later O must be blocked before server save');
 assert.match(element('srmMsg').textContent,/검증 실패/);

 // Closing the authenticated session must discard supplementary SRM data,
 // but retain Action Board entries visible in the current browser dataset.
 authenticated=false;
 listeners.get(partner?'dcm-partner-logged-out':'dcm-sync-access-changed')();
 assert.equal(element('srmConsulted').textContent,'41');
 assert.equal(element('srmRefresh').disabled,true);
 assert.match(element('srmSourceNote').textContent,/추가 SRM 협의 기록 미조회/);
}
await verify(false);
await verify(true);
console.log('PASS SRM UI: Master/Partner record Action entries once, no login error before authentication, compact five-column view, verified optional history and logout reset');
