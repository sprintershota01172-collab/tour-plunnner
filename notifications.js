(() => {
  'use strict';
  const API='https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/';
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
  const readJSON=(key,fallback)=>{try{return JSON.parse(read(key))||fallback;}catch{return fallback;}};
  const clientId=read('tabi-notification-device')||crypto.randomUUID();write('tabi-notification-device',clientId);
  const PREF='tabi-notifications-enabled',CHANNEL='tabi-notification-test-channel',KNOWN='tabi-notification-registered-rooms';
  const available=()=>window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,55);
  const named=value=>'「'+(clean(value)||'名前未設定')+'」';
  const dayLabel=value=>{const m=String(value||'').match(/^\d{4}-(\d\d)-(\d\d)$/);return m?Number(m[1])+'/'+Number(m[2]):'日程未設定';};
  const timeLabel=value=>Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
  function scheduleLabel(trip,place){
    if(place.start==null||place.day==null)return '未配置';
    let date=(place.day+1)+'日目';
    if(trip.startDate){const d=new Date(trip.startDate+'T12:00:00Z');if(Number.isFinite(d.getTime())){d.setUTCDate(d.getUTCDate()+place.day);date=(d.getUTCMonth()+1)+'/'+d.getUTCDate();}}
    return date+' '+timeLabel(place.start);
  }
  function describeUpdate(before,after){
    const changes=[],oldPlaces=new Map((before.places||[]).map(p=>[p.id,p])),newPlaces=new Map((after.places||[]).map(p=>[p.id,p]));
    for(const p of after.places||[]){
      const old=oldPlaces.get(p.id);
      if(!old){changes.push(named(p.name)+'をリストに追加しました');continue;}
      if(old.booked!==p.booked||old.reservationRequired!==p.reservationRequired)changes.push(named(p.name)+'の予約を'+(p.booked?'予約済み':p.reservationRequired?'予約が必要':'予約不要')+'にしました');
      if(old.day!==p.day||old.start!==p.start||old.duration!==p.duration)changes.push(named(p.name)+'の予定を'+scheduleLabel(after,p)+(p.start!=null?'（'+p.duration+'分）':'')+'に変更しました');
      else if(!equal({...old,booked:p.booked,reservationRequired:p.reservationRequired},p))changes.push(named(p.name)+'の情報を編集しました');
    }
    for(const p of before.places||[])if(!newPlaces.has(p.id))changes.push(named(p.name)+'をリストから削除しました');
    const oldHotels=new Map((before.hotels||[]).map((h,i)=>[h.id||String(i),h])),newHotels=new Map((after.hotels||[]).map((h,i)=>[h.id||String(i),h]));
    for(const [id,h] of newHotels){const old=oldHotels.get(id);if(!old||!equal(old,h))changes.push('宿泊先'+named(h.name)+'を'+(!old?'追加':'変更')+'しました'+(h.start&&h.end?'（'+dayLabel(h.start)+'〜'+dayLabel(h.end)+'）':''));}
    for(const [id,h] of oldHotels)if(!newHotels.has(id))changes.push('宿泊先'+named(h.name)+'を削除しました');
    if(before.destination!==after.destination)changes.push('行き先を'+named(after.destination)+'に変更しました');
    if(before.startDate!==after.startDate||before.endDate!==after.endDate)changes.push('旅行日程を'+dayLabel(after.startDate)+(after.endDate?'〜'+dayLabel(after.endDate):'')+'に変更しました');
    if(before.travelers!==after.travelers)changes.push('旅行人数を'+after.travelers+'人に変更しました');
    const packing=new Map((before.packingItems||[]).map(p=>[p.id,p]));
    for(const p of after.packingItems||[]){const old=packing.get(p.id);if(!old)changes.push('持ち物'+named(p.name)+'を追加しました');else if(old.checked!==p.checked)changes.push('持ち物'+named(p.name)+'を'+(p.checked?'準備済み':'未準備')+'にしました');else if(!equal(old,p))changes.push('持ち物'+named(p.name)+'を編集しました');}
    const currentPacking=new Set((after.packingItems||[]).map(p=>p.id));for(const p of before.packingItems||[])if(!currentPacking.has(p.id))changes.push('持ち物'+named(p.name)+'を削除しました');
    const oldGifts=new Map((before.souvenirs||[]).map(item=>[item.id,item])),newGifts=new Map((after.souvenirs||[]).map(item=>[item.id,item]));
    for(const gift of after.souvenirs||[]){
      const old=oldGifts.get(gift.id);
      if(!old)changes.push('お土産'+named(gift.name)+'を追加しました');
      else if(!!old.bought!==!!gift.bought)changes.push('お土産'+named(gift.name)+'を'+(gift.bought?'購入済み':'未購入')+'にしました');
      else if(!equal(old,gift))changes.push('お土産'+named(gift.name)+'を編集しました');
    }
    for(const gift of before.souvenirs||[])if(!newGifts.has(gift.id))changes.push('お土産'+named(gift.name)+'を削除しました');
    if(!equal(before.groups,after.groups))changes.push('リストのグループを変更しました');
    if(!changes.length)return null;
    return ('パートナーが'+changes.slice(0,2).join('\n')+(changes.length>2?'\nほか'+(changes.length-2)+'件の更新':'')).slice(0,300);
  }
  function create(options){
    let busy=false,message='',feedback='',progress='',timer=0,queue=Promise.resolve(),restoring=false;
    const room=()=>options.getMetadata?.();
    const desired=()=>read(PREF)==='on';
    const metadata=value=>({roomId:value.roomId,key:value.key});
    const known=()=>readJSON(KNOWN,[]);
    const remember=meta=>write(KNOWN,JSON.stringify([...known().filter(m=>m.roomId!==meta.roomId),metadata(meta)]));
    const forget=meta=>write(KNOWN,JSON.stringify(known().filter(m=>m.roomId!==meta.roomId)));
    const activeRooms=()=>[...new Map([...(options.listMetadata?.()||[]),...(room()?[room()]:[]),...(readJSON(CHANNEL,null)?[readJSON(CHANNEL,null)]:[])].map(m=>[m.roomId,m])).values()];
    const allRooms=()=>[...new Map([...activeRooms(),...known()].map(m=>[m.roomId,m])).values()];
    const api=async(meta,method,body)=>{
      const response=await fetch(API+meta.roomId+'/push',{method,headers:{Authorization:'Bearer '+await window.TabiSharing.auth(meta.key),'X-Tabi-Client':clientId,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error(response.status===404?'not_registered':'connection');return response.json();
    };
    const render=()=>{
      const button=document.querySelector('#partnerNotifyToggle'),hint=document.querySelector('#partnerNotifyHint'),status=document.querySelector('#partnerNotifyState');if(!button||!hint)return;
      const enabled=desired(),supported=available(),permitted=supported&&Notification.permission==='granted';
      const mode=busy?'busy':feedback==='error'?'error':enabled&&permitted?'on':!supported?'unsupported':supported&&Notification.permission==='denied'?'blocked':'off';
      button.dataset.state=mode;button.textContent=busy?'…':enabled?'ON':'OFF';
      button.setAttribute('aria-checked',String(enabled));button.setAttribute('aria-busy',String(busy));button.disabled=busy;
      if(status){status.dataset.state=mode;status.hidden=!['error','blocked','unsupported'].includes(mode);status.textContent={busy:'設定中',on:'通知 ON',off:'通知 OFF',unsupported:'ホーム画面から設定',blocked:'通知の許可が必要',error:'接続を確認してください'}[mode];}
      hint.dataset.state=feedback||mode;
      hint.textContent=busy?progress:message||(!supported?'iPhoneではホーム画面に追加したtabiから設定してください。':Notification.permission==='denied'?'iPhoneの設定でtabiの通知を許可してください。':enabled?(room()?'相手の追加・変更をお知らせします。':'共有を始めると、相手の更新が届きます。'):'相手の追加・変更をお知らせします。');
    };
    const enqueue=work=>{queue=queue.catch(()=>{}).then(work);return queue;};
    async function channel(){
      let meta=readJSON(CHANNEL,null);if(meta)return meta;
      // An empty device-only channel allows push tests before a trip is shared.
      const helper=window.TabiSharing.create({auto:false,getContext:()=>null});
      try{meta=await helper.createRoom({destination:'',travelers:0,startDate:'',endDate:'',datesConfigured:false,hotels:[],groups:[],places:[],packingItems:[]});}
      finally{helper.dispose();}
      meta=metadata(meta);if(!write(CHANNEL,JSON.stringify(meta)))throw new Error('storage');return meta;
    }
    async function registration(){
      return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('worker')),10000))]);
    }
    async function registerAll({testOnly=false}={}){
      if(!desired()&&!testOnly)return;
      const meta=await channel(),reg=await registration(),{publicKey}=await api(meta,'GET'),key=decode(publicKey);
      let subscription=await reg.pushManager.getSubscription();
      if(subscription?.options.applicationServerKey){const current=new Uint8Array(subscription.options.applicationServerKey);if(current.length!==key.length||current.some((v,i)=>v!==key[i])){await subscription.unsubscribe();subscription=null;}}
      if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      const data=subscription.toJSON();if(!data.keys?.p256dh||!data.keys?.auth)throw new Error('subscription_keys');
      const targets=testOnly&&!desired()?[meta]:activeRooms(),activeIds=new Set(activeRooms().map(m=>m.roomId));
      for(const stale of known().filter(m=>!activeIds.has(m.roomId)))try{await api(stale,'DELETE');forget(stale);}catch(error){if(error.message==='not_registered')forget(stale);else throw error;}
      for(const target of targets){
        if(!desired()&&!testOnly)return;
        try{await api(target,'POST',{subscription:data});if(desired())remember(target);}
        catch(error){if(error.message==='not_registered'&&target.roomId!==meta.roomId){forget(target);continue;}throw error;}
      }
    }
    async function unregisterAll(){
      if(available()){const reg=await registration(),sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();}
      let failed=false;for(const meta of allRooms())try{await api(meta,'DELETE');forget(meta);}catch(error){if(error.message==='not_registered')forget(meta);else{remember(meta);failed=true;}}
      if(failed)throw new Error('connection');
    }
    function permission(){
      if(!available())return Promise.reject(new Error('unsupported'));
      return Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
    }
    function errorMessage(error){
      if(error.message==='unsupported')return 'iPhoneではホーム画面に追加したtabiから設定してください。';
      if(error.message==='denied')return '通知が許可されていません。iPhoneの設定からtabiの通知を許可してください。';
      if(error.message==='worker')return '通知の準備ができませんでした。アプリを開き直して再度お試しください。';
      return '接続できませんでした。設定は保持しています。オンラインで再試行してください。';
    }
    async function toggle(){
      if(busy)return;const enabling=!desired(),request=enabling?permission():Promise.resolve(null);
      busy=true;feedback='';message='';progress=enabling?'通知をONにしています…':'通知をOFFにしています…';render();
      try{
        if(enabling){if(await request!=='granted')throw new Error('denied');write(PREF,'on');await enqueue(registerAll);feedback='success';message=room()?'相手の追加・変更をお知らせします。':'共有を始めると、相手の更新が届きます。';}
        else{write(PREF,'off');await enqueue(unregisterAll);feedback='success';message='この端末の更新通知をOFFにしました。';}
      }catch(error){feedback='error';message=!enabling?'通知OFFを保存しました。接続が戻るとサーバー側の解除も完了します。':errorMessage(error);}
      finally{busy=false;render();}
    }
    async function restore(){
      if(read(PREF)===null)write(PREF,allRooms().some(m=>read('tabi-push:'+m.roomId)==='on')?'on':'off');
      render();if(restoring||busy||navigator.onLine===false)return;restoring=true;
      try{await enqueue(async()=>{if(desired()&&available()&&Notification.permission==='granted')await registerAll();else if(!desired()&&known().length)await unregisterAll();});if(feedback==='error'){feedback='';message='';}}
      catch(error){feedback='error';message=errorMessage(error);}finally{restoring=false;render();}
    }
    function notice(before,after){
      const el=document.querySelector('#partnerUpdateNotice'),text=describeUpdate(before,after);if(!el||!text)return;
      el.textContent=text;el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),6500);
    }
    async function leave(meta){if(!meta)return;remember(meta);try{await enqueue(()=>api(meta,'DELETE'));forget(meta);}catch{}}
    document.querySelector('#partnerNotifyToggle')?.addEventListener('click',toggle);
    navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='tabi-partner-update')options.sync?.();});
    window.addEventListener('online',restore);window.addEventListener('focus',restore);
    return {render,notice,restore,leave};
  }
  window.TabiNotifications={create,clientId,describeUpdate};
})();
