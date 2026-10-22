import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert.equal(manifest.id,manifest.scope);assert.equal(manifest.start_url,manifest.scope);assert.equal(manifest.display,'standalone');assert.ok(!manifest.start_url.includes('?'));
for(const size of [192,512]){const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);assert.ok(icon);const png=fs.readFileSync(icon.src);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
function fixture(standalone=false){
 const events={},buttons=[{addEventListener(k,fn){this[k]=fn;}}],nodes={},registrations=[];
 const context={window:{matchMedia:()=>({matches:standalone}),addEventListener:(k,fn)=>events[k]=fn},navigator:{serviceWorker:{register:async(...args)=>registrations.push(args)}},document:{readyState:'complete',querySelectorAll:()=>buttons,getElementById:id=>nodes[id],createElement:()=>({setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}}),body:{appendChild(el){nodes[el.id]=el;}}}};
 vm.runInNewContext(fs.readFileSync('pwa-install.js','utf8'),context);return{events,buttons,nodes,registrations};
}
const f=fixture();assert.equal(f.buttons[0].textContent,'앱 설치 안내');await f.buttons[0].click();assert.equal(f.nodes.appInstallHelp.open,true);
let prompts=0,prevented=false;f.events.beforeinstallprompt({preventDefault(){prevented=true;},prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})});assert.ok(prevented);assert.equal(prompts,0);assert.equal(f.buttons[0].textContent,'앱 설치');await f.buttons[0].click();assert.equal(prompts,1);assert.equal(f.buttons[0].disabled,false);assert.equal(f.buttons[0].textContent,'앱 설치 안내');
f.events.appinstalled();assert.equal(f.buttons[0].hidden,true);assert.equal(f.nodes.appInstallHelp.open,false);assert.equal(fixture(true).buttons[0].hidden,true);
assert.equal(f.registrations[0][0],'./service-worker.js');assert.equal(f.registrations[0][1].scope,'./');
const swEvents={};vm.runInNewContext(fs.readFileSync('service-worker.js','utf8'),{self:{addEventListener:(k,fn)=>swEvents[k]=fn}});assert.equal(swEvents.fetch,undefined);
console.log('PASS PWA: isolated identity/scope, PNG dimensions, user-triggered prompt, dismissal, standalone hiding, help and no data cache');
