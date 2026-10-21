import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd(),fail=m=>{throw new Error(m)},ok=m=>console.log('PASS',m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),exists=p=>fs.existsSync(path.join(root,p));
const html=read('index.html');
const workflow=read('srm-workflow.js');
new Function(workflow);
if(!workflow.includes('grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr))'))
  fail('SRM form must use responsive container-width grid, not three fixed columns');
if(!workflow.includes('box-sizing:border-box')||!workflow.includes('overflow-x:hidden'))
  fail('SRM fields/table do not isolate horizontal overflow');
if(!workflow.includes("const host=target?.parentNode||document.querySelector('main.wrap')||document.body"))
  fail('SRM panel can escape the dashboard main container');
if(!workflow.includes("const target=isPartner()?$('action'):$('ctActionBody')?.closest('section')"))
  fail('Master SRM panel anchor is not the Action Board section');
if(!workflow.includes('srmNeedsAction')||!workflow.includes('srmConsulted')||
   workflow.includes('srmOverdue')||workflow.includes('srm-dueDate')||
   workflow.includes('>기한</th>')||workflow.includes('기한 초과'))
   fail('SRM must show six grounded metrics without obsolete deadline inputs or KPIs');
if(!workflow.includes('table-layout:fixed')||!workflow.includes('min-width:0')||
   !workflow.includes('data-label="다음 조치"'))
   fail('SRM five-column table must not require horizontal scrolling on desktop or mobile');
ok('SRM six grounded KPI cards, deadline-free editor/table and responsive in-layout mount');

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

const required=['partnerLogin','loginPartner','loginPassword','loginBtn','outlet','month','rate','actionBody','exportAction','actionView','actionDetail','actionSearch','actionFilterReset','actionFilterCount','actionViewTitle'];
for(const id of required)if(!html.includes('id="'+id+'"'))fail('Missing required DOM id: '+id);
if(html.includes('id="actionEntity"'))fail('Redundant Action Board group-company filter returned');
const actionOptions=id=>{
 const selection=html.match(new RegExp('<select id="'+id+'"[^>]*>([\\s\\S]*?)<\\/select>'))?.[1]||'';
 return [...selection.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)]
  .map(([,value,label])=>({value,label}));
};
const expectedBase=[{value:'supplied',label:'전체 거래처'},{value:'x',label:'우선 조치 필요처'}];
const expectedDetails=[
 {value:'all',label:'전체'},
 {value:'persist',label:'2개월 이상 지속 X'},
 {value:'all3',label:'3개사 모두 X'},
 {value:'improved',label:'X→O 개선 거래처'},
 {value:'worsened',label:'O→X 악화 거래처'},
 {value:'new',label:'신규 공급처'},
 {value:'stopped',label:'중단 공급처'}];
if(JSON.stringify(actionOptions('actionView'))!==JSON.stringify(expectedBase)||
 JSON.stringify(actionOptions('actionDetail'))!==JSON.stringify(expectedDetails))
 fail('Partner filters must contain only 2 merchant views and 7 essential details, with no history/group selector');
ok('required partner DOM contract');
const actionHeader=html.match(/<div class="table-wrap"><table><thead><tr>(.*?)<\/tr>/)?.[1]||'';
if((actionHeader.match(/<th/g)||[]).length!==9||actionHeader.includes('완료 예정일'))fail('Partner Action Board must have exactly nine visible columns without due date');
const responsiveCss=read('partner.css');
if(!responsiveCss.includes('table-layout:fixed')||!responsiveCss.includes('overflow-x:hidden')||!responsiveCss.includes('@media(max-width:1180px)'))fail('Partner Action Board responsive layout or horizontal scroll guard missing');
ok('nine-column Partner board with responsive desktop and small-device layouts');
if(html.includes('Priority · Risk Score 산정 기준')||html.includes('>Score</th>')||html.includes('>Priority</th>'))fail('Partner scoring labels remain in Action Board');
if(!html.includes('<th>미연동 기간</th>')||!html.includes('우선 조치 필요처'))fail('Partner Korean Action labels missing');
ok('Partner action board has Korean period/action labels and no scoring UI');

