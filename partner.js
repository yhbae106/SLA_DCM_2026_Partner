(()=>{
'use strict';
const ENDPOINT='https://script.google.com/macros/s/AKfycbygUlCo1x2izUO59cdbbBL3pbGLZgMaGrZz2lrqDfB8m4VtUHC-VqnEJMOeiQOUPXWCuQ/exec';
const L=window.DCMLogic,E=L?.E||['대웅제약','대웅바이오','한올바이오'],TARGET=.95,$=id=>document.getElementById(id),XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let xlsxPromise=null;function ensureXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(xlsxPromise)return xlsxPromise;xlsxPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=XLSX_URL;s.async=true;s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxPromise=null;reject(new Error('Excel 모듈 로딩 실패 · 네트워크/방화벽을 확인해 주세요.'));};document.head.appendChild(s);});return xlsxPromise;}
const reasons={'01':'ERP/시스템 미구축','02':'도입 품목 미연동','03':'전산/데이터 오류','04':'거래처 연동 거부/미협조','05':'공급·거래 중단 예정','06':'신규 거래처 연동 예정','07':'당월 매출 미발생','08':'도매몰 연동 필요'};
const SESSION_PARTNER='dcm-partner-login-company',SESSION_PASSWORD='dcm-partner-login-password';
let partner='',password='',data=[],actions=[],remoteActions=[],actionIndex=new Map(),actionOverrides={},actionPoll=null,dataPoll=null,lastEditAt=0,actionLimit=100,riskLimit=150,historyCache=new Map();
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`,pp=v=>v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${(v*100).toFixed(1)}%p`,key=r=>`${r.outlet}|||${r.businessNo}`;
const monthLabel=m=>{if(!m)return '—';const [y,mm]=m.split('-');return `${y}년 ${Number(mm)}월`;};
const EDIT_FIELDS=['reasonCode','plan','dueDate','status'];
function actionKey(){return `dcm-partner-master-actions::${partner}`;}
function overrideKey(){return `dcm-partner-action-overrides-v1::${partner}`;}
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
  try{const obj=JSON.parse(raw);return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{};}catch(e){return {};}
}
function rebuildActions(){
  const map=new Map(remoteActions.filter(a=>a?.key).map(a=>[a.key,{...a}]));
  Object.entries(actionOverrides).forEach(([k,over])=>{
    if(!k.includes('|||')||!over||typeof over!=='object')return;
    const [outlet,businessNo]=k.split('|||'),base=map.get(k)||{key:k,outlet,businessNo},fields=over.fields||{};
    EDIT_FIELDS.forEach(f=>{if(Object.prototype.hasOwnProperty.call(fields,f))base[f]=String(fields[f]??'');});
    map.set(k,base);
  });
  actionIndex=map;actions=[...map.values()];
}
function savePartnerOverride(k,field,value){
  if(!EDIT_FIELDS.includes(field)||!k.includes('|||'))return;
  const entry=actionOverrides[k]||{fields:{},updatedAt:''};
  entry.fields={...(entry.fields||{}),[field]:String(value??'')};entry.updatedAt=new Date().toISOString();
  actionOverrides[k]=entry;localStorage.setItem(overrideKey(),JSON.stringify(actionOverrides));lastEditAt=Date.now();
  rebuildActions();setActionStatus('업체 수정값이 이 브라우저에 저장되었습니다 · 마스터 값보다 우선 표시');
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
function actionFor(r){return actionIndex.get(key(r))||{};}
function statusLabel(s){return ({TODO:'미조치',IN_PROGRESS:'진행중',WAITING:'회신대기',DONE:'완료'})[s]||'미조치';}
function renderPersist(cur,curr){const rows=streakRows(cur,curr);let pa=0,ps=0,a3=0,a3s=0;rows.forEach(r=>{let hp=false;E.forEach(e=>{if((r.entityStreak[e]||0)>=2){ps++;hp=true;}});if(hp)pa++;if(E.every(e=>L.normStatus(r.statuses?.[e])==='X')){a3++;a3s+=3;}});$('persistAbs').textContent=`${pa}처`;if($('persistState'))$('persistState').textContent=`${ps}건`;$('all3Abs').textContent=`${a3}처`;if($('all3State'))$('all3State').textContent=`${a3s}건`;}
function render(){const cur=$('month')?.value;if(!cur)return renderEmpty();const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],s=L.summarize(curr),ps=L.summarize(prior),ch=L.compare(prior,curr),rr=risks(cur,curr,prior,ch);$('scopeLabel').textContent=`${partner} · ${$('outlet').value} · ${monthLabel(cur)}`;$('rate').textContent=pct(s.rate);$('rate').closest('.kpi').querySelector('small').textContent=`O ${s.O.toLocaleString()}건 / O+X ${s.evaluated.toLocaleString()}건`;$('xCount').textContent=s.X.toLocaleString();$('needCount').textContent=s.needAbsolute.toLocaleString();$('supplyCount').textContent=s.suppliedAbsolute.toLocaleString();$('x2o').textContent=(ch.xToO||[]).length.toLocaleString();$('o2x').textContent=(ch.oToX||[]).length.toLocaleString();if($('targetNeed'))$('targetNeed').textContent=`${s.evaluated?Math.ceil(Math.max(0,TARGET*s.evaluated-s.O)):0}건`;renderPersist(cur,curr);$('entityCards').innerHTML=E.map(e=>{const x=s.byEntity[e];return `<div class="entity"><h3>${e}</h3><div class="rate">${pct(x.rate)}</div><div class="meter"><i style="width:${x.rate==null?0:x.rate*100}%"></i></div><small>O ${x.O.toLocaleString()} · X ${x.X.toLocaleString()} · 평가 ${(x.O+x.X).toLocaleString()}</small></div>`}).join('');$('changeSub').textContent=prev?`${monthLabel(prev)} → ${monthLabel(cur)}`:'비교할 이전 월이 없습니다.';$('deltaRate').textContent=prev&&s.rate!=null&&ps.rate!=null?pp(s.rate-ps.rate):'—';$('kpiDeltaRate').textContent=$('deltaRate').textContent;$('newSupply').textContent=(ch.newSupply||[]).length.toLocaleString();$('stopSupply').textContent=(ch.stoppedSupply||[]).length.toLocaleString();$('changeX2O').textContent=(ch.xToO||[]).length.toLocaleString();renderRisk(rr);renderAction(rr);}
function renderRisk(rr){
  $('riskTotal').textContent=`X 거래처 ${rr.length.toLocaleString()}처`;
  $('riskBody').innerHTML=rr.slice(0,riskLimit).map((r,i)=>`<tr><td>${i+1}</td><td><span class="priority ${r.priority.toLowerCase()}">${r.priority}</span></td><td>${esc(r.outlet)}</td><td>${esc(r.businessName)}</td><td>${esc(r.businessNo)}</td><td>${E.map(e=>L.normStatus(r.statuses?.[e])||'-').join(' / ')}</td><td>${r.streak}개월</td><td><b>${r.score}</b></td></tr>`).join('')||'<tr><td colspan="8" class="empty">X가 있는 거래처가 없습니다.</td></tr>';
  if($('riskShown'))$('riskShown').textContent=`${Math.min(riskLimit,rr.length).toLocaleString()} / ${rr.length.toLocaleString()}처 표시`;
  if($('riskMore'))$('riskMore').hidden=rr.length<=riskLimit;
}
function renderAction(rr){
  $('actionBody').innerHTML=rr.slice(0,actionLimit).map(r=>{
    const a=actionFor(r);
    return `<tr><td><span class="priority ${r.priority.toLowerCase()}">${r.priority}</span></td><td>${r.score}</td><td>${esc(r.businessName)}${actionOverrides[key(r)]?.fields&&Object.keys(actionOverrides[key(r)].fields).length?'<small class="local-action-marker">업체 수정</small>':''}</td><td>${esc(r.outlet)}</td><td>${r.streak}개월</td><td><select class="action-field" data-field="reasonCode" data-key="${esc(key(r))}"><option value="">원인 선택</option>${Object.entries(reasons).map(([k,v])=>`<option value="${esc(k)}" ${a.reasonCode===k?'selected':''}>${esc(k)} ${esc(v)}</option>`).join('')}</select></td><td><input class="action-field plan" data-field="plan" data-key="${esc(key(r))}" value="${esc(a.plan||'')}" placeholder="조치계획"></td><td><input class="action-field" type="date" data-field="dueDate" data-key="${esc(key(r))}" value="${esc(a.dueDate||'')}"></td><td><select class="action-field" data-field="status" data-key="${esc(key(r))}">${['TODO','IN_PROGRESS','WAITING','DONE'].map(x=>`<option value="${x}" ${(a.status||'TODO')===x?'selected':''}>${statusLabel(x)}</option>`).join('')}</select></td></tr>`;
  }).join('')||'<tr><td colspan="9" class="empty">Action 대상이 없습니다.</td></tr>';
  document.querySelectorAll('#actionBody [data-field]').forEach(el=>el.addEventListener('change',()=>savePartnerOverride(el.dataset.key,el.dataset.field,el.value)));
  if($('actionShown'))$('actionShown').textContent=`${Math.min(actionLimit,rr.length).toLocaleString()} / ${rr.length.toLocaleString()}처 표시`;
  if($('actionMore'))$('actionMore').hidden=rr.length<=actionLimit;
}
function applyShared(json){
  if(json.reasons&&typeof json.reasons==='object'&&!Array.isArray(json.reasons)){
    Object.entries(json.reasons).forEach(([code,label])=>{if(/^\d{2}$/.test(code)&&typeof label==='string')reasons[code]=label;});
  }
  if(Array.isArray(json.actions))remoteActions=json.actions;
  actionOverrides=loadOverrides();rebuildActions();
}
function setActionStatus(msg,bad=false){
  const el=$('actionSyncStatus');if(el){el.textContent=msg;el.className=bad?'sync-error':'sync-ok';}
}
async function newPullSharedActions(){
  if(!partner||!password||Date.now()-lastEditAt<10000||document.visibilityState==='hidden'||document.activeElement?.closest?.('#actionBody'))return;
  try{
    const json=await request({type:'partnerActions',partner,password});
    const old=JSON.stringify(remoteActions);applyShared(json);
    if(JSON.stringify(remoteActions)!==old)render();
    setActionStatus('마스터 Action 최신값 확인 · 이 브라우저의 업체 수정값은 유지됩니다');
  }catch(e){setActionStatus('공용 Action 최신값 확인 실패 · 기존 표시 유지 · '+e.message,true);}
}
function startActionPolling(){
  clearInterval(actionPoll);clearInterval(dataPoll);
  actionPoll=setInterval(pullSharedActions,60000);
  dataPoll=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastEditAt>10000&&!document.activeElement?.closest?.('#actionBody'))pull();},180000);
}
function renderEmpty(){['rate','kpiDeltaRate','xCount','needCount','supplyCount','x2o','o2x','targetNeed','deltaRate','newSupply','stopSupply','changeX2O'].forEach(id=>{if($(id))$(id).textContent='-';});['persistAbs','persistState','all3Abs','all3State'].forEach(id=>{if($(id))$(id).textContent='-';});$('riskTotal').textContent='X 거래처 0처';$('riskBody').innerHTML='<tr><td colspan="8" class="empty">표시할 데이터가 없습니다.</td></tr>';$('actionBody').innerHTML='<tr><td colspan="9" class="empty">표시할 데이터가 없습니다.</td></tr>';$('entityCards').innerHTML=E.map(e=>`<div class="entity"><h3>${e}</h3><div class="rate">-</div></div>`).join('');}
async function request(payload){const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const json=await res.json();if(!json.ok)throw new Error(json.error||'조회 실패');return json;}
async function pull(){if(!partner||!password)return;try{$('syncMsg').textContent='대웅제약 마스터 데이터 불러오는 중...';$('syncMsg').className='upload-msg';const json=await request({type:'partnerDashboard',partner,password});data=Array.isArray(json.data)?json.data:[];historyCache.clear();data.forEach(r=>{if(r.outlet==='백제약품 대전')r.manager='정직한';});applyShared(json);setActionStatus(Array.isArray(json.actions)?'마스터 Action 최신값 적용 · 업체 수정값 유지':'마스터 Action 연동 대기 · Apps Script 업데이트 필요',!Array.isArray(json.actions));refreshSelectors();render();startActionPolling();$('syncMsg').textContent=`마스터 최신 데이터 적용 · ${data.length.toLocaleString()}건 · ${json.updatedAt||''}`;$('syncMsg').className='upload-msg sync-ok';}catch(e){$('syncMsg').textContent=`공용 데이터 연결 실패 · ${e.message}`;$('syncMsg').className='upload-msg sync-error';if(/접속코드|업체명/.test(e.message)){logout(false);$('loginError').textContent=e.message;}else renderEmpty();}}
async function login(){const p=$('loginPartner').value||'',pw=$('loginPassword').value||'';$('loginError').textContent='';if(!p||!pw){$('loginError').textContent='업체명과 접속코드를 입력해 주세요.';return;}try{$('loginBtn').disabled=true;$('loginBtn').textContent='확인 중...';const json=await request({type:'partnerLogin',partner:p,password:pw});partner=json.partner||p;historyCache.clear();password=pw;sessionStorage.setItem(SESSION_PARTNER,partner);sessionStorage.setItem(SESSION_PASSWORD,password);$('partnerName').textContent=partner;$('partnerLogin').classList.add('hidden-login');data=Array.isArray(json.data)?json.data:[];data.forEach(r=>{if(r.outlet==='백제약품 대전')r.manager='정직한';});applyShared(json);setActionStatus(Array.isArray(json.actions)?'마스터 Action 최신값 적용 · 업체 수정값 유지':'마스터 Action 연동 대기 · Apps Script 업데이트 필요',!Array.isArray(json.actions));refreshSelectors();render();startActionPolling();$('syncMsg').textContent=`마스터 최신 데이터 적용 · ${data.length.toLocaleString()}건 · ${json.updatedAt||''}`;$('syncMsg').className='upload-msg sync-ok';}catch(e){$('loginError').textContent=e.message||'로그인에 실패했습니다.';}finally{$('loginBtn').disabled=false;$('loginBtn').textContent='접속하기';}}
function logout(clear=true){clearInterval(actionPoll);clearInterval(dataPoll);partner='';password='';data=[];actions=[];remoteActions=[];actionIndex.clear();actionOverrides={};historyCache.clear();if(clear){sessionStorage.removeItem(SESSION_PARTNER);sessionStorage.removeItem(SESSION_PASSWORD);}$('partnerName').textContent='-';$('partnerLogin').classList.remove('hidden-login');$('loginPassword').value='';renderEmpty();}
async function exportActions(){const cur=$('month')?.value;if(!cur)return;try{await ensureXLSX();}catch(e){alert(e.message||e);return;}const prev=prevMonth(cur),curr=scope(cur),prior=prev?scope(prev):[],rr=risks(cur,curr,prior,L.compare(prior,curr));const rows=rr.map(r=>{const a=actionFor(r),c=a.reasonCode||'';return {'파트너사':partner,'기준월':cur,'업체/권역':r.outlet,'실사업자번호':r.businessNo,'실사업자명':r.businessName,'Priority':r.priority,'Risk Score':r.score,'Aging':`${r.streak}개월`,'대웅제약':L.normStatus(r.statuses?.['대웅제약'])||'','대웅바이오':L.normStatus(r.statuses?.['대웅바이오'])||'','한올바이오':L.normStatus(r.statuses?.['한올바이오'])||'','원인코드':c,'원인':reasons[c]||'','조치계획':a.plan||'','Due':a.dueDate||'','상태':statusLabel(a.status||'TODO')};});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Action Board');XLSX.writeFile(wb,`DCM_ActionBoard_${partner}_${cur}.xlsx`);}
function start(){$('outlet').addEventListener('change',()=>{riskLimit=150;actionLimit=100;render();});$('month').addEventListener('change',()=>{riskLimit=150;actionLimit=100;render();});$('actionMore')?.addEventListener('click',()=>{actionLimit+=100;render();});$('riskMore')?.addEventListener('click',()=>{riskLimit+=150;render();});$('refreshBtn').onclick=pull;$('exportAction').onclick=exportActions;$('exportAction2').onclick=exportActions;$('resetActionBtn').onclick=()=>{if(!partner)return;if(confirm(`${partner}의 이 브라우저 수정값을 초기화하고 마스터 최신값으로 복원할까요?`)){localStorage.setItem(overrideKey(),'{}');localStorage.removeItem(actionKey());actionOverrides={};rebuildActions();render();setActionStatus('이 브라우저 수정값 초기화됨 · 마스터 최신값 표시');}};$('logoutBtn').onclick=()=>logout(true);$('loginBtn').onclick=login;$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullSharedActions();});window.addEventListener('storage',e=>{if(partner&&e.key===overrideKey()){actionOverrides=loadOverrides();rebuildActions();render();}});document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth'}));const sp=sessionStorage.getItem(SESSION_PARTNER)||'',sw=sessionStorage.getItem(SESSION_PASSWORD)||'';if(sp&&sw){partner=sp;password=sw;$('partnerName').textContent=partner;$('partnerLogin').classList.add('hidden-login');pull();}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();