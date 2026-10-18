'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const distApp=readFileSync('dist/app.js','utf8');
const distHtml=readFileSync('dist/index.html','utf8');

test('one shared registration entry point and no collection switch',()=>{
  assert.match(html,/id="registerPlace"/);
  assert.doesNotMatch(html,/id="registerFood"|id="collectionSwitch"/);
  assert.match(html,/id="categoryChips"/);
  assert.match(html,/行きたい場所・食べたいものをまとめる/);
  assert.match(app,/const source=state\.places;/);
  assert.doesNotMatch(app,/collectionMode|switchCollection|collectionItems/);
});
test('category determines meal fields while old food groups remain editable',()=>{
  assert.match(app,/group==='グルメ'\|\|group==='カフェ'/);
  assert.match(app,/existing&&existing\.category===group&&isFood\(existing\)/);
  assert.match(app,/form\.elements\.listType\.value=enabled\?'food':'place'/);
  assert.match(app,/navigate\(0\);openPlace\(undefined,'food'\)/);
});
test('data model preserves meal types and all spots are rendered in same list',()=>{
  assert.match(app,/listType:isFood\(p\)\?'food':'place'/);
  assert.match(app,/const visible=source\.filter\(p=>/);
  assert.match(app,/const items=sortWishlistPlaces\(visible\)/);
  assert.match(app,/function foodPlaces\(\)\{return state\.places\.filter\(isFood\);\}/);
  assert.equal(app,distApp);
  assert.equal(html,distHtml);
});
