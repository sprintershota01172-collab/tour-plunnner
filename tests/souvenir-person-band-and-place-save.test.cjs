'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('styles.css','utf8');

test('recipient filters have the same horizontal band proportions as collection categories',()=>{
 assert.match(css,/\.souvenir-detail-panel \.souvenir-person-tabs\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/\.souvenir-detail-panel \.souvenir-person-chip\{[\s\S]*?height:32px/);
 assert.match(css,/\.souvenir-detail-panel \.souvenir-person-chip\.active\{[\s\S]*?background:#e0ebe6/);
 assert.match(html,/id="souvenirPeopleTabs"/);
 assert.match(app,/data-souvenir-person=/);
});

test('submit closes the collection modal before expensive data writes and full redraw',()=>{
 const first=app.indexOf('function savePlace(event){');
 const last=app.indexOf('function deletePlace(){',first);
 assert.ok(first>0&&last>first);
 const calls=[];
 const state={places:[]};
 const entries={
   id:'',name:'Diamond Head',category:'観光',listType:'place',mealType:'',
   address:'',duration:'60',notes:'',url:'',hours:'',phone:'',
   latitude:'',longitude:'',reservationStatus:'none'
 };
 const fields={};
 for(const [key,value] of Object.entries(entries))fields[key]={value};
 fields.mustGo={checked:false};
 const save=runInNewContext(app.slice(first,last)+';savePlace',{
   state,editingPhotos:[],id:()=> 'saved-1',validMealType:v=>v,selectedCategory:'観光',
   $:()=>({id:'modalBackdrop'}),
   closeModal:()=>calls.push('close'),
   persist:()=>calls.push('persist'),
   renderAll:()=>calls.push('redraw'),
   showToast:()=>calls.push('toast'),
   setTimeout:fn=>{calls.push('scheduled');fn();}
 });
 save({preventDefault(){},currentTarget:{elements:fields}});
 assert.equal(state.places.length,1);
 assert.equal(state.places[0].name,'Diamond Head');
 assert.deepEqual(calls,['close','persist','toast','scheduled','redraw']);
});

test('invalid input gives an explanation, and keyboard completion can submit',()=>{
 assert.match(html,/name="name" required maxlength="100" enterkeyhint="done"/);
 assert.match(html,/id="placeFormError" class="place-form-error" role="alert"/);
 assert.match(app,/addEventListener\('invalid',[\s\S]*?placeFormError/);
 assert.match(app,/e\.target\?\.name!=='name'/);
 assert.match(app,/requestSubmit\(\)/);
 assert.match(css,/\.place-form-error:not\(\[hidden\]\)/);
});

test('cache and deployed copies update together',()=>{
 for(const p of ['app.js','index.html','styles.css','sw.js']){
  assert.equal(readFileSync(p,'utf8'),readFileSync('dist/'+p,'utf8'));
 }
 assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v110/);
});
