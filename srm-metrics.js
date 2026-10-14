/* SRM KPI projection over existing Action Board, monthly retrospective actions and SRM Events.
 * Read-only, does not mutate or publish enterprise merchant data.
 * A plan containing "ERP" is not proof of an ERP-vendor conversation.
 */
(function(g){
'use strict';
const S=['reasonCode','plan','dueDate','status'];
const clean=x=>String(x==null?'':x).trim();
const normStatus=s=>{const v=clean(s).toUpperCase();
 if(['DONE','완료'].includes(v))return 'DONE';
 if(['VERIFIED'].includes(v))return 'VERIFIED';
 if(['IN_PROGRESS','진행중','진행 중'].includes(v))return 'IN_PROGRESS';
 if(['ERP_WAIT','WAITING','회신대기','회신 대기'].includes(v))return 'WAITING';
 if(['CHECKING','OPEN','REOPENED','TODO','미조치','확인 요청','원인 확인'].includes(v))return 'OPEN';
 return '';
};
const meaningful=a=>!!a&&S.some(f=>f==='status'?['IN_PROGRESS','WAITING','DONE','VERIFIED'].includes(normStatus(a[f])):!!clean(a[f]));
const monthEnd=m=>/^\d{4}-\d{2}$/.test(m)?m+'-'+String(new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5)),0)).getUTCDate()).padStart(2,'0'):'';
const sourceLabel={live:'기존 Action',monthly:'월별 조치 이력',srm:'SRM 협의'};
function build({actions=[],history=[],events=[],month='',latestMonth='',today=''}={}){
 const selected=clean(month),latest=clean(latestMonth)||selected,showLive=selected===latest;
 const map=new Map(),keyFor=e=>clean(e.key)||[clean(e.outlet),clean(e.businessNo)].join('|||');
 function make(key,src,base){
  const [outlet,businessNo]=key.split('|||');
  return {key,outlet,businessNo,businessName:clean(base.businessName)||clean(base.outlet)||businessNo,
    source:src,masterAction:{},partnerAction:{},events:[],month:selected,entity:'대웅제약',erpVendor:''};
 }
 if(showLive)for(const a of actions||[]){
  const key=keyFor(a);if(!key.includes('|||'))continue;
  const m=a.masterAction||a,p=a.partnerAction||{};
  const owner=meaningful(m),vendor=meaningful(p);
  if(!owner&&!vendor)continue;
  const entry=make(key,'live',a);
  entry.masterAction={reasonCode:clean(m.reasonCode),plan:clean(m.plan),dueDate:clean(m.dueDate),status:clean(m.status)};
  entry.partnerAction={reasonCode:clean(p.reasonCode),plan:clean(p.plan),dueDate:clean(p.dueDate),status:clean(p.status)};
  entry.masterFilled=owner;entry.partnerFilled=vendor;
  map.set(key,entry);
 }
 for(const h of history||[]){
  if(!h||h.month!==selected)continue;
  const key=keyFor(h);if(!key.includes('|||'))continue;
  const entry=make(key,'monthly',h);
  entry.masterAction={...h.masterAction};
  entry.partnerAction={...h.partnerAction};
  entry.masterFilled=meaningful(entry.masterAction);
  entry.partnerFilled=meaningful(entry.partnerAction);
  entry.historyType=clean(h.type)||'X2O';
  entry.retrospective=true;
  entry.entity=(h.entities||[])[0]||'대웅제약';
  map.set(key,entry); // Historical selected-month snapshot has precedence over timeless live Action.
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
 const stats={total:records.length,master:0,partner:0,progress:0,done:0,erp:0,overdue:0,verified:0,dispute:0,srm:0,stopped:0};
 const compareDay=showLive?(today||new Date().toISOString().slice(0,10)):monthEnd(selected);
 for(const r of records){
  const m=r.masterAction||{},p=r.partnerAction||{},ev=r.events||[];
  if(r.masterFilled)stats.master++;
  if(r.partnerFilled)stats.partner++;
  if(ev.length)stats.srm++;
  const latestEvent=ev[ev.length-1]||{};
  const s=[normStatus(m.status),normStatus(p.status)].filter(Boolean);
  const eventStatus=normStatus(latestEvent.status);
  r.verified=(r.source==='monthly'&&r.historyType!=='SUPPLY_STOP'&&s.includes('DONE'))||ev.some(e=>normStatus(e.status)==='VERIFIED');
  r.done=r.verified||!!(s.length&&s.every(t=>t==='DONE'||t==='VERIFIED'))||(s.length===0&&eventStatus==='DONE');
  r.progress=!r.done&&(s.some(t=>t==='IN_PROGRESS'||t==='WAITING')||['IN_PROGRESS','WAITING'].includes(eventStatus));
  r.status=r.verified?'VERIFIED':r.done?'DONE':r.progress?'IN_PROGRESS':'OPEN';
  r.statusLabel=r.verified?'X→O 개선 확인':r.done?'조치 완료':r.progress?'진행중':'원인·조치 확인';
  r.dueDate=clean(p.dueDate)||clean(m.dueDate)||clean(latestEvent.dueDate);
  r.erpRelated=[m.reasonCode,p.reasonCode].some(x=>['01','03'].includes(clean(x).slice(0,2)))||
    [m.plan,p.plan,latestEvent.erpVendor,latestEvent.contactTarget].some(x=>/ERP|전산|시스템/i.test(clean(x)))||
    clean(latestEvent.status)==='ERP_WAIT';
  r.dispute=!!(clean(m.reasonCode)&&clean(p.reasonCode)&&clean(m.reasonCode).slice(0,2)!==clean(p.reasonCode).slice(0,2));
  r.stop=r.historyType==='SUPPLY_STOP';
  r.nextAction=clean(p.plan)||clean(m.plan)||clean(latestEvent.nextAction)||clean(latestEvent.detail);
  r.erpVendor=clean(r.erpVendor)||clean(latestEvent.erpVendor);
  r.overdue=!r.done&&!!r.dueDate&&!!compareDay&&r.dueDate<compareDay;
  if(r.progress)stats.progress++;
  if(r.done)stats.done++;
  if(r.erpRelated)stats.erp++;
  if(r.overdue)stats.overdue++;
  if(r.verified)stats.verified++;
  if(r.dispute)stats.dispute++;
  if(r.stop)stats.stopped++;
 }
 records.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||
   Number(a.done)-Number(b.done)||
   String(a.businessName).localeCompare(String(b.businessName),'ko'));
 return {stats,records,month:selected,latestMonth:latest,hasData:records.length>0};
}
g.DCMSRMAggregate=Object.freeze({build,meaningful,normStatus,monthEnd});
})(typeof window!=='undefined'?window:globalThis);
