import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const metricSource=fs.readFileSync('srm-metrics.js','utf8');
const viewSource=fs.readFileSync('srm-workflow.js','utf8');
const history=Array.from({length:41},(_,i)=>({
 month:'2026-06',sourceMonth:'2026-06',nextMonth:'2026-07',key:'RETRO|||'+i,
 outlet:'RETRO',businessNo:String(i),businessName:'검증 거래처 '+i,
 entities:['대웅제약'],startOx:'X/—/—',endOx:'O/—/—',
 masterAction:{reasonCode:'06',plan:'ERP업체 소통하여 정상 연동 조치',status:'IN_PROGRESS',dueDate:'2026-06-30'},
 partnerAction:{reasonCode:'06',plan:'거래처 요청 및 대웅 협조',status:'IN_PROGRESS',dueDate:'2026-06-30'}
}));
const records=history.map((h,i)=>({month:'2026-06',outlet:'RETRO',
 businessNo:String(i),businessName:h.businessName,manager:'검증 담당',
 statuses:{'대웅제약':'X','대웅바이오':null,'한올바이오':null}}));

async function check(partner){
 const els=new Map(),styles=[];
 const el=id=>{
  if(!els.has(id))els.set(id,{
   textContent:'',innerHTML:'',value:id==='month'?'2026-06':'',
   hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},
   addEventListener(){},insertAdjacentHTML(){},scrollIntoView(){},reset(){},
   closest(){return {parentNode:host,nextSibling:null};}
  });
  return els.get(id);
 };
 const host={insertBefore(){},appendChild(){}};
 const doc={
  readyState:'complete',head:{appendChild(node){styles.push(node.textContent);}},
  body:host,getElementById:el,querySelector:()=>host,addEventListener(){},
  createElement(tag){return tag==='style'?{textContent:''}:{
   id:'',className:'',innerHTML:'',parentNode:host,querySelector:selector=>el(selector),
   insertAdjacentHTML(){}
  };}
 };
 let response={ok:true,events:[]};
 const ctx={document:doc,console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
   addEventListener(){},setTimeout(){},clearTimeout(){}};
 ctx.window=ctx;ctx.globalThis=ctx;
 ctx.DCM_MONTHLY_ACTION_HISTORY={refresh(){},forMonth:()=>history};
 const service={srmRows:()=>records,srmActions:()=>[],srmRequest:async()=>response};
 if(partner)ctx.DCMPartnerSRM={rows:()=>records,actionRows:()=>[],name:()=> '검증 업체',request:async()=>response};
 else ctx.DCMActionSync=service;
 vm.createContext(ctx);
 vm.runInContext(metricSource,ctx);
 vm.runInContext(viewSource,ctx);
 const body=el('srmBody');
 const validate=(count)=>{
  const lines=body.innerHTML.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)||[];
  assert.equal(lines.length,count);
  if(count)for(const line of lines)assert.equal((line.match(/<td\b/g)||[]).length,6);
  assert.doesNotMatch(body.innerHTML,/2026-06-30|ERP 관련\(업체 미확인\)/);
 };
 assert.equal(el('srmManaged').textContent,'41');
 assert.equal(el('srmNeedsAction').textContent,'41');
 for(const id of ['srmConsulted','srmOpen','srmDone'])assert.equal(el(id).textContent,'—');
 assert.equal(el('srmVerified').textContent,'0');
 assert.match(el('srmSourceNote').textContent,/사후분류 41처/);
 assert.match(el('srmSourceNote').textContent,/협의 이력 미조회/);
 validate(41);
 assert.match(body.innerHTML,/월별 DCM 사후분류/);
 assert.doesNotMatch(body.innerHTML,/실제 Action 입력|진행중|ERP업체 소통하여 정상 연동 조치/);
 const css=styles.join('\n');
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/table-layout:fixed/);
 assert.match(css,/overflow-x:hidden/);
 assert.match(css,/@media\(max-width:920px\)/);
 assert.doesNotMatch(viewSource,/srmOverdue|srm-dueDate|기한 초과|<th>기한<\/th>/);

 if(partner)response={ok:true,events:[{key:'RETRO|||1',entity:'대웅제약',
   status:'ERP_WAIT',erpVendor:'확인된 ERP 업체',nextAction:'검증 요청'}]};
 await ctx.DCMSRM.refresh();
 assert.equal(el('srmConsulted').textContent,partner?'1':'0');
 assert.equal(el('srmOpen').textContent,partner?'1':'0');
 assert.equal(el('srmDone').textContent,'0');
 assert.doesNotMatch(el('srmSourceNote').textContent,/미조회/);
 validate(41);
 if(partner){
  assert.match(body.innerHTML,/확인된 ERP 업체/);
  el('srmFilter').onchange({target:{value:'erp'}});
  validate(1);
  assert.match(el('srmCount').textContent,/1처 \/ 관리 41처/);
 }
}
await check(false);
await check(true);
console.log('PASS SRM UI: Master and Partner 41 retrospective cases, six evidence-based KPI cards, 6-cell no-deadline table, authenticated SRM history');
