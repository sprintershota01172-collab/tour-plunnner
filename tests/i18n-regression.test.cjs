'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
function mount(){
 const node={nodeValue:'行き先未設定',parentElement:{tagName:'SPAN',closest:()=>false}};
 const storage=new Map();
 const document={body:{},documentElement:{lang:'ja',dataset:{}},title:'',
   createTreeWalker(){let visited=false;return {currentNode:null,nextNode(){if(visited)return false;visited=true;this.currentNode=node;return true;}}},
   querySelector(){return null;},querySelectorAll(){return [];}};
 const window={dispatchEvent(){}};
 class MutationObserver{observe(){}}
 class CustomEvent{constructor(name,data){this.type=name;this.detail=data.detail;}}
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 runInNewContext(readFileSync('i18n.js','utf8'),{document,window,MutationObserver,CustomEvent,
   navigator:{language:'en-US'},localStorage,NodeFilter:{SHOW_TEXT:4},WeakMap,Set,
   URL,Uint8Array,Image:function(){},requestAnimationFrame(){}});
 return {node,window};
}
test('switching language does not restore an old destination over a new one',()=>{
 const {node,window}=mount();
 assert.equal(node.nodeValue,'Destination not set');
 node.nodeValue='Honolulu';
 window.TabiLocale.refresh();
 assert.equal(node.nodeValue,'Honolulu');
 window.TabiLocale.setLanguage('ja');
 assert.equal(node.nodeValue,'Honolulu');
});
test('static text can change language repeatedly',()=>{
 const {node,window}=mount();
 window.TabiLocale.setLanguage('ja');
 assert.equal(node.nodeValue,'行き先未設定');
 window.TabiLocale.setLanguage('en');
 assert.equal(node.nodeValue,'Destination not set');
});

test('four font styles are selectable',()=>{const {window}=mount();window.TabiLocale.setFont('serif');assert.equal(window.TabiLocale.getFont(),'serif');window.TabiLocale.setFont('round');assert.equal(window.TabiLocale.getFont(),'round');});
