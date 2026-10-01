import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),fail=m=>{throw new Error(m)},ok=m=>console.log('PASS',m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),exists=p=>fs.existsSync(path.join(root,p));
const html=read('index.html');
const refs=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1].split(/[?#]/)[0]).filter(x=>x&&!/^(?:https?:|data:|#)/.test(x));
for(const r of refs)if(!exists(r))fail('Missing local asset: '+r);
ok('all index assets exist');
if(html.includes('cdn.sheetjs.com'))fail('SheetJS must not be eagerly loaded');
ok('SheetJS is lazy-loaded');

for(const p of ['app.js','data/base-data.js','dw-illustration.svg','partner-upload-v2.js','styles.css'])if(exists(p))fail('Legacy unused asset returned: '+p);
ok('legacy unused assets remain removed');

const required=['partnerLogin','loginPartner','loginPassword','loginBtn','outlet','month','rate','riskBody','actionBody','exportAction'];
for(const id of required)if(!html.includes('id="'+id+'"'))fail('Missing required DOM id: '+id);
ok('required partner DOM contract');

function walk(dir='.'){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.name==='.git'||e.name==='node_modules')return[];return e.isDirectory()?walk(p):[p]})}
for(const file of walk().filter(x=>x.endsWith('.js'))){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});}
ok('all JavaScript parses');

const ctx={};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(read('logic.js'),ctx);
const L=ctx.DCMLogic;if(!L)fail('DCMLogic not exported');
const S=(a,b,c)=>({'대웅제약':a,'대웅바이오':b,'한올바이오':c});
const prev=[
 {month:'2026-08',outlet:'A',manager:'M',businessNo:'1',businessName:'Alpha',statuses:S('X','O',null)},
 {month:'2026-08',outlet:'A',manager:'M',businessNo:'2',businessName:'Beta',statuses:S('O',null,null)}
];
const curr=[
 {month:'2026-09',outlet:'A',manager:'M',businessNo:'1',businessName:'Alpha',statuses:S('O','X',null)},
 {month:'2026-09',outlet:'A',manager:'M',businessNo:'3',businessName:'Gamma',statuses:S('O',null,null)}
];
const sum=L.summarize(curr);
if(sum.O!==2||sum.X!==1||sum.needAbsolute!==1||sum.suppliedAbsolute!==2)fail('summarize regression');
const ch=L.compare(prev,curr);
if(ch.xToO.length!==1||ch.oToX.length!==1||ch.newSupply.length!==1||ch.stoppedSupply.length!==1)fail('compare regression');
ok('core DCM calculations');

const localAssets=[...new Set(refs)].filter(exists);
const initialBytes=fs.statSync('index.html').size+localAssets.reduce((s,p)=>s+fs.statSync(p).size,0);
if(initialBytes>120000)fail('Initial local payload budget exceeded: '+initialBytes);
ok('initial local payload '+Math.round(initialBytes/1024)+' KB');
console.log('HARNESS_OK');