(() => {
  'use strict';
  const jpToEnglish={"行きたい場所をまとめる":"Collect places you want to visit","旅行先を設定":"Set destination","行き先未設定":"Destination not set","旅行を選ぶ":"Your trips","旅行を切り替え":"Switch trip","旅行の設定":"Trip settings","設定":"Settings","宿泊先":"Accommodation","宿泊先を追加":"Add accommodation","行きたいリストに登録":"Add to wishlist","グループ編集":"Edit groups","すべて":"All","観光":"Sightseeing","グルメ":"Food","ビーチ":"Beach","買い物":"Shopping","アクティビティ":"Activities","カフェ":"Cafes","その他":"Other","未分類":"Uncategorized","仕立てる":"Plan","旅を仕立てる":"Build your itinerary","集める":"Collect","記録":"Itinerary","旅程":"Itinerary","持ち物":"Packing list","共有":"Share","未設定":"Not set","パートナーを招待":"Invite partner","パートナーと共同編集":"Edit together","パートナーを招待・共同編集":"Invite & collaborate","通知の設定":"Notification settings","パートナーの更新通知":"Partner update notifications","未共有":"Not shared","共有中":"Shared","旅行先":"Destination","人数":"Travelers","旅行日程":"Travel dates","旅行日程を選ぶ":"Choose travel dates","日程未設定":"Dates not set","旅行日程を設定":"Set travel dates","期間を選ぶ":"Select dates","この期間にする":"Apply dates","開始日":"Start date","終了日":"End date","キャンセル":"Cancel","閉じる":"Close","保存する":"Save","削除":"Delete","追加":"Add","新しい旅を登録":"Create a new trip","場所を追加":"Add a place","場所を編集":"Edit place","場所の名前":"Place name","グループ":"Group","所要時間":"Duration","写真":"Photos","写真を追加":"Add photos","カメラ":"Camera","予約状況":"Reservation status","予約不要":"No reservation needed","要予約":"Reservation needed","予約済み":"Booked","絶対行きたい":"Must visit","住所":"Address","URL":"URL","営業時間":"Opening hours","電話番号":"Phone number","メモ":"Notes","もう少し詳しく":"More details","貼り付け":"Paste","URLから情報を読み込む":"Get details from URL","宿泊先はここで登録・変更できます":"Add or change your accommodation here","宿泊先はまだ登録されていません":"No accommodation added yet","ホテル名":"Hotel name","宿泊期間":"Stay dates","招待するあなたの名前":"Your name","招待URLを作成する":"Create invitation link","この旅行に参加する":"Join this trip","招待URLを送る":"Send invitation","招待URLをコピー":"Copy invitation link","招待リンクで参加する":"Join using an invite link","受け取った招待リンクから参加":"Paste the invitation link you received","このリンクで参加":"Join with this link","招待パスワード":"Invitation password","招待リンクのパスワード（任意）":"Invitation password (optional)","招待を開く":"Open invitation","パートナーからの更新":"Partner updates","パスワードなし：招待リンクを知る人が参加できます。":"No password: anyone with this link can join.","12～128文字のパスワードを入力してください。":"Use a password of 12–128 characters.","安全な招待リンクを作成しています…":"Creating protected invitation link…","パスワードで保護しました。パスワードは別の方法で伝えてください。":"Invitation protected. Share the password separately.","リンクを暗号化できませんでした。再入力してください。":"Could not protect the link. Try again.","招待パスワードが違います。":"Incorrect invitation password.","招待パスワードを入力してください。":"Enter your invitation password.","行きたい場所も、旅の予定も、一緒に。":"Save places and plan your trip together.","招待URLを送って、旅程や持ち物を一緒に編集できます。":"Share an invite to edit the itinerary and packing list together.","場所・旅程・宿泊先・持ち物は自動で共有されます。":"Places, plans, stays and packing lists sync automatically.","招待URLを作成して、パートナーに送ってください。":"Create an invitation link and send it to your partner.","この旅行を削除しますか？":"Delete this trip?","今すぐ同期":"Sync now","この端末で共有を終了":"Leave shared trip on this device","共有の詳細":"Sharing details","その他の送り方":"Other sharing methods","LINEでカード形式の招待を送る":"Send invitation card with LINE","一緒に旅しよう":"Travel together","日付":"Date","ピース":"Places","言語とブランド":"Language and branding","ロゴ":"Logo","標準ロゴに戻す":"Restore default logo","表示言語 / Language":"Display language / Language","アプリ名 / Brand name":"App name / Brand name","ロゴ / Logo":"Logo","この日のピースを戻す":"Clear this day","元に戻す":"Undo","テキストをコピー":"Copy text","画像として保存":"Save as image","JSONを書き出す":"Export JSON","JSONを読み込む":"Import JSON","スポットを保存しました":"Place saved","スポットを更新しました":"Place updated","写真は複数追加できます":"You can add multiple photos","宿泊先未設定":"Accommodation not set","まだ時間が決まっていない場所":"Places without a scheduled time","旅程に並べる":"Add to itinerary","持ち物を追加":"Add packing item","同期済み":"Synced","同期中…":"Syncing…","接続中…":"Connecting…","完了":"Done"};
  const englishPlaceholders={"キーワードで探す":"Search places","例：ダイヤモンドヘッド":"e.g. Diamond Head","グループ名":"Group name","持ち物を追加":"Add an item","宿泊先の名前":"Name of accommodation","行き先だけでも保存できます":"You can save just the destination","例：翔太":"e.g. Alex","設定する場合は12文字以上":"12+ characters to enable protection","招待者から聞いたパスワード":"Password from the sender","招待リンクを貼り付け":"Paste invitation link","例：6:00–18:00":"e.g. 6:00–18:00","住所を入力":"Enter address","予約のこと、気になることなど":"Reservations, reminders, notes"};
  const LKEY='tabi-language-v1',NKEY='tabi-brand-name-v1',GKEY='tabi-brand-logo-v1';
  const defaultIcon='icon.svg?v=20261012-41';
  const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
  let language=read(LKEY,(/^ja\b/i.test(navigator.language||'')?'ja':'en'));
  if(!['ja','en'].includes(language))language='ja';
  let brandName=read(NKEY,'tabi'),brandLogo=read(GKEY,'');
  const bases=new WeakMap(),attrs=new WeakMap();
  const preserve=new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','OPTION']);
  const skip='[contenteditable],.place-card,.timeline-piece,.tray-piece,.itinerary-stop,.place-swipe-background,.itinerary-content .hotel-name,#partnerMessagePreview,#partnerInviteTitle,#partnerInviteDestination,#tripList,.packing-item,#appToast,.toast,.partner-error,#tripSummary,#itinerarySubtitle,#selectedDateLabel,#hotelEditList,#placeCount,#placedCount,#trayCount,#partnerLinkRow,#travelerCount,#partnerStatus,.trip-summary,.trip-list,.day-tabs';
  function textNode(node){
    const p=node.parentElement;
    if(!p||preserve.has(p.tagName)||p.closest(skip))return;
    const actual=node.nodeValue;
    let record=bases.get(node);
    // React to live changes: do not overwrite a newly-rendered destination with old text.
    if(!record||(actual!==record.last&&actual!==record.base)){
      record={base:actual,last:actual};
      bases.set(node,record);
    }
    const raw=record.base,middle=raw.trim();
    const translated=language==='en'?jpToEnglish[middle]:undefined;
    const wanted=translated?raw.replace(middle,translated):raw;
    if(actual!==wanted)node.nodeValue=wanted;
    record.last=wanted;
  }
  function translate(){
    if(!document.body)return;
    document.documentElement.lang=language;
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walk.nextNode())textNode(walk.currentNode);
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{
      if(el.closest(skip))return;
      const source=attrs.get(el)??el.getAttribute('placeholder');
      if(!attrs.has(el))attrs.set(el,source);
      const newValue=language==='en'?(englishPlaceholders[source]||source):source;
      if(el.placeholder!==newValue)el.placeholder=newValue;
    });
    document.title=(brandName||'tabi')+' — '+(language==='en'?'Trip Planner':'旅程プランナー');
  }
  function brand(){
    const logo=brandLogo||defaultIcon;
    for(const target of ['#brandLogo','#logoPreview']){const el=document.querySelector(target);if(el&&el.getAttribute('src')!==logo)el.setAttribute('src',logo);}
    const title=document.querySelector('#brandName');if(title&&title.textContent!==brandName)title.textContent=brandName;
    const input=document.querySelector('#brandNameInput');if(input&&document.activeElement!==input&&input.value!==brandName)input.value=brandName;
    translate();
  }
  function setLanguage(value){
    language=['ja','en'].includes(value)?value:'ja';save(LKEY,language);
    const selector=document.querySelector('#languageSelect');
    if(selector)selector.value=language;
    translate();
    window.dispatchEvent(new CustomEvent('tabi-language-changed',{detail:{language}}));
  }
  async function imageData(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('format');
    const src=URL.createObjectURL(file);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=src;});
      const width=img.naturalWidth,height=img.naturalHeight;
      if(!width||!height||width*height>25000000)throw Error('size');
      const ratio=Math.min(1,256/Math.max(width,height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const context=canvas.getContext('2d');if(!context)throw Error('canvas');
      context.drawImage(img,0,0,canvas.width,canvas.height);
      const result=canvas.toDataURL('image/png');
      if(result.length>550000)throw Error('size');
      return result;
    }finally{URL.revokeObjectURL(src);}
  }
  const select=document.querySelector('#languageSelect');
  if(select){select.value=language;select.addEventListener('change',()=>setLanguage(select.value));}
  const nameField=document.querySelector('#brandNameInput');
  nameField?.addEventListener('input',()=>{
    brandName=nameField.value.trim().slice(0,24)||'tabi';save(NKEY,brandName);
    const label=document.querySelector('#brandName');if(label)label.textContent=brandName;
    document.title=brandName+' — '+(language==='en'?'Trip Planner':'旅程プランナー');
  });
  document.querySelector('#logoUpload')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const value=await imageData(file);
      if(!save(GKEY,value))throw Error('storage');
      brandLogo=value;brand();
    }catch{
      const label=document.querySelector('.brand-pref-help');
      if(label)label.textContent=language==='en'?'Could not save the image. Use a PNG, JPEG or WebP under 8MB.':'画像を保存できませんでした。8MB以下のPNG・JPEG・WebPを選択してください。';
    }finally{e.target.value='';}
  });
  document.querySelector('#logoReset')?.addEventListener('click',()=>{
    brandLogo='';try{localStorage.removeItem(GKEY);}catch{}brand();
  });
  // Capture new DOM text from lazy-rendered screens, without touching user input values.
  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;translate();});
  }).observe(document.body,{childList:true,subtree:true,characterData:true});
  window.TabiLocale={getLanguage:()=>language,setLanguage,refresh:translate};
  brand();
})();
