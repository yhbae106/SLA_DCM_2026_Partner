import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const clone=value=>JSON.parse(JSON.stringify(value));
const row=(outlet='업체 A',businessNo='1')=>({month:'2026-09',outlet,businessNo,businessName:'테스트 거래처',statuses:{'대웅제약':'X','대웅바이오':'O','한올바이오':null}});
const dashboard=(outlet='업체 A',revision='r1')=>({ok:true,data:[row(outlet)],dashboardRevision:revision,updatedAt:'2026-09-30T10:00:00Z'});
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),values};};
function environment(){
 const nodes=new Map(),timers=new Map();let timerId=0;
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,dataset:{},attributes:{},
   classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(){},scrollIntoView(){},reset(){},closest(){return null;}});
  return nodes.get(id);
 };
 const ctx={console:{warn(){}},AbortController,Date,localStorage:storage(),sessionStorage:storage(),
  document:{readyState:'loading',visibilityState:'visible',activeElement:null,getElementById:node,addEventListener(){}},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  setInterval(){return ++timerId;},clearInterval(){},CustomEvent:class{constructor(type){this.type=type;}},
  dispatchEvent(){},addEventListener(){}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);return {ctx,node,timers};
}
function partnerFixture(){
 const f=environment(),{ctx}=f;
 const hook="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();";
 const source=fs.readFileSync('partner.js','utf8');assert.ok(source.includes(hook));
 vm.runInContext(source.replace(hook,`window.testPartner={
  login,logout,pull,pullSharedActions,request,applyShared,applyDashboard,loadCachedData,loadCachedActions,
  savePendingActions,savePartnerOverride,pendingChanges,actionFor,
  setSession:(company,secret='test-code')=>{partner=company;password=secret;partnerVerified=true;},
  setData:rows=>{data=rows;},mockRequest:fn=>{request=fn;},
  state:()=>({partner,data,remoteActions,actionOverrides,loadingData,savingBatch,actionFetchBusy,loginInProgress,dashboardState}),
  quiet:()=>{render=()=>{};renderAction=()=>{};renderEmpty=()=>{};refreshSelectors=()=>{};}
 };`),ctx);
 f.api=ctx.testPartner;f.api.quiet();return f;
}
const warmLogin=company=>({ok:true,partner:company,dashboardRevision:'r1',dashboardSnapshot:dashboard(company),actionSnapshot:{actions:[],revision:'a1'}});

// A warm authenticated snapshot keeps the one-request login path; only a matching
// server revision qualifies a cached dashboard as confirmed.
{
 const {api,node}=partnerFixture(),calls=[];
 api.mockRequest(async payload=>{calls.push(payload);return warmLogin(payload.partner);});
 node('loginPartner').value='업체 A';node('loginPassword').value='test-code';
 await api.login();
 assert.equal(calls.length,1);assert.equal(calls[0].preferCachedDashboard,true);
 assert.equal(api.state().dashboardState,'confirmed');assert.match(node('syncMsg').textContent,/최신 확인/);
 assert.equal(node('loginBtn').disabled,false);
}
{
 const {api,node}=partnerFixture(),old=deferred(),next=deferred();let calls=0;
 api.mockRequest(()=>++calls===1?old.promise:next.promise);
 node('loginPartner').value='업체 A';node('loginPassword').value='old-code';
 const first=api.login();api.logout();
 node('loginPartner').value='업체 B';node('loginPassword').value='new-code';
 const second=api.login();old.resolve(warmLogin('업체 A'));await first;
 assert.equal(api.state().partner,'');assert.equal(api.state().loginInProgress,true);
 assert.equal(node('loginBtn').disabled,true,'Retired login cannot unlock a newer attempt');
 next.resolve(warmLogin('업체 B'));await second;
 assert.equal(api.state().partner,'업체 B');assert.equal(api.state().data[0].outlet,'업체 B');
}

