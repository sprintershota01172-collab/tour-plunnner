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
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const snapshot=trip=>Object.fromEntries(['destination','travelers','startDate','endDate','datesConfigured','hotels','groups','places','packingItems'].map(key=>[key,trip[key]]));
  function describeUpdate(before,after){
    if(JSON.stringify(canonical(snapshot(before)))===JSON.stringify(canonical(snapshot(after))))return null;
    const old=new Map((before.places||[]).map(p=>[p.id,p]));
    const added=(after.places||[]).filter(p=>!old.has(p.id));
    if(added.length)return added.length===1?`パートナーが「${added[0].name}」を追加しました`:`パートナーが${added.length}件の場所を追加しました`;
    if((after.places||[]).length<(before.places||[]).length)return 'パートナーが行きたいリストを更新しました';
    if((after.places||[]).some(p=>old.has(p.id)&&(p.start!==old.get(p.id).start||p.day!==old.get(p.id).day||p.duration!==old.get(p.id).duration)))return 'パートナーが旅程を変更しました';
    return 'パートナーが旅行を更新しました';
  }
  function create(options){
    let busy=false,message='',feedback='',progress='通知を設定しています…',currentRoom='',timer=0,queue=Promise.resolve(),verified=new Set(),repair=new Set();
    const room=()=>options.getMetadata?.();
    const prefKey=meta=>'tabi-push:'+meta.roomId;
    const api=async(meta,method,body)=>{
      const response=await fetch(API+meta.roomId+'/push',{method,headers:{Authorization:`Bearer ${await window.TabiSharing.auth(meta.key)}`,'X-Tabi-Client':clientId,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('connection');return response.json();
    };
    const render=()=>{
      const meta=room(),button=document.querySelector('#partnerNotifyToggle'),hint=document.querySelector('#partnerNotifyHint'),status=document.querySelector('#partnerNotifyState');if(!button||!hint)return;
      const roomId=meta?.roomId||'';if(roomId!==currentRoom){currentRoom=roomId;message='';feedback='';}
      const saved=!!meta&&preference(meta.roomId),supported=available(),enabled=saved&&verified.has(meta.roomId)&&supported&&Notification.permission==='granted';
      const mode=busy?'busy':feedback==='error'?'error':enabled?'on':!meta?'setup':!supported?'unsupported':Notification.permission==='denied'?'blocked':saved&&!verified.has(meta.roomId)?'checking':'off';
      button.dataset.state=mode;button.textContent=busy?'設定中…':feedback==='error'?'もう一度試す':enabled?'✓ 通知 ON':saved&&!enabled?'登録を確認':saved?'通知設定を解除':'通知をONにする';
      button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-busy',String(busy));button.disabled=busy;
      const testButton=document.querySelector('#partnerNotifyTest');if(testButton){testButton.hidden=false;testButton.disabled=busy;}
      if(status){status.dataset.state=mode;status.textContent={busy:'設定中',on:'通知 ON',off:'通知 OFF',checking:'登録確認中',setup:'共有の設定が必要',unsupported:'ホーム画面から設定',blocked:'通知の許可が必要',error:'設定できませんでした'}[mode];}
      hint.dataset.state=feedback||mode;
      hint.textContent=busy?progress:message||(!meta?'先に共有リンクを作成するか、パートナーの招待リンクから参加してください。':!supported?'iPhoneではSafariの共有から「ホーム画面に追加」。追加したtabiを開いて通知をONにしてください。':Notification.permission==='denied'?'端末の設定でtabiの通知を許可してください。':enabled?'ONになっています。もう一度押すと、この旅行の通知をOFFにできます。':'OFFになっています。ボタンを押して通知を許可してください。');
    };
    const register=async(meta,force=false)=>{
      const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('worker')),10000))]);
      const {publicKey}=await api(meta,'GET');
      let subscription=await registration.pushManager.getSubscription();
      const key=decode(publicKey);
      if(force&&subscription){await subscription.unsubscribe();subscription=null;}
      if(subscription?.options.applicationServerKey){const current=new Uint8Array(subscription.options.applicationServerKey);if(current.length!==key.length||current.some((v,i)=>v!==key[i])){await subscription.unsubscribe();subscription=null;}}
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await api(meta,'POST',{subscription:{endpoint:subscription.endpoint}});verified.add(meta.roomId);repair.delete(meta.roomId);
    };
    const enqueue=work=>{queue=queue.catch(()=>{}).then(work);return queue;};
    async function toggle(){
      const meta=room();if(busy)return;
      if(!meta){feedback='setup';message='①「共有リンクを作成」を押す → ② このボタンで通知をON。招待された方は、招待リンクから参加してください。';render();const next=document.querySelector('#partnerCreate');if(next&&!next.hidden){next.classList.add('notification-next-step');next.focus();}return;}
      const enabled=preference(meta.roomId)&&verified.has(meta.roomId)&&feedback!=='error';
      if(!enabled&&!available()){feedback='unsupported';message='iPhoneではSafariの共有から「ホーム画面に追加」し、追加したtabiで通知をONにしてください。';render();return;}
      // Ask directly within the user's click; never request permission automatically.
      const permission=enabled?null:Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
      progress=enabled?'通知をOFFにしています…':'通知を設定しています…';busy=true;message='';feedback='';render();
      try{
        if(enabled&&feedback!=='error'){await enqueue(()=>api(meta,'DELETE'));write(prefKey(meta),'off');verified.delete(meta.roomId);feedback='success';message='この旅行の通知をOFFにしました。';}
        else if(await permission!=='granted'){feedback='blocked';message='通知は許可されませんでした。アプリ内の更新表示は利用できます。';}
        else{await enqueue(()=>register(meta,repair.has(meta.roomId)));write(prefKey(meta),'on');feedback='success';message='通知をONにしました。パートナーの更新をお知らせします。';}
      }catch{feedback='error';message='通知を設定できませんでした。通信を確認して、もう一度お試しください。';}finally{busy=false;render();}
    }
    function notice(before,after){
      const el=document.querySelector('#partnerUpdateNotice');if(!el)return;
      const text=describeUpdate(before,after);if(!text)return;el.textContent=text;el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),5000);
    }
    async function restore(){const meta=room();render();if(meta&&available()&&Notification.permission==='granted'&&preference(meta.roomId))try{await enqueue(()=>register(meta,repair.has(meta.roomId)));render();}catch{verified.delete(meta.roomId);feedback='error';message='端末の登録を確認できませんでした。「もう一度試す」で再登録してください。';render();} }
    async function test(){
      const meta=room();if(busy)return;if(!meta||!preference(meta.roomId)||!available()||Notification.permission!=='granted'){feedback='blocked';message='先にこの旅行の通知をONにしてから、テストしてください。';render();return;}progress='テスト通知を送信しています…';busy=true;message='';feedback='';render();
      try{
        const result=await enqueue(()=>api(meta,'POST',{action:'test'}));
        if(result.accepted){feedback='success';message='通知サービスが送信を受け付けました。通知センターを確認してください。届かない場合は集中モードと端末の通知設定を確認してください。';}
        else if(result.reason==='wait_ten_seconds'){feedback='blocked';message='10秒ほど待ってから、もう一度テストしてください。';}
        else if(result.reason==='not_registered'||result.status===404||result.status===410){verified.delete(meta.roomId);repair.add(meta.roomId);feedback='error';message='通知の登録が期限切れです。「もう一度試す」で再登録してください。';}
        else{feedback='error';message=`送信に失敗しました（${result.reason||'connection'} / ${result.status||'通信エラー'}）。この表示を教えてください。`;}
      }catch{feedback='error';message='通知のテストに接続できませんでした。通信を確認してください。';}finally{busy=false;render();}
    }
    async function leave(meta){if(!meta)return;verified.delete(meta.roomId);write(prefKey(meta),'off');if(navigator.onLine)try{await enqueue(()=>api(meta,'DELETE'));}catch{message='通知の解除を接続後に再試行してください。';}}
    document.querySelector('#partnerNotifyToggle')?.addEventListener('click',toggle);
    document.querySelector('#partnerNotifyTest')?.addEventListener('click',test);
    navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='tabi-partner-update')options.sync?.();});
    window.addEventListener('online',restore);window.addEventListener('focus',restore);
    return {render,notice,restore,leave};
  }
  window.TabiNotifications={create,clientId,describeUpdate};
})();
