(()=>{
'use strict';
const ENDPOINT='https://script.google.com/macros/s/AKfycbygUlCo1x2izUO59cdbbBL3pbGLZgMaGrZz2lrqDfB8m4VtUHC-VqnEJMOeiQOUPXWCuQ/exec';
const L=window.DCMLogic,E=L?.E||['대웅제약','대웅바이오','한올바이오'],TARGET=.95,$=id=>document.getElementById(id),XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let xlsxPromise=null;function ensureXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(xlsxPromise)return xlsxPromise;xlsxPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=XLSX_URL;s.async=true;s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxPromise=null;reject(new Error('Excel 모듈 로딩 실패 · 네트워크/방화벽을 확인해 주세요.'));};document.head.appendChild(s);});return xlsxPromise;}
const reasons={'01':'ERP/시스템 미구축','02':'도입 품목 미연동','03':'전산/데이터 오류','04':'거래처 연동 거부/미협조','05':'도매몰 미연동','06':'신규 거래처 연동 예정','07':'당월 매출 미발생'};
const SESSION_PARTNER='dcm-partner-login-company',SESSION_PASSWORD='dcm-partner-login-password';
let partner='',password='',data=[],actions=[],remoteActions=[],actionIndex=new Map(),actionOverrides={},actionPoll=null,dataPoll=null,lastEditAt=0,actionLimit=30,riskLimit=60,historyCache=new Map(),saveQueue=Promise.resolve(),inFlight=new Set(),savingBatch=false,loadingData=false,loginInProgress=false,offlineServer=false,actionView='x',actionEntity='all',actionSearch='',actionContext=null,activeKpi=null;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`,pp=v=>v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${(v*100).toFixed(1)}%p`,key=r=>`${r.outlet}|||${r.businessNo}`;
const monthLabel=m=>{if(!m)return '—';const [y,mm]=m.split('-');return `${y}년 ${Number(mm)}월`;};
const EDIT_FIELDS=['reasonCode','plan','dueDate','status'];
const VISIBLE_ACTION_FIELDS=['reasonCode','plan','status']; // Due dates remain stored, not shown in the Action Board.
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
    a.partnerPending=!!Object.keys(actionOverrides[a.key]?.fields||{}).length;
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
 const count=pendingChanges().length,btn=$('saveToMasterBtn'),counter=$('pendingActionCount');
 if(btn){btn.disabled=!count||savingBatch||!password;btn.textContent=savingBatch?'저장 중...':`저장(마스터에게 전달)${count?' · '+count+'건':''}`;}
 if(counter)counter.textContent=count?`미전송 ${count}건 · 입력은 이 브라우저에 보관됨`:'미전송 변경사항 없음';
}
async function savePendingActions(){
 if(savingBatch||!partner||!password||!data.length)return;
 const changes=pendingChanges();if(!changes.length){setActionStatus('전송할 변경사항이 없습니다.');updateSaveButton();return;}
 const company=partner,secret=password;savingBatch=true;updateSaveButton();
 let completed=0;
 try{
  for(let i=0;i<changes.length;i+=40){
   const batch=changes.slice(i,i+40);
   const response=await request({type:'partnerSaveActions',partner:company,password:secret,changes:batch});
   if(!Array.isArray(response.results)||response.results.length!==batch.length)throw new Error('서버 저장 확인 건수가 일치하지 않습니다.');
   for(const item of response.results){
    const original=batch.find(b=>b.key===item.key&&b.field===item.field&&b.value===String(item.value??''));
    if(!original)throw new Error('서버가 예상치 못한 변경 결과를 반환했습니다.');
    mergeAcknowledgedPartnerField(item.key,item.field,original.value,item);completed++;
   }
   setActionStatus(`저장 진행 중: ${completed} / ${changes.length}건`);
  }
  setActionStatus(`${completed}건 저장 완료 · Google Sheet로 전달됨`);
  void pullSharedActions(true);
 }catch(err){
  setActionStatus(`서버 전달 실패 (${completed}/${changes.length}건 성공) · 미전송 내용 보관 · ${err.message}`,true);
  console.warn('[DCM] save batch failed',err);
 }finally{savingBatch=false;updateSaveButton();if(partner===company)renderAction();}
}
function retryPendingUploads(){updateSaveButton();}
function savePartnerOverride(k,field,value){
 if(!EDIT_FIELDS.includes(field)||!k.includes('|||'))return;
 const entry=actionOverrides[k]||{fields:{},updatedAt:''};
 entry.fields={...(entry.fields||{}),[field]:String(value??'')};
 entry.updatedAt=new Date().toISOString();
 actionOverrides[k]=entry;localStorage.setItem(overrideKey(),JSON.stringify(actionOverrides));lastEditAt=Date.now();
 rebuildActions();updateSaveButton();
 setActionStatus('업체 입력이 임시 저장되었습니다 · 저장(마스터에게 전달) 버튼을 눌러주세요');
}
function months(){return [...new Set(data.map(r=>r.month).filter(Boolean))].sort();}
function scope(m){const o=$('outlet')?.value||'전체';return data.filter(r=>r.month===m&&(o==='전체'||r.outlet===o));}
function prevMonth(cur){const ms=months(),i=ms.indexOf(cur);return i>0?ms[i-1]:null;}
function refreshSelectors(){const oldO=$('outlet')?.value||'전체',oldM=$('month')?.value||'';const outs=[...new Set(data.map(r=>r.outlet).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));$('outlet').innerHTML=['전체',...outs].map(x=>`<option>${esc(x)}</option>`).join('');$('outlet').value=['전체',...outs].includes(oldO)?oldO:'전체';const ms=months();$('month').innerHTML=ms.length?ms.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join(''):'<option value="">데이터 없음</option>';$('month').value=ms.includes(oldM)?oldM:(ms.at(-1)||'');}
function streakRows(cur,curr){
  let all=historyCache.get(cur);
  if(!all){
    const ms=months().filter(m=>m<=cur),by=new Map();
    data.forEach(r=>{if(!r.month||r.month>cur)return;const k=key(r);if(!by.has(k))by.set(k,{});by.get(k)[r.month]=r;});
    all=[];
    by.forEach(hist=>{
      const r=hist[cur];if(!r)return;
      const entityStreak={};let streak=0;
      E.forEach(e=>{let n=0;for(let i=ms.length-1;i>=0;i--){if(L.normStatus(hist[ms[i]]?.statuses?.[e])==='X')n++;else break;}entityStreak[e]=n;streak=Math.max(streak,n);});
      all.push({...r,entityStreak,streak});
    });
    historyCache.set(cur,all);
  }
  const currentKeys=new Set(curr.map(key));
  return all.filter(r=>currentKeys.has(key(r)));
}
function risks(cur,curr,prior,ch){const pmap=new Map(prior.map(r=>[key(r),r])),o2x=new Set((ch.oToX||[]).map(x=>`${x.outlet}|||${x.businessNo}|||${x.entity}`));return streakRows(cur,curr).filter(r=>E.some(e=>L.normStatus(r.statuses?.[e])==='X')).map(r=>{let score=0,xCount=0;E.forEach(e=>{if(L.normStatus(r.statuses?.[e])!=='X')return;xCount++;score+=2;const st=r.entityStreak[e]||0;if(st>=2)score+=3*Math.min(st-1,3);if(o2x.has(`${r.outlet}|||${r.businessNo}|||${e}`))score+=4;if(!L.normStatus(pmap.get(key(r))?.statuses?.[e]))score+=2;});return {...r,score,xCount,priority:score>=12?'P1':score>=7?'P2':'P3'};}).sort((a,b)=>b.score-a.score||b.xCount-a.xCount||String(a.businessName).localeCompare(String(b.businessName),'ko'));}
const actionMap=()=>new Map(actions.map(a=>[a.key,a]));
function actionFor(r){const hist=window.DCM_MONTHLY_ACTION_HISTORY?.get($('month')?.value||'',key(r));if(hist)return {...hist.masterAction,masterAction:{...hist.masterAction},partnerAction:{...hist.partnerAction},monthlyHistorical:true};return actionIndex.get(key(r))||{};}
function statusLabel(s){return ({TODO:'미조치',IN_PROGRESS:'진행중',WAITING:'회신대기',DONE:'완료'})[s]||'미조치';}
function renderPersist(cur,curr){const rows=streakRows(cur,curr);let pa=0,ps=0,a3=0,a3s=0;rows.forEach(r=>{let hp=false;E.forEach(e=>{if((r.entityStreak[e]||0)>=2){ps++;hp=true;}});if(hp)pa++;if(E.every(e=>L.normStatus(r.statuses?.[e])==='X')){a3++;a3s+=3;}});$('persistAbs').textContent=`${pa}처`;if($('persistState'))$('persistState').textContent=`${ps}건`;$('all3Abs').textContent=`${a3}처`;if($('all3State'))$('all3State').textContent=`${a3s}건`;}
function render(){const cur=$('month')?.value;if(!cur)return renderEmpty();const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],s=L.summarize(curr),ps=L.summarize(prior),ch=L.compare(prior,curr),rr=risks(cur,curr,prior,ch);$('scopeLabel').textContent=`${partner} · ${$('outlet').value} · ${monthLabel(cur)}`;$('rate').textContent=pct(s.rate);$('rate').closest('.kpi').querySelector('small').textContent=`O ${s.O.toLocaleString()}건 / O+X ${s.evaluated.toLocaleString()}건`;$('xCount').textContent=s.X.toLocaleString();$('needCount').textContent=s.needAbsolute.toLocaleString();$('supplyCount').textContent=s.suppliedAbsolute.toLocaleString();$('x2o').textContent=(ch.xToO||[]).length.toLocaleString();$('o2x').textContent=(ch.oToX||[]).length.toLocaleString();if($('targetNeed'))$('targetNeed').textContent=`${s.evaluated?Math.ceil(Math.max(0,TARGET*s.evaluated-s.O)):0}건`;renderPersist(cur,curr);$('entityCards').innerHTML=E.map(e=>{const x=s.byEntity[e];return `<div class="entity"><h3>${e}</h3><div class="rate">${pct(x.rate)}</div><div class="meter"><i style="width:${x.rate==null?0:x.rate*100}%"></i></div><small>O ${x.O.toLocaleString()} · X ${x.X.toLocaleString()} · 평가 ${(x.O+x.X).toLocaleString()}</small></div>`}).join('');$('changeSub').textContent=prev?`${monthLabel(prev)} → ${monthLabel(cur)}`:'비교할 이전 월이 없습니다.';$('deltaRate').textContent=prev&&s.rate!=null&&ps.rate!=null?pp(s.rate-ps.rate):'—';$('kpiDeltaRate').textContent=$('deltaRate').textContent;$('newSupply').textContent=(ch.newSupply||[]).length.toLocaleString();$('stopSupply').textContent=(ch.stoppedSupply||[]).length.toLocaleString();$('changeX2O').textContent=(ch.xToO||[]).length.toLocaleString();actionContext=buildActionContext(cur,curr,prior,ch,rr);renderAction();}
const ACTION_VIEWS={
  x:'우선 조치 필요처',
  persist:'2개월 이상 지속 X',
  all3:'3개사 모두 X',
  improved:'X→O 개선 거래처',
  worsened:'O→X 악화 거래처',
  history:'월별 조치 이력',
  new:'선택월 신규 도도매',
  stopped:'선택월 중단 도도매',
  supplied:'도도매 공급처 (O 또는 X)'
};
const KPI_VIEWS={rate:'supplied',unlinked:'x',need:'x',persist:'persist',all3:'all3',improved:'improved',worsened:'worsened',supply:'supplied'};
const VIEW_ORDER=['x','persist','all3','improved','worsened','history','supplied','new','stopped'];
function scopedViewLabel(view,month){
 if(view!=='new'&&view!=='stopped')return ACTION_VIEWS[view]||ACTION_VIEWS.x;
 const m=/^\d{4}-(0[1-9]|1[0-2])$/.exec(String(month||''));
 return (m?Number(m[1])+'월':'선택월')+' '+(view==='new'?'신규 도도매':'중단 도도매');
}
function syncActionViewOptions(month){
 const select=$('actionView');if(!select?.options)return;
 const seen=new Set();
 for(const option of [...select.options]){
  const view=option.value;
  if(!Object.prototype.hasOwnProperty.call(ACTION_VIEWS,view)||seen.has(view)){option.remove();continue;}
  seen.add(view);option.textContent=scopedViewLabel(view,month);
 }
 for(const view of VIEW_ORDER)if(!seen.has(view)){
  const option=document.createElement('option');option.value=view;option.textContent=scopedViewLabel(view,month);select.appendChild(option);
 }
 if(!Object.prototype.hasOwnProperty.call(ACTION_VIEWS,select.value))select.value=actionView;
}
function evaluated(r,entity='all'){
  return (entity==='all'?E:[entity]).some(e=>L.normStatus(r.statuses?.[e])!==null);
}
function hasCurrentX(r,entity='all'){
  return (entity==='all'?E:[entity]).some(e=>L.normStatus(r.statuses?.[e])==='X');
}
function buildActionContext(cur,curr,prior,ch,rr){
  window.DCM_MONTHLY_ACTION_HISTORY?.refresh(data);
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
    return [r.businessName,r.businessNo,r.outlet,r.manager].some(x=>String(x||'').toLocaleLowerCase('ko').includes(q));
  });
}
function setActionView(view,{scroll=true,kpi=null}={}){
  activeKpi=kpi;
  actionView=Object.prototype.hasOwnProperty.call(ACTION_VIEWS,view)?view:'x';
  actionEntity='all';actionSearch='';actionLimit=30;
  if($('actionView'))$('actionView').value=actionView;
  if($('actionEntity'))$('actionEntity').value='all';
  if($('actionSearch'))$('actionSearch').value='';
  renderAction();
  if(scroll)document.getElementById('action')?.scrollIntoView({behavior:'smooth',block:'start'});
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
    input='<span class="readonly-action" title="'+(a.monthlyHistorical?'월별 실적 기준 사후 정리 이력: 현재 Action Board 원본과 별도 저장':'현재 X가 없는 신규 거래처는 조회 전용입니다.')+'">'+raw+'</span>';
  }else if(field==='reasonCode'){
    const opts=Object.entries(reasons).map(([c,label])=>`<option value="${esc(c)}" ${v.partnerValue===c?'selected':''}>${esc(c)} ${esc(label)}</option>`).join('');
    input=`<select class="${cls}" data-field="${field}" data-key="${keyAttr}"><option value="" ${!v.partnerValue?'selected':''}>업체 미입력</option>${opts}</select>`;
  }else if(field==='status'){
    input=`<select class="${cls}" data-field="${field}" data-key="${keyAttr}"><option value="" ${!v.partnerValue?'selected':''}>업체 미입력</option>${['TODO','IN_PROGRESS','WAITING','DONE'].map(code=>`<option value="${code}" ${v.partnerValue===code?'selected':''}>${statusLabel(code)}</option>`).join('')}</select>`;
  }else if(field==='dueDate'){
    input=`<input type="date" class="${cls}" data-field="${field}" data-key="${keyAttr}" value="${value}">`;
  }else{
    input=`<input class="${cls} plan" type="text" maxlength="3000" data-field="${field}" data-key="${keyAttr}" value="${value}" placeholder="업체 조치계획 입력">`;
  }
  return `<td class="dual-action-cell" data-label="${({reasonCode:'원인',plan:'조치계획',status:'상태'}[field]||field)}"><div class="dual-master"><b>마스터</b><span title="${esc(v.masterLabel)}">${esc(v.masterLabel)}</span></div><div class="dual-partner"><b>업체</b>${input}</div>${wip?'<small class="pending-indicator">서버 전송 대기</small>':''}</td>`;
}
function renderAction(){
  syncActionViewOptions($('month')?.value);
  const rr=filterActionRows(actionContext,actionView,actionEntity,actionSearch);
  const visible=rr.slice(0,actionLimit),body=$('actionBody');
  if(!body)return;
  body.innerHTML=visible.map(r=>{
    const a=actionFor(r),k=key(r),pa=a.partnerAction||{},
      hasPartner=(pa.editedFields||[]).length>0,hasX=hasCurrentX(r),
      canEdit=!a.monthlyHistorical&&(hasX||actionIndex.has(k)),
      display=a.monthlyHistorical?'<small class="monthly-action-marker" title="월별 DCM 자료 기준 사후 분류(공급 중단 또는 과거 협의 수행 증빙은 별도 확인 필요)">'+(window.DCM_MONTHLY_ACTION_HISTORY?.get($('month')?.value||'',k)?.type==='SUPPLY_STOP'?'공급 중단(사후 관리 분류)':'월별 X→O 조치 이력')+'</small>':hasPartner?'<small class="local-action-marker">업체 입력 있음</small>':'';
    const status=e=>{
      const st=L.normStatus(r.statuses?.[e]),label=st||'—';
      return '<td class="status-cell" data-label="'+esc(e)+'"><span class="status-pill status-'+(st||'na').toLowerCase()+'" title="'+esc(e)+' '+(st==='O'?'연동':st==='X'?'미연동':'미평가')+'">'+label+'</span></td>';
    };
    const name='<strong>'+esc(r.businessName)+'</strong><small class="business-number">'+esc(r.businessNo)+'</small><button type="button" class="srm-launch" data-srm-open="'+esc(k)+'">SRM 협의</button>'+display;
    const changeSet=actionContext?.improved.get(k)||actionContext?.worsened.get(k);
    const trend=changeSet?.size?'<small class="action-trend">전월 대비 상태 변경</small>':'';
    return '<tr class="'+(hasX?'':'not-x-row')+'">'+
      '<td class="key-col name-col" data-label="거래처">'+name+trend+'</td>'+
      '<td data-label="업체/권역">'+esc(r.outlet)+'</td>'+
      E.map(status).join('')+
      '<td data-label="미연동 기간">'+(hasX?r.streak+'개월':'—')+'</td>'+
      VISIBLE_ACTION_FIELDS.map(f=>actionFieldCell(a,k,f,canEdit)).join('')+'</tr>';
  }).join('')||'<tr><td colspan="9" class="empty">조건에 해당하는 거래처가 없습니다. 필터나 검색어를 변경해 주세요.</td></tr>';
  const assessed=rr.reduce((sum,r)=>sum+E.filter(e=>L.normStatus(r.statuses?.[e])).length,0),
        xs=rr.reduce((sum,r)=>sum+E.filter(e=>L.normStatus(r.statuses?.[e])==='X').length,0);
  if($('actionFilterCount'))$('actionFilterCount').textContent=
    rr.length.toLocaleString()+'처 · O '+(assessed-xs).toLocaleString()+'건 / X '+xs.toLocaleString()+'건 (법인별 평가)';
  if($('actionViewTitle'))$('actionViewTitle').textContent=scopedViewLabel(actionView,$('month')?.value);
  if($('actionShown'))$('actionShown').textContent=
    Math.min(actionLimit,rr.length).toLocaleString()+' / '+rr.length.toLocaleString()+'처 표시';
  if($('actionMore'))$('actionMore').hidden=rr.length<=actionLimit;
  updateKpiSelection();
  window.DCMSRM?.update?.();
}
function applyShared(json){
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
function setActionStatus(msg,bad=false){
  const el=$('actionSyncStatus');if(el){el.textContent=msg;el.className=bad?'sync-error':'sync-ok';}
}
async function pullSharedActions(force=false){
  if(!partner||!password||(!force&&(offlineServer||Date.now()-lastEditAt<10000||document.visibilityState==='hidden'||document.activeElement?.closest?.('#actionBody'))))return;
  try{
    const json=await request({type:'partnerActions',partner,password});offlineServer=false;
    const old=JSON.stringify(remoteActions);applyShared(json);
    if(JSON.stringify(remoteActions)!==old)renderAction();
    setActionStatus('마스터·업체 Action 동기화 완료 · 미전송 내용 유지');updateSaveButton();
  }catch(e){if(e.status===404)offlineServer=true;setActionStatus('공용 Action 조회 실패 · '+e.message,true);}
}
function startActionPolling(){
  clearInterval(actionPoll);clearInterval(dataPoll);
  actionPoll=setInterval(()=>pullSharedActions(false),60000);
  dataPoll=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastEditAt>10000&&!document.activeElement?.closest?.('#actionBody'))pull();},180000);
}
function renderEmpty(){['rate','kpiDeltaRate','xCount','needCount','supplyCount','x2o','o2x','targetNeed','deltaRate','newSupply','stopSupply','changeX2O'].forEach(id=>{if($(id))$(id).textContent='-';});['persistAbs','persistState','all3Abs','all3State'].forEach(id=>{if($(id))$(id).textContent='-';});actionContext=null;$('actionBody').innerHTML='<tr><td colspan="9" class="empty">표시할 데이터가 없습니다.</td></tr>';if($('actionFilterCount'))$('actionFilterCount').textContent='0처';$('entityCards').innerHTML=E.map(e=>`<div class="entity"><h3>${e}</h3><div class="rate">-</div></div>`).join('');}
async function request(payload){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal});
  if(!response.ok){
    const error=new Error(response.status===404?'HTTP 404 · Google Apps Script 웹앱 주소/배포가 유효하지 않습니다':`HTTP ${response.status}`);
    error.status=response.status;throw error;
  }
  const text=await response.text();
  let json;try{json=JSON.parse(text)}catch(_){throw new Error('서버에서 JSON이 아닌 응답을 보냈습니다. Apps Script 배포를 확인해 주세요.');}
  if(!json.ok)throw new Error(json.error||'조회 실패');
  return json;
 }catch(err){
  if(err.name==='AbortError')throw new Error('서버가 18초 이내 응답하지 않아 요청이 중단되었습니다.');
  throw err;
 }finally{clearTimeout(timer);}
}
function snapshotKey(){return 'dcm-partner-last-data-v2::'+partner;}
function loadCachedData(){
 try{
  const cached=JSON.parse(sessionStorage.getItem(snapshotKey())||'null');
  if(!cached||!Array.isArray(cached.data)||Date.now()-cached.savedAt>3600000)return false;
  data=cached.data;historyCache.clear();refreshSelectors();render();
  $('syncMsg').textContent='이전 조회 결과 임시 표시 · 최신 데이터 확인 중...';
  return true;
 }catch(_){return false;}
}
function applyDashboard(json){
 const incoming=Array.isArray(json.data)?json.data:[];
 incoming.forEach(r=>{if(r.outlet==='백제약품 대전')r.manager='정직한';});
 const wasReady=!!data.length,changed=JSON.stringify(data)!==JSON.stringify(incoming);
 if(changed||!wasReady){data=incoming;historyCache.clear();refreshSelectors();render();}
 try{
  const text=JSON.stringify({data,savedAt:Date.now()});
  if(text.length<1400000)sessionStorage.setItem(snapshotKey(),text);
 }catch(_){}
 $('syncMsg').textContent=`마스터 최신 현황 적용 · ${data.length.toLocaleString()}건 · ${json.updatedAt||''}`;
 $('syncMsg').className='upload-msg sync-ok';
 updateSaveButton();
}
async function pull(){
 if(!partner||!password||loadingData)return;
 loadingData=true;$('syncMsg').textContent='마스터 최신 데이터 불러오는 중...';
 try{
  const json=await request({type:'partnerDashboard',partner,password});
  offlineServer=false;applyDashboard(json);startActionPolling();
  void pullSharedActions(true);
 }catch(err){
  if(err.status===404)offlineServer=true;
  $('syncMsg').textContent='마스터 현황 연결 실패 · '+err.message;
  $('syncMsg').className='upload-msg sync-error';
 }finally{loadingData=false;}
}
async function login(){
 if(loginInProgress)return;
 const company=$('loginPartner').value||'',secret=$('loginPassword').value||'';
 $('loginError').textContent='';
 if(!company||!secret){$('loginError').textContent='업체명과 접속코드를 입력해 주세요.';return;}
 loginInProgress=true;$('loginBtn').disabled=true;$('loginBtn').textContent='인증 중...';
 try{
  // Authentication is now independent of the expensive Action Board sheet.
  const json=await request({type:'partnerLogin',partner:company,password:secret});
  partner=json.partner||company;password=secret;offlineServer=false;
  sessionStorage.setItem(SESSION_PARTNER,partner);sessionStorage.setItem(SESSION_PASSWORD,password);
  $('partnerName').textContent=partner;$('partnerLogin').classList.add('hidden-login');
  loadCachedData();updateSaveButton();void pull();
 }catch(err){$('loginError').textContent=err.message||'로그인에 실패했습니다.';}
 finally{loginInProgress=false;$('loginBtn').disabled=false;$('loginBtn').textContent='접속하기';}
}
function logout(clear=true){clearInterval(actionPoll);clearInterval(dataPoll);partner='';password='';data=[];actions=[];remoteActions=[];actionIndex.clear();actionOverrides={};historyCache.clear();actionContext=null;actionView='x';actionEntity='all';actionSearch='';activeKpi=null;actionLimit=30;offlineServer=false;updateSaveButton();if($('actionView'))$('actionView').value='x';if($('actionEntity'))$('actionEntity').value='all';if($('actionSearch'))$('actionSearch').value='';if(clear){sessionStorage.removeItem(SESSION_PARTNER);sessionStorage.removeItem(SESSION_PASSWORD);}$('partnerName').textContent='-';$('partnerLogin').classList.remove('hidden-login');$('loginPassword').value='';renderEmpty();}
async function exportActions(){const cur=$('month')?.value;if(!cur)return;try{await ensureXLSX();}catch(e){alert(e.message||e);return;}const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],ch=L.compare(prior,curr),ctx=actionContext?.month===cur?actionContext:buildActionContext(cur,curr,prior,ch,risks(cur,curr,prior,ch)),rr=filterActionRows(ctx,actionView,actionEntity,actionSearch);const rows=rr.map(r=>{const a=actionFor(r),c=a.reasonCode||'',m=a.masterAction||a,p=a.partnerAction||{},owned=new Set(p.editedFields||[]),pv=f=>owned.has(f)?String(p[f]??''):'';return {'파트너사':partner,'기준월':cur,'업체/권역':r.outlet,'실사업자번호':r.businessNo,'실사업자명':r.businessName,'미연동 기간':hasCurrentX(r)?`${r.streak}개월`:'—','대웅제약':L.normStatus(r.statuses?.['대웅제약'])||'','대웅바이오':L.normStatus(r.statuses?.['대웅바이오'])||'','한올바이오':L.normStatus(r.statuses?.['한올바이오'])||'','원인코드':c,'원인':reasons[c]||'','조치계획':a.plan||'','Due':a.dueDate||'','상태':statusLabel(a.status||'TODO'),'마스터 원인코드':m.reasonCode||'','업체 원인코드':pv('reasonCode'),'마스터 조치계획':m.plan||'','업체 조치계획':pv('plan'),'마스터 Due':m.dueDate||'','업체 Due':pv('dueDate'),'마스터 상태':statusLabel(m.status||'TODO'),'업체 상태':pv('status')?statusLabel(pv('status')):'','업체 수정일시':p.updatedAt||''};});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Action Board');XLSX.writeFile(wb,`DCM_ActionBoard_${partner}_${cur}_${actionView}.xlsx`);}
function start(){
  const resetContext=()=>{actionLimit=30;render();};
  $('outlet').addEventListener('change',resetContext);
  $('month').addEventListener('change',resetContext);
  $('actionView').addEventListener('change',ev=>{actionView=ev.target.value;activeKpi=null;actionLimit=30;renderAction();});
  $('actionEntity').addEventListener('change',ev=>{actionEntity=ev.target.value;activeKpi=null;actionLimit=30;renderAction();});
  $('actionSearch').addEventListener('input',ev=>{actionSearch=ev.target.value;activeKpi=null;actionLimit=30;renderAction();});
  $('actionFilterReset').addEventListener('click',()=>setActionView('x',{scroll:false}));
  $('actionMore').addEventListener('click',()=>{actionLimit+=50;renderAction();});
  $('actionBody').addEventListener('change',event=>{
    const el=event.target.closest('[data-field]');
    if(!el)return;
    savePartnerOverride(el.dataset.key,el.dataset.field,el.value);
    el.classList.add('pending');
  });
  document.querySelectorAll('.kpi[data-kpi]').forEach(card=>{
    card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-controls','action');
    card.setAttribute('title','클릭하면 '+(ACTION_VIEWS[KPI_VIEWS[card.dataset.kpi]]||'해당')+' 목록으로 이동');
    const activate=()=>setActionView(KPI_VIEWS[card.dataset.kpi],{kpi:card.dataset.kpi});
    card.addEventListener('click',activate);
    card.addEventListener('keydown',ev=>{
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();activate();}
    });
  });
  $('refreshBtn').onclick=()=>{offlineServer=false;void pull();};
  $('saveToMasterBtn')?.addEventListener('click',savePendingActions);
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
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullSharedActions();});
  window.addEventListener('storage',ev=>{
    if(partner&&ev.key===overrideKey()){actionOverrides=loadOverrides();rebuildActions();renderAction();}
  });
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{
    document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth'});
  });
  const sp=sessionStorage.getItem(SESSION_PARTNER)||'',sw=sessionStorage.getItem(SESSION_PASSWORD)||'';
  if(sp&&sw){
    partner=sp;password=sw;$('partnerName').textContent=partner;
    $('partnerLogin').classList.add('hidden-login');loadCachedData();void pull();
  }
}
window.DCMPartnerSRM={rows:()=>data,actionRows:()=>actions,name:()=>partner,request:x=>{if(!partner||!password)throw Error('파트너 로그인 후 이용해 주세요.');return request({...x,partner,password});}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();