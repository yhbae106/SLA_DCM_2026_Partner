(()=>{
'use strict';
const ENDPOINT='https://script.google.com/macros/s/AKfycbygUlCo1x2izUO59cdbbBL3pbGLZgMaGrZz2lrqDfB8m4VtUHC-VqnEJMOeiQOUPXWCuQ/exec';
const L=window.DCMLogic,E=L?.E||['대웅제약','대웅바이오','한올바이오'],TARGET=.95,$=id=>document.getElementById(id),XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let xlsxPromise=null;function ensureXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(xlsxPromise)return xlsxPromise;xlsxPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=XLSX_URL;s.async=true;s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxPromise=null;reject(new Error('Excel 모듈 로딩 실패 · 네트워크/방화벽을 확인해 주세요.'));};document.head.appendChild(s);});return xlsxPromise;}
const reasons={'01':'ERP/시스템 미구축','02':'도입 품목 미연동','03':'전산/데이터 오류','04':'거래처 연동 거부/미협조','05':'도매몰 미연동','06':'신규 거래처 연동 예정','07':'당월 매출 미발생'};
const SESSION_PARTNER='dcm-partner-login-company',SESSION_PASSWORD='dcm-partner-login-password';
let partner='',password='',partnerVerified=false,data=[],actions=[],remoteActions=[],actionIndex=new Map(),actionOverrides={},actionPoll=null,dataPoll=null,lastActionRevision=null,lastDashboardRevision='',revisionSupported=false,actionCheckBusy=false,actionFetchBusy=false,lastActionFullPullAt=0,srmAnnounced=false,srmNotifyTimer=null,srmRenderTimer=null,historyInput=null,lastEditAt=0,actionLimit=30,riskLimit=60,historyCache=new Map(),saveQueue=Promise.resolve(),inFlight=new Set(),savingBatch=false,loadingData=false,loginInProgress=false,offlineServer=false,actionView='supplied',actionBase='supplied',actionDetail='all',actionSearch='',actionContext=null,activeKpi=null;
let sessionGeneration=0,actionGeneration=0,dashboardReceivedAt=0,dashboardUpdatedAt='',dashboardState='empty';
let outletCount=0,revisionRetryAt=0,revisionFailures=0;
const ownedRequests=new Set();
const currentSession=()=>({generation:sessionGeneration,company:partner,secret:password});
const sameSession=s=>s.generation===sessionGeneration&&s.company===partner&&s.secret===password;
function retireRequests(){revisionRetryAt=0;revisionFailures=0;sessionGeneration++;for(const controller of ownedRequests)controller.abort();ownedRequests.clear();}
function staleRequest(){const error=new Error('이전 접속의 요청이 취소되었습니다.');error.stale=true;return error;}
const stamp=value=>{const n=new Date(value);return Number.isFinite(n.getTime())?n.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'';};
function setDashboardStatus(message,state='loading'){
 dashboardState=state;const refresh=$('refreshBtn');if(refresh)refresh.disabled=state==='loading';const el=$('syncMsg');if(!el)return;
 el.textContent=message;el.className='upload-msg '+(state==='error'?'sync-error':state==='confirmed'?'sync-ok':'sync-pending');
 el.setAttribute?.('data-state',state);
}
function confirmDashboard(){
 dashboardReceivedAt=Date.now();
 setDashboardStatus(`마스터 현황 · ${data.length.toLocaleString()}건 · 최신 확인 ${stamp(dashboardReceivedAt)}${stamp(dashboardUpdatedAt)?' · 원본 갱신 '+stamp(dashboardUpdatedAt):''}`,'confirmed');
}
function validateDashboard(json){
 if(!json||!Array.isArray(json.data)||json.data.some(r=>!r||typeof r!=='object'||Array.isArray(r)||
  !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)||typeof r.outlet!=='string'||!r.outlet.trim()||
  !['string','number'].includes(typeof r.businessNo)||!String(r.businessNo).trim()||
  !r.statuses||typeof r.statuses!=='object'||Array.isArray(r.statuses)))
  throw new Error('현황 응답의 필수 항목을 확인할 수 없습니다. 이전 조회값을 유지합니다.');
 return json;
}
function validateActions(json){
 if(!json||!Array.isArray(json.actions)||json.actions.some(a=>!a||typeof a!=='object'||
  typeof a.key!=='string'||!a.key.includes('|||')||
  (a.partnerAction!=null&&(typeof a.partnerAction!=='object'||Array.isArray(a.partnerAction)||
   (a.partnerAction.editedFields!==undefined&&!Array.isArray(a.partnerAction.editedFields))))))
  throw new Error('조치 응답의 필수 항목을 확인할 수 없습니다. 기존 조치와 미전송 내용을 유지합니다.');
 return json;
}
function validatedAcknowledgements(batch,response){
 const expected=new Map(batch.map(item=>[JSON.stringify([item.key,item.field]),item]));
 if(!Array.isArray(response.results)||response.results.length!==batch.length)throw new Error('서버 저장 확인 건수가 일치하지 않습니다.');
 const checked=[];
 for(const item of response.results){
  const id=JSON.stringify([item?.key,item?.field]),original=expected.get(id);
  if(!original||!Object.prototype.hasOwnProperty.call(item,'value')||original.value!==String(item.value??''))
   throw new Error('서버 저장 확인이 중복되거나 입력값과 다릅니다. 미전송 내용을 유지합니다.');
  expected.delete(id);checked.push({item,original});
 }
 return checked;
}
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`,pp=v=>v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${(v*100).toFixed(1)}%p`,key=r=>`${r.outlet}|||${r.businessNo}`;
const monthLabel=m=>{if(!m)return '—';const [y,mm]=m.split('-');return `${y}년 ${Number(mm)}월`;};
const EDIT_FIELDS=['reasonCode','plan','status'];
function actionKey(){return `dcm-partner-master-actions::${partner}`;}
function overrideKey(){return `dcm-partner-action-overrides-v1::${partner}`;}
function canonicalPartnerReasonCode(code){return String(code||'')==='08'?'05':String(code||'');}
function loadOverrides(){
  let raw=localStorage.getItem(overrideKey());
  if(raw===null){
    const migrated={};
    try{
      const old=JSON.parse(localStorage.getItem(actionKey())||'[]');
      if(Array.isArray(old))old.forEach(a=>{
        if(!a?.key||!String(a.key).includes('|||'))return;
        const fields={};
        EDIT_FIELDS.forEach(f=>{if(Object.prototype.hasOwnProperty.call(a,f))fields[f]=String(a[f]??'');});
        if(Object.keys(fields).length)migrated[a.key]={fields,updatedAt:a.updatedAt||''};
      });
    }catch(e){console.warn('[DCM] legacy partner Action migration skipped',e);}
    raw=JSON.stringify(migrated);
    localStorage.setItem(overrideKey(),raw);
  }
  try{const obj=JSON.parse(raw);if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
    Object.values(obj).forEach(entry=>{if(entry?.fields?.reasonCode==='08')entry.fields.reasonCode='05';});
    return obj;
  }return {};}catch(e){return {};}
}
function rebuildActions(){
  const map=new Map();
  remoteActions.filter(a=>a?.key).forEach(a=>{
    const masterAction=Object.fromEntries(EDIT_FIELDS.map(f=>[f,a[f]??'']));
    map.set(a.key,{...a,masterAction,partnerAction:a.partnerAction?{...a.partnerAction,editedFields:[...(a.partnerAction.editedFields||[])]}:null});
  });
  Object.entries(actionOverrides).forEach(([k,over])=>{
    if(!k.includes('|||')||!over||typeof over!=='object')return;
    const [outlet,businessNo]=k.split('|||');
    const a=map.get(k)||{key:k,outlet,businessNo,masterAction:{},partnerAction:null};
    const owned={...(a.partnerAction||{}),editedFields:[...(a.partnerAction?.editedFields||[])]};
    Object.entries(over.fields||{}).forEach(([f,value])=>{
      if(!EDIT_FIELDS.includes(f))return;
      owned[f]=String(value??'');
      if(!owned.editedFields.includes(f))owned.editedFields.push(f);
    });
    a.partnerAction=owned;
    map.set(k,a);
  });
  for(const a of map.values()){
    a.masterAction=a.masterAction||Object.fromEntries(EDIT_FIELDS.map(f=>[f,a[f]??'']));
    const own=a.partnerAction||{},written=new Set(own.editedFields||[]);
    EDIT_FIELDS.forEach(f=>{if(written.has(f))a[f]=own[f]??'';});
    a.partnerPending=Object.keys(actionOverrides[a.key]?.fields||{}).some(f=>EDIT_FIELDS.includes(f));
  }
  actionIndex=map;actions=[...map.values()];
  updateSaveButton();
}
function mergeAcknowledgedPartnerField(k,field,value,answer){
  let item=remoteActions.find(a=>a.key===k);
  if(!item){const [outlet,businessNo]=k.split('|||');item={key:k,outlet,businessNo};remoteActions.push(item);}
  const p={...(item.partnerAction||{}),editedFields:[...(item.partnerAction?.editedFields||[])]};
  if(!p.editedFields.includes(field))p.editedFields.push(field);
  p[field]=value;
  p.modifiedBy=answer.modifiedBy||'업체:'+partner;
  p.updatedAt=answer.updatedAt||new Date().toISOString();
  item.partnerAction=p;
  const pending=actionOverrides[k];
  if(pending&&Object.prototype.hasOwnProperty.call(pending.fields||{},field)&&pending.fields[field]===value){
    delete pending.fields[field];
    if(!Object.keys(pending.fields).length)delete actionOverrides[k];
    localStorage.setItem(overrideKey(),JSON.stringify(actionOverrides));
  }
  rebuildActions();
}
function pendingChanges(){
 const valid=new Set(data.map(r=>key(r))),entries=[];
 for(const [k,a] of Object.entries(actionOverrides)){
  if(!valid.has(k))continue;
  for(const [field,value] of Object.entries(a.fields||{})){
   if(EDIT_FIELDS.includes(field))entries.push({key:k,field,value:String(value??'')});
  }
 }
 return entries;
}
function updateSaveButton(){
 const changes=pendingChanges(),count=changes.length,merchants=new Set(changes.map(x=>x.key)).size,
  btn=$('saveToMasterBtn'),counter=$('pendingActionCount'),quick=$('workSave');
 if(btn){btn.disabled=!count||savingBatch||!password;btn.textContent=savingBatch?'저장 중...':`저장(마스터에게 전달)${count?' · '+count+'건':''}`;}
 if(counter)counter.textContent=count?`미전송 ${merchants}처 · ${count}개 항목 · 이 브라우저에 보관됨`:'미전송 변경사항 없음';
 if(quick){quick.disabled=!count||savingBatch||!password;quick.textContent=savingBatch?'저장 중…':count?`미전송 ${merchants}처 저장`:'미전송 없음';}
}
async function savePendingActions(){
 if(savingBatch||!partner||!password||!data.length)return;
 const changes=pendingChanges();if(!changes.length){setActionStatus('전송할 변경사항이 없습니다.');updateSaveButton();return;}
 const session=currentSession(),company=partner,secret=password;actionGeneration++;actionFetchBusy=false;savingBatch=true;updateSaveButton();
 let completed=0;
 try{
  for(let i=0;i<changes.length;i+=40){
   const batch=changes.slice(i,i+40);
   const response=await request({type:'partnerSaveActions',partner:company,password:secret,changes:batch});
   if(!sameSession(session))return;
   for(const {item,original} of validatedAcknowledgements(batch,response)){
    mergeAcknowledgedPartnerField(item.key,item.field,original.value,item);completed++;
   }
   setActionStatus(`저장 진행 중: ${completed} / ${changes.length}건`,false,true);
   window.DCMSRM?.update?.();
  }
  setActionStatus(`${completed}건 저장 완료 · Google Sheet로 전달됨`);
 }catch(err){
  if(!sameSession(session)||err.stale)return;
  setActionStatus(`서버 전달 실패 (${completed}/${changes.length}건 성공) · 미전송 내용 보관 · ${err.message}`,true);
  console.warn('[DCM] save batch failed',err);
 }finally{if(sameSession(session)){savingBatch=false;updateSaveButton();renderAction();if(completed)void pullSharedActions(true);}}
}
function retryPendingUploads(){updateSaveButton();}
function savePartnerOverride(k,field,value){
 if(!EDIT_FIELDS.includes(field)||!k.includes('|||'))return;
 const entry=actionOverrides[k]||{fields:{},updatedAt:''};
 entry.fields={...(entry.fields||{}),[field]:String(value??'')};
 entry.updatedAt=new Date().toISOString();
 actionOverrides[k]=entry;localStorage.setItem(overrideKey(),JSON.stringify(actionOverrides));lastEditAt=Date.now();
 rebuildActions();updateSaveButton();
 window.DCMSRM?.update?.();
 setActionStatus('업체 입력이 임시 저장되었습니다 · 저장(마스터에게 전달) 버튼을 눌러주세요',false,true);
}
function months(){return [...new Set(data.map(r=>r.month).filter(Boolean))].sort();}
function scope(m){const o=$('outlet')?.value||'전체';return data.filter(r=>r.month===m&&(o==='전체'||r.outlet===o));}
function prevMonth(cur){const ms=months(),i=ms.indexOf(cur);return i>0?ms[i-1]:null;}
function refreshSelectors(){
 const oldO=$('outlet')?.value||'전체',oldM=$('month')?.value||'',wasSingle=outletCount===1;
 // Retain historical regions so monthly comparisons and stopped supply remain reachable.
 const outs=[...new Set(data.map(r=>r.outlet).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 outletCount=outs.length;
 const choices=outletCount===1?outs:['전체',...outs],select=$('outlet');
 select.innerHTML=choices.map(x=>`<option>${esc(x)}</option>`).join('');
 select.value=outletCount===1?outs[0]:!wasSingle&&choices.includes(oldO)?oldO:'전체';
 select.disabled=outletCount<2;
 if($('outletFilter'))$('outletFilter').hidden=outletCount<2;
 $('partnerFilters')?.classList.toggle('single-outlet',outletCount<2);
 const ms=months();
 $('month').innerHTML=ms.length?ms.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join(''):'<option value="">데이터 없음</option>';
 $('month').value=ms.includes(oldM)?oldM:(ms.at(-1)||'');
}
function streakRows(cur,curr){
  let all=historyCache.get(cur);
  if(!all){
    const ms=months().filter(m=>m<=cur),by=new Map();
    data.forEach(r=>{if(!r.month||r.month>cur)return;const k=key(r);if(!by.has(k))by.set(k,{});by.get(k)[r.month]=r;});
    all=[];
    by.forEach(hist=>{
      const r=hist[cur];if(!r)return;
      const entityStreak={};let streak=0;
      E.forEach(e=>{const n=L.consecutiveX(cur,m=>hist[m]?.statuses?.[e]);entityStreak[e]=n;streak=Math.max(streak,n);});
      all.push({...r,entityStreak,streak});
    });
    historyCache.set(cur,all);
  }
  const currentKeys=new Set(curr.map(key));
  return all.filter(r=>currentKeys.has(key(r)));
}
function risks(cur,curr,prior,ch){const pmap=new Map(prior.map(r=>[key(r),r])),o2x=new Set((ch.oToX||[]).map(x=>`${x.outlet}|||${x.businessNo}|||${x.entity}`));return streakRows(cur,curr).filter(r=>E.some(e=>L.normStatus(r.statuses?.[e])==='X')).map(r=>{let score=0,xCount=0;E.forEach(e=>{if(L.normStatus(r.statuses?.[e])!=='X')return;xCount++;score+=2;const st=r.entityStreak[e]||0;if(st>=2)score+=3*Math.min(st-1,3);if(o2x.has(`${r.outlet}|||${r.businessNo}|||${e}`))score+=4;if(!L.normStatus(pmap.get(key(r))?.statuses?.[e]))score+=2;});return {...r,score,xCount,priority:score>=12?'P1':score>=7?'P2':'P3'};}).sort((a,b)=>b.score-a.score||b.xCount-a.xCount||String(a.businessName).localeCompare(String(b.businessName),'ko'));}
const actionMap=()=>new Map(actions.map(a=>[a.key,a]));
function actionFor(r){
 const k=key(r),saved=actionIndex.get(k)||{};
 const hist=window.DCM_MONTHLY_ACTION_HISTORY?.get($('month')?.value||'',k);
 if(!hist)return saved;
 // Month-based defaults are proposals; true Partner edits take precedence.
 const actual=saved.partnerAction||{},edited=(actual.editedFields||[]).filter(f=>EDIT_FIELDS.includes(f));
 const baseline=hist.partnerAction||{},partnerAction={
  ...baseline,editedFields:[...new Set([...(baseline.editedFields||[]),...edited])],
  manuallyEditedFields:edited,updatedAt:actual.updatedAt||'',modifiedBy:actual.modifiedBy||''
 };
 for(const field of edited)partnerAction[field]=actual[field]??'';
 return {...hist.masterAction,masterAction:{...hist.masterAction},partnerAction,
  partnerSavedFields:edited,partnerPending:!!saved.partnerPending,monthlyHistorical:true};
}
function statusLabel(s){return ({TODO:'미조치',IN_PROGRESS:'진행중',WAITING:'회신대기',DONE:'완료'})[s]||'미조치';}
function renderPersist(cur,curr){const rows=streakRows(cur,curr);let pa=0,ps=0,a3=0,a3s=0;rows.forEach(r=>{let hp=false;E.forEach(e=>{if((r.entityStreak[e]||0)>=2){ps++;hp=true;}});if(hp)pa++;if(E.every(e=>L.normStatus(r.statuses?.[e])==='X')){a3++;a3s+=3;}});$('persistAbs').textContent=`${pa}처`;if($('persistState'))$('persistState').textContent=`${ps}건`;$('all3Abs').textContent=`${a3}처`;if($('all3State'))$('all3State').textContent=`${a3s}건`;}
function comparison(prior,curr,available){
 return available?L.compare(prior,curr):{xToO:[],oToX:[],newSupply:[],stoppedSupply:[]};
}
function selectionLabel(){
 const cur=$('month')?.value;
 if(!cur)return partner?partner+' · 조회 자료 없음':'로그인 후 조회 범위가 표시됩니다';
 const outlet=$('outlet')?.value||'전체';
 const region=outletCount>1||outletCount===1&&outlet!==partner?outlet:'';
 return [monthLabel(cur),partner,region].filter(Boolean).join(' · ');
}
function jumpTo(id){
 const target=$(id);if(!target)return;
 target.scrollIntoView({behavior:'smooth',block:'start'});
 document.querySelectorAll('[data-jump]').forEach(button=>{
  const active=button.dataset.jump===id;
  button.classList.toggle('active',active);button.setAttribute('aria-current',active?'location':'false');
 });
}
function setDashboardAccess(visible){
 for(const id of ['partnerSide','top']){
  const element=$(id);if(!element)continue;
  element.inert=!visible;element.setAttribute('aria-hidden',visible?'false':'true');
 }
}
function render(){
 const cur=$('month')?.value;if(!cur)return renderEmpty();
 const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],s=L.summarize(curr),ps=L.summarize(prior),
  ch=comparison(prior,curr,!!prev),rr=risks(cur,curr,prior,ch),changeCount=items=>prev?items.length.toLocaleString():'—';
 $('scopeLabel').textContent=selectionLabel();if($('workScope'))$('workScope').textContent=selectionLabel();
 $('rate').textContent=pct(s.rate);
 $('rate').closest('.kpi').querySelector('small').textContent=`O ${s.O.toLocaleString()}건 / O+X ${s.evaluated.toLocaleString()}건`;
 $('xCount').textContent=s.X.toLocaleString();$('needCount').textContent=s.needAbsolute.toLocaleString();$('supplyCount').textContent=s.suppliedAbsolute.toLocaleString();
 $('x2o').textContent=changeCount(ch.xToO);$('o2x').textContent=changeCount(ch.oToX);
 if($('targetNeed'))$('targetNeed').textContent=`${s.evaluated?Math.ceil(Math.max(0,TARGET*s.evaluated-s.O)):0}건`;
 renderPersist(cur,curr);
 $('entityCards').innerHTML=E.map(e=>{const x=s.byEntity[e];return `<div class="entity"><h3>${e}</h3><div class="rate">${pct(x.rate)}</div><div class="meter"><i style="width:${x.rate==null?0:x.rate*100}%"></i></div><small>O ${x.O.toLocaleString()} · X ${x.X.toLocaleString()} · 평가 ${(x.O+x.X).toLocaleString()}</small></div>`}).join('');
 $('changeSub').textContent=prev?`${monthLabel(prev)} → ${monthLabel(cur)}`:'이전 월 자료가 없어 변화를 비교할 수 없습니다.';
 $('deltaRate').textContent=prev&&s.rate!=null&&ps.rate!=null?pp(s.rate-ps.rate):'—';$('kpiDeltaRate').textContent=$('deltaRate').textContent;
 $('newSupply').textContent=changeCount(ch.newSupply);$('stopSupply').textContent=changeCount(ch.stoppedSupply);$('changeX2O').textContent=changeCount(ch.xToO);
 actionContext=buildActionContext(cur,curr,prior,ch,rr);renderAction();
}
const ACTION_VIEWS={
  x:'우선 조치 필요처',
  persist:'2개월 이상 지속 X',
  all3:'3개사 모두 X',
  improved:'X→O 개선 거래처',
  worsened:'O→X 악화 거래처',
  history:'월별 조치 이력',
  new:'신규 공급처',
  stopped:'중단 공급처',
  supplied:'전체 거래처'
};
const KPI_VIEWS={rate:'supplied',unlinked:'x',need:'x',persist:'persist',all3:'all3',improved:'improved',worsened:'worsened',supply:'supplied'};
const DETAIL_VIEWS=['persist','all3','improved','worsened','new','stopped'];
function scopedViewLabel(view,month){
 if(view!=='new'&&view!=='stopped')return ACTION_VIEWS[view]||ACTION_VIEWS.supplied;
 const m=/^\d{4}-(0[1-9]|1[0-2])$/.exec(String(month||''));
 return (m?Number(m[1])+'월':'선택월')+' '+ACTION_VIEWS[view];
}
function syncActionViewOptions(){
 const select=$('actionDetail');if(!select?.options)return;
 const expected=new Set(['all',...DETAIL_VIEWS]),seen=new Set();
 for(const option of [...select.options]){
  const detail=option.value;
  if(!expected.has(detail)||seen.has(detail)){option.remove();continue;}
  seen.add(detail);
  option.textContent=detail==='all'?'전체':ACTION_VIEWS[detail];
 }
}
function evaluated(r,entity='all'){
  return (entity==='all'?E:[entity]).some(e=>L.normStatus(r.statuses?.[e])!==null);
}
function hasCurrentX(r,entity='all'){
  return (entity==='all'?E:[entity]).some(e=>L.normStatus(r.statuses?.[e])==='X');
}
function buildActionContext(cur,curr,prior,ch,rr){
  // The monthly archive depends on the data snapshot, not the selected filter.
  if(historyInput!==data){window.DCM_MONTHLY_ACTION_HISTORY?.refresh(data);historyInput=data;}
  const riskByKey=new Map(rr.map(r=>[key(r),r]));
  const streakByKey=new Map(streakRows(cur,curr).map(r=>[key(r),r]));
  const prevByKey=new Map(prior.map(r=>[key(r),r]));
  const improved=new Map(),worsened=new Map();
  const newSupply=new Map(),stoppedSupply=new Map();
  for(const [dest,items] of [[newSupply,ch.newSupply||[]],[stoppedSupply,ch.stoppedSupply||[]]])
    for(const item of items)dest.set(key(item),new Set((item.entities||[]).map(x=>x.entity)));
  for(const [dest,items] of [[improved,ch.xToO||[]],[worsened,ch.oToX||[]]]){
    items.forEach(item=>{
      const k=key(item);if(!dest.has(k))dest.set(k,new Set());
      dest.get(k).add(item.entity);
    });
  }
  const byKey=new Map();
  curr.forEach(r=>{
    const k=key(r),x=riskByKey.get(k),st=streakByKey.get(k);
    const a=x||{...r,score:0,xCount:0,priority:'P3',streak:st?.streak||0,entityStreak:st?.entityStreak||{}};
    byKey.set(k,a);
  });
  for(const entry of window.DCM_MONTHLY_ACTION_HISTORY?.forMonth(cur)||[]){
    if(byKey.has(entry.key))continue;
    const [outlet,businessNo]=entry.key.split('|||');
    if(($('outlet')?.value||'전체')!=='전체'&&$('outlet')?.value!==outlet)continue;
    byKey.set(entry.key,{
      month:cur,outlet,businessNo,businessName:entry.businessName,
      manager:entry.manager||'',statuses:{'대웅제약':null,'대웅바이오':null,'한올바이오':null},
      priority:'P3',score:0,xCount:0,streak:0,entityStreak:{},
      monthlyHistorical:true,historyType:entry.type||'X2O'
    });
  }
  for(const item of ch.stoppedSupply||[]){
    const k=key(item);
    if(byKey.has(k))continue;
    const old=prevByKey.get(k)||{};
    if(($('outlet')?.value||'전체')!=='전체'&&$('outlet')?.value!==item.outlet)continue;
    byKey.set(k,{...old,month:cur,outlet:item.outlet,businessNo:item.businessNo,
      businessName:item.businessName||old.businessName||'',manager:item.manager||old.manager||'',
      statuses:{},priority:'P3',score:0,xCount:0,streak:0,entityStreak:{},stoppedSupply:true});
  }
  return {rows:[...byKey.values()].sort((a,b)=>b.score-a.score||b.xCount-a.xCount||
    String(a.businessName).localeCompare(String(b.businessName),'ko')),
    prevByKey,improved,worsened,newSupply,stoppedSupply,month:cur};
}
function filterActionRows(ctx,view='x',entity='all',search=''){
  if(!ctx)return [];
  const scopeEntities=entity==='all'?E:[entity];
  const q=String(search||'').trim().toLocaleLowerCase('ko');
  return ctx.rows.filter(r=>{
    const k=key(r),statuses=r.statuses||{},prior=ctx.prevByKey.get(k);
    let include=false;
    switch(view){
      case 'x':include=scopeEntities.some(e=>L.normStatus(statuses[e])==='X');break;
      case 'persist':include=scopeEntities.some(e=>L.normStatus(statuses[e])==='X'&&(r.entityStreak?.[e]||0)>=2);break;
      case 'all3':include=E.every(e=>L.normStatus(statuses[e])==='X');break;
      case 'improved':include=scopeEntities.some(e=>ctx.improved.get(k)?.has(e));break;
      case 'worsened':include=scopeEntities.some(e=>ctx.worsened.get(k)?.has(e));break;
      case 'new':include=scopeEntities.some(e=>ctx.newSupply?.get(k)?.has(e));break;
      case 'history':include=!!window.DCM_MONTHLY_ACTION_HISTORY?.get(ctx.month,k)?.entities.some(e=>scopeEntities.includes(e));break;
      case 'stopped':include=scopeEntities.some(e=>ctx.stoppedSupply?.get(k)?.has(e));break;
      case 'supplied':include=scopeEntities.some(e=>L.normStatus(statuses[e]));break;
      default:include=false;
    }
    if(!include)return false;
    if(!q)return true;
    return [r.businessName,r.businessNo,r.outlet,r.manager].some(x=>String(x||'').toLocaleLowerCase('ko').includes(q))||
     (/^[\d\s-]+$/.test(q)&&q.replace(/\D/g,'').length>0&&String(r.businessNo||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')));
  });
}
function setActionView(view,{scroll=true,kpi=null}={}){
  activeKpi=kpi;
  actionView=Object.prototype.hasOwnProperty.call(ACTION_VIEWS,view)?view:'supplied';
  actionDetail=DETAIL_VIEWS.includes(actionView)?actionView:'all';
  actionBase=actionView==='x'?'x':'supplied';
  actionSearch='';actionLimit=30;
  if($('actionView'))$('actionView').value=actionBase;
  if($('actionDetail'))$('actionDetail').value=actionDetail;
  if($('actionSearch'))$('actionSearch').value='';
  renderAction();
  if(scroll)jumpTo('action');
}
function chooseActionBase(value){
 actionBase=value==='x'?'x':'supplied';
 actionDetail='all';actionView=actionBase;
 if($('actionView'))$('actionView').value=actionBase;
 if($('actionDetail'))$('actionDetail').value='all';
 activeKpi=null;actionLimit=30;renderAction();
}
function chooseActionDetail(value){
 actionDetail=DETAIL_VIEWS.includes(value)?value:'all';
 if(actionDetail!=='all')actionBase='supplied';
 actionView=actionDetail==='all'?actionBase:actionDetail;
 if($('actionView'))$('actionView').value=actionBase;
 if($('actionDetail'))$('actionDetail').value=actionDetail;
 activeKpi=null;actionLimit=30;renderAction();
}
function updateKpiSelection(){
  document.querySelectorAll('.kpi[data-kpi]').forEach(card=>{
    const chosen=card.dataset.kpi===activeKpi;
    card.classList.toggle('kpi-selected',chosen);
    card.setAttribute('aria-pressed',chosen?'true':'false');
  });
}
function dualValue(a,field){
  const m=a.masterAction||a,own=a.partnerAction||{};
  const edited=(own.editedFields||[]).includes(field);
  const master=m[field]??(field==='status'?'TODO':'');
  const partnerValue=edited?own[field]??'':'';
  const show=value=>field==='reasonCode'?(value?value+' '+(reasons[value]||''):'—'):
    field==='status'?value?statusLabel(value):'—':value||'—';
  return {master,partnerValue,edited,masterLabel:show(master)};
}
function actionFieldCell(a,k,field,canEdit=true){
  const v=dualValue(a,field),value=esc(v.partnerValue),keyAttr=esc(k),wip=actionOverrides[k]?.fields?.[field]!==undefined;
  const cls='action-field'+(wip?' pending':'');
  let input='';
  if(!canEdit){const raw=field==='reasonCode'?(v.partnerValue?esc(v.partnerValue+' '+(reasons[v.partnerValue]||'')):'미입력'):
    field==='status'?(v.partnerValue?esc(statusLabel(v.partnerValue)):'미입력'):esc(v.partnerValue||'미입력');
    input='<span class="readonly-action" title="'+(a.monthlyHistorical?'기존 조치 내용':'현재 X가 없는 신규 거래처는 조회 전용입니다.')+'">'+raw+'</span>';
  }else if(field==='reasonCode'){
    const opts=Object.entries(reasons).map(([c,label])=>`<option value="${esc(c)}" ${v.partnerValue===c?'selected':''}>${esc(c)} ${esc(label)}</option>`).join('');
    input=`<select class="${cls}" data-field="${field}" data-key="${keyAttr}"><option value="" ${!v.partnerValue?'selected':''}>업체 미입력</option>${opts}</select>`;
  }else if(field==='status'){
    input=`<select class="${cls}" data-field="${field}" data-key="${keyAttr}"><option value="" ${!v.partnerValue?'selected':''}>업체 미입력</option>${['TODO','IN_PROGRESS','WAITING','DONE'].map(code=>`<option value="${code}" ${v.partnerValue===code?'selected':''}>${statusLabel(code)}</option>`).join('')}</select>`;
  }else{
    input=`<input class="${cls} plan" type="text" maxlength="3000" data-field="${field}" data-key="${keyAttr}" value="${value}" placeholder="업체 조치계획 입력">`;
  }
  const label=({reasonCode:'원인',plan:'조치계획',status:'상태'}[field]||field);
  input=input.replace(/<(select|input) /,(_match,tag)=>`<${tag} aria-label="${esc(k.replace('|||',' '))} 업체 ${label}" `);
  return `<td class="dual-action-cell" data-label="${label}"><div class="dual-master"><b>마스터</b><span title="${esc(v.masterLabel)}">${esc(v.masterLabel)}</span></div><div class="dual-partner"><b>업체</b>${input}</div>${wip?'<small class="pending-indicator">서버 전송 대기</small>':''}</td>`;
}
function renderAction(){
  syncActionViewOptions($('month')?.value);
  const rr=filterActionRows(actionContext,actionView,'all',actionSearch);
  const visible=rr.slice(0,actionLimit),body=$('actionBody');
  if(!body)return;
  body.innerHTML=visible.map(r=>{
    const a=actionFor(r),k=key(r),pa=a.partnerAction||{},
      hasPartner=(a.monthlyHistorical?a.partnerSavedFields||[]:pa.editedFields||[]).some(f=>EDIT_FIELDS.includes(f)),
      hasX=hasCurrentX(r),
      canEdit=actionIndex.has(k)||(!a.monthlyHistorical&&hasX),
      display=a.monthlyHistorical?
       (window.DCM_MONTHLY_ACTION_HISTORY?.get($('month')?.value||'',k)?.type==='SUPPLY_STOP'?
        '<small class="monthly-action-marker">공급 중단</small>':''):
       (hasPartner?'<small class="local-action-marker">업체 입력</small>':'');
    const status=e=>{
      const st=L.normStatus(r.statuses?.[e]),label=st||'—';
      return '<td class="status-cell" data-label="'+esc(e)+'"><span class="status-pill status-'+(st||'na').toLowerCase()+'" title="'+esc(e)+' '+(st==='O'?'연동':st==='X'?'미연동':'미평가')+'">'+label+'</span></td>';
    };
    const name='<strong>'+esc(r.businessName)+'</strong><small class="business-number">'+esc(r.businessNo)+'</small><button type="button" class="srm-launch" data-srm-open="'+esc(k)+'">추가 협의</button>'+display;
    const changeSet=actionContext?.improved.get(k)||actionContext?.worsened.get(k);
    const trend=changeSet?.size?'<small class="action-trend">전월 대비 상태 변경</small>':'';
    return '<tr class="'+(hasX?'':'not-x-row')+'">'+
      '<td class="key-col name-col" data-label="거래처">'+name+trend+'</td>'+
      '<td data-label="업체/권역">'+esc(r.outlet)+'</td>'+
      E.map(status).join('')+
      '<td data-label="미연동 기간">'+(hasX?r.streak+'개월':'—')+'</td>'+
      EDIT_FIELDS.map(f=>actionFieldCell(a,k,f,canEdit)).join('')+'</tr>';
  }).join('')||'<tr><td colspan="9" class="empty">'+(
   ['improved','worsened','new','stopped'].includes(actionView)&&!prevMonth($('month')?.value)?
   '이전 월 자료가 없어 변화를 비교할 수 없습니다. 다른 월 또는 목록을 선택해 주세요.':
   actionSearch.trim()?'검색한 거래처가 없습니다. 검색어를 지우거나 목록 필터를 변경해 주세요.':
   '현재 조회 범위에 해당하는 거래처가 없습니다. 목록 필터 또는 업체/권역을 확인해 주세요.'
  )+'</td></tr>';
  const assessed=rr.reduce((sum,r)=>sum+E.filter(e=>L.normStatus(r.statuses?.[e])).length,0),
        xs=rr.reduce((sum,r)=>sum+E.filter(e=>L.normStatus(r.statuses?.[e])==='X').length,0);
  if($('actionFilterCount'))$('actionFilterCount').textContent=
    rr.length.toLocaleString()+'처 · O '+(assessed-xs).toLocaleString()+'건 / X '+xs.toLocaleString()+'건 (법인별 평가)';
  if($('actionViewTitle'))$('actionViewTitle').textContent=scopedViewLabel(actionView,$('month')?.value);
  if($('actionShown'))$('actionShown').textContent=
    Math.min(actionLimit,rr.length).toLocaleString()+' / '+rr.length.toLocaleString()+'처 표시';
  if($('actionMore'))$('actionMore').hidden=rr.length<=actionLimit;
  if($('actionScope'))$('actionScope').textContent=selectionLabel()+(actionSearch.trim()?` · 검색: ${actionSearch.trim()}`:'');
  if($('actionSearchClear'))$('actionSearchClear').hidden=!actionSearch.trim();
  updateKpiSelection();
  scheduleSrmRender();
}
function scheduleSrmRender(){
  // Allow KPI and first 30 Action rows to paint before recalculating SRM tables.
  if(typeof setTimeout!=='function'){window.DCMSRM?.update?.();return;}
  clearTimeout(srmRenderTimer);
  srmRenderTimer=setTimeout(()=>{srmRenderTimer=null;window.DCMSRM?.update?.();},80);
}
function notifySrmAfterPaint(){
  if(srmAnnounced||!partnerVerified)return;
  srmAnnounced=true;
  if(typeof setTimeout!=='function'){window.dispatchEvent(new CustomEvent('dcm-partner-authenticated'));return;}
  const session=currentSession();
  srmNotifyTimer=setTimeout(()=>{
    srmNotifyTimer=null;
    if(sameSession(session)&&partnerVerified)window.dispatchEvent(new CustomEvent('dcm-partner-authenticated'));
  },120);
}
function applyShared(json){
  validateActions(json);
  if(json.reasons&&typeof json.reasons==='object'&&!Array.isArray(json.reasons)){
    Object.keys(reasons).forEach(code=>{if(code==='05')reasons[code]='도매몰 미연동';}); // canonical seven categories only
  }
  if(Array.isArray(json.actions))remoteActions=json.actions.map(a=>{
    const c={...a};if(c.reasonCode==='08')c.reasonCode='05';
    if(c.partnerAction?.reasonCode==='08')c.partnerAction={...c.partnerAction,reasonCode:'05'};
    return c;
  });
  actionOverrides=loadOverrides();rebuildActions();
}
function setActionStatus(msg,bad=false,pending=false){
  const el=$('actionSyncStatus');if(el){el.textContent=msg;el.className=bad?'sync-error':pending?'sync-pending':'sync-ok';}
}
async function pullSharedActions(force=false){
  if(savingBatch||actionFetchBusy||!partner||!password||(!force&&(offlineServer||Date.now()-lastEditAt<10000||document.visibilityState==='hidden'||document.activeElement?.closest?.('#actionBody'))))return;
  const session=currentSession(),ticket=++actionGeneration;actionFetchBusy=true;
  try{
    const json=await request({type:'partnerActions',partner,password});
    if(!sameSession(session)||ticket!==actionGeneration)return;
    validateActions(json);offlineServer=false;lastActionFullPullAt=Date.now();
    const old=JSON.stringify(remoteActions);applyShared(json);
    if(Object.prototype.hasOwnProperty.call(json,'revision')){lastActionRevision=json.revision;revisionSupported=true;}
    cacheCurrentActions(json);
    if(JSON.stringify(remoteActions)!==old)renderAction();
    setActionStatus('마스터·업체 조치 확인 '+stamp(lastActionFullPullAt)+' · 미전송 '+pendingChanges().length+'건');updateSaveButton();
  }catch(e){if(!sameSession(session)||ticket!==actionGeneration||e.stale)return;if(e.status===404)offlineServer=true;setActionStatus('조치 확인 실패 · 이전 조회·미전송 내용 유지 · '+e.message,true);}
  finally{if(sameSession(session)&&ticket===actionGeneration)actionFetchBusy=false;}
}
async function checkActionRevision(){
  if(navigator.onLine===false||Date.now()<revisionRetryAt||savingBatch||actionCheckBusy||!partnerVerified||!partner||!password||document.visibilityState==='hidden'||Date.now()-lastEditAt<10000||document.activeElement?.closest?.('#actionBody'))return;
  const session=currentSession();actionCheckBusy=true;
  try{
    const json=await request({type:'partnerActionRevision',partner,password});
    if(!sameSession(session))return;
    revisionFailures=0;revisionRetryAt=0;
    if(!revisionSupported||json.revision!==lastActionRevision)await pullSharedActions(false);
    if(!sameSession(session))return;
    if(json.dashboardRevision&&json.dashboardRevision!==lastDashboardRevision&&!loadingData){void pull();}
  }catch(e){if(!sameSession(session)||e.stale)return;if(e.status===404)offlineServer=true;revisionRetryAt=Date.now()+Math.min(300000,30000*2**Math.min(revisionFailures++,4));console.warn('[DCM] Action revision check failed',e);
    // Older GAS deployments may lack the lightweight revision endpoint.
    if(e.status!==401&&e.status!==403&&Date.now()-lastActionFullPullAt>60000)void pullSharedActions(true);
  }
  finally{if(sameSession(session))actionCheckBusy=false;}
}
function startActionPolling(){
  clearInterval(actionPoll);clearInterval(dataPoll);
  actionPoll=setInterval(()=>checkActionRevision(),12000);
  dataPoll=setInterval(()=>{if(navigator.onLine!==false&&document.visibilityState==='visible'&&Date.now()-lastEditAt>10000&&!document.activeElement?.closest?.('#actionBody'))pull();},180000);
}
function renderEmpty(){if($('scopeLabel'))$('scopeLabel').textContent=selectionLabel();if($('workScope'))$('workScope').textContent=selectionLabel();if($('actionScope'))$('actionScope').textContent='조회 자료 없음';if($('actionSearchClear'))$('actionSearchClear').hidden=true;if($('actionShown'))$('actionShown').textContent='0 / 0처 표시';if($('actionMore'))$('actionMore').hidden=true;['rate','kpiDeltaRate','xCount','needCount','supplyCount','x2o','o2x','targetNeed','deltaRate','newSupply','stopSupply','changeX2O'].forEach(id=>{if($(id))$(id).textContent='-';});['persistAbs','persistState','all3Abs','all3State'].forEach(id=>{if($(id))$(id).textContent='-';});actionContext=null;$('actionBody').innerHTML='<tr><td colspan="9" class="empty">표시할 데이터가 없습니다.</td></tr>';if($('actionFilterCount'))$('actionFilterCount').textContent='0처';$('entityCards').innerHTML=E.map(e=>`<div class="entity"><h3>${e}</h3><div class="rate">-</div></div>`).join('');}
async function request(payload){
 const generation=sessionGeneration,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),['partnerLogin','partnerActionRevision'].includes(payload.type)?9000:18000);
 ownedRequests.add(controller);
 try{
  const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal});
  if(generation!==sessionGeneration)throw staleRequest();
  if(!response.ok){
    const error=new Error(response.status===404?'HTTP 404 · Google Apps Script 웹앱 주소/배포가 유효하지 않습니다':`HTTP ${response.status}`);
    error.status=response.status;throw error;
  }
  const text=await response.text();
  if(generation!==sessionGeneration)throw staleRequest();
  let json;try{json=JSON.parse(text)}catch(_){throw new Error('서버에서 JSON이 아닌 응답을 보냈습니다. Apps Script 배포를 확인해 주세요.');}
  if(!json||json.ok!==true)throw new Error(json?.error||'조회 실패');
  return json;
 }catch(err){
  if(generation!==sessionGeneration)throw staleRequest();
  if(err.name==='AbortError')throw new Error('서버 응답 지연 · '+(['partnerLogin','partnerActionRevision'].includes(payload.type)?'인증/상태 확인 9초':'데이터 조회 18초')+' 제한시간 초과');
  throw err;
 }finally{clearTimeout(timer);ownedRequests.delete(controller);}
}
function snapshotKey(){return 'dcm-partner-last-data-v2::'+partner;}
function actionSnapshotKey(){return 'dcm-partner-last-actions-v1::'+partner;}
function loadCachedActions(){
 try{
  const stored=JSON.parse(sessionStorage.getItem(actionSnapshotKey())||'null');
  if(!stored||!Number.isFinite(stored.savedAt)||stored.savedAt>Date.now()||Date.now()-stored.savedAt>3600000)return false;
  validateActions(stored);
  applyShared({actions:stored.actions});
  if(Object.prototype.hasOwnProperty.call(stored,'revision')){
    lastActionRevision=stored.revision;revisionSupported=true;
  }
  if(actionContext)renderAction();
  setActionStatus('최근 조회 조치 · '+stamp(stored.savedAt)+' 기준 · 최신 확인 중',false,true);
  return true;
 }catch(_){return false;}
}
function cacheCurrentActions(json){
 try{
  const stored=JSON.stringify({actions:remoteActions,savedAt:Date.now(),revision:json.revision||''});
  if(stored.length<1800000)sessionStorage.setItem(actionSnapshotKey(),stored);
 }catch(_){/* Browser storage may be disabled or full; server remains the authority. */}
}
function loadCachedData(){
 try{
  const cached=JSON.parse(sessionStorage.getItem(snapshotKey())||'null');
  if(!cached||!Number.isFinite(cached.savedAt)||cached.savedAt>Date.now()||Date.now()-cached.savedAt>3600000)return false;
  validateDashboard(cached);
  data=cached.data;lastDashboardRevision=cached.dashboardRevision||'';historyCache.clear();historyInput=null;refreshSelectors();render();
  dashboardReceivedAt=cached.savedAt;dashboardUpdatedAt=cached.updatedAt||'';
  setDashboardStatus('최근 조회 현황 · '+stamp(cached.savedAt)+' 기준 · 최신 확인 중','cached');
  return true;
 }catch(_){return false;}
}
function applyDashboard(json,confirmed=true){
 validateDashboard(json);const incoming=json.data;
 incoming.forEach(r=>{if(r.outlet==='백제약품 대전')r.manager='정직한';});
 const wasReady=!!data.length,changed=JSON.stringify(data)!==JSON.stringify(incoming);
 if(changed||!wasReady){data=incoming;historyCache.clear();historyInput=null;refreshSelectors();render();}
 lastDashboardRevision=String(json.dashboardRevision||'');
 dashboardUpdatedAt=json.updatedAt||'';dashboardReceivedAt=Date.now();
 try{
  const text=JSON.stringify({data,savedAt:Date.now(),dashboardRevision:lastDashboardRevision,updatedAt:dashboardUpdatedAt});
  if(text.length<1400000)sessionStorage.setItem(snapshotKey(),text);
 }catch(_){}
 if(confirmed)confirmDashboard();else setDashboardStatus('마스터 보관 현황 · '+data.length.toLocaleString()+'건 · 최신 확인 중','cached');
 updateSaveButton();
}
async function pull(){
 if(!partner||!password||loadingData)return;
 const session=currentSession();loadingData=true;setDashboardStatus(data.length?'최근 조회 현황 표시 중 · 최신 확인 중…':'마스터 현황 불러오는 중…');
 try{
  const json=await request({type:'partnerDashboard',partner,password});
  if(!sameSession(session))return;
  applyDashboard(json);offlineServer=false;partnerVerified=true;startActionPolling();
  notifySrmAfterPaint();
  // Action/SRM endpoints are secondary: do not race the first KPI render.
  setTimeout(()=>{if(sameSession(session)&&password)void pullSharedActions(true);},160);
 }catch(err){
  if(!sameSession(session)||err.stale)return;
  if(err.status===404)offlineServer=true;
  setDashboardStatus('최신 현황 확인 실패 · '+(data.length?'최근 조회 '+stamp(dashboardReceivedAt)+' 기준 유지 · ':'')+err.message,'error');
 }finally{if(sameSession(session))loadingData=false;}
}
async function login(){
 if(loginInProgress)return;
 const company=$('loginPartner').value||'',secret=$('loginPassword').value||'';
 $('loginError').textContent='';
 if(!company||!secret){$('loginError').textContent='업체명과 접속코드를 입력해 주세요.';return;}
 retireRequests();const generation=sessionGeneration;
 loginInProgress=true;$('loginBtn').disabled=true;$('loginBtn').textContent='인증 중...';
 try{
  // A warm server snapshot can return KPIs and Action values in the LOGIN response.
  // If the cache is cold the same endpoint authenticates immediately without scanning sheets.
  const json=await request({type:'partnerLogin',partner:company,password:secret,preferCachedDashboard:true});
  if(generation!==sessionGeneration)return;
  partner=json.partner||company;password=secret;offlineServer=false;partnerVerified=true;
  sessionStorage.setItem(SESSION_PARTNER,partner);sessionStorage.setItem(SESSION_PASSWORD,password);
  $('partnerName').textContent=partner;$('partnerLogin').classList.add('hidden-login');setDashboardAccess(true);
  let warmAction=false,cached=false;
  if(json.actionSnapshot)try{
    applyShared(json.actionSnapshot);lastActionRevision=json.actionSnapshot.revision||'';
    revisionSupported=true;lastActionFullPullAt=Date.now();cacheCurrentActions(json.actionSnapshot);warmAction=true;
  }catch(e){setActionStatus(e.message,true);}
  if(!warmAction)loadCachedActions();
  if(json.dashboardSnapshot)try{applyDashboard(json.dashboardSnapshot,false);cached=true;}catch(e){setDashboardStatus(e.message,'error');}
  if(!cached)cached=loadCachedData();
  updateSaveButton();
  if(warmAction)setActionStatus('마스터·업체 조치 확인 '+stamp(lastActionFullPullAt)+' · 미전송 '+pendingChanges().length+'건');
  const unchanged=!!(cached&&json.dashboardRevision&&json.dashboardRevision===lastDashboardRevision);
  if(cached)notifySrmAfterPaint();
  if(unchanged){
    confirmDashboard();
    startActionPolling();
    if(!warmAction){
      const session=currentSession();
      setTimeout(()=>{if(sameSession(session)&&password)void pullSharedActions(true);},160);
    }
  }else{void pull();}
 }catch(err){if(generation===sessionGeneration&&!err.stale)$('loginError').textContent=err.message||'로그인에 실패했습니다.';}
 finally{if(generation===sessionGeneration){loginInProgress=false;$('loginBtn').disabled=false;$('loginBtn').textContent='접속하기';}}
}
function logout(clear=true){setDashboardAccess(false);retireRequests();clearInterval(actionPoll);clearInterval(dataPoll);clearTimeout(srmNotifyTimer);clearTimeout(srmRenderTimer);srmAnnounced=false;historyInput=null;lastDashboardRevision='';partner='';password='';partnerVerified=false;lastActionRevision=null;revisionSupported=false;actionFetchBusy=false;actionCheckBusy=false;loadingData=false;savingBatch=false;loginInProgress=false;lastActionFullPullAt=0;dashboardReceivedAt=0;dashboardUpdatedAt='';setDashboardStatus('접속 후 마스터 현황을 확인합니다.','empty');setActionStatus('접속 후 조치 내용을 확인합니다.',false,true);$('loginBtn').disabled=false;$('loginBtn').textContent='접속하기';$('loginError').textContent='';
 window.dispatchEvent(new CustomEvent('dcm-partner-logged-out'));data=[];actions=[];remoteActions=[];actionIndex.clear();actionOverrides={};historyCache.clear();actionContext=null;actionView='supplied';actionBase='supplied';actionDetail='all';actionSearch='';activeKpi=null;actionLimit=30;offlineServer=false;updateSaveButton();if($('actionView'))$('actionView').value='supplied';if($('actionDetail'))$('actionDetail').value='all';if($('actionSearch'))$('actionSearch').value='';if(clear){sessionStorage.removeItem(SESSION_PARTNER);sessionStorage.removeItem(SESSION_PASSWORD);}$('partnerName').textContent='-';$('partnerLogin').classList.remove('hidden-login');$('loginPassword').value='';refreshSelectors();renderEmpty();}