// Cancellation is exercised against the real fetch wrapper, including delayed
// response-body parsing and both existing bounded request timeouts.
{
 const {api,ctx}=partnerFixture();api.setSession('업체 A');let signal;
 ctx.fetch=(_url,options)=>{signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));};
 const pending=api.request({type:'partnerDashboard'});api.logout();
 assert.equal(signal.aborted,true);await assert.rejects(pending,error=>error.stale===true);
}
{
 const {api,ctx}=partnerFixture(),body=deferred();api.setSession('업체 A');
 ctx.fetch=async()=>({ok:true,text:()=>body.promise});
 const pending=api.request({type:'partnerDashboard'});await Promise.resolve();api.logout();
 body.resolve(JSON.stringify(dashboard()));await assert.rejects(pending,error=>error.stale===true);
}
for(const [type,timeout] of [['partnerLogin',9000],['partnerDashboard',18000]]){
 const {api,ctx,timers}=partnerFixture();
 ctx.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));
 const pending=api.request({type});const timer=[...timers.values()].find(t=>t.ms===timeout);assert.ok(timer);timer.fn();
 await assert.rejects(pending,/제한시간 초과/);assert.equal(timers.size,0);
}

// Old dashboard responses and finally blocks cannot replace another session or
// release its loading flag, even when the user logs into the same company again.
{
 const {api}=partnerFixture(),old=deferred(),next=deferred();let calls=0;
 api.setSession('업체 A');api.mockRequest(()=>++calls===1?old.promise:next.promise);
 const first=api.pull();api.logout();api.setSession('업체 A');api.setData([row('업체 A','new')]);
 const second=api.pull();old.resolve(dashboard('업체 A','old'));await first;
 assert.equal(api.state().data[0].businessNo,'new');assert.equal(api.state().loadingData,true);
 next.resolve(dashboard('업체 A','new'));await second;
 assert.equal(api.state().dashboardState,'confirmed');assert.equal(api.state().loadingData,false);
}
{
 const {api,node,ctx}=partnerFixture();api.setSession('업체 A');api.applyDashboard(dashboard());
 for(const invalid of [{ok:true},{ok:true,data:{}},{ok:true,data:[{month:'bad'}]}]){
  api.mockRequest(async()=>invalid);await api.pull();
  assert.equal(api.state().data.length,1);assert.equal(api.state().dashboardState,'error');
  assert.match(node('syncMsg').textContent,/확인 실패/);
 }
 assert.equal(api.loadCachedData(),true);assert.equal(api.state().dashboardState,'cached');
 assert.match(node('syncMsg').textContent,/최신 확인 중/);
 const cacheKey='dcm-partner-last-data-v2::업체 A';
 ctx.sessionStorage.setItem(cacheKey,JSON.stringify({...dashboard(),savedAt:Date.now()+10000}));
 assert.equal(api.loadCachedData(),false,'Future timestamps cannot make a cache valid');
 api.mockRequest(async()=>({ok:true,data:[]}));await api.pull();
 assert.equal(api.state().data.length,0);assert.equal(api.state().dashboardState,'confirmed','Explicit empty data is a valid result');
}

