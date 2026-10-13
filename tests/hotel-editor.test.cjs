'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync('app.js','utf8');
const start=source.indexOf('function renderHotelEditor(){');
const end=source.indexOf('function updateTripRangeLabel(){',start);
if(start<0||end<0)throw new Error('Hotel rendering helpers missing');
function render(hotels,index=0){
 const tabs={hidden:false,innerHTML:''},list={innerHTML:''};
 const nodes={'#hotelEditList':list,'#hotelTabs':tabs};
 const sandbox={hotelDraft:hotels,selectedHotelIndex:index,$:key=>nodes[key],esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),window:{TabiDateRange:{label:(start,end)=>start+'–'+end}}};
 runInNewContext(source.slice(start,end)+';renderHotelEditor();',sandbox,{timeout:1000});
 return {tabs,list,index:sandbox.selectedHotelIndex};
}
test('all stays use horizontal tabs and only one editable card is visible',()=>{
 const items=Array.from({length:4},(_,i)=>({name:'Hotel '+i,start:'2027-02-21',end:'2027-02-22'}));
 const {tabs,list}=render(items,2);
 assert.equal((tabs.innerHTML.match(/data-hotel-tab=/g)||[]).length,4);
 assert.equal((list.innerHTML.match(/data-hotel-index=/g)||[]).length,1);
 assert.match(list.innerHTML,/data-hotel-index="2"/);
 assert.equal(tabs.hidden,false);
});
test('hotel edit does not mutate other stay drafts',()=>{
 const hotels=[{name:'Hale Puna'},{name:'Halekulani'}];
 render(hotels,1);
 assert.deepEqual(hotels,[{name:'Hale Puna'},{name:'Halekulani'}]);
});
test('empty hotel list shows an add prompt',()=>{
 const {tabs,list,index}=render([],5);
 assert.equal(tabs.hidden,true);
 assert.match(list.innerHTML,/宿泊先はまだ登録されていません/);
 assert.equal(index,0);
});
test('one hotel requires no tabs',()=>{
 const {tabs,list}=render([{name:'Halekulani'}]);
 assert.equal(tabs.hidden,true);
 assert.equal((list.innerHTML.match(/data-hotel-index=/g)||[]).length,1);
});
