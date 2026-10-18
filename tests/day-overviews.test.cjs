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

test('legacy trip day overviews are normalized and safely limited',()=>{
  const first=app.indexOf('function normalizeDaySummaries('),last=app.indexOf('function daySummaryKey(',first);
  assert.ok(first>0&&last>first);
  const normalize=runInNewContext(app.slice(first,last)+';normalizeDaySummaries');
  assert.equal(JSON.stringify(normalize(undefined)),'{}');
  const notes=normalize({
    '2027-02-21':'  ホテルでゆっくり！  ',
    '2027-02-22':' 午前はビーチ、午後は観光 ',
    'bad':'ignore',
    '2027-02-23':99,
    '__proto__':'not an actual date',
    '2027-02-24':' '.repeat(250)
  });
  assert.equal(notes['2027-02-21'],'ホテルでゆっくり！');
  assert.equal(notes['2027-02-22'],'午前はビーチ、午後は観光');
  assert.equal(notes['2027-02-23'],undefined);
  assert.equal(notes['bad'],undefined);
  assert.equal(Object.keys(notes).length,2);
  assert.equal(normalize({'2027-03-01':'x'.repeat(500)})['2027-03-01'].length,240);
  assert.match(app,/s\.daySummaries=normalizeDaySummaries\(data\.daySummaries\)/);
});

test('calendar date, not day position, is used as overview identity',()=>{
  const start=app.indexOf('function daySummaryKey('),end=app.indexOf('function openDaySummary(',start);
  assert.ok(start>0&&end>start);
  const current={
    startDate:'2027-02-21',endDate:'2027-02-27',
    daySummaries:{'2027-02-21':'ホテルでのんびり'}
  };
  const dateAt=i=>{const d=new Date(current.startDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d;};
  const helpers=runInNewContext(app.slice(start,end)+';({daySummaryKey,daySummary})',{
    hasTripDates:()=>true,dayCount:()=>7,dateAt,state:current
  });
  assert.equal(helpers.daySummaryKey(0),'2027-02-21');
  assert.equal(helpers.daySummary(0),'ホテルでのんびり');
  current.startDate='2027-02-20';
  assert.equal(helpers.daySummaryKey(1),'2027-02-21');
  assert.equal(helpers.daySummary(1),'ホテルでのんびり');
  assert.equal(helpers.daySummary(0),'');
  assert.equal(helpers.daySummaryKey(7),'');
});

test('itinerary and board both offer editing; notes are not timed appointments',()=>{
  assert.match(html,/id="daySummaryBackdrop"/);
  assert.match(html,/id="daySummaryForm"/);
  assert.match(html,/name="dayKey"/);
  assert.match(html,/name="summary"/);
  assert.match(app,/data-edit-day-summary/);
  assert.match(app,/function openDaySummary\(/);
  assert.match(app,/function saveDaySummary\(/);
  assert.match(app,/renderItinerary\(\);renderDays\(\)/);
  assert.match(css,/\.itinerary-day-overview\{/);
  assert.match(css,/\.day-context-overview\{/);
  assert.match(css,/@media\(max-width:600px\)/);
});

test('summaries sync by date, and partner changes are announced',()=>{
  assert.match(sync,/'datesConfigured','daySummaries','hotels'/);
  assert.match(sync,/\['meals','daySummaries'\]\.includes\(field\)/);
  assert.match(notifications,/previousOverview=before\.daySummaries\|\|\{\}/);
  assert.match(notifications,/旅行.*の概要を/);
  const begin=sync.indexOf('function mergeValue('),end=sync.indexOf('function mergeItems(',begin);
  const mergeValue=runInNewContext(sync.slice(begin,end)+';mergeValue',{
    same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    copy:v=>structuredClone(v)
  });
  const before={'2027-02-21':'a'};
  const left={'2027-02-21':'a','2027-02-22':'b'};
  const right={'2027-02-21':'a','2027-02-23':'c'};
  const merged=mergeValue(before,left,right);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)),{
    '2027-02-21':'a','2027-02-22':'b','2027-02-23':'c'
  });
});

test('deploy root and dist are consistent and offline version increases',()=>{
  for(const p of ['app.js','index.html','styles.css','sync.js','notifications.js','i18n.js','sw.js']){
    assert.equal(readFileSync(p,'utf8'),readFileSync('dist/'+p,'utf8'));
  }
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v\\d+/);
});
