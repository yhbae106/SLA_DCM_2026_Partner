(()=>{'use strict';
let pending=null,installed=false;
const standalone=()=>installed||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const buttons=()=>[...document.querySelectorAll('[data-app-install]')];
function refresh(){buttons().forEach(b=>{b.hidden=standalone();b.textContent=pending?'앱 설치':'앱 설치 안내';});}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;refresh();});
window.addEventListener('appinstalled',()=>{installed=true;pending=null;refresh();document.getElementById('appInstallHelp')?.close();});
function help(){
 let dialog=document.getElementById('appInstallHelp');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='appInstallHelp';dialog.setAttribute('aria-labelledby','appInstallTitle');dialog.innerHTML='<h2 id="appInstallTitle">대시보드를 앱으로 사용하기</h2><p>홈 화면이나 시작 메뉴에 추가하면 별도 앱 창으로 열 수 있습니다.</p><ul><li><strong>Android · PC Chrome/Edge</strong><br>브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택하세요.</li><li><strong>iPhone · iPad Safari</strong><br>공유 메뉴 → 홈 화면에 추가를 선택하세요.</li></ul><p>설치 항목은 브라우저와 기기에 따라 다릅니다. 이미 설치했다면 홈 화면 또는 시작 메뉴에서 실행하세요.</p><p>최신 데이터 조회와 저장에는 인터넷 연결이 필요합니다. 앱에서도 기존 로그인 권한을 사용합니다.</p><form method="dialog"><button class="app-install-control" autofocus>닫기</button></form>';document.body.appendChild(dialog);}
 dialog.showModal();
}
async function install(){
 if(!pending){help();return;}
 const event=pending;pending=null;buttons().forEach(b=>b.disabled=true);
 try{await event.prompt();await event.userChoice;}catch(_){help();}
 finally{buttons().forEach(b=>b.disabled=false);refresh();}
}
function start(){buttons().forEach(b=>b.addEventListener('click',install));refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
if('serviceWorker' in navigator){const register=()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});}
})();
