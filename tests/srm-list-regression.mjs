import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped UI handlers over the real aggregation code. All records
// are isolated fixtures; the transport rejects any unexpected production call.
const metricSource=fs.readFileSync('srm-metrics.js','utf8');
const viewSource=fs.readFileSync('srm-workflow.js','utf8');

function verify(partner){
 const nodes=new Map(),cards=new Map(),events=new Map();
 let mounted=false,requests=0,partnerName='테스트 파트너';
 const host={insertBefore(){mounted=true;},appendChild(){mounted=true;}};
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{
   innerHTML:'',textContent:'',value:id==='month'?'2026-10':id==='manager'?'테스트 담당':id==='outlet'?'전체':'',
   hidden:false,disabled:false,dataset:{},handlers:new Map(),
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(type,fn){this.handlers.set(type,fn);},
   scrollIntoView(){},reset(){},closest(){return {parentNode:host,nextSibling:null};}
  });
  return nodes.get(id);
 };
 const card=value=>{
  if(!cards.has(value))cards.set(value,{
   dataset:{srmFilter:value},handlers:new Map(),attributes:{},classList:{toggle(){}},
   addEventListener(type,fn){this.handlers.set(type,fn);},
   setAttribute(name,value){this.attributes[name]=value;}
  });
  return cards.get(value);
 };
 const document={readyState:'complete',head:{appendChild(){}},body:host,
  getElementById:id=>id==='srmWorkflow'&&!mounted?null:get(id),querySelector:()=>host,
  addEventListener(type,fn){events.set('document:'+type,fn);},
  createElement(tag){return tag==='style'?{textContent:''}:{innerHTML:'',parentNode:host,
   querySelectorAll(selector){return selector==='[data-srm-filter]'?
    [...this.innerHTML.matchAll(/data-srm-filter="([^"]+)"/g)].map(([,value])=>card(value)):[];}
  };}
 };
 const data=Array.from({length:321},(_,i)=>({month:'2026-10',outlet:i<200?'가나다약품':'라바약품',
  manager:'테스트 담당',businessNo:`100-00-${String(i).padStart(5,'0')}`,
  businessName:i===320?'Zulu 마지막 거래처':`거래처 ${String(i).padStart(3,'0')}`,
  statuses:{대웅제약:'X',대웅바이오:null,한올바이오:null}}));
 const key=r=>r.outlet+'|||'+r.businessNo;
 // Deliberately omit action businessName: render/search should use the
 // month-specific merchant name from the original DCM record.
 const actions=data.map((row,i)=>({key:key(row),outlet:row.outlet,businessNo:row.businessNo,
  plan:'확인 중',status:i<200?'IN_PROGRESS':'DONE'}));
 const viewRows=()=>data.filter(r=>get('outlet').value==='전체'||r.outlet===get('outlet').value)
  .map(r=>({key:key(r),masterStatus:actions.find(a=>a.key===key(r)).status,partnerStatus:''}));
 const storage=new Map();
 const ctx={document,console,
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  addEventListener(type,fn){events.set(type,fn);},setTimeout(){},clearTimeout(){}};
 ctx.window=ctx;ctx.globalThis=ctx;
 ctx.DCM_MONTHLY_ACTION_HISTORY={refresh(){},forMonth:()=>[]};
 const rejectRequest=()=>{requests++;throw Error('No network is allowed in the list test');};
 if(partner)ctx.DCMPartnerSRM={rows:()=>data,actionRows:()=>actions,viewRows,
  name:()=>partnerName,isAuthenticated:()=>false,request:rejectRequest};
 else{
  ctx.DCMActionSync={srmRows:()=>data,srmActions:()=>actions,isConnected:()=>false,srmRequest:rejectRequest};
  ctx.DCMUnifiedAction={viewRows};
 }
 vm.createContext(ctx);vm.runInContext(metricSource,ctx);vm.runInContext(viewSource,ctx);
 const rows=()=>get('srmBody').innerHTML.match(/<tr\b/g)?.length||0;
 const search=value=>{get('srmSearch').value=value;get('srmSearch').oninput({target:{value}});};
 const filter=value=>get('srmFilter').onchange({target:{value}});

 assert.equal(rows(),150);
 assert.equal(get('srmManaged').textContent,'321');
 assert.equal(get('srmOpen').textContent,'200');
 assert.equal(get('srmDone').textContent,'121');
 assert.equal(get('srmMore').hidden,false);
 assert.match(get('srmSourceNote').textContent,/150 \/ 321처/);
 assert.match(get('srmScope').textContent,/2026-10/);
 assert.match(get('srmScope').textContent,partner?/테스트 파트너/:/테스트 담당/);

 get('srmMore').onclick();assert.equal(rows(),300);
 assert.equal(get('srmMore').textContent,'21처 더 보기');
 get('srmMore').onclick();assert.equal(rows(),321);
 assert.equal(get('srmMore').hidden,true);
 assert.match(get('srmBody').innerHTML,/Zulu 마지막 거래처/,'A merchant after row 150 must be reachable');

 search('zULu');assert.equal(rows(),1);
 assert.match(get('srmBody').innerHTML,/Zulu 마지막 거래처/);
 assert.match(get('srmCount').textContent,/1처 \/ 관리 321처/);
 assert.equal(get('srmManaged').textContent,'321','Search must not redefine the top-scope KPI');
 search('1000000320');assert.equal(rows(),1);
 search('100-00-00320');assert.equal(rows(),1,'Formatted and unformatted IDs must find the same merchant');
 search('없는 거래처');assert.match(get('srmBody').innerHTML,/검색 결과가 없습니다/);
 assert.equal(get('srmMore').hidden,true);
 get('srmReset').onclick();assert.equal(rows(),150);
 assert.equal(get('srmSearch').value,'');assert.equal(get('srmFilter').value,'all');

 filter('done');assert.equal(rows(),121);assert.equal(get('srmMore').hidden,true);
 search('가나다약품');assert.match(get('srmBody').innerHTML,/검색 결과가 없습니다/,'State and search intersect');
 filter('progress');assert.equal(rows(),150);
 get('srmMore').onclick();assert.equal(rows(),200);
 assert.equal(get('srmSearch').value,'가나다약품','Load more preserves the search');
 assert.equal(get('srmFilter').value,'progress','Load more preserves the selected status');

 // List work must not erase an open editor or its locally kept draft.
 ctx.DCMSRM.open(key(data[320]));
 get('srm-detail').value='작성 중인 협의 내용';get('srm-nextAction').value='후속 확인';
 get('srmForm').handlers.get('input')();
 const draft=storage.get('dcm-srm-draft::'+(partner?'테스트 파트너':'master')+'::'+key(data[320])+'::대웅제약');
 get('srmReset').onclick();get('srmMore').onclick();search('Zulu');
 assert.equal(get('srm-detail').value,'작성 중인 협의 내용');
 assert.equal(get('srm-nextAction').value,'후속 확인');
 assert.equal(storage.get('dcm-srm-draft::'+(partner?'테스트 파트너':'master')+'::'+key(data[320])+'::대웅제약'),draft);
 assert.equal(get('srmEditor').hidden,false);

 get('srmReset').onclick();get('srmMore').onclick();
 search('가나다약품');
 get('outlet').value='가나다약품';get('outlet').handlers.get('change')();
 assert.equal(rows(),150,'Changing the top-level scope restarts paging');
 assert.equal(get('srmManaged').textContent,'200');assert.equal(get('srmDone').textContent,'0');
 assert.match(get('srmScope').textContent,/가나다약품/);
 assert.match(get('srmCount').textContent,/200처 \/ 관리 200처/);
 assert.equal(get('srmSearch').value,'가나다약품','Region change preserves the same owner search intent');
 get('month').value='2026-09';get('month').handlers.get('change')();
 assert.equal(get('srmSearch').value,'가나다약품','Month change preserves search intent');
 get('month').value='2026-10';get('month').handlers.get('change')();
 if(partner){
  events.get('dcm-partner-logged-out')({type:'dcm-partner-logged-out'});
  assert.equal(get('srmSearch').value,'','Logout clears the previous company search');
  assert.equal(get('srmFilter').value,'all');
  assert.equal(get('srm-detail').value,'작성 중인 협의 내용','Logout keeps the recoverable draft content');
  search('이전 업체 검색');filter('done');
  partnerName='다른 파트너';ctx.DCMSRM.update();
  assert.equal(get('srmSearch').value,'','An owner change clears stale query even without a logout event');
  assert.equal(get('srmFilter').value,'all');
  assert.match(get('srmScope').textContent,/다른 파트너/);
 }
 assert.equal(requests,0,'Read-only filtering must not trigger API writes or reads');
}

verify(false);verify(true);
console.log('PASS SRM LIST: all 321 merchants reachable, case/ID search, status intersection, top-scope counts, paging reset and editor draft preservation');
