import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('data/monthly-action-history.js','utf8');
assert.ok(!source.includes('1178174643')&&!source.includes('신협)동명당약국'),
  'Sensitive merchant data must never be embedded in public Pages assets');
const env={};env.window=env;vm.createContext(env);vm.runInContext(source,env);
const hist=env.DCM_MONTHLY_ACTION_HISTORY;
const S=(a,b,c)=>({'대웅제약':a,'대웅바이오':b,'한올바이오':c});
const make=(month,outlet,key,statuses)=>({month,outlet,businessNo:key,businessName:'Test '+key,manager:'Tester',statuses});
const rows=[
 make('2026-06','PARTNER-A','one',S('X',null,null)),
 make('2026-07','PARTNER-A','one',S('O',null,null)),
 make('2026-07','PARTNER-A','two',S('X','X','X')),
 make('2026-08','PARTNER-A','two',S('O','O','O')),
 make('2026-08','PARTNER-B','three',S('X',null,'X')),
 make('2026-09','PARTNER-B','three',S('O',null,'O')),
 // Already-linked entity in baseline: not "all X to O".
 make('2026-06','PARTNER-A','notall',S('O','X','X')),
 make('2026-07','PARTNER-A','notall',S('O','O','O')),
 // A newly selling group was not X in the prior month: exclude.
 make('2026-06','PARTNER-A','newcompany',S('X',null,null)),
 make('2026-07','PARTNER-A','newcompany',S('O','O',null)),
 // No actual improvement: exclude.
 make('2026-08','PARTNER-B','unresolved',S('X',null,null)),
 make('2026-09','PARTNER-B','unresolved',S('X',null,null))
];
assert.equal(hist.refresh(rows),6,'Exactly three qualifying transitions, two monthly statuses each');
assert.deepEqual([...new Set(hist.forMonth('2026-07').map(r=>r.key))].sort(),
 ['PARTNER-A|||one','PARTNER-A|||two'],'July should contain completion and new in-progress');
const first=hist.get('2026-06','PARTNER-A|||one');
assert.equal(first.masterAction.reasonCode,'06');
assert.equal(first.partnerAction.reasonCode,'06');
assert.equal(first.masterAction.plan,'ERP업체 소통하여 정상 연동 조치');
assert.equal(first.partnerAction.plan,'거래처 요청 및 대웅 협조');
assert.equal(first.masterAction.status,'IN_PROGRESS');
assert.equal(first.partnerAction.status,'IN_PROGRESS');
assert.equal(first.masterAction.dueDate,'2026-06-30');
assert.equal(first.partnerAction.dueDate,'2026-06-30');
const finished=hist.get('2026-07','PARTNER-A|||one');
assert.equal(finished.masterAction.status,'DONE');
assert.equal(finished.partnerAction.status,'DONE');
assert.equal(finished.masterAction.dueDate,'2026-07-31');
assert.equal(finished.partnerAction.dueDate,'2026-07-31');
assert.equal(hist.get('2026-07','PARTNER-A|||notall'),null);
assert.equal(hist.get('2026-06','PARTNER-A|||newcompany'),null);
assert.equal(hist.get('2026-08','PARTNER-B|||unresolved'),null);
assert.deepEqual(Array.from(hist.get('2026-08','PARTNER-A|||two').entities),
 ['대웅제약','대웅바이오','한올바이오']);
assert.equal(hist.get('2026-08','PARTNER-A|||two').startOx,'X/X/X');
assert.equal(hist.get('2026-08','PARTNER-A|||two').endOx,'O/O/O');
// Restricting to the authenticated Partner row subset must expose no other partner.
assert.equal(hist.refresh(rows.filter(r=>r.outlet==='PARTNER-A')),4);
assert.equal(hist.get('2026-08','PARTNER-B|||three'),null);
hist.clear();assert.equal(hist.count(),0);
console.log('PASS MONTHLY X2O: three transitions, group-scoped sales, master/partner plans, month-end Due, progress→done, auth subset, no embedded merchant dataset');
