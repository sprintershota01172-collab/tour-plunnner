(() => {
  'use strict';
  const account=window.TabiAccounts,bridge=window.TabiAccountBridge;
  if(!account||!bridge)return;
  const $=s=>document.querySelector(s);
  let busy=false,timer=0,session=null,indexed=new Set(),skipIds=new Set(),pendingDeletes=new Set();
  let ready=false;
  function status(message,error=false){
    const node=$('#accountMessage');
    if(!node)return;
    node.textContent=message;node.dataset.error=error?'true':'false';
  }
  function errorMessage(error){
    const messages={
      invalid_id:'IDは半角英数字から始まる4〜32文字で入力してください（英数字・._-）。',
      weak_password:'パスワードは12〜128文字にしてください。',
      id_taken:'このログインIDはすでに登録されています。ログインしてください。',
      bad_credentials:'IDまたはパスワードが正しくありません。',
      invalid_account:'アカウントの情報を読み込めませんでした。',
      room_conflict:'別の認証情報が登録されています。旅行データは端末に残しています。',
      offline:'通信が必要です。インターネット接続を確認してください。',
      conflict:'同時更新の競合が続きました。再度お試しください。'
    };
    return messages[error?.message]||'接続または同期に失敗しました。少し後に再試行してください。';
  }
  function render(){
    if(!$('#accountSignedOut'))return;
    const signed=!!session;
    $('#accountSignedOut').hidden=signed;
    $('#accountSignedIn').hidden=!signed;
    $('#accountCurrent').textContent=signed?'ログイン中：'+session.username:'';
    $('#accountSyncState').textContent=busy?'同期処理中…':signed?'暗号化して同期':'';
    ['accountLogin','accountRegister','accountPull','accountUpload','accountLogout'].forEach(id=>{
      $('#'+id).disabled=busy;
    });
    $('#accountHeaderStatus').textContent=signed?session.username:'未ログイン';
  }
  function pendingEntries(manual=false){
    return bridge.trips().filter(t=>!t.empty&&(manual||!skipIds.has(t.id))).filter(t=>
      !t.collaboration||!indexed.has(t.collaboration.roomId)
    );
  }
  function notifyTripChange(){
    if(!ready||!session||busy)return;
    if(!pendingEntries().length)return;
    clearTimeout(timer);
    timer=setTimeout(()=>upload(true,false),2500);
  }
  function persistAccountIndex(){
    if(!session)return;
    session.knownRooms=[...indexed];
    session.pendingDeletes=[...pendingDeletes];
    bridge.saveSession(session);
  }
  async function applyPendingDeletions(){
    for(const roomId of [...pendingDeletes]){
      await account.forgetRoom(session,roomId);
      pendingDeletes.delete(roomId);indexed.delete(roomId);
      persistAccountIndex();
    }
  }
  function notifyTripDeleted(roomId){
    if(!ready||!session||!roomId)return;
    pendingDeletes.add(roomId);
    indexed.delete(roomId);
    persistAccountIndex();
    clearTimeout(timer);
    timer=setTimeout(()=>pull(true),250);
  }
  async function importEntries(entries){
    const result=await bridge.importRooms(entries);
    entries.forEach(entry=>indexed.add(entry.roomId));
    return result;
  }
  async function pull(silent=false){
    if(!session||busy)return;
    busy=true;render();
    try{
      await applyPendingDeletions();
      const previouslyIndexed=new Set(indexed);
      const remote=await account.pull(session);
      const visible=remote.entries.filter(entry=>!pendingDeletes.has(entry.roomId));
      const imported=await importEntries(visible);
      const current=new Set(visible.map(entry=>entry.roomId));
      bridge.dropRooms([...previouslyIndexed].filter(roomId=>!current.has(roomId)));
      indexed=current;
      persistAccountIndex();
      if(imported.failed){
        status(imported.failed+'件の旅行を取得できませんでした。通信状況をご確認ください。',true);
      }else if(!silent){
        status('同期確認完了。新しく取り込んだ旅行：'+imported.count+'件');
      }
    }catch(error){if(!silent)status(errorMessage(error),true);}
    finally{busy=false;render();notifyTripChange();}
  }
  async function uploadCore(manual){
    if(manual)skipIds.clear();
    await applyPendingDeletions();
    const candidates=bridge.trips().filter(t=>!t.empty&&!skipIds.has(t.id));
    const entries=[];
    for(const trip of candidates){
      const ref=await bridge.ensureRoom(trip.id);
      if(ref)entries.push(ref);
    }
    const remote=await account.addRooms(session,entries);
    remote.entries.forEach(entry=>indexed.add(entry.roomId));
    persistAccountIndex();
    return remote.entries.length;
  }
  async function upload(silent=false,manual=true){
    if(!session||busy)return;
    clearTimeout(timer);busy=true;render();
    try{
      const count=await uploadCore(manual);
      if(!silent)status('保存しました。'+count+'件の旅行を他の端末でも利用できます。');
    }catch(error){status(errorMessage(error),true);}
    finally{busy=false;render();}
  }
  function addInvitedRoom(roomId){
    if(!session||!roomId)return;
    for(const trip of bridge.trips()){
      if(trip.collaboration?.roomId===roomId)skipIds.delete(trip.id);
    }
    notifyTripChange();
  }
  async function authenticate(register){
    if(busy)return;
    const name=$('#accountId').value.trim(),password=$('#accountPassword').value;
    if(register&&password!==$('#accountPasswordConfirm').value){
      status('確認用パスワードが一致しません。',true);return;
    }
    clearTimeout(timer);busy=true;render();status('接続しています…');
    try{
      const result=register
        ?{session:await account.register(name,password),remote:{entries:[]}}
        :await account.login(name,password);
      session=result.session;
      indexed=new Set();pendingDeletes=new Set();
      skipIds=new Set(register?[]:bridge.trips().map(t=>t.id));
      bridge.saveSession(session);
      $('#accountPassword').value='';
      $('#accountPasswordConfirm').value='';
      const imported=await importEntries(result.remote.entries);
      persistAccountIndex();
      if(imported.failed)status('一部の旅行を復元できませんでした。もう一度同期してください。',true);
      else if(register){
        const count=await uploadCore(true);
        status('アカウントを作成しました。'+count+'件の旅行を保存しました。');
      }else{
        status('ログインしました。'+imported.count+'件の旅行を復元しました。元からこの端末にある別の旅行は「この端末の旅行を同期」で追加できます。');
      }
    }catch(error){status(errorMessage(error),true);}
    finally{
      busy=false;render();
      if(session&&bridge.hasPendingInvite?.()){
        try{await bridge.resumePendingInvite();}catch(error){status(errorMessage(error),true);}
      }
    }
  }
  function logout(){
    if(busy)return;
    clearTimeout(timer);
    session=null;indexed=new Set();skipIds=new Set();pendingDeletes=new Set();
    bridge.saveSession(null);
    $('#accountPassword').value='';$('#accountPasswordConfirm').value='';
    status('ログアウトしました。この端末に保存済みの旅行は消えません。');
    render();
  }
  function onReady(){
    if(ready)return;
    ready=true;session=bridge.session();
    if(session){indexed=new Set(session.knownRooms||[]);pendingDeletes=new Set(session.pendingDeletes||[]);}
    render();
    if(session)pull(true);
  }
  function init(){
    $('#accountLogin').onclick=()=>authenticate(false);
    $('#accountRegister').onclick=()=>authenticate(true);
    $('#accountPull').onclick=()=>pull(false);
    $('#accountUpload').onclick=()=>upload(false,true);
    $('#accountLogout').onclick=logout;
    $('#accountId').addEventListener('input',()=>status(''));
    ['accountPassword','accountPasswordConfirm'].forEach(id=>$('#'+id).addEventListener('input',()=>status('')));
    $('#accountRefreshPassword').onclick=()=>{const fields=[$('#accountPassword'),$('#accountPasswordConfirm')];fields.forEach(el=>el.type=el.type==='password'?'text':'password');};
    if(bridge.isReady())onReady();
    else window.addEventListener('tabi-account-ready',onReady,{once:true});
    window.addEventListener('focus',()=>{if(ready&&session&&!busy)pull(true);});
    setInterval(()=>{if(ready&&session&&!busy&&!document.hidden)pull(true);},45000);
  }
  window.TabiAccountUI={notifyTripChange,notifyTripDeleted,addInvitedRoom,render};
  init();
})();