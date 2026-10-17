'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('styles.css','utf8');
const sync=readFileSync('sync.js','utf8');
const notifications=readFileSync('notifications.js','utf8');

test('souvenir tab is a fourth page with equal-width navigation',()=>{
  assert.match(html,/data-page="3" aria-label="お土産リスト"/);
  assert.match(html,/data-nav="3"/);
  assert.match(css,/\.pages\{width:400%\}/);
  assert.match(css,/\.page\{width:25%;flex:0 0 25%\}/);
  assert.match(app,/Math\.min\(3,index\)/);
  assert.match(app,/translate3d\(-\$\{index\*25\}%,0,0\)/);
});

test('legacy trip souvenir lists are normalized without phantom gifts',()=>{
  const start=app.indexOf('function normalizeSouvenirs(');
  const end=app.indexOf('function storagePayload(',start);
  assert.ok(start>0&&end>start);
  const normalize=runInNewContext(app.slice(start,end)+';normalizeSouvenirs');
  assert.equal(JSON.stringify(normalize(undefined)),'[]');
  assert.equal(normalize([{id:'1',name:'Chocolate',quantity:2,currency:'USD'}])[0].quantity,2);
  assert.equal(normalize([{id:'1',name:'Chocolate'},{id:'1',name:'Duplicate'}]).length,1);
  assert.equal(normalize([{id:'1',name:'Gift',bought:true}])[0].bought,true);
  assert.match(app,/s\.souvenirs=normalizeSouvenirs\(data\.souvenirs\)/);
});

test('souvenir edits and checks are available and synchronized as individual records',()=>{
  for(const id of ['souvenirForm','souvenirList','addSouvenir','souvenirFilters','deleteSouvenir','souvenirProgress'])
    assert.ok(html.includes('id="'+id+'"'),id);
  for(const name of ['renderSouvenirs','openSouvenir','saveSouvenir','deleteSouvenir','bindSouvenirs'])
    assert.ok(app.includes('function '+name+'('),name);
  assert.match(sync,/'packingItems','meals','souvenirs'/);
  assert.match(sync,/\['places','hotels','packingItems','souvenirs'\]/);
  assert.match(sync,/field==='souvenirs'\?\(Array\.isArray\(trip\[field\]\)\?trip\[field\]:\[\]\)/);
  assert.match(notifications,/oldGifts=new Map/);
  assert.match(notifications,/お土産.*購入済み/);
});

test('souvenir-only trip cannot be discarded as empty or merged away',()=>{
  const first=app.indexOf('function isEmptyTrip(');
  const last=app.indexOf('function normalizeState(',first);
  const helper=runInNewContext(app.slice(first,last)+';({isEmptyTrip,hasPlanDetails})',{
    CATEGORIES:[{name:'観光'}],PACKING_DEFAULTS:[]
  });
  const empty={id:'a',destination:'',startDate:'',endDate:'',datesConfigured:false,
    hotels:[],meals:{},places:[],groups:['観光'],packingItems:[],souvenirs:[]};
  assert.equal(helper.isEmptyTrip({...empty,souvenirs:[{id:'gift',name:'Cookies'}]}),false);
  assert.equal(helper.hasPlanDetails({...empty,souvenirs:[{id:'gift',name:'Cookies'}]}),true);
});

test('root and dist files match and offline cache is updated',()=>{
  for(const name of ['app.js','index.html','styles.css','sync.js','notifications.js','i18n.js','sw.js'])
    assert.equal(readFileSync(name,'utf8'),readFileSync('dist/'+name,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v99/);
});
