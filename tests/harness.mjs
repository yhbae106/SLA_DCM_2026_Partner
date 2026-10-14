import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),fail=m=>{throw new Error(m)},ok=m=>console.log('PASS',m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),exists=p=>fs.existsSync(path.join(root,p));
const html=read('index.html');
const workflow=read('srm-workflow.js');
new Function(workflow);
if(!workflow.includes('grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr))'))
  fail('SRM form must use responsive container-width grid, not three fixed columns');
if(!workflow.includes('box-sizing:border-box')||!workflow.includes('overflow-x:auto'))
  fail('SRM fields/table do not isolate horizontal overflow');
if(!workflow.includes("const host=target?.parentNode||document.querySelector('main.wrap')||document.body"))
  fail('SRM panel can escape the dashboard main container');
if(!workflow.includes("const target=isPartner()?$('action'):$('ctActionBody')?.closest('section')"))
  fail('Master SRM panel anchor is not the Action Board section');
ok('SRM fixed-width overflow guard, responsive field grid and in-layout mount');

if(!html.includes('srm-workflow.js')||!workflow.includes('srmAppend')||!workflow.includes('SRM'))fail('SRM workflow panel missing');
const partnerJsText=read('partner.js');
if(!partnerJsText.includes('DCMPartnerSRM')||!partnerJsText.includes('data-srm-open'))fail('Partner SRM authenticated connector missing');
ok('SRM Partner workflow, authenticated adapter and Action Board drilldown');
const refs=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1].split(/[?#]/)[0]).filter(x=>x&&!/^(?:https?:|data:|#)/.test(x));
for(const r of refs)if(!exists(r))fail('Missing local asset: '+r);
ok('all index assets exist');
if(html.includes('cdn.sheetjs.com'))fail('SheetJS must not be eagerly loaded');
ok('SheetJS is lazy-loaded');

for(const p of ['app.js','data/base-data.js','dw-illustration.svg','partner-upload-v2.js','styles.css'])if(exists(p))fail('Legacy unused asset returned: '+p);
ok('legacy unused assets remain removed');

const required=['partnerLogin','loginPartner','loginPassword','loginBtn','outlet','month','rate','actionBody','exportAction','actionView','actionEntity','actionSearch','actionFilterReset','actionFilterCount','actionViewTitle'];
for(const id of required)if(!html.includes('id="'+id+'"'))fail('Missing required DOM id: '+id);
ok('required partner DOM contract');

function walk(dir='.'){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.name==='.git'||e.name==='node_modules')return[];return e.isDirectory()?walk(p):[p]})}
for(const file of walk().filter(x=>x.endsWith('.js'))){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});}
ok('all JavaScript parses');
await import('./monthly-history-regression.mjs');

const ctx={};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(read('logic.js'),ctx);
const L=ctx.DCMLogic;if(!L)fail('DCMLogic not exported');
const S=(a,b,c)=>({'대웅제약':a,'대웅바이오':b,'한올바이오':c});
const prev=[
 {month:'2026-08',outlet:'A',manager:'M',businessNo:'1',businessName:'Alpha',statuses:S('X','O',null)},
 {month:'2026-08',outlet:'A',manager:'M',businessNo:'2',businessName:'Beta',statuses:S('O',null,null)}
];
const curr=[
 {month:'2026-09',outlet:'A',manager:'M',businessNo:'1',businessName:'Alpha',statuses:S('O','X',null)},
 {month:'2026-09',outlet:'A',manager:'M',businessNo:'3',businessName:'Gamma',statuses:S('O',null,null)}
];
const sum=L.summarize(curr);
if(sum.O!==2||sum.X!==1||sum.needAbsolute!==1||sum.suppliedAbsolute!==2)fail('summarize regression');
const ch=L.compare(prev,curr);
if(ch.xToO.length!==1||ch.oToX.length!==1||ch.newSupply.length!==1||ch.stoppedSupply.length!==1)fail('compare regression');
ok('core DCM calculations');

const localAssets=[...new Set(refs)].filter(exists);
const initialBytes=fs.statSync('index.html').size+localAssets.reduce((s,p)=>s+fs.statSync(p).size,0);
if(initialBytes>120000)fail('Initial local payload budget exceeded: '+initialBytes);
ok('initial local payload '+Math.round(initialBytes/1024)+' KB');

