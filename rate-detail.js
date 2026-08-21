(()=>{
'use strict';
function updateRateDetail(){
  const rate=document.getElementById('rate');
  const cards=[...document.querySelectorAll('#entityCards .entity small')];
  if(!rate||!cards.length)return;
  let o=0,x=0,found=false;
  cards.forEach(el=>{
    const text=el.textContent||'';
    const om=text.match(/O\s*([\d,]+)/i);
    const xm=text.match(/X\s*([\d,]+)/i);
    if(om){o+=Number(om[1].replace(/,/g,''));found=true;}
    if(xm)x+=Number(xm[1].replace(/,/g,''));
  });
  const small=rate.closest('.kpi')?.querySelector('small');
  if(!small)return;
  small.textContent=found?`O ${o.toLocaleString()} / O+X ${(o+x).toLocaleString()}`:'O - / O+X -';
}
function start(){
  updateRateDetail();
  const box=document.getElementById('entityCards');
  if(box)new MutationObserver(updateRateDetail).observe(box,{childList:true,subtree:true,characterData:true});
  ['month','outlet'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(updateRateDetail,30)));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
