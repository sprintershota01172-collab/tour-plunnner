'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync('sw.js','utf8');
async function navigate(online){
  const listeners={};
  const stored={body:'cached-version'};
  const fresh={ok:true,type:'basic',body:'latest-version',clone(){return {...this}}};
  let requests=0,updates=0;
  const cache={match:async()=>stored,put:async()=>{updates++}};
  runInNewContext(source,{
    navigator:{onLine:online},
    self:{location:{origin:'https://example.github.io'},
      registration:{scope:'https://example.github.io/trip/'},
      addEventListener(name,handler){listeners[name]=handler}},
    caches:{open:async()=>cache,keys:async()=>[]},
    fetch:async()=>{requests++;return fresh},
    URL,Promise,Response,AbortController,setTimeout,clearTimeout
  });
  let promise;
  listeners.fetch({
    request:{method:'GET',url:'https://example.github.io/trip/',mode:'navigate'},
    respondWith(value){promise=value}
  });
  return {result:await promise,requests,updates,stored,fresh};
}
test('online home-screen navigation refreshes HTML instead of serving stale cached UI',async()=>{
 const r=await navigate(true);
 assert.equal(r.result.body,'latest-version');
 assert.equal(r.requests,1);
 assert.equal(r.updates,1);
});
test('offline home-screen navigation opens saved UI without a network call',async()=>{
 const r=await navigate(false);
 assert.equal(r.result.body,'cached-version');
 assert.equal(r.requests,0);
 assert.equal(r.updates,0);
});
