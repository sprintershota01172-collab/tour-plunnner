'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');
const src=readFileSync('sync.js','utf8');
function harness(){
  let next=1,interval=0;
  const timers=new Map();
  const window={addEventListener(){}};
  const context={window,document:{hidden:false,addEventListener(){}},navigator:{onLine:true},
    crypto:{subtle:{digest:async()=>new Uint8Array(32).buffer}},TextEncoder,TextDecoder,structuredClone,Uint8Array,AbortController,btoa,atob,fetch:async()=>{throw new Error('unexpected network');},
    setTimeout(cb,delay){const id=next++;timers.set(id,{cb,delay});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(_fn,delay){interval=delay;return next++;},clearInterval(){}};
  runInNewContext(src,context);
  return {window,timers,interval:()=>interval};
}
function trip(){return {destination:'Hawaii',travelers:2,startDate:'',endDate:'',
  datesConfigured:false,daySummaries:{},hotels:[],groups:['観光'],places:[],packingItems:[],todoItems:[],meals:{},souvenirs:[],souvenirPeople:[],souvenirOwners:[{id:'owner-husband',name:'夫',budgetAmount:null,currency:'USD'},{id:'owner-wife',name:'妻',budgetAmount:null,currency:'USD'}]};}
test('foreground poll checks every 2 seconds and local edits are sent promptly',()=>{
  const h=harness(),data=trip(),metadata={roomId:'room-1',key:'secret',revision:1,baseline:data};
  const sharing=h.window.TabiSharing.create({getContext:()=>({id:'trip-1',metadata,trip:data})});
  sharing.attach();
  assert.equal(h.interval(),2000);
  sharing.changed();
  assert.equal([...h.timers.values()].filter(v=>v.delay===120).length,1);
  sharing.dispose();
});
test('an update during a running request causes an immediate follow-up sync',async()=>{
  const h=harness(),data=trip();let metadata={roomId:'room-1',key:'secret',revision:1,baseline:data};
  let firstResponse,requests=0;const statuses=[];const errors=[];
  const response=()=>({status:304,headers:{get:()=> '1'}});
  const sharing=h.window.TabiSharing.create({
    getContext:()=>({id:'trip-1',metadata,trip:data}),
    onStatus:status=>statuses.push(status),
    onError:error=>errors.push(error?.stack||error?.message),
    applyTrip(next){Object.assign(data,next);},
    setMetadata(next){metadata=next;},
    fetch:async()=>{requests++;if(requests===1)return new Promise(resolve=>{firstResponse=resolve;});return response();}
  });
  sharing.attach();
  const first=sharing.sync();
  for(let i=0;i<30&&requests===0;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);
  sharing.changed();
  firstResponse(response());
  await first;
  const followup=[...h.timers.values()].find(v=>v.delay===0);
  assert.ok(followup,'queued sync missing; timers='+[...h.timers.values()].map(v=>v.delay).join(',')+'; statuses='+statuses.join(',')+'; errors='+errors.join(' | '));
  followup.cb();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,2);
  sharing.dispose();
});
test('app and dist share the same implementation and cache versions',()=>{
  for(const path of ['sync.js','notifications.js','sw.js','index.html']){
    assert.equal(readFileSync(path,'utf8'),readFileSync('dist/'+path,'utf8'));
  }
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v\d+/);
  assert.match(readFileSync('sw.js','utf8'),/Promise\.all\(\[/);
});
