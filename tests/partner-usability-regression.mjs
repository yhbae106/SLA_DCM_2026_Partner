import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('partner.js','utf8');
const hook="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();";
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
function fixture(){
 const nodes=new Map(),requests=[],exported=[],scrolled=[];let nextTimer=0;
 const element=id=>{
  if(nodes.has(id))return nodes.get(id);
  const classes=new Set(),listeners=new Map();let markup='';
  const node={id,value:'',textContent:'',hidden:false,disabled:false,dataset:{},attributes:{},inert:false,options:[],listeners,
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){on?classes.add(x):classes.delete(x);}},
   setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(fn);},
   fire(k,event={}){return Promise.all((listeners.get(k)||[]).map(fn=>fn({target:this,...event})));},
   scrollIntoView(){scrolled.push(id);},focus(){node.focused=true;},
   closest(){return element('card-'+id);},querySelector(){return element('small-'+id);},
   get innerHTML(){return markup;},set innerHTML(value){markup=value;this.options=[...value.matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map((m,i)=>({value:m[1]??m[2],textContent:m[2],remove:()=>this.options.splice(i,1)}));}
  };nodes.set(id,node);return node;
 };
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))element(id);
 const cards=[...html.matchAll(/<article[^>]*data-kpi="([^"]+)"/g)].map(([,kpi])=>Object.assign(element('kpi-'+kpi),{dataset:{kpi}}));
 const jumps=[...html.matchAll(/<button[^>]*data-jump="([^"]+)"/g)].map(([,jump],i)=>Object.assign(element('jump-'+i),{dataset:{jump}}));
 const links=[...html.matchAll(/<button[^>]*data-action-view="([^"]+)"/g)].map(([,view])=>Object.assign(element('change-'+view),{dataset:{actionView:view}}));
 element('actionDetail').innerHTML=html.match(/<select id="actionDetail"[^>]*>([\s\S]*?)<\/select>/)[1];
 const ctx={console,Date,AbortController,localStorage:storage(),sessionStorage:storage(),
  setTimeout(){return ++nextTimer;},clearTimeout(){},setInterval(){return ++nextTimer;},clearInterval(){},
  CustomEvent:class{constructor(type){this.type=type;}},dispatchEvent(){},addEventListener(){},alert:message=>{throw Error(message);},
  document:{readyState:'loading',visibilityState:'visible',activeElement:null,addEventListener(){},getElementById:id=>nodes.get(id)||null,
   querySelectorAll:selector=>selector==='.kpi[data-kpi]'?cards:selector==='[data-jump]'?jumps:selector==='[data-action-view]'?links:[]},
  XLSX:{utils:{book_new:()=>({}),json_to_sheet:rows=>{exported.push(rows);return {};},book_append_sheet(){}},writeFile(){}},
  DCMSRM:{update(){}}
 };ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('logic.js','utf8'),ctx);
 assert.ok(source.includes(hook));
 vm.runInContext(source.replace(hook,`window.testPartner={start,render,refreshSelectors,setActionView,savePartnerOverride,updateSaveButton,logout,login,exportActions,
  setData:rows=>{data=rows;historyCache.clear();},setSession:()=>{partner='테스트 업체';password='fixture';partnerVerified=true;},
  mockRequest:fn=>{request=fn;},selection:()=>({base:actionBase,detail:actionDetail,view:actionView,search:actionSearch,limit:actionLimit})};`),ctx);
 const api=ctx.testPartner;
 api.mockRequest(async payload=>{requests.push(payload);if(payload.type==='partnerSaveActions')return {ok:true,results:payload.changes};return {ok:true,actions:[]};});
 api.start();api.setSession();
 return {api,ctx,element,cards,links,jumps,requests,exported,scrolled};
}
const row=(month,outlet,no,name,x)=>({month,outlet,businessNo:no,businessName:name,statuses:{'대웅제약':x,'대웅바이오':null,'한올바이오':null}});
const data=[
 row('2026-08','권역 A','111-11-11111','Alpha','X'),row('2026-08','권역 A','222-22-22222','Beta','X'),
 row('2026-08','권역 B','333-33-33333','Gamma','O'),row('2026-08','권역 A','444-44-44444','Stopped','X'),
 row('2026-09','권역 A','111-11-11111','Alpha','O'),row('2026-09','권역 A','222-22-22222','Beta','X'),
 row('2026-09','권역 B','333-33-33333','Gamma','X'),row('2026-09','권역 A','555-55-55555','New','X')
];

{
 const f=fixture(),{api,element}=f;api.setData(data);api.refreshSelectors();api.render();
 assert.equal(element('month').value,'2026-09');assert.match(element('workScope').textContent,/2026년 9월.*전체/);
 await element('change-new').fire('click');
 assert.equal(element('actionDetail').value,'new');assert.match(element('actionBody').innerHTML,/New/);assert.doesNotMatch(element('actionBody').innerHTML,/Alpha/);
 await element('change-stopped').fire('click');
 assert.match(element('actionBody').innerHTML,/Stopped/);assert.equal(element('actionView').value,'supplied');
 await element('change-improved').fire('click');
 assert.match(element('actionBody').innerHTML,/Alpha/);assert.equal(api.selection().view,'improved');
 element('outlet').value='권역 B';await element('outlet').fire('change');
 assert.match(element('actionScope').textContent,/권역 B/);assert.doesNotMatch(element('actionBody').innerHTML,/Alpha/);
 assert.match(element('actionBody').innerHTML,/현재 조회 범위/);
 element('outlet').value='권역 A';await element('outlet').fire('change');
 assert.match(element('actionBody').innerHTML,/Alpha/);
 api.refreshSelectors();assert.equal(element('outlet').value,'권역 A');assert.equal(element('month').value,'2026-09');
 assert.equal(f.requests.length,0,'Navigation and scope selection do not submit changes');
}
console.log('PASS Partner usability: current scope follows month/region, valid selections survive refresh, change tiles open matching rows');

