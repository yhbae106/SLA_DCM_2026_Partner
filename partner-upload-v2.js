(()=>{
'use strict';
const E=['대웅제약','대웅바이오','한올바이오'];
const $=id=>document.getElementById(id);
const norm=v=>window.DCMLogic?.normStatus?window.DCMLogic.normStatus(v):String(v??'').trim().toUpperCase();
function bizNo(v){if(v==null)return '';const s=String(v).trim();return s.replace(/\.0$/,'').replace(/\D/g,'')||s;}
function entityName(v){const s=String(v??'').replace(/\s/g,'');if(s.includes('한올'))return '한올바이오';if(s.includes('대웅바이오'))return '대웅바이오';if(s.includes('대웅제약'))return '대웅제약';return null;}
function outletName(v){const s=String(v??'').trim();if(!s)return '';if(s.includes('원주'))return '백제약품 원주';if(s.includes('영남'))return '백제약품 영남';if(s.includes('대전'))return '백제약품 대전';if(s.includes('영등포'))return '백제약품 영등포';if(s.includes('인천'))return '인천약품';if(s.includes('복산'))return '복산나이스';if(s.includes('유진'))return '유진약품';if(s.includes('아이팜')||s.includes('동보약품'))return '아이팜코리아';return s;}
function partnerFromOutlet(v){const s=String(v||'');if(s.includes('백제'))return '백제약품';if(s.includes('인천'))return '인천약품';if(s.includes('복산'))return '복산나이스';if(s.includes('유진'))return '유진약품';if(s.includes('아이팜')||s.includes('동보'))return '아이팜코리아';return s||'미확인 업체';}
function fileYear(name){const s=String(name??'');let m=s.match(/(?:^|\D)(20\d{2})[-_. ]?(\d{1,2})(?:\D|$)/);if(m)return Number(m[1]);m=s.match(/(?:^|\D)(\d{2})(\d{2})(?:\D|$)/);if(m)return 2000+Number(m[1]);return new Date().getFullYear();}
function monthFromText(v,y){const s=String(v??'');let m=s.match(/(20\d{2})[-./년\s]*(\d{1,2})(?:월|\D|$)/);if(m){const mm=Number(m[2]);if(mm>=1&&mm<=12)return `${m[1]}-${String(mm).padStart(2,'0')}`;}m=s.match(/(?:^|\D)(\d{1,2})월(?:\D|$)/);if(m){const mm=Number(m[1]);if(mm>=1&&mm<=12)return `${y}-${String(mm).padStart(2,'0')}`;}return null;}
function findHeader(aoa,cols){for(let r=0;r<Math.min(20,aoa.length);r++){const h=aoa[r].map(x=>String(x??'').trim());if(cols.every(c=>h.includes(c)))return {row:r,idx:Object.fromEntries(h.map((x,i)=>[x,i]))};}return null;}
function mergeStatus(rec,e,v){if(!e||!v)return;rec.statuses[e]=(rec.statuses[e]&&rec.statuses[e]!==v)?'X':v;}
async function parseWorkbook(file){
 if(!window.XLSX)throw new Error('Excel 읽기 라이브러리를 불러오지 못했습니다.');
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),out=[],year=fileYear(file.name);
 wb.SheetNames.forEach(sh=>{
   const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:null,raw:true});if(!aoa.length)return;
   const month=monthFromText(file.name,year)||monthFromText(aoa?.[0]?.[0],year)||monthFromText(aoa?.[2]?.[0],year)||monthFromText(sh,year);if(!month)return;
   const nf=findHeader(aoa,['회사','도도매명','사업자번호','연동']);
   if(nf){
     const outlet=outletName(sh||aoa?.[0]?.[0]||file.name),map=new Map();
     aoa.slice(nf.row+1).forEach(row=>{
       const b=bizNo(row[nf.idx['사업자번호']]),e=entityName(row[nf.idx['회사']]),v=norm(row[nf.idx['연동']]);if(!b||!e||!v)return;
       if(!map.has(b))map.set(b,{month,outlet,businessNo:b,businessName:String(row[nf.idx['도도매명']]??'').trim(),statuses:{'대웅제약':null,'대웅바이오':null,'한올바이오':null}});
       const rec=map.get(b);if(!rec.businessName)rec.businessName=String(row[nf.idx['도도매명']]??'').trim();mergeStatus(rec,e,v);
     });
     out.push(...map.values());return;
   }
   const of=findHeader(aoa,['도매상명','실사업자번호','실사업자명']);if(!of)return;
   const map=new Map();
   aoa.slice(of.row+1).forEach(row=>{
     const b=bizNo(row[of.idx['실사업자번호']]);if(!b)return;const outlet=outletName(row[of.idx['도매상명']]);if(!outlet)return;
     const k=`${month}|||${outlet}|||${b}`;
     if(!map.has(k))map.set(k,{month,outlet,businessNo:b,businessName:String(row[of.idx['실사업자명']]??'').trim(),statuses:{'대웅제약':null,'대웅바이오':null,'한올바이오':null}});
     const rec=map.get(k);E.forEach(e=>{if(of.idx[e]!=null)mergeStatus(rec,e,norm(row[of.idx[e]]));});
   });
   out.push(...map.values());
 });
 return out;
}
async function upload(files){
 const incoming=[];for(const f of files)incoming.push(...await parseWorkbook(f));
 if(!incoming.length)throw new Error('인식 가능한 월 시트와 필수 열을 찾지 못했습니다.');
 const partners=[...new Set(incoming.map(r=>partnerFromOutlet(r.outlet)).filter(Boolean))];
 if(partners.length!==1)throw new Error(`서로 다른 업체 데이터가 함께 감지되었습니다: ${partners.join(', ')}. 업체별 파일로 업로드해 주세요.`);
 const partner=partners[0],key=`dcm-partner-v2-data::${partner}`;
 let data=[];try{const x=JSON.parse(localStorage.getItem(key));if(Array.isArray(x))data=x;}catch(e){}
 const pairs=new Set(incoming.map(r=>`${r.month}|||${r.outlet}`));
 data=data.filter(r=>!pairs.has(`${r.month}|||${r.outlet}`));
 const map=new Map(data.map(r=>[`${r.month}|||${r.outlet}|||${r.businessNo}`,r]));incoming.forEach(r=>map.set(`${r.month}|||${r.outlet}|||${r.businessNo}`,r));
 localStorage.setItem(key,JSON.stringify([...map.values()]));localStorage.setItem('dcm-partner-v2-last',partner);
 const msg=$('uploadMsg');if(msg)msg.textContent=`${partner} 자동 인식 · ${incoming.length.toLocaleString()}처 반영 완료 · 데이터는 현재 브라우저에만 저장됩니다.`;
 setTimeout(()=>location.reload(),250);
}
function install(){const input=$('fileInput');if(!input||input.dataset.newFormat==='1')return;input.dataset.newFormat='1';input.addEventListener('change',async e=>{e.stopImmediatePropagation();const files=[...(e.target.files||[])];if(!files.length)return;try{const msg=$('uploadMsg');if(msg)msg.textContent='파일 분석 중...';await upload(files);}catch(err){const msg=$('uploadMsg');if(msg)msg.textContent='업로드 실패';alert(err.message||err);}finally{e.target.value='';}},true);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();