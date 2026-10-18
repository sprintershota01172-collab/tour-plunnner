'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const app=readFileSync('app.js','utf8'),html=readFileSync('index.html','utf8');
const styles=readFileSync('styles.css','utf8'),sync=readFileSync('sync.js','utf8'),notifications=readFileSync('notifications.js','utf8');
test('wishlist supports grouping, name, duration, reservation and placement sorting',()=>{
  const first=app.indexOf('function sortWishlistPlaces('),last=app.indexOf('function renderWishlist(',first);
  assert.ok(first>0&&last>first);
  const places=[
    {id:'a',name:'Beach',category:'ビーチ',duration:45,reservationRequired:false,start:null},
    {id:'b',name:'Dinner',category:'グルメ',duration:75,reservationRequired:true,booked:false,start:570},
    {id:'c',name:'Attraction',category:'観光',duration:120,reservationRequired:true,booked:true,start:null}
  ];
  const sort=runInNewContext(app.slice(first,last)+';sortWishlistPlaces',{
    state:{places},groupNames:()=>['観光','グルメ','ビーチ'],UNGROUPED:'未分類',selectedPlaceSort:'recent'
  });
  const ids=mode=>sort(places,mode).map(p=>p.id).join('');
  assert.equal(ids('recent'),'abc');
  assert.equal(ids('group'),'cba');
  assert.equal(ids('name'),'cab');
  assert.equal(ids('duration-asc'),'abc');
  assert.equal(ids('duration-desc'),'cba');
  assert.equal(ids('reservation'),'bca');
  assert.equal(ids('unplaced'),'acb');
  assert.match(html,/id="placeSort"/);
  assert.match(html,/value="group">グループ別/);
  assert.match(html,/value="reservation">予約が必要な順/);
});
test('reservation todos reflect the current booking status without duplicates',()=>{
  const first=app.indexOf('function reservationTodos('),last=app.indexOf('function renderTodos(',first);
  assert.ok(first>0&&last>first);
  const state={places:[
    {id:'p1',name:'Diamond Head',reservationRequired:true,booked:false},
    {id:'p2',name:'Museum',reservationRequired:false,booked:false},
    {id:'p3',name:'Luau',reservationRequired:true,booked:true}
  ],todoItems:[{id:'m1',title:'Apply for ESTA',completed:false}]};
  const f=runInNewContext(app.slice(first,last)+';({reservationTodos,allTodos})',{state});
  assert.equal(f.reservationTodos().map(t=>t.id).join(','),'p1,p3');
  assert.equal(f.allTodos().length,3);
  assert.equal(f.reservationTodos().find(t=>t.id==='p1').completed,false);
  state.places[0].booked=true;
  assert.equal(f.reservationTodos().find(t=>t.id==='p1').completed,true);
  state.places[0].reservationRequired=false;state.places[0].booked=false;
  assert.equal(f.reservationTodos().length,1);
  assert.match(app,/spot\.booked=box\.checked;spot\.reservationRequired=true/);
});
test('manual todos retain due dates, survive sync and notify partners',()=>{
  const first=app.indexOf('function normalizeTodoItems('),end=app.indexOf('function storagePayload(',first);
  assert.ok(first>0&&end>first);
  const normalize=runInNewContext(app.slice(first,end)+';normalizeTodoItems');
  assert.equal(JSON.stringify(normalize(undefined)),'[]');
  const tasks=normalize([{id:'1',title:'Pack chargers',completed:true,dueDate:'2027-02-20'},
    {id:'1',title:'Duplicate'},{id:'2',title:'  '}]);
  assert.equal(tasks.length,1);assert.equal(tasks[0].completed,true);
  assert.match(app,/s\.todoItems=normalizeTodoItems\(data\.todoItems\)/);
  assert.match(sync,/'packingItems','todoItems','meals'/);
  assert.match(sync,/\['places','hotels','packingItems','todoItems'/);
  assert.match(notifications,/olderTasks=new Map/);
  assert.match(notifications,/やること.*追加しました/);
});
test('the fifth tab and a task editor are present',()=>{
  for(const id of ['todoFilters','todoProgress','todoProgressBar','todoAdd','todoList','todoEditForm','todoBackdrop','todoSheetTitle','placeSort'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/data-page="4" aria-label="やることリスト"/);
  assert.match(html,/data-nav="4"/);
  assert.match(app,/Math\.min\(4,index\)/);
  assert.match(styles,/\.todo-page\{/);
});
test('compiled files and cache version match',()=>{
  for(const p of ['app.js','index.html','styles.css','sync.js','notifications.js','i18n.js','sw.js'])
    assert.equal(readFileSync(p,'utf8'),readFileSync('dist/'+p,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v107/);
});
