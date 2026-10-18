'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const src=readFileSync('app.js','utf8'),styles=readFileSync('styles.css','utf8'),html=readFileSync('index.html','utf8'),sync=readFileSync('sync.js','utf8');
const start=src.indexOf('function normalizeMeals(raw){'),end=src.indexOf('function dateHotel(day){',start);
if(start<0||end<start)throw Error('Meal helpers not found');
function harness(){
 const panel={hidden:false,innerHTML:''};
 const state={places:[{id:'a',name:'Cafe A',category:'カフェ'},{id:'b',name:'Dinner B',category:'グルメ'}],meals:{},hotels:[]};
 let writes=0,renders=0;
 const context={state,MEALS:[['breakfast','朝食','朝'],['lunch','昼食','昼'],['dinner','夕食','夜']],isFood:p=>p.category==='グルメ'||p.category==='カフェ',
  $:k=>k==='#dayMeals'?panel:null,hasTripDates:()=>true,selectedDay:0,
  dayCount:()=>7,persist:()=>{writes++},renderItinerary:()=>{renders++},
  esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')};
 const result=runInNewContext(src.slice(start,end)+';({normalizeMeals,foodPlaces,mealAt,mealText,updateMeal,renderDayMeals})',context,{timeout:1000});
 return {...result,state,panel,writes:()=>writes,renders:()=>renders};
}
test('older trips have no extra phantom meals and malformed input is ignored',()=>{
 const {normalizeMeals}=harness();
 assert.equal(JSON.stringify(normalizeMeals(undefined)),'{}');
 assert.equal(JSON.stringify(normalizeMeals({'5':{lunch:{name:'Poke Bowl'}},'100':{dinner:{name:'bad'}},'__proto__':{breakfast:{name:'bad'}}})),'{"5":{"lunch":{"name":"Poke Bowl","placeId":""}}}');
});
test('chosen restaurant uses a reference and automatically shows the updated place name',()=>{
 const h=harness();
 h.updateMeal(1,'lunch',{placeId:'b',name:'Dinner B'});
 assert.equal(h.mealText(h.mealAt(1,'lunch')),'Dinner B');
 h.state.places[1].name='Renamed Cafe';
 assert.equal(h.mealText(h.mealAt(1,'lunch')),'Renamed Cafe');
 assert.equal(h.writes(),1);
});
test('custom meals and clearing a meal work independently for each day',()=>{
 const h=harness();
 h.updateMeal(2,'breakfast',{name:'Malasada'});
 h.updateMeal(2,'dinner',{name:'Ramen'});
 h.updateMeal(3,'breakfast',{name:'Eggs'});
 h.updateMeal(2,'dinner',null);
 assert.equal(h.mealAt(2,'breakfast').name,'Malasada');
 assert.equal(h.mealAt(2,'dinner'),null);
 assert.equal(h.mealAt(3,'breakfast').name,'Eggs');
});
test('hotel time bar removed, with stay summary and meals outside timeline',()=>{
 const timeline=src.slice(src.indexOf('function renderTimeline(){'),src.indexOf('function fmtTime(',src.indexOf('function renderTimeline(){')));
 assert.equal(timeline.includes('timeline-hotel-band'),false);
 assert.equal(src.includes('function staySummary(){'),true);
 assert.equal(src.includes('mealsSummary(day)'),true);
});
test('phone planner uses a 2-column, 3-row tray showing up to six pieces',()=>{
 assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(styles,/grid-auto-rows:42px/);
 for(const id of ['dayMeals','mealsBackdrop','mealEditorRows','foodFilterEmpty'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('collaboration includes the meals field',()=>{
 assert.match(sync,/'packingItems','todoItems','meals'/);
 assert.match(sync,/\['meals','daySummaries'\]\.includes\(field\)/);
});

test('daily meal tiles open the matching day editor, without changing the hour timeline',()=>{
 assert.match(src,/data-open-day-meal/);
 assert.match(src,/selectedDay=Number\(edit.dataset.openDayMeal\);renderDays\(\);openMealEditor\(\)/);
});
