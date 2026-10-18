'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

function mount(){
  const vars=new Map(),classes=new Set(),timers=new Map();
  let seq=0;
  const documentEvents={},viewportEvents={},windowEvents={};
  const openModal={active:true};
  const visualViewport={height:844,offsetTop:0,addEventListener(type,fn){viewportEvents[type]=fn;}};
  const document={
    documentElement:{style:{setProperty(key,value){vars.set(key,value);}},classList:{
      add(key){classes.add(key)},remove(key){classes.delete(key)},toggle(key,enable){if(enable)classes.add(key);else classes.delete(key)}
    }},
    activeElement:null,
    querySelector(selector){return selector==='.modal-backdrop.open'&&openModal.active?{}:null},
    addEventListener(type,fn){documentEvents[type]=fn;}
  };
  const window={innerHeight:844,innerWidth:390,visualViewport,addEventListener(type,fn){windowEvents[type]=fn;}};
  const timeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;};
  const clear=id=>{timers.delete(id);};
  function flush(){let cycles=0;while(timers.size&&cycles++<10){const list=[...timers.values()];timers.clear();for(const t of list)t.fn();}}
  runInNewContext(readFileSync('mobile-input.js','utf8'),{
    window,document,matchMedia:()=>({matches:true}),
    setTimeout:timeout,clearTimeout:clear,
    requestAnimationFrame:fn=>{fn();return 1;}
  },{timeout:1000});
  return {vars,classes,timers,flush,document,window,visualViewport,documentEvents,viewportEvents,windowEvents,openModal};
}
const active=()=>({matches:()=>true});
test('iOS keyboard height is applied once after resize settles',()=>{
  const ui=mount();
  assert.equal(ui.vars.get('--sheet-visual-height'),'844px');
  ui.document.activeElement=active();ui.documentEvents.focusin();
  ui.visualViewport.height=515;ui.viewportEvents.resize();
  assert.equal(ui.vars.get('--sheet-visual-height'),'844px','do not resize the dialog during keyboard animation');
  ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-height'),'515px');
  assert.equal(ui.vars.has('--keyboard-inset'),false);
  assert.equal(ui.classes.has('editing-input'),true);
  ui.visualViewport.height=511;ui.viewportEvents.resize();ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-height'),'515px','minor predictive text changes must not move the sheet');
});
test('input focus switching does not flicker editing mode or jump the sheet',()=>{
  const ui=mount();
  ui.document.activeElement=active();ui.documentEvents.focusin();
  ui.visualViewport.height=515;ui.viewportEvents.resize();ui.flush();
  const height=ui.vars.get('--sheet-visual-height');
  ui.document.activeElement=null;ui.documentEvents.focusout();
  ui.document.activeElement=active();ui.documentEvents.focusin();
  assert.equal(ui.classes.has('editing-input'),true);
  ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-height'),height);
  ui.document.activeElement=null;ui.documentEvents.focusout();
  ui.visualViewport.height=844;ui.visualViewport.offsetTop=0;
  ui.flush();
  assert.equal(ui.classes.has('editing-input'),false);
  assert.equal(ui.vars.get('--sheet-visual-height'),'844px');
});
test('modal follows stable viewport offset and resets on blur',()=>{
  const ui=mount();
  ui.document.activeElement=active();ui.documentEvents.focusin();
  ui.visualViewport.offsetTop=36;ui.viewportEvents.scroll();ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-top'),'36px');
  ui.document.activeElement=null;ui.documentEvents.focusout();
  ui.visualViewport.height=844;ui.visualViewport.offsetTop=0;ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-top'),'0px');
});
test('landscape rotation updates layout height without scroll repositioning',()=>{
  const ui=mount();
  ui.window.innerWidth=844;ui.window.innerHeight=390;ui.visualViewport.height=390;
  ui.windowEvents.orientationchange();ui.flush();
  assert.equal(ui.vars.get('--sheet-visual-height'),'390px');
  assert.equal(ui.vars.get('--vh'),'390px');
});