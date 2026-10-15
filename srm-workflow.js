(()=>{
'use strict';
const $=id=>document.getElementById(id),E=['대웅제약','대웅바이오','한올바이오'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPartner=()=>!!window.DCMPartnerSRM;
const source=()=>isPartner()?window.DCMPartnerSRM?.rows()||[]:window.DCMActionSync?.srmRows()||[];
const actionRows=()=>isPartner()?window.DCMPartnerSRM?.actionRows?.()||[]:window.DCMActionSync?.srmActions?.()||[];
const request=x=>isPartner()?window.DCMPartnerSRM?.request(x):window.DCMActionSync?.srmRequest(x);
const canHistory=()=>isPartner()?
 !!(window.DCMPartnerSRM?.isAuthenticated?.()??window.DCMPartnerSRM?.name?.()):
 !!window.DCMActionSync?.isConnected?.();
let events=[],selected='',entity='대웅제약',filter='all',loading=false,ready=false,generation=0;
const labels={OPEN:'확인 요청',CHECKING:'원인 확인',ERP_WAIT:'ERP 협의',IN_PROGRESS:'조치 진행',
 DONE:'조치 완료',VERIFIED:'X→O 검증 완료',REOPENED:'재확인 필요'};
const draftKey=()=> 'dcm-srm-draft::'+(isPartner()?window.DCMPartnerSRM?.name():'master')+'::'+selected+'::'+entity;
function show(message,error=false){
 const element=$('srmMsg');if(!element)return;
 element.textContent=message;element.classList.toggle('srm-error',error);
}
function monthsFor(key){
 return [...new Set(source().filter(r=>r.outlet+'|||'+r.businessNo===key&&r.month)
  .map(r=>r.month))].sort();
}
function currentRows(key){
 return source().filter(r=>r.outlet+'|||'+r.businessNo===key)
  .sort((a,b)=>String(a.month).localeCompare(String(b.month)));
}
function syncHistoryUI(){
 const button=$('srmRefresh');if(!button)return;
 const authenticated=canHistory();
 button.disabled=!authenticated||loading;
 button.textContent=loading?'조회 중…':authenticated?'추가 이력 새로고침':'로그인 후 추가 이력';
 button.title=authenticated?'별도로 기록된 협의·검증 내역을 불러옵니다.':
  '기본 ACTION BOARD 입력 이력은 로그인 여부와 관계없이 현재 불러온 자료에서 확인할 수 있습니다.';
}
function render(){
 const raw=source(),month=$('month')?.value||'',
  monthList=[...new Set(raw.map(r=>r.month).filter(Boolean))].sort();
 const archive=window.DCM_MONTHLY_ACTION_HISTORY;
 if(raw.length)archive?.refresh?.(raw);
 const result=window.DCMSRMAggregate?.build({
  actions:actionRows(),history:archive?.forMonth?.(month)||[],events:ready?events:[],
  month,latestMonth:monthList[monthList.length-1]||month
 })||{stats:{},records:[]};
 const stats=result.stats,records=result.records,loaded=raw.length>0;
 const values={srmManaged:stats.total,srmConsulted:stats.recorded,srmNeedsAction:stats.needsAction,
  srmOpen:stats.progress,srmDone:stats.done,srmVerified:stats.verified};
 for(const [id,value] of Object.entries(values)){
  const el=$(id);if(el)el.textContent=loaded?Number(value||0).toLocaleString():'—';
 }
 const match=r=>filter==='all'||filter==='recorded'&&r.recorded||
  filter==='open'&&r.needsAction||filter==='progress'&&r.progress||
  filter==='done'&&r.done||filter==='verified'&&r.verified||
  filter==='consulted'&&r.events.length>0;
 const shown=records.filter(match),byKey=new Map(raw.filter(r=>r.month===month)
  .map(r=>[r.outlet+'|||'+r.businessNo,r]));
 if($('srmCount'))$('srmCount').textContent=loaded?
  month+' · '+shown.length+'처 / 관리 '+records.length+'처':'DCM 데이터 불러오는 중';
 $('srmBody').innerHTML=shown.slice(0,150).map(r=>{
  const row=byKey.get(r.key),ox=row?E.map(e=>row.statuses?.[e]||'—').join(' / '):
   (r.oxSnapshot?r.oxSnapshot.split('/').join(' / '):'— / — / —');
  return '<tr><td data-label="거래처"><button class="srm-link" data-srm-open="'+esc(r.key)+
   '" data-srm-entity="'+esc(r.entity||E[0])+'">'+esc(r.businessName||r.businessNo)+
   '</button><small>'+esc(r.outlet)+' · '+esc(r.businessNo)+'</small></td>'+
   '<td data-label="3사 O/X">'+esc(ox)+'</td>'+
   '<td data-label="조치 이력">'+esc(r.recordSource)+'</td>'+
   '<td data-label="관리 상태">'+esc(r.statusLabel)+'</td>'+
   '<td data-label="다음 조치">'+esc(r.nextAction||'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="5" class="srm-empty">'+(
  !loaded?'DCM 데이터 불러오는 중':
  filter==='consulted'&&!ready?'추가 협의 이력은 로그인 후 조회할 수 있습니다.':
  '선택한 조건에 해당하는 거래처가 없습니다. 다른 상태를 선택해 주세요.'
 )+'</td></tr>';
 if($('srmSourceNote'))$('srmSourceNote').textContent=
  '조치 이력 '+(stats.recorded||0)+'처 = 일괄기재만 '+(stats.bulkOnly||0)+'처 + 실제 마스터·업체 입력/추가 협의 '+(stats.actualRecorded||0)+'처 (거래처 중복 제외). '+
  '일괄기재는 실제 실행 증빙이 아니며, 조치 내용 입력 자체를 조치 완료로 계산하지 않습니다.'+
  (ready?'':' · 추가 SRM 협의 기록 미조회'+(canHistory()?'':'(공용 로그인 후 확인 가능)'))+
  (shown.length>150?' · 첫 150처 표시':'');
 syncHistoryUI();
}
async function refresh(){
 if(loading)return false;
 if(!canHistory()){
  ready=false;events=[];
  render();
  show('기본 조치 이력은 ACTION BOARD 입력에서 표시합니다. 추가 협의 이력은 공용 Sync 또는 파트너 로그인 후 조회할 수 있습니다.');
  return false;
 }
 const ticket=++generation;loading=true;
 syncHistoryUI();show('추가 SRM 협의 이력 확인 중…');
 try{
  const response=await request({type:'srmList',scope:isPartner()?'partner':'master'});
  if(!response?.ok)throw Error(response?.error||'SRM 조회 실패');
  if(ticket!==generation||!canHistory())return false;
  events=Array.isArray(response.events)?response.events:[];ready=true;
  render();show('추가 협의 기록 '+events.length+'건 동기화 완료'+
   (response.hasMore?' · 서버 최근 1000건 기준':''));
  if(selected)history();
  return true;
 }catch(e){
  if(ticket===generation){
   // A separate SRM log failure never invalidates ACTION BOARD entries.
   ready=false;events=[];render();
   show('ACTION BOARD 조치 이력은 조회할 수 있습니다. 별도 SRM 협의 기록은 현재 연결되지 않았습니다. '+
    '로그인·서버 배포 상태를 확인해 주세요. ('+(e?.message||e)+')');
  }
  return false;
 }finally{loading=false;syncHistoryUI();}
}
function history(){
 const h=$('srmHistory');if(!h)return;
 const cs=ready?events.filter(e=>e.key===selected&&e.entity===entity):[];
 h.innerHTML=cs.slice(-30).reverse().map(e=>
  '<div class="srm-event"><strong>'+esc(e.updatedAt||'')+' · '+
  esc(e.actor||'')+' · '+esc(labels[e.status]||e.status||'')+'</strong>'+
  (e.contactTarget||e.erpVendor?'<div>'+esc(e.contactTarget||'')+
    (e.erpVendor?' · '+esc(e.erpVendor):'')+'</div>':'')+
  '<div>'+esc(e.detail||'')+'</div>'+
  (e.nextAction?'<small>다음 조치: '+esc(e.nextAction)+'</small>':'')+
  '</div>').join('')||
  '<p>'+(ready?'별도로 등록된 협의 이력이 없습니다. ACTION BOARD 입력은 상단 목록에 표시됩니다.':
   '기본 조치는 ACTION BOARD에 입력하면 자동 반영됩니다. 별도 협의 이력은 로그인 후 확인할 수 있습니다.')+'</p>';
}
function updateForm(){
 const kind=$('srm-kind')?.value||'contact';
 const contact=$('srm-contactTarget')?.value||'';
 if($('srmContactRow'))$('srmContactRow').hidden=kind!=='contact';
 if($('srmErpRow'))$('srmErpRow').hidden=kind!=='contact'||contact!=='ERP 업체';
 if($('srmBaselineRow'))$('srmBaselineRow').hidden=kind!=='verify';
}
function open(key,entityName='대웅제약'){
 if(!key?.includes('|||'))return;
 selected=key;entity=E.includes(entityName)?entityName:E[0];
 const form=$('srmForm');form.reset();form.dataset.requestId='';form.dataset.dirty='';
 const rows=currentRows(key);
 $('srmEntity').value=entity;
 $('srmTitle').textContent=(rows[rows.length-1]?.businessName||key.split('|||')[1])+
  ' · '+key.split('|||')[0];
 const ms=monthsFor(key);
 $('srm-baselineMonth').innerHTML='<option value="">기준월 선택</option>'+
  ms.map(month=>'<option>'+esc(month)+'</option>').join('');
 const first=ms.find(m=>rows.some(r=>r.month===m&&r.statuses?.[entity]==='X'));
 if(first)$('srm-baselineMonth').value=first;
 try{
  const saved=JSON.parse(localStorage.getItem(draftKey())||'null');
  if(saved)Object.entries(saved).forEach(([f,v])=>{
   if($('srm-'+f))$('srm-'+f).value=v;
  });
 }catch(_){}
 updateForm();
 $('srmEditor').hidden=false;history();
 $('srmWorkflow')?.scrollIntoView({behavior:'smooth',block:'start'});
 if(!ready&&canHistory())void refresh();
}
function draft(){
 const values={};
 for(const field of ['kind','contactTarget','erpVendor','detail','nextAction','baselineMonth'])
  values[field]=$('srm-'+field)?.value||'';
 try{localStorage.setItem(draftKey(),JSON.stringify(values));}catch(_){}
 return values;
}
async function submit(ev){
 ev.preventDefault();if(loading||!selected)return;
 if(!canHistory()){
  show('추가 협의 기록을 저장하려면 먼저 공용 Sync 또는 파트너에 로그인해 주세요.',true);return;
 }
 const value=draft(),kind=value.kind;
 if(!value.detail.trim()&&!value.nextAction.trim()){
  show('실제 협의·조치 내용 또는 다음 조치 중 하나를 입력해 주세요.',true);return;
 }
 const status=kind==='verify'?'VERIFIED':kind==='done'?'DONE':
  kind==='progress'?'IN_PROGRESS':'CHECKING';
 const eventType=kind==='verify'?'VERIFICATION':kind==='contact'?'CONTACT':'CASE_UPDATE';
 if(status==='VERIFIED'){
  const rows=currentRows(selected),from=rows.find(r=>r.month===value.baselineMonth),to=rows[rows.length-1];
  if(!(from?.statuses?.[entity]==='X'&&to?.statuses?.[entity]==='O'&&to.month>value.baselineMonth)){
   show('X→O 검증 실패: 기준월 X와 이후 최신월 O를 먼저 확인해 주세요.',true);return;
  }
 }
 const form=$('srmForm'),id=form.dataset.requestId||
  'srm-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
 form.dataset.requestId=id;
 const payload={type:'srmAppend',scope:isPartner()?'partner':'master',key:selected,entity,
  eventType,status,reason:'',owner:'',contactTarget:kind==='contact'?value.contactTarget:'',
  erpVendor:kind==='contact'&&value.contactTarget==='ERP 업체'?value.erpVendor:'',
  detail:value.detail,nextAction:value.nextAction,
  baselineMonth:kind==='verify'?value.baselineMonth:'',requestId:id};
 loading=true;syncHistoryUI();show('추가 협의 기록 저장 중…');
 try{
  const response=await request(payload);
  if(!response?.ok||!response.saved)throw Error(response?.error||'서버 저장을 확인하지 못했습니다.');
  localStorage.removeItem(draftKey());form.dataset.requestId='';
  $('srm-detail').value='';$('srm-nextAction').value='';
  loading=false;
  show('추가 협의 기록 저장 확인 완료');
  await refresh();
 }catch(e){
  show('서버 저장 실패 · 작성한 내용은 이 브라우저에 보관됩니다. '+(e?.message||e),true);
  loading=false;
 }finally{syncHistoryUI();}
}
function authChanged(){
 if(!canHistory()){
  generation++;loading=false;ready=false;events=[];
  if($('srmEditor'))$('srmEditor').hidden=true;
  render();
  show('기본 ACTION BOARD 조치 이력은 유지됩니다. 별도 협의 이력은 로그인 후 자동으로 조회합니다.');
 }else{
  render();
  if(!ready&&!loading)void refresh();
 }
}
function mount(){
 if($('srmWorkflow'))return;
 const root=document.createElement('section');root.id='srmWorkflow';root.className='srm-workflow';
 root.innerHTML='<div class="srm-head"><div><h2>SRM 거래처 조치 현황</h2>'+
 '<p>마스터·업체 ACTION BOARD 입력을 조치 이력으로 통합합니다. 별도 협의 기록은 선택사항입니다.</p></div>'+
 '<button id="srmRefresh" type="button">로그인 후 추가 이력</button></div>'+
 '<div class="srm-metrics">'+
 '<div>관리 대상<b id="srmManaged">—</b></div>'+
 '<div>조치 이력 있음<b id="srmConsulted">—</b></div>'+
 '<div>확인·조치 필요<b id="srmNeedsAction">—</b></div>'+
 '<div>조치 진행<b id="srmOpen">—</b></div>'+
 '<div>조치 완료<b id="srmDone">—</b></div>'+
 '<div>DCM X→O 개선<b id="srmVerified">—</b></div></div>'+
 '<div class="srm-head"><label>거래처 상태 <select id="srmFilter">'+
 '<option value="all">전체</option><option value="recorded">조치 이력 있음</option>'+
 '<option value="open">확인·조치 필요</option><option value="progress">조치 진행</option>'+
 '<option value="done">조치 완료</option><option value="verified">DCM X→O 개선</option>'+
 '<option value="consulted">추가 협의 기록</option></select></label><span id="srmCount"></span></div>'+
 '<div class="srm-table"><table><thead><tr><th>거래처</th><th>3사 O/X</th>'+
 '<th>조치 이력</th><th>관리 상태</th><th>다음 조치</th></tr></thead>'+
 '<tbody id="srmBody"></tbody></table></div>'+
 '<p id="srmSourceNote" class="srm-message"></p>'+
 '<p id="srmMsg" class="srm-message" role="status" aria-live="polite"></p>'+
 '<div id="srmEditor" hidden><div class="srm-head"><div><h3 id="srmTitle">추가 협의·검증 기록</h3>'+
 '<p>ACTION BOARD의 원인·조치계획·상태를 다시 입력할 필요가 없습니다.</p></div>'+
 '<button id="srmClose" type="button">닫기</button></div>'+
 '<form id="srmForm" class="srm-form">'+
 '<label>그룹사<select id="srmEntity"><option>대웅제약</option><option>대웅바이오</option><option>한올바이오</option></select></label>'+
 '<label>추가 기록 유형<select id="srm-kind">'+
 '<option value="contact">실제 협의</option><option value="progress">진행 내용</option>'+
 '<option value="done">조치 완료</option><option value="verify">X→O 검증</option></select></label>'+
 '<label id="srmContactRow" class="srm-conditional">협의 대상<select id="srm-contactTarget">'+
 '<option value="">선택 안 함</option><option>유통협력사</option><option>도도매 거래처</option>'+
 '<option>ERP 업체</option><option>공동 협의</option></select></label>'+
 '<label id="srmErpRow" class="srm-conditional" hidden>ERP 업체명<input id="srm-erpVendor" maxlength="100" placeholder="실제 협의한 업체명"></label>'+
 '<label id="srmBaselineRow" class="srm-conditional" hidden>검증 기준월<select id="srm-baselineMonth"><option value="">기준월 선택</option></select></label>'+
 '<label class="wide">실제 협의·조치 내용<textarea id="srm-detail" rows="2" maxlength="1000" placeholder="확인하거나 처리한 사실만 간단히 기록"></textarea></label>'+
 '<label class="wide">다음 조치 (선택)<textarea id="srm-nextAction" rows="2" maxlength="1000" placeholder="ACTION BOARD와 동일한 계획은 재입력하지 않아도 됩니다"></textarea></label>'+
 '<button class="srm-primary" type="submit">추가 기록 저장</button>'+
 '<p class="srm-help">입력 이력이 있다는 사실은 조치 완료를 뜻하지 않습니다. 완료·연동 검증 결과는 별도로 판단합니다.</p>'+
 '</form><div class="srm-history"><strong>추가 협의·검증 이력</strong><div id="srmHistory"></div></div></div>';
 const target=isPartner()?$('action'):$('ctActionBody')?.closest('section');
 const host=target?.parentNode||document.querySelector('main.wrap')||document.body;
 if(target&&target.parentNode)host.insertBefore(root,target.nextSibling);else host.appendChild(root);
 const st=document.createElement('style');
 st.textContent=String.raw`
 .srm-workflow{box-sizing:border-box;max-width:100%;min-width:0;width:100%;grid-column:1/-1;
  margin:16px 0;padding:16px;border:1px solid #d5e2ef;border-radius:12px;background:#fff;color:#243f61;scroll-margin-top:18px}
 .srm-workflow *{box-sizing:border-box}
 .srm-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin:0 0 12px}
 .srm-head>*,.srm-form>*,.srm-metrics>div{min-width:0;max-width:100%}
 .srm-head h2{font-size:17px;margin:0}.srm-head h3{font-size:15px;margin:0}
 .srm-head p{font-size:11px;color:#6c8297;margin:5px 0}
 .srm-workflow button{cursor:pointer;border:1px solid #bdd3eb;border-radius:7px;padding:7px 10px;background:#f2f7ff;color:#1765a9;font-weight:750}
 .srm-workflow button:disabled{cursor:not-allowed;opacity:.58}
 .srm-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:12px 0}
 .srm-metrics>div{padding:12px;border-radius:9px;background:#f1f6fc;font-size:11px;color:#57728c}
 .srm-metrics b{display:block;margin-top:7px;font-size:24px;color:#155d9f}
 .srm-head select{min-height:34px;padding:4px 10px;border:1px solid #cfdded;background:#fff}
 .srm-table{width:100%;max-width:100%;max-height:370px;overflow-x:hidden;overflow-y:auto;border:1px solid #e2eaf3;border-radius:8px}
 .srm-table table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:11px}
 .srm-table th{position:sticky;top:0;background:#edf3fb;text-align:left;z-index:2}
 .srm-table th,.srm-table td{min-width:0;white-space:normal;overflow-wrap:anywhere;vertical-align:top;padding:10px 9px;line-height:1.5;border-bottom:1px solid #e5ecf4}
 .srm-table th:nth-child(1){width:28%}.srm-table th:nth-child(2){width:12%}
 .srm-table th:nth-child(3){width:20%}.srm-table th:nth-child(4){width:17%}.srm-table th:nth-child(5){width:23%}
 .srm-table td small{display:block;font-size:10px;color:#7287a0;margin-top:3px}
 .srm-table .srm-link{border:0!important;padding:0!important;background:none!important;text-decoration:underline;text-align:left;white-space:normal;overflow-wrap:anywhere}
 .srm-message{font-size:11px;line-height:1.6;color:#54708d;overflow-wrap:anywhere}
 .srm-error{color:#b42318}
 .srm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:11px;
  width:100%;padding:12px 0;border-top:1px solid #e3eaf3;align-items:start}
 .srm-form label{display:block;font-size:11px;font-weight:750;color:#4e6884}
 .srm-form label[hidden]{display:none!important}
 .srm-form select,.srm-form input,.srm-form textarea{display:block;min-width:0;width:100%;max-width:100%;margin-top:5px;padding:8px;
  border:1px solid #ceddec;border-radius:7px;font:inherit;background:#fff}
 .srm-form .wide,.srm-form .srm-primary,.srm-form .srm-help{grid-column:1/-1}
 .srm-form .srm-primary{background:#1669cc;color:#fff;border-color:#1669cc}
 .srm-help{margin:0;color:#71869c;font-size:10px}
 .srm-history{margin-top:10px;border:1px solid #e3eaf3;border-radius:8px;padding:12px;max-height:280px;overflow-y:auto;overflow-x:hidden;font-size:11px;overflow-wrap:anywhere}
 .srm-event{padding:10px 0;border-bottom:1px solid #e3eaf3;line-height:1.6}
 .srm-event strong{display:block;color:#1765a9}
 @media(max-width:1300px){.srm-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:920px){
  .srm-table table,.srm-table tbody{display:block;width:100%}
  .srm-table thead{display:none}
  .srm-table tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;border:1px solid #dce7f2;border-radius:9px;margin:8px;padding:10px;background:#fff}
  .srm-table tbody td{display:block;width:auto!important;border:0;padding:4px 6px}
  .srm-table tbody td::before{content:attr(data-label);display:block;margin-bottom:2px;font-size:10px;font-weight:800;color:#7a90a9}
  .srm-table tbody td:first-child,.srm-table tbody td:last-child,.srm-table tbody td.srm-empty{grid-column:1/-1}
  .srm-table tbody td:first-child::before{display:none}
 }
 @media(max-width:650px){.srm-workflow{padding:11px}.srm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .srm-table tbody tr{grid-template-columns:minmax(0,1fr)}.srm-table tbody td{grid-column:1/-1}}
 `;
 document.head.appendChild(st);
 $('srmRefresh').onclick=()=>void refresh();
 $('srmFilter').onchange=e=>{filter=e.target.value;render();};
 $('srmClose').onclick=()=>{$('srmEditor').hidden=true;selected='';};
 $('srmEntity').onchange=e=>{entity=E.includes(e.target.value)?e.target.value:E[0];history();};
 $('srm-kind').onchange=updateForm;
 $('srm-contactTarget').onchange=updateForm;
 ['month','manager','outlet'].forEach(id=>$(id)?.addEventListener('change',render));
 window.addEventListener('dcm-action-sync-applied',render);
 window.addEventListener('dcm-srm-data-changed',render);
 window.addEventListener('dcm-sync-access-changed',authChanged);
 window.addEventListener('dcm-partner-authenticated',authChanged);
 window.addEventListener('dcm-partner-logged-out',authChanged);
 $('srmForm').onsubmit=submit;
 $('srmForm').addEventListener('input',()=>{$('srmForm').dataset.dirty='1';draft();});
 document.addEventListener('click',e=>{
  const target=e.target.closest('[data-srm-open]');
  if(target){e.preventDefault();open(target.dataset.srmOpen,target.dataset.srmEntity||'대웅제약');}
 });
 render();
 if(canHistory())void refresh();
 else show('ACTION BOARD 조치 이력은 표시 중입니다. 추가 협의 기록은 로그인 후 자동으로 조회합니다.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.DCMSRM={open,refresh,update:render};
})();
