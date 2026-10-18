(() => {
  'use strict';
  const API='https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/';
  const FIELDS=['destination','travelers','startDate','endDate','datesConfigured','daySummaries','hotels','groups','places','packingItems','todoItems','meals','souvenirs','souvenirPeople','souvenirOwners'];
  const encoder=new TextEncoder(), decoder=new TextDecoder();
  const copy=value=>structuredClone(value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const wire=trip=>Object.fromEntries(FIELDS.map(field=>[field,copy(['meals','daySummaries'].includes(field)?(trip[field]||{}):['todoItems','souvenirs','souvenirPeople','souvenirOwners'].includes(field)?(Array.isArray(trip[field])?trip[field]:[]):trip[field])]));
  const encode64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
  async function auth(key){return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`tabi-auth-v1:${key}`))));}
  async function cryptKey(key){return crypto.subtle.importKey('raw',decode64(key),'AES-GCM',false,['encrypt','decrypt']);}
  async function encrypt(trip,key,roomId){
    let bytes=encoder.encode(JSON.stringify({format:1,trip:wire(trip)})),flag=0;
    if(typeof CompressionStream==='function'){
      bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());flag=1;
    }
    const iv=crypto.getRandomValues(new Uint8Array(12)),aad=encoder.encode(`tabi:${roomId}:1:${flag}`);
    const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await cryptKey(key),bytes));
    const envelope=new Uint8Array(13+data.length);envelope[0]=flag;envelope.set(iv,1);envelope.set(data,13);
    if(envelope.length>16*1024*1024)throw new Error('photos_too_large');return envelope;
  }
  async function decrypt(body,key,roomId){
    const bytes=new Uint8Array(body),flag=bytes[0];
    if(bytes.length<29||flag>1)throw new Error('invalid_invite');
    let plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(1,13),additionalData:encoder.encode(`tabi:${roomId}:1:${flag}`)},await cryptKey(key),bytes.slice(13)));
    if(flag===1){
      if(typeof DecompressionStream!=='function')throw new Error('browser_update');
      const reader=new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>64*1024*1024){await reader.cancel();throw new Error('photos_too_large');}chunks.push(part.value);}
      plain=new Uint8Array(size);let offset=0;for(const chunk of chunks){plain.set(chunk,offset);offset+=chunk.length;}
    }
    const value=JSON.parse(decoder.decode(plain));
    if(value.format!==1||!value.trip||!Array.isArray(value.trip.places)||!Array.isArray(value.trip.hotels)||!Array.isArray(value.trip.packingItems)||!Array.isArray(value.trip.groups))throw new Error('invalid_invite');
    return wire(value.trip);
  }
  // Three-way field merging retains independent changes. A deletion wins over an edit.
  function mergeValue(base,local,remote){
    if(same(local,base))return copy(remote);if(same(remote,base)||same(local,remote))return copy(local);
    if(local&&remote&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){
      const result={};for(const field of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
        if(field==='__proto__'||field==='constructor'||field==='prototype')continue;
        result[field]=mergeValue(base?.[field],local[field],remote[field]);
      }return result;
    }return copy(local);
  }
  function mergeItems(base=[],local=[],remote=[]){
    const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x])),result=[];
    for(const id of new Set([...remote.map(x=>x.id),...local.map(x=>x.id)])){
      if(b.has(id)&&(!l.has(id)||!r.has(id)))continue;
      result.push(b.has(id)?mergeValue(b.get(id),l.get(id),r.get(id)):copy(l.get(id)||r.get(id)));
    }return result;
  }
  function merge(base,local,remote){
    const result={};base=base||remote;
    for(const field of FIELDS){
      if(['places','hotels','packingItems','todoItems','souvenirs','souvenirPeople','souvenirOwners'].includes(field))result[field]=mergeItems(base[field],local[field],remote[field]);
      else if(field==='groups'){
        const original=new Set(base.groups||[]),left=new Set(local.groups||[]),right=new Set(remote.groups||[]);
        result.groups=[...new Set([...(remote.groups||[]),...(local.groups||[])])].filter(name=>!original.has(name)||(left.has(name)&&right.has(name)));
      }else result[field]=mergeValue(base[field],local[field],remote[field]);
    }
    for(const place of result.places)if(!result.groups.includes(place.category))place.category='未分類';
    return result;
  }
  function settleSchedule(trip){
    const result=copy(trip),scheduled=[];let displaced=0;
    for(const place of result.places.filter(p=>p.start!=null).sort((a,b)=>a.day-b.day||a.start-b.start||String(a.id).localeCompare(String(b.id)))){
      if(scheduled.some(p=>p.day===place.day&&place.start<p.start+(p.duration||60)&&place.start+(place.duration||60)>p.start)){
        place.start=null;place.day=null;displaced++;
      }else scheduled.push(place);
    }return {trip:result,displaced};
  }
  // A protected invitation wraps the room secret with a password-derived key.
  // This keeps the usable room secret out of password-protected URLs.
  const UUID='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  function parseInvite(hash){
    const h=String(hash||'');
    let match=h.match(new RegExp('^#join=('+UUID+')\\.([A-Za-z0-9_-]{43})$'));
    if(match)return {roomId:match[1],key:match[2]};
    match=h.match(new RegExp('^#joinp=('+UUID+')\\.([A-Za-z0-9_-]{22})\\.([A-Za-z0-9_-]{16})\\.([A-Za-z0-9_-]{64})$'));
    return match?{roomId:match[1],locked:true,salt:match[2],nonce:match[3],wrapped:match[4]}:null;
  }
  function parseInviteUrl(input){
    try{
      const url=new URL(String(input||'').trim());
      const normalizedPath=pathname=>pathname.endsWith('/index.html')?pathname.slice(0,-'index.html'.length):pathname;
      if(url.origin!==location.origin||normalizedPath(url.pathname)!==normalizedPath(location.pathname)||url.search)return null;
      return parseInvite(url.hash);
    }catch{return null;}
  }
  function link(metadata){const u=new URL(location.origin+location.pathname);u.hash='join='+metadata.roomId+'.'+metadata.key;return u.href;}
  async function inviteKey(password,salt){
    const source=await crypto.subtle.importKey('raw',encoder.encode(password.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function protectInvite(metadata,password){
    if(!metadata?.roomId||typeof metadata.key!=='string'||decode64(metadata.key).length!==32)throw new Error('invalid_invite');
    if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('weak_password');
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const wrapped=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('tabi:invite:v1:'+metadata.roomId)},await inviteKey(password,salt),decode64(metadata.key)));
    const u=new URL(location.origin+location.pathname);
    u.hash='joinp='+metadata.roomId+'.'+encode64(salt)+'.'+encode64(iv)+'.'+encode64(wrapped);
    return u.href;
  }
  async function unlockInvite(invite,password){
    if(!invite?.locked)return invite;
    if(!password)throw new Error('password_required');
    try{
      const secret=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(invite.nonce),additionalData:encoder.encode('tabi:invite:v1:'+invite.roomId)},await inviteKey(password,decode64(invite.salt)),decode64(invite.wrapped)));
      if(secret.length!==32)throw new Error('invalid_invite');
      return {roomId:invite.roomId,key:encode64(secret)};
    }catch{throw new Error('wrong_password');}
  }
  function create(options){
    let currentId='',timer=0,poll=0,running=false,rerunRequested=false,status='local',disposed=false;
    const transport=options.fetch||fetch;
    const online=()=>options.online?options.online():navigator.onLine!==false;
    const context=()=>options.getContext();
    const tag=ctx=>ctx?.metadata?`${ctx.id}:${ctx.metadata.roomId}:${ctx.metadata.key}`:'';
    const valid=ctx=>!disposed&&tag(context())===tag(ctx);
    const busy=()=>options.isBusy?.()||false;
    function emit(next){status=next;options.onStatus?.(next);}
    function schedule(delay=120){clearTimeout(timer);if(!disposed)timer=setTimeout(()=>{timer=0;void sync();},delay);}
    async function request(metadata,method,body,revision,conditional=false,updateMessage=null){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
      try{
        const headers={Authorization:`Bearer ${await auth(metadata.key)}`};
        if(method==='PUT'&&window.TabiNotifications?.clientId)headers['X-Tabi-Client']=window.TabiNotifications.clientId;
        if(body)headers['Content-Type']='application/octet-stream';
        if(method==='PUT'&&updateMessage)headers['X-Tabi-Update']=encode64(encoder.encode(updateMessage.slice(0,300)));
        if(revision)headers[conditional?'If-None-Match':'X-Tabi-Revision']=conditional?`"${revision}"`:String(revision);
        const response=await transport(`${options.api||API}${metadata.roomId}`,{method,body,headers,cache:'no-store',credentials:'omit',signal:controller.signal});
        if(![200,201,304,409].includes(response.status))throw new Error(response.status===413?'photos_too_large':response.status===404?'invalid_invite':'connection');
        return response;
      }finally{clearTimeout(timeout);}
    }
    async function sync(){
      const initial=context();if(!initial?.metadata||disposed)return;
      if(!online()){emit('offline');return;}
      if(running){rerunRequested=true;return;}
      if(busy()){emit('waiting');schedule(250);return;}
      running=true;rerunRequested=false;let failed=false;emit('syncing');
      try{
        for(let attempt=0;attempt<5;attempt++){
          if(!valid(initial))return;
          const ctx=context(),metadata=ctx.metadata;
          const response=await request(metadata,'GET',null,metadata.revision,true);
          const revision=Number(response.headers.get('X-Tabi-Revision'));
          if(!Number.isSafeInteger(revision)||revision<1)throw new Error('connection');
          const remote=response.status===304?metadata.baseline:await decrypt(await response.arrayBuffer(),metadata.key,metadata.roomId);
          if(!valid(initial))return;
          if(busy()){emit('waiting');schedule(250);return;}
          const latest=context(),merged=settleSchedule(merge(metadata.baseline,wire(latest.trip),remote));
          if(!same(wire(latest.trip),merged.trip)){options.applyTrip(merged.trip);if(merged.displaced)options.onConflict?.(merged.displaced);}
          options.setMetadata({...context().metadata,revision,baseline:copy(remote)});
          const snapshot=wire(context().trip);
          if(same(snapshot,remote)){emit('synced');return;}
          const body=await encrypt(snapshot,metadata.key,metadata.roomId);
          if(!valid(initial))return;
          const updateMessage=window.TabiNotifications?.describeUpdate(remote,snapshot);
          const saved=await request(metadata,'PUT',body,revision,false,updateMessage);
          if(!valid(initial))return;
          if(saved.status===409)continue;
          const nextRevision=Number(saved.headers.get('X-Tabi-Revision'));
          if(!Number.isSafeInteger(nextRevision)||nextRevision<=revision)throw new Error('connection');
          options.setMetadata({...context().metadata,revision:nextRevision,baseline:copy(snapshot)});
          if(same(wire(context().trip),snapshot))emit('synced');else{emit('waiting');schedule(100);}
          return;
        }
        emit('waiting');schedule(1500);
       }catch(error){
        options.onError?.(error);
        failed=true;
        if(valid(initial)){
          emit(!online()?'offline':error.message==='photos_too_large'?'too-large':error.message==='invalid_invite'?'invalid':'retry');
          if(online()&&error.message!=='invalid_invite'&&error.message!=='photos_too_large')schedule(2500);
        }
      }finally{
        running=false;
        if(tag(context())!==tag(initial)&&context()?.metadata)schedule(100);
        else if(rerunRequested&&valid(initial)){
          rerunRequested=false;
          // An edit or incoming push received during a request triggers a follow-up sync.
          schedule(failed?1500:0);
        }
      }
    }
    function attach(){
      const ctx=context(),next=tag(ctx);if(next===currentId)return;currentId=next;clearTimeout(timer);clearInterval(poll);rerunRequested=false;
      if(!next){emit('local');return;}emit(online()?'waiting':'offline');
      if(options.auto!==false){poll=setInterval(()=>{if(online()&&(typeof document==='undefined'||!document.hidden))sync();},2000);if(online())schedule(100);}
    }
    function changed(){attach();if(context()?.metadata){emit(online()?'waiting':'offline');if(options.auto!==false){if(running)rerunRequested=true;schedule();}}}
    async function createRoom(trip){
      if(!online())throw new Error('offline');
      const metadata={roomId:crypto.randomUUID(),key:encode64(crypto.getRandomValues(new Uint8Array(32))),revision:1,baseline:wire(trip)};
      const body=await encrypt(trip,metadata.key,metadata.roomId),response=await request(metadata,'POST',body);
      if(response.status!==201)throw new Error('connection');return metadata;
    }
    async function join(invite){
      if(!online())throw new Error('offline');
      const response=await request(invite,'GET'),trip=await decrypt(await response.arrayBuffer(),invite.key,invite.roomId);
      return {trip,metadata:{...invite,revision:Number(response.headers.get('X-Tabi-Revision')),baseline:copy(trip)}};
    }
    const wake=()=>{attach();if(options.auto!==false)sync();};
    if(options.auto!==false){window.addEventListener('online',wake);window.addEventListener('offline',()=>emit(context()?.metadata?'offline':'local'));window.addEventListener('focus',wake);document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});}
    return {attach,changed,sync,createRoom,join,getStatus:()=>status,dispose(){disposed=true;clearTimeout(timer);clearInterval(poll);}};
  }
  window.TabiSharing={create,wire,merge,settleSchedule,parseInvite,parseInviteUrl,link,protectInvite,unlockInvite,encrypt,decrypt,auth};
})();