function walk(dir='.'){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.name==='.git'||e.name==='node_modules')return[];return e.isDirectory()?walk(p):[p]})}
for(const file of walk().filter(x=>x.endsWith('.js'))){new vm.Script(read(file),{filename:file});}
ok('all JavaScript parses');
await import('./monthly-history-regression.mjs');
await import('./srm-metrics-regression.mjs');
await import('./srm-ui-regression.mjs');
await import('./srm-action-parity-regression.mjs');
await import('./partner-reliability-regression.mjs');

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
// Main at a9534ce already shipped 135,532 bytes; session/snapshot/save guards add
// about 6 KB without extra dependencies or initial requests. Keep a tight ceiling.
if(initialBytes>143000)fail('Initial local payload budget exceeded: '+initialBytes);
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
const withTest=partnerJs.replace(hook,"window.__overrideTest={setPartner:p=>{partner=p},setPassword:p=>{password=p},setData:d=>{data=d;historyCache.clear()},mockRequest:f=>{request=f},disableRender:()=>{render=()=>{};pullSharedActions=async()=>{}},getPending:pendingChanges,savePendingActions,applyShared,savePartnerOverride,actionFor,risks,buildActionContext,filterActionRows,setActionView,chooseActionBase,chooseActionDetail,getSelection:()=>({base:actionBase,detail:actionDetail,view:actionView}),getView:()=>actionView,setActionContext:c=>{actionContext=c},renderAction,reset:()=>{localStorage.setItem(overrideKey(),'{}');actionOverrides={};rebuildActions()}};"+hook);
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
test.savePartnerOverride(k,'dueDate','2026-12-01');
if(test.getPending().some(change=>change.field==='dueDate'))fail('Retired dueDate must never be staged for saving');
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
uiElements.set('actionView',{value:'supplied'});
uiElements.set('actionDetail',{value:'all'});
uiElements.set('actionSearch',{value:''});
sandbox.document.getElementById=id=>uiElements.get(id)||null;
sandbox.document.querySelectorAll=()=>[];
test.setActionContext(context);
test.setActionView('x',{scroll:false});
if(JSON.stringify(test.getSelection())!==JSON.stringify({base:'x',detail:'all',view:'x'}))fail('Partner base filter did not select only unlinked merchants');
test.chooseActionDetail('improved');
if(JSON.stringify(test.getSelection())!==JSON.stringify({base:'supplied',detail:'improved',view:'improved'})||
 uiElements.get('actionView').value!=='supplied'||uiElements.get('actionDetail').value!=='improved'||
 !uiElements.get('actionFilterCount').textContent.startsWith('2처'))
 fail('Selecting an improvement detail must clear the X-only base filter and retain 2 improved merchants');
test.chooseActionBase('x');
if(JSON.stringify(test.getSelection())!==JSON.stringify({base:'x',detail:'all',view:'x'})||
 uiElements.get('actionDetail').value!=='all')
 fail('Selecting a new base filter must reset the incompatible detail condition');
test.chooseActionDetail('all');
if(test.getSelection().base!=='x'||test.getSelection().view!=='x')
 fail('Selecting all details should preserve base X selection');
test.chooseActionDetail('stopped');
if(test.getSelection().base!=='supplied'||test.getSelection().detail!=='stopped'||
 uiElements.get('actionView').value!=='supplied')
 fail('Supply-stop filter must not be accidentally intersected with current-X merchants');
test.setActionView('persist',{scroll:false});
if(test.getSelection().base!=='supplied'||test.getSelection().detail!=='persist'||
 uiElements.get('actionFilterCount').textContent.indexOf('1처')!==0)
 fail('Persist-X KPI drilldown did not populate the new detail filter');
test.setActionView('supplied',{scroll:false});
if(test.getSelection().base!=='supplied'||test.getSelection().detail!=='all'||
 !uiElements.get('actionFilterCount').textContent.startsWith('4처'))
 fail('Reset/full-supply view lost expected merchant total');
const tableHtml=uiElements.get('actionBody').innerHTML;
const renderedRows=tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)||[];
if(!renderedRows.length||renderedRows.some(row=>(row.match(/<td\b/g)||[]).length!==9))fail('Partner table did not render 9 aligned columns');
if(/data-field="dueDate"/.test(tableHtml)||/\b\d{4}-\d{2}-\d{2}\b/.test(tableHtml))fail('Retired due date must not appear in action rows');
if(partnerJs.includes("'마스터 Due':")||partnerJs.includes("'업체 Due':")||partnerJs.includes("'Due':"))fail('Due date columns must not be exported');
if(!tableHtml.includes('data-label="조치계획"'))fail('Partner card field labels missing');
if(/score-col|priority-col/.test(tableHtml))fail('Partner scoring columns reappeared');
if(tableHtml.includes('월별 일괄기재')||tableHtml.includes('업체 입력 수정 가능')||
 !tableHtml.includes('ERP업체 소통하여 정상 연동 조치')||
 !tableHtml.includes('거래처 요청 및 대웅 협조'))
 fail('Partner historical Master/Partner cause, plan and completed state not rendered');
