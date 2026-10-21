import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');
function harness(){
 class MemoryStorage{
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)||null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
 }
 const elements=new Map();
 for(const id of ['month','manager','outlet','ctPersist','ctPersistSub','ctAll3','ctAll3Sub',
  'persistAbs','persistState','all3Abs','all3State'])elements.set(id,{
  value:id==='month'?'2026-08':'전체',textContent:'',innerHTML:'',addEventListener(){}
 });
 const ctx={console,Storage:MemoryStorage,localStorage:new MemoryStorage(),sessionStorage:new MemoryStorage(),
  document:{readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id)||null,
   querySelectorAll:()=>[],querySelector:()=>null},
  setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){},addEventListener(){},
  DCM_CONFIG:{},DCM_ACTION_SYNC:{},DCM_BASE_DATA:[],
  DCM_MONTHLY_ACTION_HISTORY:{refresh(){},get:()=>null,forMonth:()=>[]}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(read('logic.js'),ctx);
 return {ctx,elements};
}
const row=(month,id='A',status='X')=>({month,outlet:'테스트 업체',manager:'테스트 담당',
 businessNo:id,businessName:'거래처 '+id,statuses:{대웅제약:status,대웅바이오:null,한올바이오:null}});
const cases=[
 {name:'whole July absent',month:'2026-08',data:[row('2026-06'),row('2026-08')],expected:1},
 {name:'December to January',month:'2027-01',data:[row('2026-12'),row('2027-01')],expected:2},
 {name:'three consecutive months',month:'2026-08',data:[row('2026-06'),row('2026-07'),row('2026-08')],expected:3},
 {name:'merchant July absent',month:'2026-08',data:[row('2026-06'),row('2026-07','B','O'),row('2026-08')],expected:1},
 {name:'intervening O',month:'2026-08',data:[row('2026-06'),row('2026-07','A','O'),row('2026-08')],expected:1},
 {name:'current O ends the streak',month:'2026-08',data:[row('2026-06'),row('2026-07'),row('2026-08','A','O')],expected:0}
];
function instrument(file,marker,statement){
 const source=read(file);assert.equal(source.split(marker).length,2,file+' test mount marker must be unique');
 return source.replace(marker,statement+'\n'+marker);
}
function verifyHelper(){
 const {ctx}=harness(),L=ctx.DCMLogic;
 for(const fixture of cases){
  const map=new Map(fixture.data.filter(r=>r.businessNo==='A').map(r=>[r.month,r.statuses.대웅제약]));
  assert.equal(L.consecutiveX(fixture.month,m=>map.get(m)),fixture.expected,fixture.name);
 }
 assert.equal(L.consecutiveX('2026-08',()=>null),0,'Unassessed is not an X month');
 assert.equal(L.consecutiveX('2026-13',()=> 'X'),0,'Invalid month is rejected');
 assert.equal(L.consecutiveX('',()=> 'X'),0);
 assert.equal(L.consecutiveX('2026-08',null),0);
 const values={'2026-08':' x ','2026-07':'X'};
 assert.equal(L.consecutiveX('2026-08',m=>values[m]),2,'Status normalization remains shared');
}
function verifyMaster(){
 const {ctx,elements}=harness();
 vm.runInContext(instrument('control-tower.js',
  "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();",
  'window.__calendarTower={streakRows,render};'),ctx);
 vm.runInContext(read('action-sync.js'),ctx);
 vm.runInContext(read('control-tower-patch.js'),ctx);
 vm.runInContext(instrument('action-sync-config.js','  let persistTimer=0;',
  '  window.__calendarPersist=renderPersistMatrix;'),ctx);
 for(const fixture of cases){
  ctx.DCM_BASE_DATA=fixture.data;elements.get('month').value=fixture.month;
  const tower=ctx.__calendarTower.streakRows(fixture.data,fixture.month).find(r=>r.businessNo==='A');
  assert.equal(tower.entityStreak.대웅제약,fixture.expected,'Tower: '+fixture.name);
  const risk=ctx.DCMActionSync.allRisk().find(r=>r.businessNo==='A');
  if(fixture.expected)assert.equal(risk.aging,fixture.expected+'M','Sync risk: '+fixture.name);
  else assert.equal(risk,undefined,'Current O is not a risk merchant');
  const board=ctx.DCMUnifiedAction.build(),merchant=board.rows.find(r=>r.businessNo==='A');
  assert.equal(merchant.entityStreak.대웅제약,fixture.expected,'Board: '+fixture.name);
  assert.equal(merchant.aging,fixture.expected+'M');
  const filtered=ctx.DCMUnifiedAction.filter(board,'persist');
  assert.equal(filtered.length,fixture.expected>=2?1:0,'Board persistent-X filter: '+fixture.name);
  ctx.__calendarTower.render();
  assert.equal(ctx.DCM_CONTROL_TOWER_OK,true,'Real control-tower render must succeed');
  assert.equal(elements.get('ctPersist').textContent,filtered.length+'처','Tower KPI matches Board');
  ctx.__calendarPersist();
  assert.equal(elements.get('ctPersist').textContent,filtered.length+'처','Final matrix KPI matches Board');
  assert.equal(elements.get('ctPersistSub').textContent,filtered.length+'건 그룹사 상태 지속 X');
 }
}
function verifyPartner(){
 const {ctx,elements}=harness();
 vm.runInContext(instrument('partner.js',
  "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();",
  'window.__calendarPartner={setData:rows=>{data=rows;historyCache.clear();historyInput=null;},streakRows,risks,renderPersist,buildActionContext,filterActionRows};'),ctx);
 const api=ctx.__calendarPartner,L=ctx.DCMLogic;
 for(const fixture of cases){
  api.setData(fixture.data);elements.get('month').value=fixture.month;
  const months=[...new Set(fixture.data.map(r=>r.month))].sort(),index=months.indexOf(fixture.month),
   curr=fixture.data.filter(r=>r.month===fixture.month),prior=index>0?fixture.data.filter(r=>r.month===months[index-1]):[],
   changes=L.compare(prior,curr),risk=api.risks(fixture.month,curr,prior,changes);
  const merchant=api.streakRows(fixture.month,curr).find(r=>r.businessNo==='A');
  assert.equal(merchant.entityStreak.대웅제약,fixture.expected,'Partner source: '+fixture.name);
  assert.equal(merchant.streak,fixture.expected);
  const board=api.buildActionContext(fixture.month,curr,prior,changes,risk),
   filtered=api.filterActionRows(board,'persist');
  assert.equal(filtered.length,fixture.expected>=2?1:0,'Partner persistent-X filter: '+fixture.name);
  api.renderPersist(fixture.month,curr);
  assert.equal(elements.get('persistAbs').textContent,filtered.length+'처','Partner KPI matches Board');
  assert.equal(elements.get('persistState').textContent,filtered.length+'건');
 }
}

verifyHelper();
if(fs.existsSync('partner.js'))verifyPartner();else verifyMaster();
console.log('PASS CALENDAR STREAK: missing calendar/merchant months break X continuity, December–January and three-month chains work, actual KPI/board/risk paths agree');
