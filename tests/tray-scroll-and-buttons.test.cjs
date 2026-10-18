'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('styles.css','utf8');
test('mobile tray never initiates dragging from touch or pen',()=>{
  assert.match(app,/if\(e\.pointerType!=='mouse'\|\|e\.target\.closest\('button'\)\)return;/);
  assert.match(app,/addEventListener\('pointerdown',e=>\{if\(e\.pointerType!=='mouse'/);
  assert.match(css,/\.board-page \.tray-pieces\{[\s\S]*?touch-action:pan-y!important/);
  assert.match(css,/\.board-page \.tray-piece\{[\s\S]*?touch-action:pan-y!important/);
});
test('place buttons align independently of text length and must-go badges',()=>{
  assert.match(app,/class="tray-priority-slot"/);
  assert.match(css,/grid-template-columns:26px minmax\(0,1fr\) 12px 38px!important/);
  assert.match(css,/\.board-page \.tray-piece \.tray-place-button\{[\s\S]*?grid-column:4;/);
  assert.match(css,/\.board-page \.tray-piece \.tray-place-button\{[\s\S]*?width:38px!important/);
  assert.match(css,/\.board-page \.tray-piece \.tray-priority-slot\{grid-column:3/);
});
test('all pieces remain available in expandable scroll list',()=>{
  assert.match(html,/id="trayExpand"[^>]*aria-expanded="false"/);
  assert.match(app,/expand\.hidden=items\.length<=6/);
  assert.match(app,/const page=\$\('\.board-page'\),expanded=page\.classList\.toggle\('tray-expanded'\)/);
  assert.match(css,/\.board-page\.tray-expanded \.tray-pieces\{[\s\S]*?overflow-y:auto!important/);
});
test('dist copies are identical to published sources',()=>{
  for(const path of ['app.js','styles.css','index.html','i18n.js','sw.js'])assert.equal(readFileSync(path,'utf8'),readFileSync('dist/'+path,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v102/);
});
