(function(global){
'use strict';
const E=['대웅제약','대웅바이오','한올바이오'];
function normStatus(v){const s=(v==null?'':String(v)).trim().toUpperCase();return s==='O'||s==='X'?s:null;}
function relationKey(r){return `${r.outlet}|||${r.businessNo}`;}
// Absolute counts are unique within each wholesaler/outlet, not globally across wholesalers.
function absoluteKey(r){return relationKey(r);}
function monthSort(a,b){return a.localeCompare(b);}
function filterRecords(data,opts={}){return data.filter(r=>(!opts.month||r.month===opts.month)&&(!opts.manager||opts.manager==='전체'||r.manager===opts.manager)&&(!opts.outlet||opts.outlet==='전체'||r.outlet===opts.outlet));}
function hasSupply(r){return !!r&&E.some(e=>{const s=normStatus(r.statuses?.[e]);return s==='O'||s==='X';});}
function summarize(records){
 let O=0,X=0;const byEntity={};E.forEach(e=>byEntity[e]={O:0,X:0,rate:null});const need=new Set(),supplied=new Set();
 records.forEach(r=>{let hasX=false,hasAny=false;E.forEach(e=>{const s=normStatus(r.statuses?.[e]);if(s==='O'){O++;byEntity[e].O++;hasAny=true;}else if(s==='X'){X++;byEntity[e].X++;hasX=true;hasAny=true;}});if(hasX)need.add(absoluteKey(r));if(hasAny)supplied.add(absoluteKey(r));});
 E.forEach(e=>{const d=byEntity[e].O+byEntity[e].X;byEntity[e].rate=d?byEntity[e].O/d:null;});
 return {O,X,evaluated:O+X,rate:(O+X)?O/(O+X):null,needAbsolute:need.size,suppliedAbsolute:supplied.size,byEntity};
}
function mapByRelation(records){const m=new Map();records.forEach(r=>m.set(relationKey(r),r));return m;}
function emptyStatuses(){return {'대웅제약':null,'대웅바이오':null,'한올바이오':null};}
function compare(prevRecords,currRecords){
 const pm=mapByRelation(prevRecords),cm=mapByRelation(currRecords),keys=new Set([...pm.keys(),...cm.keys()]);
 const xToO=[],oToX=[],newSupply=[],stoppedSupply=[];
 keys.forEach(k=>{
   const p=pm.get(k),c=cm.get(k),ps=p?.statuses||emptyStatuses(),cs=c?.statuses||emptyStatuses(),base=c||p;
   E.forEach(e=>{const a=normStatus(ps[e]),b=normStatus(cs[e]);const common={outlet:base.outlet,manager:base.manager,businessNo:base.businessNo,businessName:c?.businessName||p?.businessName||'',entity:e,prev:a,curr:b};if(a==='X'&&b==='O')xToO.push(common);if(a==='O'&&b==='X')oToX.push(common);});
   const wasSupplied=hasSupply(p),isSupplied=hasSupply(c);
   if(!wasSupplied&&isSupplied){
     newSupply.push({outlet:base.outlet,manager:base.manager,businessNo:base.businessNo,businessName:c?.businessName||p?.businessName||'',entities:E.map(e=>({outlet:base.outlet,entity:e,status:normStatus(cs[e])})).filter(x=>x.status)});
   }
   if(wasSupplied&&!isSupplied){
     stoppedSupply.push({outlet:base.outlet,manager:base.manager,businessNo:base.businessNo,businessName:c?.businessName||p?.businessName||'',entities:E.map(e=>({outlet:base.outlet,entity:e,status:normStatus(ps[e])})).filter(x=>x.status)});
   }
 });
 const sort=(a,b)=>a.outlet.localeCompare(b.outlet,'ko')||a.businessNo.localeCompare(b.businessNo);xToO.sort(sort);oToX.sort(sort);newSupply.sort(sort);stoppedSupply.sort(sort);
 return {xToO,oToX,newSupply,stoppedSupply};
}
function needList(records){return records.filter(r=>E.some(e=>normStatus(r.statuses?.[e])==='X')).map(r=>({...r,xCount:E.filter(e=>normStatus(r.statuses?.[e])==='X').length}));}
global.DCMLogic={E,normStatus,relationKey,absoluteKey,monthSort,filterRecords,summarize,compare,needList};
})(typeof window!=='undefined'?window:globalThis);
