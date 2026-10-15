/* SRM overview. Distinguish automatically inferred month-end classifications
 * from actual Action edits and recorded SRM consultations. Never treat a DCM
 * status transition as evidence of an ERP discussion or a completed task.
 */
(function(g){
'use strict';
const FIELDS=['reasonCode','plan','status'];
const clean=x=>String(x==null?'':x).trim();
const normStatus=s=>{
 const v=clean(s).toUpperCase();
 if(v==='DONE'||v==='완료')return 'DONE';
 if(v==='VERIFIED')return 'VERIFIED';
 if(v==='IN_PROGRESS'||v==='진행중'||v==='진행 중')return 'IN_PROGRESS';
 if(['ERP_WAIT','WAITING','회신대기','회신 대기'].includes(v))return 'WAITING';
 if(['CHECKING','OPEN','REOPENED','TODO','미조치','확인 요청','원인 확인'].includes(v))return 'OPEN';
 return '';
};
const meaningful=a=>!!a&&FIELDS.some(f=>f==='status'?
 ['IN_PROGRESS','WAITING','DONE','VERIFIED'].includes(normStatus(a[f])):!!clean(a[f]));
function build({actions=[],history=[],events=[],month='',latestMonth=''}={}){
 const selected=clean(month),latest=clean(latestMonth)||selected,showLive=selected===latest;
 const map=new Map(),keyFor=e=>clean(e.key)||[clean(e.outlet),clean(e.businessNo)].join('|||');
 function make(key,src,base){
  const [outlet,businessNo]=key.split('|||');
  return {key,outlet,businessNo,businessName:clean(base.businessName)||clean(base.outlet)||businessNo,
    source:src,masterAction:{},partnerAction:{},masterFilled:false,partnerFilled:false,
    events:[],month:selected,entity:'대웅제약',erpVendor:'',retrospective:false};
 }
 if(showLive)for(const a of actions||[]){
  const key=keyFor(a);if(!key.includes('|||'))continue;
  const m=a.masterAction||a,p=a.partnerAction||{},master=meaningful(m),partner=meaningful(p);
  if(!master&&!partner)continue;
  const entry=make(key,'live',a);
  entry.masterAction={reasonCode:clean(m.reasonCode),plan:clean(m.plan),status:clean(m.status)};
  entry.partnerAction={reasonCode:clean(p.reasonCode),plan:clean(p.plan),status:clean(p.status)};
  entry.masterFilled=master;entry.partnerFilled=partner;
  map.set(key,entry);
 }
 for(const h of history||[]){
  if(!h||h.month!==selected)continue;
  const key=keyFor(h);if(!key.includes('|||'))continue;
  let entry=map.get(key);
  if(!entry){entry=make(key,'monthly',h);map.set(key,entry);}
  entry.retrospective=true;
  entry.historyType=clean(h.type)||'X2O';
  entry.dataImproved=entry.historyType!=='SUPPLY_STOP'&&
   [h.masterAction,h.partnerAction].some(a=>normStatus(a?.status)==='DONE');
  entry.oxSnapshot=selected===h.sourceMonth?clean(h.startOx):clean(h.endOx);
  entry.entity=(h.entities||[])[0]||entry.entity;
  /* Keep true live actions if present; generated master/partner plans are not input. */
 }
 if(showLive)for(const e of events||[]){
  const key=keyFor(e);if(!key.includes('|||'))continue;
  let entry=map.get(key);
  if(!entry){entry=make(key,'srm',e);map.set(key,entry);}
  entry.events.push(e);
  if(clean(e.erpVendor))entry.erpVendor=clean(e.erpVendor);
  if(clean(e.entity))entry.entity=clean(e.entity);
 }
 const records=[...map.values()];
 const stats={total:records.length,master:0,partner:0,needsAction:0,progress:0,
  done:0,erp:0,verified:0,dispute:0,srm:0,stopped:0,retrospective:0};
 for(const r of records){
  const m=r.masterAction||{},p=r.partnerAction||{},ev=r.events||[];
  if(r.masterFilled)stats.master++;
  if(r.partnerFilled)stats.partner++;
  if(r.retrospective)stats.retrospective++;
  if(ev.length)stats.srm++;
  const latestEvent=ev[ev.length-1]||{};
  const s=r.source==='live'?[normStatus(m.status),normStatus(p.status)].filter(Boolean):[];
  const eventStatus=normStatus(latestEvent.status);
  r.verified=!!r.dataImproved||ev.some(e=>normStatus(e.status)==='VERIFIED');
  /* Completion is only a saved Action state or a real SRM event, never a synthetic status. */
  r.done=!!(s.length&&s.every(t=>t==='DONE'||t==='VERIFIED'))||
    (ev.length>0&&['DONE','VERIFIED'].includes(eventStatus));
  r.progress=!r.done&&(s.some(t=>t==='IN_PROGRESS'||t==='WAITING')||
    (ev.length>0&&['IN_PROGRESS','WAITING'].includes(eventStatus)));
  r.needsAction=!r.done&&!r.verified;
  r.status=r.done?'DONE':r.verified?'VERIFIED':r.progress?'IN_PROGRESS':'OPEN';
  r.statusLabel=r.done?'조치 완료':r.verified?'DCM X→O 개선 확인':
   r.progress?'조치 진행':r.retrospective?'사후분류 · 확인 필요':'확인·조치 필요';
  r.erpRelated=ev.some(e=>!!clean(e.erpVendor)||
   /ERP/i.test(clean(e.contactTarget))||clean(e.status)==='ERP_WAIT');
  r.erpVendor=clean(r.erpVendor)||clean(latestEvent.erpVendor);
  r.dispute=r.source==='live'&&!!(clean(m.reasonCode)&&clean(p.reasonCode)&&
   clean(m.reasonCode).slice(0,2)!==clean(p.reasonCode).slice(0,2));
  r.stop=r.historyType==='SUPPLY_STOP';
  r.nextAction=clean(latestEvent.nextAction)||
   (r.source==='live'?(clean(p.plan)||clean(m.plan)):'')||
   (r.needsAction?'조치 근거 확인 필요':'—');
  if(r.needsAction)stats.needsAction++;
  if(r.progress)stats.progress++;
  if(r.done)stats.done++;
  if(r.erpRelated)stats.erp++;
  if(r.verified)stats.verified++;
  if(r.dispute)stats.dispute++;
  if(r.stop)stats.stopped++;
 }
 records.sort((a,b)=>Number(b.needsAction)-Number(a.needsAction)||
   Number(b.progress)-Number(a.progress)||
   String(a.businessName).localeCompare(String(b.businessName),'ko'));
 return {stats,records,month:selected,latestMonth:latest,hasData:records.length>0};
}
g.DCMSRMAggregate=Object.freeze({build,meaningful,normStatus});
})(typeof window!=='undefined'?window:globalThis);
