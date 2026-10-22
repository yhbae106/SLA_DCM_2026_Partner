import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('partner.js','utf8');
const start=source.indexOf('async function checkActionRevision()');
const end=source.indexOf('\nfunction ',start+1);
let now=100000,calls=0,pulls=0,resolve,reject;
const env={navigator:{onLine:true},document:{visibilityState:'visible',activeElement:null},console:{warn(){}},Date:{now:()=>now},post:()=>{calls++;return new Promise((a,b)=>{resolve=a;reject=b;});},pullRemote:async()=>{pulls++;}};
vm.createContext(env);
vm.runInContext(`let revisionRetryAt=0,revisionFailures=0,revisionSupported=true;let savingBatch=false,actionCheckBusy=false,partnerVerified=true,partner='fixture',password='fixture',lastEditAt=0,lastActionRevision='same',lastDashboardRevision='same',loadingData=false,offlineServer=false,lastActionFullPullAt=Date.now();
 const currentSession=()=>0,sameSession=()=>true,request=post,pullSharedActions=pullRemote,pull=pullRemote;

${source.slice(start,end)}
this.check=checkActionRevision;`,env);
const first=env.check();await env.check();assert.equal(calls,1,'coalesce in-flight revision checks');
reject(new Error('network'));await first;await env.check();assert.equal(calls,1,'backoff suppresses retries');
now+=30000;const retry=env.check();assert.equal(calls,2);resolve({version:'test',revision:'same'});await retry;assert.equal(pulls,0,'unchanged revision avoids full download');
env.navigator.onLine=false;await env.check();assert.equal(calls,2,'offline skips automatic requests');
env.navigator.onLine=true;env.document.visibilityState='hidden';await env.check();assert.equal(calls,2,'hidden skips automatic requests');
env.document.visibilityState='visible';const changed=env.check();resolve({version:'test',revision:'new'});await changed;assert.equal(pulls,1,'changed revision refreshes data');
console.log('PASS polling: coalescing, bounded retry, offline/hidden suppression and revision-only refresh');
const html=fs.readFileSync('index.html','utf8');
const loginScript=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params = new URLSearchParams'));
let cleanURL='',clicked=0;
const select={},input={},button={click(){clicked++;}};
vm.runInNewContext(loginScript,{URL,URLSearchParams,location:{href:'https://example.test/Partner/?partner=fixture&code=test-only&mode=read#top',search:'?partner=fixture&code=test-only&mode=read'},history:{state:null,replaceState(_state,_title,url){cleanURL=url;}},document:{readyState:'complete',getElementById:id=>({loginPartner:select,loginPassword:input,loginBtn:button})[id]}});
assert.equal(cleanURL,'/Partner/?partner=fixture&mode=read#top');assert.equal(clicked,1);assert.equal(input.value,'test-only');
console.log('PASS one-time link: code removed from address while intended login and other URL parameters survive');