// Invalid Action payloads and duplicate/mismatched acknowledgement sets leave
// both the confirmed master values and every unconfirmed field intact.
{
 const {api,node}=partnerFixture(),key='업체 A|||1';api.setSession('업체 A');api.setData([row()]);
 api.applyShared({actions:[{key,plan:'마스터 원본'}]});api.savePartnerOverride(key,'plan','새 계획');
 api.mockRequest(async()=>({ok:true}));await api.pullSharedActions(true);
 assert.equal(api.state().remoteActions[0].plan,'마스터 원본');assert.equal(api.pendingChanges().length,1);
 assert.match(node('actionSyncStatus').textContent,/확인 실패/);
 api.savePartnerOverride(key,'reasonCode','02');
 api.mockRequest(async payload=>({ok:true,results:[payload.changes[0],payload.changes[0]]}));
 await api.savePendingActions();
 assert.equal(api.pendingChanges().length,2);assert.equal(api.state().remoteActions[0].partnerAction,undefined);
 assert.match(node('actionSyncStatus').textContent,/중복/);
 api.mockRequest(async payload=>({ok:true,results:payload.changes.map((item,i)=>({...item,value:i?'different':item.value}))}));
 await api.savePendingActions();assert.equal(api.pendingChanges().length,2);
 assert.equal(api.state().remoteActions[0].partnerAction,undefined,'Validate the complete batch before merging any acknowledgement');
}
{
 const {api}=partnerFixture(),pending=deferred(),key='업체 A|||1';let saves=0;
 api.setSession('업체 A');api.setData([row()]);api.applyShared({actions:[]});api.savePartnerOverride(key,'plan','제출한 계획');
 api.mockRequest(payload=>{if(payload.type==='partnerSaveActions'){saves++;return pending.promise;}return Promise.resolve({ok:true,actions:[{key,partnerAction:{plan:'제출한 계획',editedFields:['plan']}}]});});
 const first=api.savePendingActions();api.savePartnerOverride(key,'plan','그 후 수정');await api.savePendingActions();
 assert.equal(saves,1,'Repeated Save clicks must not submit the same batch twice');
 pending.resolve({ok:true,results:[{key,field:'plan',value:'제출한 계획'}]});await first;
 assert.equal(api.pendingChanges()[0].value,'그 후 수정');assert.equal(api.actionFor(row()).plan,'그 후 수정');
}
{
 const {api}=partnerFixture(),old=deferred(),next=deferred(),key='업체 A|||1';let saves=0;
 api.setSession('업체 A');api.setData([row()]);api.applyShared({actions:[]});api.savePartnerOverride(key,'plan','동일 입력');
 api.mockRequest(payload=>payload.type==='partnerSaveActions'?(++saves===1?old.promise:next.promise):Promise.resolve({ok:true,actions:[]}));
 const first=api.savePendingActions();api.logout();api.setSession('업체 A');api.setData([row()]);api.applyShared({actions:[]});
 const second=api.savePendingActions();old.resolve({ok:true,results:[{key,field:'plan',value:'동일 입력'}]});await first;
 assert.equal(api.state().savingBatch,true);assert.equal(api.pendingChanges().length,1,'Retired acknowledgement cannot remove a same-company pending edit');
 next.resolve({ok:true,results:[{key,field:'plan',value:'동일 입력'}]});await second;
 assert.equal(api.pendingChanges().length,0);
}
{
 const {api}=partnerFixture(),old=deferred(),latest=deferred(),key='업체 A|||1';let reads=0;
 api.setSession('업체 A');api.setData([row()]);api.applyShared({actions:[]});api.savePartnerOverride(key,'plan','확인된 새 계획');
 api.mockRequest(payload=>payload.type==='partnerActions'?(++reads===1?old.promise:latest.promise):Promise.resolve({ok:true,results:payload.changes}));
 const first=api.pullSharedActions(true);await api.savePendingActions();
 old.resolve({ok:true,actions:[{key,partnerAction:{plan:'저장 전 조회값',editedFields:['plan']}}]});await first;
 assert.equal(api.state().remoteActions[0].partnerAction.plan,'확인된 새 계획');assert.equal(api.state().actionFetchBusy,true);
 latest.resolve({ok:true,actions:[{key,partnerAction:{plan:'확인된 새 계획',editedFields:['plan']}}]});await Promise.resolve();
 assert.equal(api.state().remoteActions[0].partnerAction.plan,'확인된 새 계획');
}
console.log('PASS Partner reliability: one-request warm login, bounded cancellation, retired session isolation, valid-only snapshots, truthful cache states, unique atomic acknowledgements, duplicate-save and newer-edit protection');

