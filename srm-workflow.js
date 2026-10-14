(()=>{
'use strict';
const $=id=>document.getElementById(id), E=['대웅제약','대웅바이오','한올바이오'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPartner=()=>!!window.DCMPartnerSRM;
const source=()=>isPartner()?window.DCMPartnerSRM?.rows()||[]:window.DCMActionSync?.srmRows()||[];
const request=x=>isPartner()?window.DCMPartnerSRM?.request(x):window.DCMActionSync?.srmRequest(x);
const actionRows=()=>isPartner()?window.DCMPartnerSRM?.actionRows?.()||[]:window.DCMActionSync?.srmActions?.()||[];
let events=[],selected='',entity='대웅제약',filter='all',loading=false,ready=false;
const labels={OPEN:'미확인',CHECKING:'원인 확인',ERP_WAIT:'ERP 협의',IN_PROGRESS:'진행 중',DONE:'조치 완료·검증 대기',VERIFIED:'X→O 검증 완료',REOPENED:'재확인 필요'};
function draftKey(){return 'dcm-srm-draft::'+(isPartner()?window.DCMPartnerSRM?.name():'master')+'::'+selected+'::'+entity;}
function latest(){
 const m=new Map();for(const r of source()){if(!r?.month||!r.outlet||!r.businessNo)continue;
 const k=r.outlet+'|||'+r.businessNo;if(!m.has(k)||r.month>=m.get(k).month)m.set(k,r);}
 return m;
}
function show(t,err=false){$('srmMsg').textContent=t;$('srmMsg').classList.toggle('srm-error',err);}
function render(){
 const raw=source(),month=$('month')?.value||'',months=[...new Set(raw.map(r=>r.month).filter(Boolean))].sort();
 const archive=window.DCM_MONTHLY_ACTION_HISTORY;if(raw.length)archive?.refresh?.(raw);
 const result=window.DCMSRMAggregate?.build({actions:actionRows(),history:archive?.forMonth?.(month)||[],
   events,month,latestMonth:months[months.length-1]||month})||{stats:{},records:[]};
 const stats=result.stats,records=result.records,loaded=raw.length>0;
 const numbers={srmManaged:stats.total,srmMaster:stats.master,srmPartner:stats.partner,
  srmOpen:stats.progress,srmErp:stats.erp,srmOverdue:stats.overdue,srmDone:stats.done,
  srmVerified:stats.verified,srmDisputes:stats.dispute};
 for(const [id,n] of Object.entries(numbers))if($(id))$(id).textContent=loaded?Number(n||0).toLocaleString():'—';
 const match=r=>filter==='all'||filter==='open'&&!r.done||filter==='progress'&&r.progress||
  filter==='erp'&&r.erpRelated||filter==='overdue'&&r.overdue||filter==='done'&&r.done||
  filter==='verified'&&r.verified||filter==='dispute'&&r.dispute||filter==='stopped'&&r.stop;
 const list=records.filter(match),now=latest();
 if($('srmCount'))$('srmCount').textContent=loaded?month+' · '+list.length+'처 / 관리 '+records.length+'처':'DCM 데이터 불러오는 중';
 $('srmBody').innerHTML=list.slice(0,100).map(r=>{
   const row=now.get(r.key),ox=E.map(e=>row?.statuses?.[e]||'—').join(' / ');
   const origin=r.source==='monthly'?'월별 사후 이력':r.source==='live'?'기존 Action':'SRM 협의';
   return '<tr><td><button class="srm-link" data-srm-open="'+esc(r.key)+'" data-srm-entity="'+esc(r.entity||E[0])+'">'+esc(r.businessName||r.businessNo)+'</button><small>'+esc(r.outlet)+' · '+esc(r.businessNo)+'</small></td><td>'+esc(ox)+'</td><td>'+esc(origin)+(r.masterFilled?' · 마스터':'')+(r.partnerFilled?' · 업체':'')+'</td><td>'+esc(r.statusLabel)+'</td><td>'+esc(r.erpVendor||(r.erpRelated?'ERP 관련(업체 미확인)':'—'))+'</td><td>'+esc(r.dueDate||'—')+'</td><td>'+esc(r.nextAction||'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="7">'+(loaded?'조건에 해당하는 거래처가 없습니다.':'DCM 데이터 불러오는 중')+'</td></tr>';
 if($('srmSourceNote'))$('srmSourceNote').textContent='월별 DCM 및 기존 Action 입력 기준 · 마스터 '+(stats.master||0)+'처 / 업체 '+(stats.partner||0)+'처 · 사후분류와 당시 수행 증빙은 구분';
}
async function refresh(){
 if(loading||!request)return;
 loading=true;show('공용 SRM 이력 확인 중...');
 try{const r=await request({type:'srmList',scope:isPartner()?'partner':'master'});
 if(!r?.ok)throw Error(r?.error||'SRM 조회 실패');
 events=r.events||[];ready=true;render();show('SRM 이력 동기화 완료 · '+events.length+'건'+(r.hasMore?' · 최근 1000건만 조회':''));
 if(selected)history();
 }catch(e){show('SRM 서버 연결 또는 Apps Script 배포 확인 필요 · '+(e.message||e),true);}
 finally{loading=false;}
}
function months(k){return [...new Set(source().filter(r=>r.outlet+'|||'+r.businessNo===k&&r.month).map(r=>r.month))].sort();}
function history(){
 const cs=events.filter(e=>e.key===selected&&e.entity===entity),last=cs[cs.length-1];
 $('srmHistory').innerHTML=cs.slice(-30).reverse().map(e=>'<div class="srm-event"><strong>'+esc(e.updatedAt)+' · '+esc(e.actor)+' · '+esc(labels[e.status])+'</strong><div>'+esc(e.contactTarget||'')+' · '+esc(e.erpVendor||'')+'</div><div>'+esc(e.detail||'')+'</div><small>다음 조치: '+esc(e.nextAction||'—')+' / 책임자: '+esc(e.owner||'—')+' / 기한: '+esc(e.dueDate||'—')+'</small></div>').join('')||'<p>아직 협의 이력이 없습니다.</p>';
 if(last&&!$('srmForm').dataset.dirty)['reason','erpVendor','contactTarget','nextAction','owner','dueDate','baselineMonth'].forEach(f=>{if(last[f]&&$('srm-'+f))$('srm-'+f).value=last[f];});
}
function open(k,e='대웅제약'){
 if(!k?.includes('|||'))return;const changedCase=selected!==k||entity!==e;selected=k;entity=E.includes(e)?e:E[0];if(changedCase)$('srmForm').dataset.requestId='';
 $('srmForm').reset();$('srmForm').dataset.dirty='';
 $('srmEntity').value=entity;$('srmTitle').textContent=(latest().get(k)?.businessName||k.split('|||')[1])+' · '+k.split('|||')[0];
 const ms=months(k);$('srm-baselineMonth').innerHTML='<option value="">기준월 선택</option>'+ms.map(m=>'<option>'+esc(m)+'</option>').join('');
 const first=ms.find(m=>source().some(r=>r.month===m&&r.outlet+'|||'+r.businessNo===k&&r.statuses?.[entity]==='X'));
 if(first)$('srm-baselineMonth').value=first;
 try{const saved=JSON.parse(localStorage.getItem(draftKey())||'null');if(saved)Object.entries(saved).forEach(([f,v])=>{if($('srm-'+f))$('srm-'+f).value=v;});}catch(_){}
 $('srmEditor').hidden=false;history();$('srmWorkflow').scrollIntoView({behavior:'smooth',block:'start'});if(!ready)void refresh();
}
function draft(){const x={};['status','eventType','reason','erpVendor','contactTarget','detail','nextAction','owner','dueDate','baselineMonth'].forEach(k=>x[k]=$('srm-'+k).value);try{localStorage.setItem(draftKey(),JSON.stringify(x));}catch(_){}return x;}
async function submit(ev){
 ev.preventDefault();if(loading||!selected)return;
 const values=draft(),prior=events.filter(e=>e.key===selected&&e.entity===entity);
 if(!values.detail&&!values.nextAction){show('협의 내용 또는 다음 조치를 입력해 주세요.',true);return;}
 if(values.status==='VERIFIED'){
  const rows=source().filter(r=>r.outlet+'|||'+r.businessNo===selected).sort((a,b)=>String(a.month).localeCompare(String(b.month)));
  const from=rows.find(r=>r.month===values.baselineMonth),to=rows[rows.length-1];
  if(!(from?.statuses?.[entity]==='X'&&to?.statuses?.[entity]==='O'&&to.month>values.baselineMonth)){show('X→O 검증 실패: 기준월 X와 이후 최신월 O를 확인해야 합니다.',true);return;}
 }
 const id=$('srmForm').dataset.requestId||'srm-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
 $('srmForm').dataset.requestId=id;
 loading=true;show('SRM 이력 저장 중...');
 try{const r=await request({...values,type:'srmAppend',scope:isPartner()?'partner':'master',key:selected,entity,requestId:id});
 if(!r?.ok||!r.saved)throw Error(r?.error||'서버 저장을 확인하지 못했습니다.');
 localStorage.removeItem(draftKey());$('srmForm').dataset.requestId='';$('srmForm').dataset.dirty='';$('srm-detail').value='';
 show('SRM 협의/조치 이력 저장 확인 완료');loading=false;await refresh();
 }catch(e){show('서버 저장 실패 · 내용은 이 브라우저에 보관 · '+(e.message||e),true);loading=false;}
}
function mount(){
 if($('srmWorkflow'))return;
 const root=document.createElement('section');root.id='srmWorkflow';root.className='srm-workflow';
root.innerHTML="<div class=\"srm-head\"><div><h2>SRM 실행관리 · 교차 검증 및 ERP 협의</h2><p>거래처별 협의 이력 · 다음 조치 · 완료 결과를 별도로 관리합니다.</p></div><button id=\"srmRefresh\" type=\"button\">최신 이력</button></div>\n<div class=\"srm-metrics\"><div>관리 거래처<b id=\"srmManaged\">—</b></div><div>마스터 입력<b id=\"srmMaster\">—</b></div><div>업체 입력<b id=\"srmPartner\">—</b></div><div>진행중<b id=\"srmOpen\">—</b></div><div>ERP 관련 관리<b id=\"srmErp\">—</b></div><div>기한 초과<b id=\"srmOverdue\">—</b></div><div>조치 완료<b id=\"srmDone\">—</b></div><div>DCM X→O 확인<b id=\"srmVerified\">—</b></div></div>\n<div class=\"srm-head\"><label>업무 현황 <select id=\"srmFilter\"><option value=\"all\">전체</option><option value=\"open\">미완료</option><option value=\"erp\">ERP 협의</option><option value=\"overdue\">기한 초과</option><option value=\"progress\">진행중</option><option value=\"done\">조치 완료</option><option value=\"verified\">DCM X→O 확인</option><option value=\"stopped\">공급 중단 사후분류</option></select></label><span id=\"srmCount\"></span></div>\n<div class=\"srm-table\"><table><thead><tr><th>거래처</th><th>3사 O/X</th><th>입력 근거</th><th>관리 상태</th><th>ERP 업체</th><th>기한</th><th>다음 조치</th></tr></thead><tbody id=\"srmBody\"></tbody></table></div>\n<p id=\"srmSourceNote\" class=\"srm-message\">기존 Action 및 월별 조치 이력 집계</p>\n<p id=\"srmMsg\" class=\"srm-message\">SRM 이력을 불러오려면 최신 이력을 눌러주세요.</p>\n<div id=\"srmEditor\" hidden><div class=\"srm-head\"><h3 id=\"srmTitle\">거래처 협의/조치 이력</h3><button id=\"srmClose\" type=\"button\">닫기</button></div>\n<form id=\"srmForm\" class=\"srm-form\">\n<label>그룹사<select id=\"srmEntity\"><option>대웅제약</option><option>대웅바이오</option><option>한올바이오</option></select></label>\n<label>업무 유형<select id=\"srm-eventType\"><option value=\"CONTACT\">협의 기록</option><option value=\"CASE_UPDATE\">조치 진행</option><option value=\"VERIFICATION\">연동 검증</option></select></label>\n<label>진행상태<select id=\"srm-status\"><option value=\"OPEN\">확인 요청</option><option value=\"CHECKING\">원인 확인</option><option value=\"ERP_WAIT\">ERP 업체 협의</option><option value=\"IN_PROGRESS\">조치 진행</option><option value=\"DONE\">조치 완료·검증 대기</option><option value=\"VERIFIED\">X→O 검증 완료</option><option value=\"REOPENED\">재확인 필요</option></select></label>\n<label>원인<select id=\"srm-reason\"><option value=\"\">미확인</option><option value=\"01\">01 ERP/시스템 미구축</option><option value=\"02\">02 도입 품목 미연동</option><option value=\"03\">03 전산/데이터 오류</option><option value=\"04\">04 거래처 미협조</option><option value=\"05\">05 도매몰 미연동</option><option value=\"06\">06 신규 연동 예정</option><option value=\"07\">07 당월 매출 미발생</option></select></label>\n<label>협의 대상<select id=\"srm-contactTarget\"><option value=\"\">선택</option><option>유통협력사</option><option>도도매 거래처</option><option>ERP 업체</option><option>공동 협의</option></select></label>\n<label>ERP 업체명<input id=\"srm-erpVendor\" maxlength=\"100\" placeholder=\"업체명\"></label>\n<label>실행 담당자<input id=\"srm-owner\" maxlength=\"100\" placeholder=\"담당자명\"></label>\n<label>완료 예정일<input id=\"srm-dueDate\" type=\"date\"></label>\n<label>검증 기준월<select id=\"srm-baselineMonth\"><option value=\"\">기준월 선택</option></select></label>\n<label class=\"wide\">협의·확인 내용<textarea id=\"srm-detail\" rows=\"3\" maxlength=\"1000\" placeholder=\"누구와 어떤 사항을 확인했는지\"></textarea></label>\n<label class=\"wide\">다음 실행사항<textarea id=\"srm-nextAction\" rows=\"2\" maxlength=\"1000\" placeholder=\"책임자별 다음 조치\"></textarea></label>\n<button class=\"srm-primary\" type=\"submit\">협의/조치 이력 저장</button>\n<p class=\"srm-help\">조치 완료와 실제 연동 X→O 검증은 별도입니다. 연동 검증 완료 선택 시 기준월 X와 최신월 O를 서버에서 확인합니다.</p></form>\n<div class=\"srm-history\"><strong>변경·협의 이력</strong><div id=\"srmHistory\"></div></div></div>";;
 root.querySelector('.srm-metrics').insertAdjacentHTML('beforeend','<div>원인 판단 불일치<b id="srmDisputes">—</b></div>');
 root.querySelector('#srmFilter').insertAdjacentHTML('beforeend','<option value="dispute">마스터·파트너 원인 불일치</option>');
 const target=isPartner()?$('action'):$('ctActionBody')?.closest('section');
 const host=target?.parentNode||document.querySelector('main.wrap')||document.body;
 if(target&&target.parentNode)host.insertBefore(root,target.nextSibling);else host.appendChild(root);
 const st=document.createElement('style');
st.textContent=".srm-workflow{background:#fff;border:1px solid #d5e2ef;border-radius:13px;padding:16px;margin:16px 0;color:#243f61;scroll-margin-top:18px}.srm-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 12px}.srm-head h2{font-size:17px;margin:0}.srm-head h3{font-size:15px}.srm-head p{font-size:11px;margin:5px 0;color:#789}.srm-workflow button{cursor:pointer;border:1px solid #bad1ea;background:#f1f7ff;border-radius:7px;padding:7px 10px;font-weight:800;color:#1765a9}.srm-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:12px 0}.srm-metrics>div{background:#f1f6fc;padding:12px;border-radius:9px;font-size:10px}.srm-metrics b{display:block;font-size:24px;color:#155d9f;margin-top:6px}.srm-table{overflow:auto;max-height:320px}.srm-table table{width:100%;min-width:830px;border-collapse:collapse;font-size:11px}.srm-table th{background:#edf3fb;position:sticky;top:0}.srm-table th,.srm-table td{padding:9px;border-bottom:1px solid #e3ebf4;text-align:left}.srm-message{font-size:11px;color:#476f9a}.srm-error{color:#c43732}.srm-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border-top:1px solid #e5eaf2;padding-top:12px}.srm-form label{font-size:11px;font-weight:700;color:#4b6684}.srm-form select,.srm-form input,.srm-form textarea{display:block;margin-top:4px;width:100%;padding:8px;border:1px solid #cfdfee;border-radius:6px;font:inherit;background:#fff}.srm-form .wide{grid-column:1/-1}.srm-form .srm-primary{background:#1769cb;color:white;border-color:#1769cb}.srm-help{grid-column:1/-1;font-size:10px;color:#657f96}.srm-history{margin-top:12px;padding:12px;border:1px solid #e0eafa;border-radius:8px;max-height:300px;overflow:auto;font-size:11px}.srm-event{padding:10px 0;border-bottom:1px solid #e5ebf3;line-height:1.7}.srm-event strong{display:block;color:#1769ac}.srm-late{color:#c73532;font-weight:800}.srm-link{background:none!important;border:0!important;text-decoration:underline;text-align:left;color:#146ac0!important;padding:0!important}.srm-launch{border:1px solid #bfd7ef!important;background:#eaf4ff!important;color:#155fb5!important;border-radius:6px!important;font-size:10px!important;padding:4px 7px!important;margin-left:6px!important}.srm-case-status{font-weight:900}.srm-ox-o{color:#16804c}.srm-ox-x{color:#c63735}@media(max-width:900px){.srm-metrics{grid-template-columns:repeat(2,1fr)}.srm-form{grid-template-columns:repeat(2,minmax(0,1fr))}}";;
 st.textContent += "\n/* SRM responsive containment: no page-level horizontal overflow at 100% browser zoom. */\n.srm-workflow,\n.srm-workflow #srmEditor,\n.srm-workflow .srm-head,\n.srm-workflow .srm-table,\n.srm-workflow .srm-history,\n.srm-workflow .srm-form,\n.srm-workflow .srm-metrics {\n  box-sizing:border-box;\n  max-width:100%;\n  min-width:0;\n}\n.srm-workflow {\n  width:100%;\n  grid-column:1 / -1;\n  margin:16px 0;\n  overflow-wrap:anywhere;\n}\n.srm-workflow .srm-head {\n  flex-wrap:wrap;\n}\n.srm-workflow .srm-head > * {\n  min-width:0;\n  max-width:100%;\n}\n.srm-workflow .srm-head h2,\n.srm-workflow .srm-head h3,\n.srm-workflow .srm-event {\n  overflow-wrap:anywhere;\n}\n.srm-workflow .srm-metrics {\n  grid-template-columns:repeat(auto-fit,minmax(min(100%,155px),1fr));\n}\n.srm-workflow .srm-metrics > div {\n  min-width:0;\n}\n.srm-workflow .srm-form {\n  grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));\n  align-items:start;\n  width:100%;\n}\n.srm-workflow .srm-form label,\n.srm-workflow .srm-form label.wide,\n.srm-workflow .srm-form .srm-help,\n.srm-workflow .srm-form .srm-primary {\n  min-width:0;\n  max-width:100%;\n}\n.srm-workflow .srm-form input,\n.srm-workflow .srm-form select,\n.srm-workflow .srm-form textarea {\n  box-sizing:border-box;\n  min-width:0;\n  max-width:100%;\n  width:100%;\n}\n.srm-workflow .srm-form label.wide,\n.srm-workflow .srm-form .srm-primary,\n.srm-workflow .srm-form .srm-help {\n  grid-column:1 / -1;\n}\n.srm-workflow .srm-history,\n.srm-workflow #srmHistory {\n  overflow-wrap:anywhere;\n  word-break:break-word;\n}\n.srm-workflow .srm-table {\n  width:100%;\n  max-width:100%;\n  overflow-x:auto;\n  overscroll-behavior-x:contain;\n}\n.srm-workflow .srm-table table {\n  width:100%;\n  min-width:830px;\n}\n@media(max-width:600px) {\n  .srm-workflow {padding:12px;}\n  .srm-workflow .srm-head > button {max-width:100%;}\n  .srm-workflow .srm-form {grid-template-columns:minmax(0,1fr);}\n}\n";
 document.head.appendChild(st);
 $('srmRefresh').onclick=refresh;$('srmFilter').onchange=e=>{filter=e.target.value;render();};
 $('srmClose').onclick=()=>{$('srmEditor').hidden=true;selected='';};
 $('srmEntity').onchange=e=>{const k=selected;open(k,e.target.value);};
 ['month','manager','outlet'].forEach(id=>$(id)?.addEventListener('change',()=>render()));
 window.addEventListener('dcm-action-sync-applied',()=>render());
 window.addEventListener('dcm-action-reasons-updated',()=>render());
 window.addEventListener('dcm-srm-data-changed',()=>render());
  $('srmForm').onsubmit=submit;$('srmForm').addEventListener('input',()=>{$('srmForm').dataset.dirty='1';draft();});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-srm-open]');if(b){e.preventDefault();open(b.dataset.srmOpen,b.dataset.srmEntity||'대웅제약');}});
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.DCMSRM={open,refresh,update:render};
})();