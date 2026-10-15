(() => {
  'use strict';
  // A password-derived, encrypted account index built on the existing room API.
  // No cleartext password is transmitted or written to device storage.
  const API='https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/';
  const enc=new TextEncoder();
  const bytes64=b=>btoa(Array.from(b,v=>String.fromCharCode(v)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const KEY=/^[A-Za-z0-9_-]{43}$/;
  const validEntry=entry=>entry&&UUID.test(entry.roomId)&&KEY.test(entry.key);
  const cleanId=text=>String(text||'').trim().toLowerCase();
  const accountIdOk=id=>/^[a-z0-9][a-z0-9._-]{3,31}$/.test(id);
  const vault=entries=>({
    destination:'__tabi_account_v1__',travelers:1,startDate:'',endDate:'',datesConfigured:false,
    hotels:[],groups:[],places:entries.map(entry=>({id:entry.roomId,roomId:entry.roomId,key:entry.key})),
    packingItems:[],meals:{}
  });
  function entriesOf(trip){
    if(trip?.destination!=='__tabi_account_v1__'||!Array.isArray(trip.places))throw new Error('invalid_account');
    const seen=new Set();
    return trip.places.filter(validEntry).filter(entry=>{if(seen.has(entry.roomId))return false;seen.add(entry.roomId);return true;}).map(({roomId,key})=>({roomId,key}));
  }
  async function derive(loginId,password){
    const username=cleanId(loginId);
    if(!accountIdOk(username))throw new Error('invalid_id');
    if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('weak_password');
    if(!crypto?.subtle)throw new Error('browser_update');
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('tabi-account-id-v1:'+username)));
    const identifier=hash.slice(0,16);
    identifier[6]=(identifier[6]&15)|64;
    identifier[8]=(identifier[8]&63)|128;
    const hex=Array.from(identifier,b=>b.toString(16).padStart(2,'0')).join('');
    const roomId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('tabi-account-password-v1:'+username)));
    const source=await crypto.subtle.importKey('raw',enc.encode(password.normalize('NFKC')),'PBKDF2',false,['deriveBits']);
    const key=bytes64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:650000,hash:'SHA-256'},source,256)));
    return {username,roomId,key};
  }
  function validSession(session){
    return session&&accountIdOk(session.username)&&UUID.test(session.roomId)&&KEY.test(session.key);
  }
  async function request(session,method,body,revision){
    if(!validSession(session))throw new Error('invalid_account');
    if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('offline');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
      const headers={Authorization:'Bearer '+await window.TabiSharing.auth(session.key)};
      if(body)headers['Content-Type']='application/octet-stream';
      if(method==='PUT')headers['X-Tabi-Revision']=String(revision);
      return await fetch(API+session.roomId,{method,body,headers,cache:'no-store',credentials:'omit',signal:controller.signal});
    }catch(e){throw new Error('connection');}
    finally{clearTimeout(timer);}
  }
  async function register(loginId,password){
    const session=await derive(loginId,password);
    const body=await window.TabiSharing.encrypt(vault([]),session.key,session.roomId);
    const response=await request(session,'POST',body);
    if(response.status===409||response.status===401||response.status===403)throw new Error('id_taken');
    if(response.status!==201)throw new Error('connection');
    return session;
  }
  async function pull(session){
    const response=await request(session,'GET');
    if([400,401,403,404].includes(response.status))throw new Error('bad_credentials');
    if(response.status!==200)throw new Error('connection');
    const revision=Number(response.headers.get('X-Tabi-Revision'));
    if(!Number.isSafeInteger(revision)||revision<1)throw new Error('connection');
    let decrypted;
    try{decrypted=await window.TabiSharing.decrypt(await response.arrayBuffer(),session.key,session.roomId);}
    catch{throw new Error('bad_credentials');}
    return {entries:entriesOf(decrypted),revision};
  }
  async function login(loginId,password){
    const session=await derive(loginId,password);
    return {session,remote:await pull(session)};
  }
  async function addRooms(session,rooms){
    const incoming=rooms.filter(validEntry).map(({roomId,key})=>({roomId,key}));
    for(let attempt=0;attempt<5;attempt++){
      const remote=await pull(session);
      const all=new Map(remote.entries.map(entry=>[entry.roomId,entry]));
      for(const entry of incoming){
        if(all.has(entry.roomId)&&all.get(entry.roomId).key!==entry.key)throw new Error('room_conflict');
        all.set(entry.roomId,entry);
      }
      if(all.size===remote.entries.length)return remote;
      const body=await window.TabiSharing.encrypt(vault([...all.values()]),session.key,session.roomId);
      const response=await request(session,'PUT',body,remote.revision);
      if(response.status===409)continue;
      if(response.status!==200&&response.status!==201)throw new Error('connection');
      return {entries:[...all.values()],revision:Number(response.headers.get('X-Tabi-Revision'))};
    }
    throw new Error('conflict');
  }
  window.TabiAccounts={derive,register,login,pull,addRooms,validSession,accountIdOk};
})();