async function exportActions(){const cur=$('month')?.value;if(!cur)return;try{await ensureXLSX();}catch(e){alert(e.message||e);return;}const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],ch=comparison(prior,curr,!!prev),ctx=actionContext?.month===cur?actionContext:buildActionContext(cur,curr,prior,ch,risks(cur,curr,prior,ch)),rr=filterActionRows(ctx,actionView,'all',actionSearch);const rows=rr.map(r=>{const a=actionFor(r),c=a.reasonCode||'',m=a.masterAction||a,p=a.partnerAction||{},owned=new Set(p.editedFields||[]),pv=f=>owned.has(f)?String(p[f]??''):'';return {'파트너사':partner,'기준월':cur,'업체/권역':r.outlet,'실사업자번호':r.businessNo,'실사업자명':r.businessName,'미연동 기간':hasCurrentX(r)?`${r.streak}개월`:'—','대웅제약':L.normStatus(r.statuses?.['대웅제약'])||'','대웅바이오':L.normStatus(r.statuses?.['대웅바이오'])||'','한올바이오':L.normStatus(r.statuses?.['한올바이오'])||'','원인코드':c,'원인':reasons[c]||'','조치계획':a.plan||'','상태':statusLabel(a.status||'TODO'),'마스터 원인코드':m.reasonCode||'','업체 원인코드':pv('reasonCode'),'마스터 조치계획':m.plan||'','업체 조치계획':pv('plan'),'마스터 상태':statusLabel(m.status||'TODO'),'업체 상태':pv('status')?statusLabel(pv('status')):'','업체 수정일시':p.updatedAt||''};});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Action Board');XLSX.writeFile(wb,`DCM_ActionBoard_${partner}_${cur}_${actionView}.xlsx`);}
function start(){
  const resetContext=()=>{actionLimit=30;render();};
  $('outlet').addEventListener('change',resetContext);
  $('month').addEventListener('change',resetContext);
  $('actionView').addEventListener('change',ev=>chooseActionBase(ev.target.value));
  $('actionDetail').addEventListener('change',ev=>chooseActionDetail(ev.target.value));
  $('actionSearch').addEventListener('input',ev=>{actionSearch=ev.target.value;activeKpi=null;actionLimit=30;renderAction();});
  $('actionSearchClear')?.addEventListener('click',()=>{
    actionSearch='';$('actionSearch').value='';actionLimit=30;renderAction();$('actionSearch').focus();
  });
  $('actionFilterReset').addEventListener('click',()=>setActionView('supplied',{scroll:false}));
  $('actionMore').addEventListener('click',()=>{actionLimit+=50;renderAction();});
  $('actionBody').addEventListener('change',event=>{
    const el=event.target.closest('[data-field]');
    if(!el)return;
    savePartnerOverride(el.dataset.key,el.dataset.field,el.value);
    el.classList.add('pending');
  });
  document.querySelectorAll('.kpi[data-kpi]').forEach(card=>{
    const delta=card.dataset.kpi==='delta';
    card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-controls',delta?'changes':'action');
    card.setAttribute('title',delta?'전월 대비 변화로 이동':'클릭하면 '+ACTION_VIEWS[KPI_VIEWS[card.dataset.kpi]]+' 목록으로 이동');
    const activate=()=>{if(delta){activeKpi='delta';updateKpiSelection();jumpTo('changes');}else setActionView(KPI_VIEWS[card.dataset.kpi],{kpi:card.dataset.kpi});};
    card.addEventListener('click',activate);
    card.addEventListener('keydown',ev=>{
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();activate();}
    });
  });
  document.querySelectorAll('[data-action-view]').forEach(button=>button.addEventListener('click',()=>setActionView(button.dataset.actionView)));
  $('refreshBtn').onclick=()=>{offlineServer=false;void pull();};
  $('saveToMasterBtn')?.addEventListener('click',savePendingActions);
  $('workSave')?.addEventListener('click',savePendingActions);
  $('exportAction').onclick=exportActions;
  $('exportAction2').onclick=exportActions;
  $('resetActionBtn').onclick=()=>{
    if(!partner)return;
    if(confirm(`${partner}의 아직 서버로 전송하지 못한 로컬 입력을 삭제할까요? (서버에 저장된 업체 입력은 유지됩니다.)`)){
      localStorage.setItem(overrideKey(),'{}');localStorage.removeItem(actionKey());
      actionOverrides={};rebuildActions();render();
      setActionStatus('미전송 로컬 내용 삭제 · 서버 저장 내용 유지');
    }
  };
  $('logoutBtn').onclick=()=>logout(true);
  $('loginBtn').onclick=login;
  $('loginPassword').addEventListener('keydown',ev=>{if(ev.key==='Enter')login();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkActionRevision();});
  window.addEventListener('online',()=>{revisionRetryAt=0;void checkActionRevision();});
  window.addEventListener('storage',ev=>{
    if(partner&&ev.key===overrideKey()){actionOverrides=loadOverrides();rebuildActions();renderAction();}
  });
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>jumpTo(b.dataset.jump));
  const sp=sessionStorage.getItem(SESSION_PARTNER)||'',sw=sessionStorage.getItem(SESSION_PASSWORD)||'';
  if(sp&&sw){
    partner=sp;password=sw;$('partnerName').textContent=partner;
    $('partnerLogin').classList.add('hidden-login');setDashboardAccess(true);loadCachedData();loadCachedActions();void pull();
  }
}
function srmVisibleStates(){
 const month=$('month')?.value||'';
 if(!actionContext||actionContext.month!==month)return null;
 // The status displayed in the Partner Action Board is the only source
 // of truth for SRM "displayed status" KPIs. This includes month-projected
 // defaults with actual Partner editedFields overriding them.
 return actionContext.rows.map(r=>{
  const a=actionFor(r),m=a.masterAction||a,p=a.partnerAction||{};
  return {key:key(r),masterStatus:m.status||'',partnerStatus:
   (p.editedFields||[]).includes('status')?p.status||'':'',
   monthlyHistorical:!!a.monthlyHistorical};
 });
}

window.DCMPartnerSRM={rows:()=>data,actionRows:()=>actions,viewRows:srmVisibleStates,name:()=>partner,scopeLabel:selectionLabel,isAuthenticated:()=>partnerVerified&&!!partner&&!!password,request:x=>{if(!partner||!password)throw Error('파트너 로그인 후 이용해 주세요.');return request({...x,partner,password});}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
