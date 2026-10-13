'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync('app.js','utf8');
const start=source.indexOf('function isEmptyTrip(');
const end=source.indexOf('function normalizeState(',start);
if(start<0||end<0)throw new Error('Trip-cleanup helpers missing');
const helpers=runInNewContext(source.slice(start,end)+';({isEmptyTrip,hasPlanDetails,cleanRedundantTrips})',{
 CATEGORIES:[{name:'観光'},{name:'グルメ'}],
 PACKING_DEFAULTS:[{id:'p',name:'Passport'}]
});
const empty=id=>({id,destination:'',travelers:2,startDate:'',endDate:'',datesConfigured:false,hotels:[],places:[],groups:['観光','グルメ'],packingItems:[{id:'p',name:'Passport',checked:false}]});
const trip=(id,opts={})=>({...empty(id),destination:'Honolulu',startDate:'2027-02-21',endDate:'2027-02-27',...opts});
test('generated empty trips disappear when real trips exist',()=>{
 const result=helpers.cleanRedundantTrips([empty('a'),trip('b')],'a');
 assert.equal(result.length,1);assert.equal(result[0].id,'b');
});
test('never remove the only blank trip',()=>{
 const result=helpers.cleanRedundantTrips([empty('a'),empty('b')],'b');
 assert.equal(result.length,1);assert.equal(result[0].id,'b');
});
test('the same destination on different dates remains separate',()=>{
 const result=helpers.cleanRedundantTrips([trip('a'),trip('b',{startDate:'2027-03-01'})],'a');
 assert.equal(result.length,2);
});
test('the filled trip is preserved when removing a duplicate empty plan',()=>{
 const full=trip('edited',{places:[{name:'Diamond Head',id:'p1'}]});
 const result=helpers.cleanRedundantTrips([full,trip('blank')],'blank');
 assert.equal(result.length,1);assert.equal(result[0].id,'edited');
});
test('packing or category edits are preserved when removing duplicates',()=>{
 const full=trip('packed',{packingItems:[{id:'p',name:'Passport',checked:true}]});
 const result=helpers.cleanRedundantTrips([full,trip('blank')],'blank');
 assert.equal(result[0].id,'packed');
});
test('distinct detailed itineraries and shared rooms remain separate',()=>{
 assert.equal(helpers.cleanRedundantTrips([trip('a',{places:[{id:1}]}),trip('b',{places:[{id:2}]})],'a').length,2);
 assert.equal(helpers.cleanRedundantTrips([trip('a',{collaboration:{roomId:'1'}}),trip('b',{collaboration:{roomId:'2'}})],'a').length,2);
});
