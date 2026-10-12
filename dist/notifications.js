(() => {
  'use strict';
  const API='https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/';
  let fallbackId=crypto.randomUUID();
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
  const clientId=read('tabi-notification-device')||fallbackId;write('tabi-notification-device',clientId);
  const preference=room=>read('tabi-push:'+room)==='on';
  const available=()=>window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
  function describeUpdate(before,after){
    const old=new Map((before.places||[]).map(p=>[p.id,p]));
    const added=(after.places||[]).filter(p=>!old.has(p.id));
    if(added.length)return added.length===1?`パートナーが「${added[0].name}」を追加しました`:`パートナーが${added.length}件の場所を追加しました`;
    if((after.places||[]).length<(before.places||[]).length)return 'パートナーが行きたいリストを更新しました';
    if((after.places||[]).some(p=>old.has(p.id)&&(p.start!==old.get(p.id).start||p.day!==old.get(p.id).day||p.duration!==old.get(p.id).duration)))return 'パートナーが旅程を変更しました';
    return 'パートナーが旅行を更新しました';
  }
  function create(options){
    let busy=false,message='',timer=0,queue=Promise.resolve();
    const room=()=>options.getMetadata?.();
    const prefKey=meta=>'tabi-push:'+meta.roomId;
    const api=async(meta,method,body)=>{
      const response=await fetch(API+meta.roomId+'/push',{method,headers:{Authorization:`Bearer ${await window.TabiSharing.auth(meta.key)}`,'X-Tabi-Client':clientId,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('connection');return response.json();
    };
    const render=()=>{
      const meta=room(),button=document.querySelector('#partnerNotifyToggle'),hint=document.querySelector('#partnerNotifyHint');if(!button||!hint)return;
      const enabled=!!meta&&preference(meta.roomId)&&available()&&Notification.permission==='granted';
      button.textContent=busy?'設定中…':enabled?'通知 ON':'通知をONにする';button.setAttribute('aria-pressed',String(enabled));button.disabled=busy||!meta;
      hint.textContent=message||(!meta?'共有リンクを作成・参加すると通知を設定できます。':!available()?'iPhoneではSafariからホーム画面に追加し、そのアプリで通知をONにしてください。':Notification.permission==='denied'?'端末の設定でtabiの通知を許可してから、もう一度ONにしてください。':enabled?'この端末にパートナーの更新を通知します。': 'アプリを閉じているときも更新をお知らせします。');
    };
    const register=async meta=>{
      const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('worker')),10000))]);
      const {publicKey}=await api(meta,'GET');
      let subscription=await registration.pushManager.getSubscription();
      const key=decode(publicKey);
      if(subscription?.options.applicationServerKey){const current=new Uint8Array(subscription.options.applicationServerKey);if(current.length!==key.length||current.some((v,i)=>v!==key[i])){await subscription.unsubscribe();subscription=null;}}
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await api(meta,'POST',{subscription:{endpoint:subscription.endpoint}});
    };
    const enqueue=work=>{queue=queue.catch(()=>{}).then(work);return queue;};
    async function toggle(){
      const meta=room();if(!meta||busy)return;
      const enabled=preference(meta.roomId);
      if(!enabled&&!available()){message='iPhoneではSafariの共有から「ホーム画面に追加」し、追加したtabiで通知をONにしてください。';render();return;}
      // Ask directly within the user's click; never request permission automatically.
      const permission=enabled?null:Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
      busy=true;message='';render();
      try{
        if(enabled){await enqueue(()=>api(meta,'DELETE'));write(prefKey(meta),'off');message='この旅行の通知をOFFにしました。';}
        else if(await permission!=='granted'){message='通知は許可されませんでした。アプリ内の更新表示は利用できます。';}
        else{await enqueue(()=>register(meta));write(prefKey(meta),'on');message='通知をONにしました。パートナーの更新をお知らせします。';}
      }catch{message='通知を設定できませんでした。通信を確認して、もう一度お試しください。';}finally{busy=false;render();}
    }
    function notice(before,after){
      const el=document.querySelector('#partnerUpdateNotice');if(!el)return;
      el.textContent=describeUpdate(before,after);el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),5000);
    }
    async function restore(){const meta=room();render();if(meta&&available()&&Notification.permission==='granted'&&preference(meta.roomId))try{await enqueue(()=>register(meta));}catch{} }
    async function leave(meta){if(!meta)return;write(prefKey(meta),'off');if(navigator.onLine)try{await enqueue(()=>api(meta,'DELETE'));}catch{message='通知の解除を接続後に再試行してください。';}}
    document.querySelector('#partnerNotifyToggle')?.addEventListener('click',toggle);
    navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='tabi-partner-update')options.sync?.();});
    window.addEventListener('online',restore);window.addEventListener('focus',restore);
    return {render,notice,restore,leave};
  }
  window.TabiNotifications={create,clientId,describeUpdate};
})();
