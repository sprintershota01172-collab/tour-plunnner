'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

function mount(){
  const vars=new Map(),classes=new Set();
  const documentEvents={};
  const viewportEvents={};
  const windowEvents={};
  const visualViewport={height:844,offsetTop:0,addEventListener(type,fn){viewportEvents[type]=fn;}};
  const document={
    documentElement:{style:{setProperty(key,value){vars.set(key,value);}},classList:{toggle(key,enable){if(enable)classes.add(key);else classes.delete(key);}}},
    activeElement:null,
    addEventListener(type,fn){documentEvents[type]=fn;}
  };
  const window={innerHeight:844,innerWidth:390,visualViewport,addEventListener(type,fn){windowEvents[type]=fn;}};
  runInNewContext(readFileSync('mobile-input.js','utf8'),{
    window,document,matchMedia:()=>({matches:true}),
    requestAnimationFrame:fn=>{fn();return 1;}
  },{timeout:1000});
  return {vars,classes,document,window,visualViewport,documentEvents,viewportEvents,windowEvents};
}
test('the keyboard height is counted exactly once when typing in a hotel field',()=>{
  const ui=mount();
  assert.equal(ui.vars.get('--sheet-visual-height'),'844px');
  ui.document.activeElement={matches:()=>true};
  ui.documentEvents.focusin();
  ui.visualViewport.height=515;
  ui.viewportEvents.resize();
  assert.equal(ui.vars.get('--sheet-visual-height'),'515px');
  assert.equal(ui.vars.has('--keyboard-inset'),false);
  assert.equal(ui.classes.has('editing-input'),true);
  ui.visualViewport.height=511;ui.viewportEvents.resize();
  assert.equal(ui.vars.get('--sheet-visual-height'),'515px','minor predictive-text changes do not resize the sheet');
});
test('the dialog follows an iOS visual viewport offset without scrolling the page',()=>{
  const ui=mount();
  ui.document.activeElement={matches:()=>true};
  ui.visualViewport.offsetTop=36;
  ui.viewportEvents.scroll();
  assert.equal(ui.vars.get('--sheet-visual-top'),'36px');
  ui.document.activeElement=null;
  ui.visualViewport.height=844;ui.visualViewport.offsetTop=0;
  ui.documentEvents.focusout();
  assert.equal(ui.vars.get('--sheet-visual-height'),'844px');
  assert.equal(ui.vars.get('--sheet-visual-top'),'0px');
  assert.equal(ui.classes.has('editing-input'),false);
});
test('landscape width changes refresh the full layout height',()=>{
  const ui=mount();
  ui.window.innerWidth=844;ui.window.innerHeight=390;ui.visualViewport.height=390;
  ui.windowEvents.orientationchange();
  assert.equal(ui.vars.get('--sheet-visual-height'),'390px');
  assert.equal(ui.vars.get('--vh'),'390px');
});
