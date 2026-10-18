'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const app=readFileSync('app.js','utf8');
const css=readFileSync('styles.css','utf8');
const html=readFileSync('index.html','utf8');
test('page navigation crossfades in place instead of sliding horizontally',()=>{
  assert.doesNotMatch(app,/pages\.style\.transform|index\*25/);
  assert.match(app,/page\.classList\.toggle\('is-active',active\)/);
  assert.match(app,/page\.inert=!active/);
  assert.match(css,/#pages\.pages\{[\s\S]*?transform:none!important/);
  assert.match(css,/#pages\.pages>\.page\{[\s\S]*?position:absolute/);
  assert.match(css,/#pages\.pages>\.page\.is-active\{[\s\S]*?opacity:1/);
  assert.match(css,/transition:opacity 900ms cubic-bezier/);
  assert.match(css,/animation:tabi-text-reveal 1100ms/);
  assert.match(css,/animation:tabi-text-reveal 1050ms/);
  assert.match(html,/class="page wishlist-page is-active" data-page="0"/);
});
test('text reveal honors reduced-motion preference',()=>{
  assert.match(css,/@keyframes tabi-text-reveal/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/#pages\.pages>\.page,#pages\.pages>\.page\.is-active\{transition:none!important\}/);
});
test('deployed root and dist keep the same transition and cache version',()=>{
  for(const path of ['app.js','styles.css','index.html','sw.js'])
    assert.equal(readFileSync(path,'utf8'),readFileSync('dist/'+path,'utf8'));
  assert.match(readFileSync('sw.js','utf8'),/tabi-planner-v103/);
});
