/* SRM monthly X-to-O historical action projection.
 * No merchant names or identifiers are embedded here. This module derives
 * month-specific read-only actions exclusively from data already loaded by
 * the authenticated master/partner dashboard. Original Action Board unchanged.
 * Retrospective classification is not evidence of contemporaneous communication.
 */
(function(g){
 'use strict';
 const E=['대웅제약','대웅바이오','한올바이오'];
 const PERIODS=[['2026-06','2026-07'],['2026-07','2026-08'],['2026-08','2026-09']];
 const MASTER_PLAN='ERP업체 소통하여 정상 연동 조치';
 const PARTNER_PLAN='거래처 요청 및 대웅 협조';
 let byMonthKey=new Map(),records=[];
 const norm=x=>String(x||'').trim().toUpperCase();
 const id=r=>String(r.outlet||'')+'|||'+String(r.businessNo||'');
 const monthEnd=m=>{
  const [y,month]=m.split('-').map(Number);
  return m+'-'+String(new Date(Date.UTC(y,month,0)).getUTCDate()).padStart(2,'0');
 };
 function refresh(rows){
  const byMonth=new Map(),result=[],index=new Map();
  for(const r of Array.isArray(rows)?rows:[]){
   if(!r||!PERIODS.some(p=>p.includes(r.month))||!r.outlet||!r.businessNo)continue;
   if(!byMonth.has(r.month))byMonth.set(r.month,new Map());
   const key=id(r);
   if(byMonth.get(r.month).has(key))throw new Error('월별 DCM 거래처 키 중복: '+r.month+' / '+key);
   byMonth.get(r.month).set(key,r);
  }
  for(const [start,end] of PERIODS){
   for(const [key,from] of byMonth.get(start)||[]){
    const to=byMonth.get(end)?.get(key);
    if(!to)continue;
    const prev=E.map(e=>norm(from.statuses?.[e]));
    const next=E.map(e=>norm(to.statuses?.[e]));
    // Each selling/evaluated entity must have X in the start month and O
    // in the subsequent month; unassessed entities must remain unassessed.
    if(!prev.some(s=>s==='X')||
       !prev.every((s,i)=>s==='X'||(!s&&!next[i]))||
       !prev.every((s,i)=>s!=='X'||next[i]==='O'))continue;
    const sellingEntities=E.filter((e,i)=>prev[i]==='X');
    for(const [month,status] of [[start,'IN_PROGRESS'],[end,'DONE']]){
     const mKey=month+'|||'+key;
     if(index.has(mKey))throw new Error('월별 SRM 조치 중복: '+mKey);
     const entry={
      month,sourceMonth:start,nextMonth:end,key,outlet:from.outlet,
      businessNo:String(from.businessNo),businessName:from.businessName||'',
      entities:sellingEntities,retrospective:true,
      startOx:prev.map(s=>s||'—').join('/'),
      endOx:next.map(s=>s||'—').join('/'),
      masterAction:{reasonCode:'06',plan:MASTER_PLAN,dueDate:monthEnd(month),status},
      partnerAction:{reasonCode:'06',plan:PARTNER_PLAN,dueDate:monthEnd(month),status,
       editedFields:['reasonCode','plan','dueDate','status']}
     };
     index.set(mKey,entry);result.push(entry);
    }
   }
  }
  byMonthKey=index;records=result;
  return result.length;
 }
 g.DCM_MONTHLY_ACTION_HISTORY=Object.freeze({
  refresh,get:(month,key)=>byMonthKey.get(String(month)+'|||'+String(key))||null,
  forMonth:month=>records.filter(r=>r.month===month),
  clear:()=>{records=[];byMonthKey=new Map();},
  count:()=>records.length,
  rulesVersion:'2026-10-14'
 });
})(typeof window!=='undefined'?window:globalThis);
