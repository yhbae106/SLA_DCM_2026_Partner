/* SRM management indicators: canonical Action Board inputs plus optional SRM
 * event records. A generated monthly X->O projection is not a human action.
 * "Recorded" never means "completed"; completion requires explicit status.
 */
(function(g){
'use strict';
const EDITABLE=['reasonCode','plan','status'];
const clean=x=>String(x===undefined||x===null?'':x).trim();
const normStatus=value=>{
 const s=clean(value).toUpperCase();
 if(s==='DONE'||s==='완료'||s==='VERIFIED')return s==='VERIFIED'?'VERIFIED':'DONE';
 if(s==='IN_PROGRESS'||s==='진행중'||s==='진행 중')return 'IN_PROGRESS';
 if(['ERP_WAIT','WAITING','회신대기','회신 대기'].includes(s))return 'WAITING';
 if(['CHECKING','OPEN','REOPENED','TODO','미조치','확인 요청','원인 확인'].includes(s))return 'OPEN';
 return '';
};
function meaningful(action){
 if(!action||action.monthlyHistorical||action.retrospective||action.generated)return false;
 if(Array.isArray(action.editedFields)&&!action.editedFields.some(f=>EDITABLE.includes(f)))return false;
 // An explicitly saved TODO choice is still a real input, unlike the default TODO.
 if(Array.isArray(action.editedFields)&&action.editedFields.includes('status')&&normStatus(action.status)==='OPEN')return true;
 return !!(clean(action.reasonCode)||clean(action.plan)||
  ['IN_PROGRESS','WAITING','DONE','VERIFIED'].includes(normStatus(action.status)));
}
const keyFor=x=>clean(x?.key)||[clean(x?.outlet),clean(x?.businessNo)].join('|||');
const isDone=x=>x==='DONE'||x==='VERIFIED';
function build({actions=[],history=[],events=[],month='',latestMonth='',viewRows=null}={}){
 const selected=clean(month),latest=clean(latestMonth)||selected,showLive=selected===latest;
 const map=new Map();
 const make=(key,origin,base)=>{
  const [outlet,businessNo]=key.split('|||');
  return {key,outlet,businessNo,businessName:clean(base?.businessName)||businessNo,
   source:origin,masterAction:{},partnerAction:{},masterFilled:false,partnerFilled:false,
   events:[],month:selected,entity:'대웅제약',erpVendor:'',retrospective:false};
 };
 if(showLive)for(const action of actions||[]){
  const key=keyFor(action);
  if(!key.includes('|||')||action?.monthlyHistorical||action?.retrospective)continue;
  const m=action.masterAction||action,p=action.partnerAction||{};
  if(!meaningful(m)&&!meaningful(p))continue;
  const entry=make(key,'live',action);
  entry.masterAction={reasonCode:clean(m.reasonCode),plan:clean(m.plan),status:clean(m.status)};
  entry.partnerAction={reasonCode:clean(p.reasonCode),plan:clean(p.plan),status:clean(p.status)};
  entry.masterFilled=meaningful(m);entry.partnerFilled=meaningful(p);
  map.set(key,entry);
 }
 for(const h of history||[]){
  if(!h||clean(h.month)!==selected)continue;
  const key=keyFor(h);if(!key.includes('|||'))continue;
  let entry=map.get(key);
  if(!entry){entry=make(key,'monthly',h);map.set(key,entry);}
  entry.retrospective=true;
  entry.historyType=clean(h.type)||'X2O';
  // This signals a measured status transition, not completed negotiations.
  entry.dataImproved=entry.historyType!=='SUPPLY_STOP'&&
   [h.masterAction,h.partnerAction].some(a=>normStatus(a?.status)==='DONE');
  entry.oxSnapshot=selected===h.sourceMonth?clean(h.startOx):clean(h.endOx);
  entry.entity=(h.entities||[])[0]||entry.entity;
  // Bulk-filled values are proposals on screen, not proven interventions.
  entry.bulkMasterFilled=Boolean(clean(h.masterAction?.reasonCode)||clean(h.masterAction?.plan)||
   ['IN_PROGRESS','WAITING','DONE'].includes(normStatus(h.masterAction?.status)));
  entry.bulkPartnerFilled=Boolean(clean(h.partnerAction?.reasonCode)||clean(h.partnerAction?.plan)||
   ['IN_PROGRESS','WAITING','DONE'].includes(normStatus(h.partnerAction?.status)));
  entry.bulkFilled=entry.bulkMasterFilled||entry.bulkPartnerFilled;
  entry.bulkPlan=clean(h.partnerAction?.plan)||clean(h.masterAction?.plan);
  entry.bulkMasterStatus=normStatus(h.masterAction?.status);
  entry.bulkPartnerStatus=normStatus(h.partnerAction?.status);
 }
 // The server stores one Action per merchant (not per month). An older month
 // can show the merchant's current saved edits, without misdating the edit.
 if(!showLive)for(const a of actions||[]){
  const entry=map.get(keyFor(a));
  if(!entry||!entry.retrospective||a?.generated||a?.monthlyHistorical)continue;
  const m=a.masterAction||a,p=a.partnerAction||{};
  if(!meaningful(m)&&!meaningful(p))continue;
  entry.masterAction={reasonCode:clean(m.reasonCode),plan:clean(m.plan),status:clean(m.status)};
  entry.partnerAction={reasonCode:clean(p.reasonCode),plan:clean(p.plan),status:clean(p.status)};
  entry.masterFilled=meaningful(m);entry.partnerFilled=meaningful(p);
  entry.partnerSavedStatus=Array.isArray(p.editedFields)&&p.editedFields.includes('status')?
   normStatus(p.status):null;
  entry.currentSavedValues=true;
 }
 if(showLive)for(const e of events||[]){
  const key=keyFor(e);if(!key.includes('|||'))continue;
  let entry=map.get(key);
  if(!entry){entry=make(key,'srm',e);map.set(key,entry);}
  entry.events.push(e);
  if(clean(e.erpVendor))entry.erpVendor=clean(e.erpVendor);
  if(clean(e.entity))entry.entity=clean(e.entity);
 }
 // The Action Board itself owns the month/outlet/manager scope and determines
 // exactly which values are visibly "진행중" / "완료". Reuse that projection
 // rather than assuming only server-authenticated edits are visible.
 const view=Array.isArray(viewRows)?new Map(viewRows.filter(x=>x?.key).map(x=>[clean(x.key),x])):null;
 const records=[...map.values()].filter(r=>!view||view.has(r.key));
 const stats={total:records.length,recorded:0,actualRecorded:0,bulkOnly:0,unrecorded:0,master:0,partner:0,
  needsAction:0,progress:0,done:0,displayProgress:0,displayDone:0,projectedProgress:0,projectedDone:0,
  erp:0,verified:0,dispute:0,srm:0,stopped:0,retrospective:0};
 for(const r of records){
  const m=r.masterAction||{},p=r.partnerAction||{},ev=r.events||[];
  const lastEvent=ev[ev.length-1]||{},eventStatus=normStatus(lastEvent.status);
  if(r.masterFilled)stats.master++;
  if(r.partnerFilled)stats.partner++;
  if(r.retrospective)stats.retrospective++;
  if(ev.length)stats.srm++;
  r.actualRecorded=Boolean(r.masterFilled||r.partnerFilled||ev.length>0);
  r.bulkOnly=Boolean(r.bulkFilled&&!r.actualRecorded);
  // Include the requested bulk notes in "recorded" but identify them distinctly.
  r.recorded=Boolean(r.actualRecorded||r.bulkFilled);
  if(r.recorded)stats.recorded++;else stats.unrecorded++;
  if(r.actualRecorded)stats.actualRecorded++;
  if(r.bulkOnly)stats.bulkOnly++;
  // The ordinary management view uses the same Master / Partner columns
  // regardless of whether they were initially populated in bulk or one by one.
  // Provenance remains available internally via bulkFilled / actualRecorded.
  r.recordSource=[
   r.bulkMasterFilled||r.masterFilled?'마스터 입력':'',
   r.bulkPartnerFilled||r.partnerFilled?'업체 입력':'',
   ev.length?'추가 협의':''
  ].filter(Boolean).join(' · ')||'입력 없음';
  const states=[];
  if(r.masterFilled){const x=normStatus(m.status);if(x&&x!=='OPEN')states.push(x);}
  if(r.partnerFilled){const x=normStatus(p.status);if(x&&x!=='OPEN')states.push(x);}
  if(ev.length&&eventStatus&&eventStatus!=='OPEN')states.push(eventStatus);
  r.verified=!!r.dataImproved||ev.some(e=>normStatus(e.status)==='VERIFIED');
  r.done=states.length>0&&states.every(isDone);
  r.progress=!r.done&&states.some(s=>s==='IN_PROGRESS'||s==='WAITING');
  // Outcome dimension is an exhaustive and exclusive pair.
  r.needsAction=!r.verified;
  const shown=view?.get(r.key);
  const masterState=shown?normStatus(shown.masterStatus):
   r.retrospective?r.bulkMasterStatus:normStatus(m.status);
  const partnerState=shown?normStatus(shown.partnerStatus):
   r.retrospective?(r.partnerSavedStatus??r.bulkPartnerStatus):normStatus(p.status);
  r.boardStates={master:masterState,partner:partnerState};
  // No double counting: each merchant is one status case even if BOTH
  // visible columns are "진행중". Real SRM logs may supplement the board.
  r.displayProgress=[masterState,partnerState].some(v=>v==='IN_PROGRESS'||v==='WAITING')||
   (ev.length>0&&r.progress);
  r.displayDone=!r.displayProgress&&(
   [masterState,partnerState].some(isDone)||(ev.length>0&&r.done));
  // Management dimension is the complementary pair: every case is
  // "진행중" until a board-visible completion, otherwise "완료".
  r.displayProgress=!r.displayDone;
  r.status=r.displayDone?'DONE':'IN_PROGRESS';
  r.statusLabel=r.displayDone?'완료':'진행중';
  r.erpRelated=ev.some(e=>!!clean(e.erpVendor)||/ERP/i.test(clean(e.contactTarget))||e.status==='ERP_WAIT');
  r.erpVendor=clean(r.erpVendor)||clean(lastEvent.erpVendor);
  r.dispute=r.masterFilled&&r.partnerFilled&&!!clean(m.reasonCode)&&!!clean(p.reasonCode)&&
   clean(m.reasonCode).slice(0,2)!==clean(p.reasonCode).slice(0,2);
  r.stop=r.historyType==='SUPPLY_STOP';
  const masterPlan=r.masterFilled?clean(m.plan):'',partnerPlan=r.partnerFilled?clean(p.plan):'';
  const plan=masterPlan&&partnerPlan&&masterPlan!==partnerPlan?
   '마스터: '+masterPlan+' / 업체: '+partnerPlan:partnerPlan||masterPlan;
  r.nextAction=clean(lastEvent.nextAction)||plan||
   (r.bulkFilled?clean(r.bulkPlan):'')||
   (r.needsAction&&r.recorded?'진행사항 확인':'—');
  if(r.needsAction)stats.needsAction++;
  if(r.progress)stats.progress++;
  if(r.done)stats.done++;
  if(r.displayProgress)stats.displayProgress++;
  if(r.displayDone)stats.displayDone++;
  if(r.displayProgress&&!r.progress)stats.projectedProgress++;
  if(r.displayDone&&!r.done)stats.projectedDone++;
  if(r.erpRelated)stats.erp++;
  if(r.verified)stats.verified++;
  if(r.dispute)stats.dispute++;
  if(r.stop)stats.stopped++;
 }
 records.sort((a,b)=>Number(b.needsAction)-Number(a.needsAction)||
  Number(b.recorded)-Number(a.recorded)||String(a.businessName).localeCompare(String(b.businessName),'ko'));
 return {stats,records,month:selected,latestMonth:latest,hasData:records.length>0};
}
g.DCMSRMAggregate=Object.freeze({build,meaningful,normStatus});
})(typeof window!=='undefined'?window:globalThis);
