'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const css=readFileSync('styles.css','utf8'),app=readFileSync('app.js','utf8');
test('hotel schedule rows have uniform heights and fixed date alignment',()=>{
  assert.match(css,/\.itinerary-stays>div\s*\{[\s\S]*?grid-auto-rows:42px/);
  const layout=css.slice(css.indexOf('/* v105:'),css.lastIndexOf('@media(max-width:360px)'));
  assert.match(layout,/grid-template-columns:20px minmax\(0,1fr\) 102px/);
  assert.match(layout,/height:42px;/);
  assert.match(layout,/min-height:42px;/);
  assert.match(layout,/max-height:42px;/);
  assert.match(css,/\.itinerary-stay-row small\s*\{[\s\S]*?white-space:nowrap/);
  assert.match(css,/\.itinerary-stay-row b\s*\{[\s\S]*?text-overflow:ellipsis/);
});
test('hotel names keep their full title and date remains data-driven',()=>{
  assert.match(app,/function staySummary\(\)/);
  assert.match(app,/itinerary-stay-row/);
  assert.ok(app.includes('<b title="'));
  assert.match(css,/@media\(max-width:360px\)/);
});
test('root and deploy copies match and offline cache is refreshed',()=>{
  for(const p of ['app.js','styles.css','index.html','sw.js'])
    assert.equal(readFileSync(p,'utf8'),readFileSync('dist/'+p,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v109/);
});