{
 const {api,element,cards,scrolled}=fixture();api.setData(data);api.refreshSelectors();api.render();
 api.setActionView('persist',{scroll:false});
 const delta=cards.find(x=>x.dataset.kpi==='delta');let prevented=false;
 await delta.fire('keydown',{key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(scrolled.at(-1),'changes');assert.equal(delta.attributes['aria-controls'],'changes');
 assert.equal(api.selection().view,'persist','Delta card must not silently replace the existing Action filter');
 element('month').value='2026-08';await element('month').fire('change');
 for(const id of ['x2o','o2x','newSupply','stopSupply','changeX2O','kpiDeltaRate'])assert.equal(element(id).textContent,'—');
 assert.match(element('changeSub').textContent,/이전 월 자료가 없어/);
 api.setActionView('new',{scroll:false});assert.match(element('actionBody').innerHTML,/비교할 수 없습니다/);
 assert.doesNotMatch(element('actionBody').innerHTML,/Alpha/,'First-month supply must not be labelled newly supplied');
 element('month').value='2026-09';await element('month').fire('change');assert.equal(element('newSupply').textContent,'1');
}
console.log('PASS Partner usability: delta keyboard navigation preserves list, absent previous-month data differs from zero changes');

{
 const {api,element,exported}=fixture();api.setData(data);api.refreshSelectors();element('outlet').value='권역 A';api.render();
 api.setActionView('x',{scroll:false});element('actionSearch').value='2222222222';await element('actionSearch').fire('input');
 assert.match(element('actionBody').innerHTML,/Beta/);assert.doesNotMatch(element('actionBody').innerHTML,/>New</);
 assert.match(element('actionScope').textContent,/검색: 2222222222/);assert.equal(element('actionSearchClear').hidden,false);
 await api.exportActions();assert.equal(exported.at(-1).length,1);assert.equal(exported.at(-1)[0]['실사업자명'],'Beta');
 await element('actionSearchClear').fire('click');assert.equal(api.selection().view,'x');assert.equal(element('actionSearch').value,'');
 assert.equal(element('outlet').value,'권역 A');assert.equal(element('actionSearchClear').hidden,true);assert.equal(element('actionSearch').focused,true);
 await element('actionFilterReset').fire('click');assert.equal(element('outlet').value,'권역 A');assert.equal(element('month').value,'2026-09');
 assert.equal(api.selection().view,'supplied');
 element('actionSearch').value='<없는 거래처>';await element('actionSearch').fire('input');
 assert.match(element('actionBody').innerHTML,/검색한 거래처가 없습니다/);assert.doesNotMatch(element('actionBody').innerHTML,/<없는 거래처>/);
}
console.log('PASS Partner usability: business-number search ignores hyphens, search reset keeps scope, export matches searched rows, clear empty result');

{
 const {api,element,requests}=fixture();api.setData(data);api.refreshSelectors();api.render();
 api.savePartnerOverride('권역 A|||222-22-22222','plan','확인 예정');api.savePartnerOverride('권역 A|||222-22-22222','status','IN_PROGRESS');
 assert.equal(requests.length,0);assert.match(element('pendingActionCount').textContent,/1처 · 2개 항목/);
 assert.equal(element('workSave').textContent,'미전송 1처 저장');assert.equal(element('workSave').disabled,false);
 await element('workSave').fire('click');
 assert.equal(requests.filter(x=>x.type==='partnerSaveActions').length,1);assert.equal(requests[0].changes.length,2);
 assert.equal(element('workSave').disabled,true);assert.equal(element('workSave').textContent,'미전송 없음');
 assert.match(element('actionBody').innerHTML,/aria-label="[^\"]+ 업체 조치계획"/);
}
console.log('PASS Partner usability: sticky save counts merchants separately from fields and sends only after explicit click, editable fields have names');

{
 const {api,element}=fixture();assert.match(html,/<main class="wrap" id="top" inert aria-hidden="true">/);
 assert.match(html,/<aside class="side" id="partnerSide" inert aria-hidden="true">/);
 element('loginPartner').value='테스트 업체';element('loginPassword').value='fixture';
 api.mockRequest(async()=>({ok:true,partner:'테스트 업체',dashboardRevision:'r1',dashboardSnapshot:{data,dashboardRevision:'r1'},actionSnapshot:{actions:[]}}));
 await api.login();assert.equal(element('top').inert,false);assert.equal(element('partnerSide').attributes['aria-hidden'],'false');
 api.logout();assert.equal(element('top').inert,true);assert.equal(element('partnerSide').attributes['aria-hidden'],'true');
 assert.equal(element('actionShown').textContent,'0 / 0처 표시');assert.equal(element('actionMore').hidden,true);
}
console.log('PASS Partner usability: logged-out dashboard is inert, successful login restores controls, logout removes stale list metadata');