function srmFixture(){
 const f=environment(),{ctx,node}=f;let authenticated=true,company='업체 A',handler=async()=>({ok:true,events:[]});
 ctx.DCMPartnerSRM={rows:()=>[],actionRows:()=>[],name:()=>company,isAuthenticated:()=>authenticated,request:payload=>handler(payload)};
 const hook="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();";
 const source=fs.readFileSync('srm-workflow.js','utf8');assert.ok(source.includes(hook));
 vm.runInContext(source.replace(hook,`window.testSrm={refresh,submit,authChanged,draft,
  select:(key,name='대웅제약')=>{selected=key;entity=name;},
  state:()=>({events,ready,loading}),quiet:()=>{render=()=>{};history=()=>{};}
 };`),ctx);
 const api=ctx.testSrm;api.quiet();api.select('업체 A|||1');
 node('srm-kind').value='progress';node('srm-detail').value='실제 협의 내용';
 return {...f,api,request:fn=>{handler=fn;},auth:(value,name=company)=>{authenticated=value;company=name;},submit:()=>api.submit({preventDefault(){}})};
}
const event=key=>({key,entity:'대웅제약',status:'IN_PROGRESS',detail:'확인된 이력'});
{
 const {api,auth,request,node}=srmFixture(),old=deferred(),next=deferred();let calls=0;
 request(()=>++calls===1?old.promise:next.promise);const first=api.refresh();
 auth(false);api.authChanged();auth(true,'업체 B');const second=api.refresh();
 old.resolve({ok:true,events:[event('업체 A|||1')]});await first;
 assert.equal(api.state().loading,true);assert.equal(api.state().events.length,0);
 next.resolve({ok:true,events:[event('업체 B|||1')]});await second;
 request(async()=>({ok:true}));await api.refresh();
 assert.equal(api.state().events[0].key,'업체 B|||1');assert.equal(api.state().ready,true);
 assert.match(node('srmMsg').textContent,/이전 협의 이력 유지/);
}
{
 const f=srmFixture(),{api,node,request,ctx}=f,pending=deferred(),payloads=[];
 request(payload=>{if(payload.type==='srmAppend'){payloads.push(clone(payload));return pending.promise;}return Promise.resolve({ok:true,events:[]});});
 const first=f.submit();await f.submit();assert.equal(payloads.length,1);assert.equal(node('srmSave').disabled,true);
 node('srm-detail').value='요청 중 새로 작성한 내용';api.draft();
 pending.resolve({ok:true,saved:true,requestId:payloads[0].requestId});await first;
 assert.equal(node('srm-detail').value,'요청 중 새로 작성한 내용');
 assert.match(ctx.localStorage.getItem('dcm-srm-draft::업체 A::업체 A|||1::대웅제약'),/새로 작성/);
 request(async payload=>{payloads.push(clone(payload));return {ok:true,saved:true,requestId:'wrong-id'};});
 await f.submit();assert.notEqual(payloads[1].requestId,payloads[0].requestId,'Changed content must receive a new idempotency key');
 const retryId=payloads[1].requestId;await f.submit();assert.equal(payloads[2].requestId,retryId,'Unchanged failed content reuses its idempotency key');
 assert.equal(node('srm-detail').value,'요청 중 새로 작성한 내용');assert.match(node('srmMsg').textContent,/저장 실패/);
}
{
 const f=srmFixture(),{api,auth,request,node,ctx}=f,old=deferred(),next=deferred();let oldId;
 request(payload=>{if(payload.type==='srmAppend'){oldId=payload.requestId;return old.promise;}return next.promise;});
 const first=f.submit();auth(false);api.authChanged();auth(true,'업체 B');api.select('업체 B|||2');
 node('srm-detail').value='새 업체 작성 내용';api.draft();const second=api.refresh();
 old.resolve({ok:true,saved:true,requestId:oldId});await first;
 assert.equal(api.state().loading,true);assert.equal(node('srm-detail').value,'새 업체 작성 내용');
 assert.match(ctx.localStorage.getItem('dcm-srm-draft::업체 B::업체 B|||2::대웅제약'),/새 업체/);
 next.resolve({ok:true,events:[]});await second;
}
console.log('PASS SRM reliability: retired history/save responses, last-valid history retention, matching save receipts, stable unchanged retries, duplicate submission and newer-draft protection');
