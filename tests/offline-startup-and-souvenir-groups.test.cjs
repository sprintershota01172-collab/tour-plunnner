'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const html=readFileSync('index.html','utf8');
const app=readFileSync('app.js','utf8');
const css=readFileSync('styles.css','utf8');
const sw=readFileSync('sw.js','utf8');
const account=readFileSync('account-ui.js','utf8');
const sync=readFileSync('sync.js','utf8');

test('souvenir management has compact switchable groups and a separate editor',()=>{
 for(const id of ['souvenirOwnerPanel','souvenirOwnerAdd','souvenirOwnerTabs','souvenirGroupSwitch','souvenirOwnerBackdrop','souvenirOwnerForm'])
   assert.match(html,new RegExp('id="'+id+'"'),id);
 assert.equal((html.match(/id="souvenirOwnerForm"/g)||[]).length,1);
 assert.match(app,/class="souvenir-group-card"/);
 assert.match(app,/data-owner-tab=/);
 assert.match(app,/souvenirOwnerFilter=button\.dataset\.ownerTab/);
 assert.match(app,/souvenirOwnerFilter=next\.id/);
 assert.match(css,/\.souvenir-group-switch-tab\.active/);
});
test('only the selected group is expanded with compact recipient tabs',()=>{
 const start=app.indexOf('function renderSouvenirOwners()'),end=app.indexOf('function cancelSouvenirOwnerEdit()',start);
 assert.ok(start>0&&end>start);
 const method=app.slice(start,end);
 assert.match(method,/entries\.filter\(owner=>owner\.id===souvenirOwnerFilter\)\.map/);
 assert.match(method,/data-person-tab=/);
 assert.match(method,/data-owner-add=/);
 assert.match(method,/souvenirGroupRecipientFilters\[owner\.id\]/);
 assert.match(html,/id="souvenirRecipientTypeTabs"/);
});

test('offline navigation gets app HTML from local cache without fetching the internet',async()=>{
 const listeners={},cached={status:200,source:'offline-shell'};
 let networkCalls=0;
 const cache={match:async url=>String(url).endsWith('/index.html')?cached:undefined,put:async()=>{}};
 const context={
   self:{location:{origin:'https://example.github.io'},registration:{scope:'https://example.github.io/tabi/'},
     addEventListener:(name,listener)=>{listeners[name]=listener;}},
   caches:{open:async()=>cache,keys:async()=>[]},URL,Promise,Response,
   fetch:async()=>{networkCalls++;throw Error('offline')}
 };
 runInNewContext(sw,context);
 let responded;
 listeners.fetch({
   request:{method:'GET',url:'https://example.github.io/tabi/',mode:'navigate'},
   respondWith:p=>{responded=p;}
 });
 assert.equal(await responded,cached);
 assert.equal(networkCalls,0);
 assert.match(sw,/await cache\.addAll\(CORE\)/);
 assert.match(sw,/Promise\.allSettled\(OPTIONAL/);
});

test('app keeps offline edits local and reconnects after network comes back',()=>{
 assert.match(app,/document\.addEventListener\('visibilitychange',[\s\S]*?flushPendingSave\(\)/);
 assert.match(app,/window\.addEventListener\('pagehide',flushPendingSave\)/);
 assert.match(app,/function writeLocalState\(\)/);
 assert.match(app,/indexedDB\.open\(DB_NAME,1\)/);
 assert.match(sync,/window\.addEventListener\('online',wake\)/);
 assert.match(sync,/if\(online\(\)&&\(typeof document==='undefined'\|\|!document\.hidden\)\)sync\(\)/);
 assert.match(account,/setTimeout\(\(\)=>pull\(true\),900\)/);
 assert.match(account,/window\.addEventListener\('online'/);
});

test('startup font css is asynchronous and root/dist files are identical',()=>{
 assert.match(html,/rel="stylesheet" media="print" onload="this\.media='all'"/);
 assert.match(sw,/tabi-planner-v\\d+/);
 for(const name of ['app.js','index.html','styles.css','sw.js','account-ui.js','sync.js','i18n.js']){
   assert.equal(readFileSync(name,'utf8'),readFileSync('dist/'+name,'utf8'),name);
 }
});