const partnerJs=read('partner.js');
if(!partnerJs.includes("type:'partnerSaveActions'")||!partnerJs.includes('savePendingActions'))fail('Authenticated Partner batch Save is not implemented');
if(!partnerJs.includes('dual-master')||!partnerJs.includes('dual-partner'))fail('Master and Partner views are not visually separated');
ok('authenticated Partner batch-save and dual-source Action cells');
if(!partnerJs.includes("'05':'도매몰 미연동'")||partnerJs.includes("'08':'도매몰 연동 필요'"))
  fail('Partner dictionary must have seven reasons and the new 05 label');

if(!partnerJs.includes("type:'partnerSaveActions'")||!partnerJs.includes('async function savePendingActions'))fail('Batch Save button handler missing');
if(/queuePartnerWrite\(k,field/.test(partnerJs))fail('Unexpected immediate per-field Save path retained');
for(const id of ['actionMore','actionSyncStatus','kpiDeltaRate','all3Abs','saveToMasterBtn','pendingActionCount'])if(!html.includes('id="'+id+'"'))fail('Missing Partner UI: '+id);
ok('unified Action pagination, searchable filters and KPI ids');
if(html.includes('id="risk"')||html.includes('id="riskBody"')||html.includes('data-jump="risk"'))
  fail('Duplicate X-risk table was not removed');
if(!html.includes('</tr></thead><tbody id="actionBody"'))fail('Unified Action Board table is malformed');
for(const company of ['대웅제약','대웅바이오','한올바이오']){
  if(!html.includes('<th>'+company+'</th>'))fail('Missing O/X status header for '+company);
}
if(!partnerJs.includes("E.map(status).join('')")||!partnerJs.includes('aria-pressed'))
  fail('3-company status cells or accessible KPI selection missing');
ok('duplicate X table removed, 3-company O/X visible, keyboard KPI cards');
const hook="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();";
if(!partnerJs.includes(hook))fail('Partner test hook marker missing');
const withTest=partnerJs.replace(hook,"window.__overrideTest={setPartner:p=>{partner=p},setPassword:p=>{password=p},setData:d=>{data=d;historyCache.clear()},mockRequest:f=>{request=f},disableRender:()=>{render=()=>{};pullSharedActions=async()=>{}},getPending:pendingChanges,savePendingActions,applyShared,savePartnerOverride,actionFor,risks,buildActionContext,filterActionRows,setActionView,getView:()=>actionView,setActionContext:c=>{actionContext=c},renderAction,reset:()=>{localStorage.setItem(overrideKey(),'{}');actionOverrides={};rebuildActions()}};"+hook);
const store=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const ls=store(),sess=store();
const sandbox={window:{DCMLogic:L},document:{readyState:'loading',addEventListener(){},getElementById(){return null}},localStorage:ls,sessionStorage:sess,console:{warn(){}}};
vm.createContext(sandbox);
vm.runInContext(read('data/monthly-action-history.js'),sandbox);
vm.runInContext(withTest,sandbox);
const test=sandbox.window.__overrideTest;
const testRow={outlet:'백제약품 대전',businessNo:'123'},k='백제약품 대전|||123';
const original={key:k,...testRow,plan:'MASTER',reasonCode:'01',dueDate:'2026-10-20',status:'TODO'};
test.setPartner('백제약품');
test.applyShared({actions:[original]});
if(test.actionFor(testRow).plan!=='MASTER')fail('Master baseline missing');
test.savePartnerOverride(k,'plan','PARTNER');
test.applyShared({actions:[{...original,plan:'MASTER NEW',reasonCode:'02',dueDate:'2026-10-21'}]});
if(test.actionFor(testRow).plan!=='PARTNER')fail('Master overwrote Partner local plan');
if(test.actionFor(testRow).reasonCode!=='02'||test.actionFor(testRow).dueDate!=='2026-10-21')fail('Untouched fields did not follow master');
test.savePartnerOverride(k,'reasonCode','');
test.applyShared({actions:[{...original,reasonCode:'08'}]});
if(test.actionFor(testRow).reasonCode!=='')fail('Empty local field did not win');
test.reset();test.applyShared({actions:[{...original,reasonCode:'08'}]});
if(test.actionFor(testRow).reasonCode!=='05')fail('Legacy 08 did not normalize to 05');
test.applyShared({actions:[{...original,plan:'RESET TO MASTER'}]});
if(test.actionFor(testRow).plan!=='RESET TO MASTER')fail('Override reset did not restore master');
ok('Partner per-field override wins, untouched fields refresh, reset restores master');
test.applyShared({actions:[{...original,plan:'MASTER LATEST',partnerAction:{plan:'PARTNER SHEET',status:'DONE',editedFields:['plan','status'],modifiedBy:'업체:백제약품'}}]});
const merged=test.actionFor(testRow);
if(merged.plan!=='PARTNER SHEET'||merged.masterAction.plan!=='MASTER LATEST')fail('Partner Sheet value hid the master original');
if(merged.partnerAction.plan!=='PARTNER SHEET'||merged.partnerAction.status!=='DONE')fail('Partner write was not preserved');
ok('master and partner values remain independent and visible together');
test.setPartner('유진약품');
ls.setItem('dcm-partner-master-actions::유진약품',JSON.stringify([{key:'유진약품|||z',outlet:'유진약품',businessNo:'z',plan:'LEGACY LOCAL'}]));
test.applyShared({actions:[{key:'유진약품|||z',outlet:'유진약품',businessNo:'z',plan:'MASTER'}]});
if(test.actionFor({outlet:'유진약품',businessNo:'z'}).plan!=='LEGACY LOCAL')fail('Legacy local Action lost');
ok('legacy local actions migrated to overrides');


test.setPartner('백제약품');test.setPassword('test-only');test.setData([{outlet:'백제약품 대전',businessNo:'123',month:'2026-10'}]);test.disableRender();
let outbound=[];
test.mockRequest(async payload=>{outbound.push(payload);if(payload.type==='partnerSaveActions')return {ok:true,results:payload.changes.map(x=>({...x,updatedAt:'2026-10-08T16:00:00+09:00',modifiedBy:'업체:백제약품'}))};return {ok:true,actions:[]};});
test.applyShared({actions:[original]});
test.savePartnerOverride(k,'plan','STAGED PARTNER PLAN');
test.savePartnerOverride(k,'status','DONE');
if(outbound.length)fail('Save happened automatically before Save to Master click');
if(test.getPending().length!==2)fail('Two edited fields not staged');
await test.savePendingActions();
const submitted=outbound.filter(x=>x.type==='partnerSaveActions');
if(submitted.length!==1||submitted[0].changes.length!==2)fail('Expected a single two-field batch request');
if(test.getPending().length!==0)fail('Acknowledged pending edits were not cleared');
ok('explicit Save batches staged changes and clears only acknowledged fields');

const S2=(a,b,c)=>({'대웅제약':a,'대웅바이오':b,'한올바이오':c});
const r=(month,num,name,status)=>({month,outlet:'백제약품 대전',businessNo:num,businessName:name,manager:'정직한',statuses:status});
const pRows=[
  r('2026-08','1','A-One',S2('X','O',null)),
  r('2026-08','2','B-ThreeX',S2('X','X','X')),
  r('2026-08','3','C-ImprovedOnly',S2('X',null,null)),
  r('2026-08','4','D-AlreadyO',S2('O','O','O'))
];
const cRows=[
  r('2026-09','1','A-One',S2('O','X',null)),
  r('2026-09','2','B-ThreeX',S2('X','X','X')),
  r('2026-09','3','C-ImprovedOnly',S2('O',null,null)),
  r('2026-09','4','D-AlreadyO',S2('O','O','O'))
];
const stopJune=r('2026-06','stop','Stop June X',S2('X',null,null));
test.setData([...pRows,...cRows,stopJune]);
const changeFixture=L.compare(pRows,cRows);
const rrFixture=test.risks('2026-09',cRows,pRows,changeFixture);
const context=test.buildActionContext('2026-09',cRows,pRows,changeFixture,rrFixture);
const historical=sandbox.window.DCM_MONTHLY_ACTION_HISTORY.get('2026-09','백제약품 대전|||3');
if(!historical||historical.masterAction.status!=='DONE'||historical.partnerAction.status!=='DONE')
 fail('Partner historical X-to-O O-only completion missing');
if(test.filterActionRows(context,'history').map(r=>r.businessNo).join(',')!=='3')
 fail('Partner historical filtered completion not visible');
ok('Partner month-scoped O-only completion in Action context');
const ids=(view,entity='all',search='')=>test.filterActionRows(context,view,entity,search).map(x=>String(x.businessNo)).sort().join(',');
if(ids('x')!=='1,2')fail('X filter must include only currently unlinked merchants');
if(ids('persist')!=='2'||ids('all3')!=='2')fail('Persistent X / all-3-X filters failed');
if(ids('improved')!=='1,3')fail('Improvement filter must include O-only now improved merchants');
if(ids('worsened')!=='1')fail('O-to-X filter includes incorrect merchants');
if(ids('supplied')!=='1,2,3,4')fail('Supply drilldown omitted O-only merchants');
if(ids('new')!==''||ids('stopped')!=='')fail('Fixture should have no new or stopped merchants');
if(ids('x','대웅제약')!=='2')fail('Company X selection did not narrow correctly');
if(ids('worsened','대웅바이오')!=='1')fail('Company O-to-X selection failed');
if(ids('supplied','all','ImprovedOnly')!=='3'||ids('x','all','not-found')!=='')fail('Search filter malfunction');
const duplicateContext=test.buildActionContext('2026-09',[...cRows,cRows[0]],pRows,changeFixture,rrFixture);
if(test.filterActionRows(duplicateContext,'supplied').length!==4)fail('Duplicate same merchant surfaced twice');
test.setActionView('worsened',{scroll:false});
if(test.getView()!=='worsened')fail('Card/select drilldown state did not update');
ok('KPI drilldowns, company filters, search and deduplicated merchants');
const uiElements=new Map();
for(const id of ['actionBody','actionFilterCount','actionViewTitle','actionShown','actionMore']){
  uiElements.set(id,{innerHTML:'',textContent:'',hidden:false});
}
uiElements.set('month',{value:'2026-09'});
sandbox.document.getElementById=id=>uiElements.get(id)||null;
sandbox.document.querySelectorAll=()=>[];
test.setActionContext(context);
test.setActionView('supplied',{scroll:false});
const tableHtml=uiElements.get('actionBody').innerHTML;
if(!tableHtml.includes('월별 X→O 조치 이력')||
 !tableHtml.includes('ERP업체 소통하여 정상 연동 조치')||
 !tableHtml.includes('거래처 요청 및 대웅 협조')||
 !tableHtml.includes('2026-09-30'))
 fail('Partner historical Master/Partner cause, plan, Due and completed state not rendered');
if(!tableHtml.includes('status-o')||!tableHtml.includes('status-x')||!tableHtml.includes('status-na'))
  fail('Rendered Action rows do not show all O/X/unassessed status chips');
if(!tableHtml.includes('readonly-action'))
  fail('Current O-only merchants without saved Action must be read only');
if(!tableHtml.includes('business-number')||!tableHtml.includes('dual-master')||!tableHtml.includes('dual-partner'))
  fail('Merchant business ID or independent master/Partner inputs missing');
if(!uiElements.get('actionFilterCount').textContent.includes('4처'))
  fail('Action filtered results count does not show unique merchant total');
ok('rendered 3-company O/X chips, master/Partner fields and read-only O-only rows');
const julyContext=test.buildActionContext('2026-07',[],[stopJune],L.compare([stopJune],[]),[]);
const missing=test.filterActionRows(julyContext,'stopped');
if(missing.length!==1||missing[0].businessNo!=='stop')
  fail('July supply-stop merchant missing because the entire July row is absent');
const julyHist=sandbox.window.DCM_MONTHLY_ACTION_HISTORY.get('2026-07','백제약품 대전|||stop');
if(!julyHist||julyHist.partnerAction.reasonCode!=='04'||
 julyHist.partnerAction.plan!=='공급 중단'||
 julyHist.partnerAction.status!=='DONE'||julyHist.partnerAction.dueDate!=='2026-07-31')
 fail('July partner 04 supply-stop action data missing');
uiElements.get('month').value='2026-07';
test.setActionContext(julyContext);
test.setActionView('stopped',{scroll:false});
const stopHtml=uiElements.get('actionBody').innerHTML;
if(!stopHtml.includes('7월 공급 중단(관리분류)')||
 !stopHtml.includes('04 거래처 연동 거부/미협조')||
 !stopHtml.includes('공급 중단')||
 !stopHtml.includes('2026-07-31')||
 !stopHtml.includes('완료'))
 fail('Partner-only July supply-stop closure must display correctly in monthly view');
if(stopHtml.includes('ERP업체 소통하여 정상 연동 조치'))
 fail('Master plan must not be populated for supply-stop cases');
ok('Partner July no-sales absent merchant synthetic row, 04 cause, plan, Due, DONE and Master unaffected');


console.log('HARNESS_OK');