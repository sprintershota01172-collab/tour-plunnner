(() => {
  'use strict';
  const ROOT='https://sprintershota01172-collab.github.io/tour-plunnner/';
  function message(sender,destination){
    const name=String(sender||'').trim().replace(/さん$/,'').slice(0,30);
    const place=String(destination||'').trim().slice(0,100);
    return `${name||'〇〇'}さんから${place?(place.endsWith('旅行')?place:place+'旅行'):'旅行'}の招待が来ています`;
  }
  function validate(data){
    if(!data||typeof data.sender!=='string'||!data.sender.trim()||data.sender.length>30||typeof data.destination!=='string'||data.destination.length>100)throw new Error('invalid');
    const url=new URL(data.url);
    if(url.origin!==new URL(ROOT).origin||url.pathname!==new URL(ROOT).pathname||url.search||!/^#join=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/.test(url.hash))throw new Error('invalid');
    return {sender:data.sender.trim(),destination:data.destination.trim(),url:url.href};
  }
  function card(input){
    const data=validate(input),text=message(data.sender,data.destination);
    return {type:'flex',altText:text,contents:{type:'bubble',size:'mega',hero:{type:'image',url:ROOT+'invite-card-art.png?v=20261013-62',size:'full',aspectRatio:'5:3',aspectMode:'cover'},body:{type:'box',layout:'vertical',backgroundColor:'#F6F2E9',paddingAll:'22px',spacing:'md',contents:[{type:'text',text,wrap:true,size:'md',color:'#173B61'},{type:'separator',color:'#DDD7CA'},{type:'text',text:'行きたい場所も、旅の予定も、一緒に。',wrap:true,size:'xs',color:'#6D7B87'}]},footer:{type:'box',layout:'vertical',backgroundColor:'#F6F2E9',paddingAll:'20px',paddingTop:'0px',contents:[{type:'button',style:'primary',color:'#173B61',height:'sm',action:{type:'uri',label:'招待を開く',uri:data.url}}]}}};
  }
  function encode(input){const bytes=new TextEncoder().encode(JSON.stringify(validate(input)));return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decode(value){if(value.length>4000)throw new Error('invalid');const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return validate(JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)))));}
  const PENDING='tabi-line-invite-pending',TTL=30*60*1000;
  function remember(input){const value={invite:validate(input),created:Date.now()};for(const name of ['sessionStorage','localStorage'])try{window[name].setItem(PENDING,JSON.stringify(value));}catch{}return value.invite;}
  function recover(){for(const name of ['sessionStorage','localStorage'])try{const value=JSON.parse(window[name].getItem(PENDING));if(value&&Number.isFinite(value.created)&&Date.now()-value.created>=0&&Date.now()-value.created<TTL)return validate(value.invite);window[name].removeItem(PENDING);}catch{}return null;}
  function forget(){for(const name of ['sessionStorage','localStorage'])try{window[name].removeItem(PENDING);}catch{}}
  let configPromise;
  function config(){return configPromise||(configPromise=fetch('./line-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('config');return r.json();}).catch(error=>{configPromise=null;throw error;}));}
  function configured(value){return /^\d+-[A-Za-z0-9]+$/.test(value?.liffId||'');}
  window.TabiLineInvite={message,validate,card,encode,decode,remember,recover,forget,config,configured};
})();
