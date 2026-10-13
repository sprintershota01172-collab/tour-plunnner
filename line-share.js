(async()=>{
  'use strict';
  const api=window.TabiLineInvite,button=document.querySelector('#send'),status=document.querySelector('#status');
  let invite;
  function sdk(){return new Promise((resolve,reject)=>{if(window.liff){resolve();return;}const script=document.createElement('script');script.src='https://static.line-scdn.net/liff/edge/2/sdk.js';script.onload=resolve;script.onerror=()=>reject(new Error('sdk'));document.head.append(script);});}
  try{
    const hash=location.hash;
    if(hash.startsWith('#invite=')){invite=api.remember(api.decode(hash.slice(8)));}
    else invite=api.recover();
    if(invite)document.querySelector('#message').textContent=api.message(invite.sender,invite.destination);
    const config=await api.config();
    if(!api.configured(config)){status.textContent='LINE招待の接続準備中です。';button.textContent='接続準備中';return;}
    await sdk();await liff.init({liffId:config.liffId});
    // Leave OAuth and LIFF redirect parameters untouched until initialization finishes.
    if(location.hash.startsWith('#invite='))history.replaceState(null,'',location.pathname+location.search);
    invite=invite||(location.hash.startsWith('#invite=')?api.remember(api.decode(location.hash.slice(8))):api.recover());
    if(!invite)throw new Error('expired');
    function refresh(){button.disabled=false;button.textContent=liff.isLoggedIn()?'LINEで送り先を選ぶ':'LINEにログイン';}
    refresh();
    button.onclick=async()=>{
      try{
        if(!liff.isLoggedIn()){liff.login({redirectUri:new URL('./line-share.html#invite='+api.encode(invite),location.href).href});return;}
        if(!liff.isApiAvailable('shareTargetPicker')){status.textContent='この環境では送信できません。Safariで開くか、LINEを更新してください。';return;}
        button.disabled=true;status.textContent='LINEの画面で送り先を選んでください。';
        const result=await liff.shareTargetPicker([api.card(invite)],{isMultiple:true});
        if(result?.status==='success'){api.forget();button.textContent='送信しました';status.textContent='招待カードを送りました。';location.replace('./');}
        else {refresh();status.textContent='送信をキャンセルしました。';}
      }catch{refresh();status.textContent='送信できませんでした。接続を確認して、もう一度お試しください。';}
    };
  }catch(error){button.disabled=false;button.textContent='アプリで招待を開き直す';button.onclick=()=>{location.href='./#invite-partner';};status.textContent=['expired','invalid'].includes(error.message)?'アプリから招待を作り直してください。':'LINEに接続できませんでした。ページを開き直してください。';}
})();
