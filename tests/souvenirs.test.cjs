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
  assert.match(app,/Math\.min\(4,index\)/);
  assert.doesNotMatch(app,/pages\.style\.transform|index\*25/);
  assert.match(app,/page\.classList\.toggle\('is-active',active\)/);
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
  assert.match(sync,/'packingItems','todoItems','meals','souvenirs','souvenirPeople','souvenirOwners'/);
  assert.match(sync,/\['places','hotels','packingItems','todoItems','souvenirs','souvenirPeople','souvenirOwners'\]/);
  assert.match(sync,/\['todoItems','souvenirs','souvenirPeople','souvenirOwners'\]\.includes\(field\)/);
  assert.match(notifications,/oldGifts=new Map/);
  assert.match(notifications,/お土産.*購入済み/);
});

test('souvenir-only trip cannot be discarded as empty or merged away',()=>{
  const first=app.indexOf('function isEmptyTrip(');
  const last=app.indexOf('function normalizeState(',first);
  const helper=runInNewContext(app.slice(first,last)+';({isEmptyTrip,hasPlanDetails})',{
    CATEGORIES:[{name:'観光'}],PACKING_DEFAULTS:[],SOUVENIR_OWNER_DEFAULTS:[{id:'owner-husband',name:'夫',budgetAmount:null},{id:'owner-wife',name:'妻',budgetAmount:null}]
  });
  const empty={id:'a',destination:'',startDate:'',endDate:'',datesConfigured:false,
    hotels:[],meals:{},places:[],groups:['観光'],packingItems:[],souvenirs:[]};
  assert.equal(helper.isEmptyTrip({...empty,souvenirs:[{id:'gift',name:'Cookies'}]}),false);
  assert.equal(helper.hasPlanDetails({...empty,souvenirs:[{id:'gift',name:'Cookies'}]}),true);
});

test('root and dist files match and offline cache is updated',()=>{
  for(const name of ['app.js','index.html','styles.css','sync.js','notifications.js','i18n.js','sw.js'])
    assert.equal(readFileSync(name,'utf8'),readFileSync('dist/'+name,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v108/);
});

test('legacy recipient names become distinct stable person records',()=>{
  const a=app.indexOf('function normalizeSouvenirs('),b=app.indexOf('function storagePayload(',a);
  const helpers=runInNewContext(app.slice(a,b)+';({normalizeSouvenirs,normalizeSouvenirPeople})');
  const items=helpers.normalizeSouvenirs([
    {id:'a',name:'Macadamia',recipient:'母'},
    {id:'b',name:'Cookies',recipient:'母'},
    {id:'c',name:'Chocolate',recipient:'友人'}
  ]);
  const people=helpers.normalizeSouvenirPeople(undefined,items);
  assert.equal(people.length,2);
  assert.equal(items[0].personId,items[1].personId);
  assert.notEqual(items[0].personId,items[2].personId);
  const items2=helpers.normalizeSouvenirs([{id:'d',name:'Macadamia',recipient:'母'}]);
  assert.equal(helpers.normalizeSouvenirPeople(undefined,items2)[0].id,people[0].id);
});

test('person rename preserves linked gifts and deleting person keeps gift records',()=>{
  for(const part of ['function addSouvenirPerson(', 'function editSouvenirPerson(', 'function removeSouvenirPerson(', 'function selectSouvenirPerson('])
    assert.ok(app.includes(part),part);
  assert.match(app,/state\.souvenirs=state\.souvenirs\.map\(item=>item\.personId===pid\?\{\.\.\.item,recipient:name\}:item\)/);
  assert.match(app,/personId:'',recipient:''/);
  assert.match(html,/id="souvenirPeopleTabs"/);
  assert.match(html,/id="souvenirPersonSelect"/);
  assert.match(html,/id="souvenirPersonForm"/);
  assert.match(sync,/'souvenirPeople'/);
  assert.match(notifications,/oldPeople=new Map/);
});

test('husband/wife group migration and item ownership preserved',()=>{
  const start=app.indexOf('function normalizeSouvenirs('),end=app.indexOf('function storagePayload(',start);
  const helper=runInNewContext(app.slice(start,end)+';({normalizeSouvenirs,normalizeSouvenirOwners})',{
    SOUVENIR_OWNER_DEFAULTS:[{id:'owner-husband',name:'夫',budgetAmount:null,currency:'USD'},{id:'owner-wife',name:'妻',budgetAmount:null,currency:'USD'}]
  });
  const owners=helper.normalizeSouvenirOwners(undefined);
  assert.equal(JSON.stringify(owners.map(o=>o.name)),JSON.stringify(['夫','妻']));
  const gifts=helper.normalizeSouvenirs([
    {id:'gift1',name:'お菓子',recipient:'母',quantity:2,unitPrice:15,currency:'USD',ownerId:'owner-husband'},
    {id:'gift2',name:'お茶',recipient:'友人',quantity:3,unitPrice:1000,currency:'JPY'}
  ]);
  assert.equal(gifts[0].ownerId,'owner-husband');
  assert.equal(gifts[0].quantity,2);
  assert.equal(gifts[1].ownerId,'');
  assert.equal(helper.normalizeSouvenirOwners([{id:'custom',name:'祖父',budgetAmount:3000,currency:'JPY'}])[0].budgetAmount,3000);
});

test('group editing, budget calculation, filters, and gentle reveal exist',()=>{
  for(const x of ['id="souvenirOwnerForm"','id="souvenirOwnerTabs"','id="souvenirOwnerSelect"','id="souvenirOwnerSummary"','id="souvenirOwnerBudget"'])assert.ok(html.includes(x),x);
  for(const x of ['function saveSouvenirOwner(','function editSouvenirOwner(','function deleteSouvenirOwner(','function souvenirOwnerBudget(','function renderSouvenirOwners('])assert.ok(app.includes(x),x);
  assert.match(app,/ownerId:owner\?\.id\|\|''/);
  assert.match(app,/state\.souvenirs=state\.souvenirs\.map\(item=>item\.ownerId===owner\.id\?\{\.\.\.item,ownerId:''\}:item\)/);
  assert.match(css,/transition:opacity 1000ms cubic-bezier/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(sync,/'souvenirOwners'/);
  assert.match(notifications,/oldOwners=new Map/);
});
