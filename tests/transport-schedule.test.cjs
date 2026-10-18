'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const app=readFileSync('app.js','utf8'),sync=readFileSync('sync.js','utf8'),html=readFileSync('index.html','utf8'),css=readFileSync('styles.css','utf8');
const start=app.indexOf('const TRANSFER_MODES='),end=app.indexOf('function normalizeSouvenirs(',start);
if(start<0||end<start)throw Error('Transfer helpers are missing');
function harness(places=[]){
 const messages=[],state={places,transfers:[]};
 const error={textContent:'',hidden:true};
 let writes=0,draws=0;
 const context={
  state,START_MIN:360,END_MIN:1380,PX_PER_MIN:44/60,selectedDay:0,
  $:s=>s==='#transferError'?error:null,
  id:()=> 'new-transfer',
  structuredClone,undoSnapshot:null,undoMessage:'',
  dayCount:()=>7,persist:()=>writes++,renderTimeline:()=>draws++,renderItinerary:()=>draws++,
  closeModal:()=>{},showToast:message=>messages.push(message),showUndoToast:message=>messages.push(message),
  fmtTime:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
  esc:v=>String(v),icon:()=>'',cat:()=>({color:'#000'})
 };
 const f=runInNewContext(app.slice(start,end)+';({normalizeTransfers,transferMinutes,transferConflict,transferConflictForDisplay,renderTransferRow,saveTransfer})',context);
 return {...f,state,messages,error,writes:()=>writes,draws:()=>draws};
}
const field=value=>({value:String(value)});
const event=(values)=>({preventDefault(){},currentTarget:{elements:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,field(value)]))}});
test('transport times, modes and invalid legacy records normalize safely',()=>{
 const h=harness();
 assert.equal(h.transferMinutes('09:42'),582);
 assert.equal(h.transferMinutes('25:15'),null);
 const items=h.normalizeTransfers([
  {id:'a',day:0,mode:'bus',start:540,end:575,from:'A',to:'B',line:'2'},
  {id:'a',day:0,mode:'taxi',start:540,end:570},
  {id:'b',day:1,mode:'walk',start:700,end:690},
  {id:'c',day:2,mode:'train',start:630,end:680}
 ]);
 assert.equal(items.length,2);
 assert.equal(items[0].mode,'bus');
 assert.equal(items[1].mode,'train');
});
test('one transport entry is saved with endpoints and blocks overlapping entries',()=>{
 const h=harness([{id:'p',day:0,start:720,duration:45}]);
 const values={id:'',day:'0',mode:'bus',start:'09:05',end:'09:42',from:'ホテル',to:'ビーチ',line:'TheBus 2',note:'停留所から徒歩5分'};
 h.saveTransfer(event(values));
 assert.equal(h.state.transfers.length,1);
 const item=h.state.transfers[0];
 assert.equal(item.mode,'bus');
 assert.equal(item.start,545);assert.equal(item.end,582);
 assert.equal(item.from,'ホテル');assert.equal(item.to,'ビーチ');
 assert.equal(item.line,'TheBus 2');
 assert.equal(h.writes(),1);assert.equal(h.draws(),2);
 assert.equal(h.transferConflict(0,560,580),true);
 assert.equal(h.transferConflict(0,720,760),true);
 assert.equal(h.transferConflict(0,700,710),false);
 h.saveTransfer(event({...values,id:'',start:'12:05',end:'12:40'}));
 assert.equal(h.state.transfers.length,1,'overlapping place must prevent saving');
 assert.match(h.error.textContent,/時間/);
});
test('itinerary and day planner provide travel buttons and chronological transport representation',()=>{
 for(const id of ['addBoardTransfer','transferBackdrop','transferForm','transferError','deleteTransfer','transferDateLabel'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/name="mode"/);assert.match(html,/name="start" type="time"/);assert.match(html,/name="end" type="time"/);
 assert.match(app,/journeyItems\.map\(entry=>entry\.html\)/);
 assert.match(app,/renderBoardTransfers\(\)/);
 assert.match(app,/data-add-transfer/);
 assert.match(css,/\.itinerary-transfer\{/);
 assert.match(css,/\.timeline-transfer\{/);
});
test('collaboration and offline state retain distinct transfer entries',()=>{
 assert.match(app,/s\.transfers=normalizeTransfers\(data\.transfers\)/);
 assert.match(app,/transfers:\[\]/);
 assert.match(sync,/'places','transfers'/);
 assert.match(sync,/result\.transfers=Array\.isArray\(result\.transfers\)/);
 assert.match(sync,/\['places','hotels','transfers'/);
});