if(!tableHtml.includes('status-o')||!tableHtml.includes('status-x')||!tableHtml.includes('status-na'))
  fail('Rendered Action rows do not show all O/X/unassessed status chips');
if(!tableHtml.includes('readonly-action'))
  fail('Current O-only merchants without saved Action must be read only');
if(!tableHtml.includes('business-number')||!tableHtml.includes('dual-master')||!tableHtml.includes('dual-partner'))
  fail('Merchant business ID or independent master/Partner inputs missing');
if(!uiElements.get('actionFilterCount').textContent.includes('4처'))
  fail('Action filtered results count does not show unique merchant total');
ok('rendered 3-company O/X chips, master/Partner fields and read-only O-only rows');

const historicKey='백제약품 대전|||3';
test.applyShared({actions:[{key:historicKey,outlet:'백제약품 대전',businessNo:'3',
 status:'TODO',reasonCode:'',plan:''}]});
test.setActionView('history',{scroll:false});
let editableHistory=uiElements.get('actionBody').innerHTML;
if(editableHistory.includes('월별 일괄기재')||
 !editableHistory.includes('data-key="'+historicKey+'"')||
 !editableHistory.includes('value="거래처 요청 및 대웅 협조"')||
 !editableHistory.includes('data-field="status"')||
 editableHistory.includes('readonly-action'))
 fail('Registered historical bulk entry must render editable Partner reason/plan/status, including O-only rows');
const beforeEdit=test.actionFor(cRows[2]);
if(beforeEdit.partnerAction.plan!=='거래처 요청 및 대웅 협조'||
 (beforeEdit.partnerSavedFields||[]).length)
 fail('Synthetic defaults must not be misidentified as a saved Partner edit');
test.savePartnerOverride(historicKey,'plan','업체가 확인한 수정 계획');
const afterEdit=test.actionFor(cRows[2]);
if(afterEdit.partnerAction.plan!=='업체가 확인한 수정 계획'||
 !(afterEdit.partnerSavedFields||[]).includes('plan')||
 !test.getPending().some(p=>p.key===historicKey&&p.field==='plan'))
 fail('Partner manual correction must override bulk-prefilled plan and stage authenticated save');
await test.savePendingActions();
if(test.getPending().length||test.actionFor(cRows[2]).partnerAction.plan!=='업체가 확인한 수정 계획')
 fail('Historical Partner edit must survive server acknowledgement and replace the default');
test.renderAction();
if(uiElements.get('actionBody').innerHTML.includes('업체 수정값 적용됨')||
 !uiElements.get('actionBody').innerHTML.includes('업체가 확인한 수정 계획'))
 fail('Re-render reverted a confirmed Partner correction to generated bulk text');
const displayed=sandbox.window.DCMPartnerSRM.viewRows().find(v=>v.key===historicKey);
if(!displayed||displayed.masterStatus!=='DONE'||displayed.partnerStatus!=='DONE')
 fail('SRM-visible Partner states must equal the historical Master/Partner DONE cells shown by the Action Board');
test.savePartnerOverride(historicKey,'status','TODO');
const changedStatus=sandbox.window.DCMPartnerSRM.viewRows().find(v=>v.key===historicKey);
if(!changedStatus||changedStatus.masterStatus!=='DONE'||changedStatus.partnerStatus!=='TODO')
 fail('SRM-visible Partner status did not follow an actual editable status override');
test.reset();
test.setActionView('supplied',{scroll:false});
ok('historical Partner fields editable, overrides persist, and SRM status projection follows actual visible values');

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
if(!stopHtml.includes('<small class="monthly-action-marker">공급 중단</small>')||
 !stopHtml.includes('04 거래처 연동 거부/미협조')||
 !stopHtml.includes('공급 중단')||
 !stopHtml.includes('완료')||
 stopHtml.includes('2026-07-31'))
 fail('Partner-only July supply-stop closure must display correctly in monthly view');
if(stopHtml.includes('ERP업체 소통하여 정상 연동 조치'))
 fail('Master plan must not be populated for supply-stop cases');
ok('Partner July stopped merchant: cause/plan/status visible, archival due date preserved but hidden');


console.log('HARNESS_OK');
