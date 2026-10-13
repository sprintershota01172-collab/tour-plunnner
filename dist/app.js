(() => {
  'use strict';

  const CATEGORIES = [
    {name:'観光',color:'#438b85',soft:'#e2f1ed',icon:'◌'},
    {name:'グルメ',color:'#c78258',soft:'#f8ece2',icon:'◉'},
    {name:'ビーチ',color:'#4389a7',soft:'#e4f1f6',icon:'≈'},
    {name:'買い物',color:'#9a76a5',soft:'#f0e9f3',icon:'◇'},
    {name:'アクティビティ',color:'#58836a',soft:'#e8f1e9',icon:'✳'},
    {name:'カフェ',color:'#aa8055',soft:'#f3ede3',icon:'◍'},
    {name:'その他',color:'#77878a',soft:'#e9efef',icon:'○'}
  ];
  const UNGROUPED='未分類';
  const PACKING_DEFAULTS = [
    ['passport','パスポート','書類'],['esta','ESTA・渡航認証','書類'],['booking','航空券・ホテル控え','書類'],['insurance','旅行保険の控え','書類'],['wallet','カード・現金','書類'],
    ['clothes','着替え','衣類'],['underwear','下着・靴下','衣類'],['shoes','歩きやすい靴','衣類'],['swimwear','水着','海・プール'],['sunscreen','日焼け止め','海・プール'],['sunglasses','サングラス','海・プール'],
    ['charger','充電器・変換プラグ','電子機器'],['battery','モバイルバッテリー','電子機器'],['medicine','常備薬','日用品'],['toiletries','洗面用品','日用品']
  ].map(([id,name,category])=>({id,name,category,checked:false}));
  const DEFAULTS = {
    destination:'', travelers:2, startDate:'', endDate:'', datesConfigured:false,
    hotels:[],
    places:[], groups:CATEGORIES.map(c=>c.name), packingItems:PACKING_DEFAULTS
  };
  const DB_NAME='malie-honeymoon', DB_STORE='app';
  let state=structuredClone(DEFAULTS), trips=[], activeTripId='', selectedDay=0, pageIndex=0, selectedCategory='すべて', editingPhotos=[], candidate=null;
  let db=null, saveTimer=0, toastTimer=0, completionShown=false, undoSnapshot=null, drag=null, resizeSession=null, swipeStart=null, focusScroll=null, ignorePlaceClickUntil=0, undoMessage='直前の操作を戻しました', hotelDraft=[], selectedPieceId=null, dragAutoFrame=0, placeSwipe=null;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const pages=$('#pages'), viewport=$('#viewport'), timelineScroll=$('#timelineScroll');
  const dateOptions={weekday:'short',month:'short',day:'numeric'};
  let undoCheckpoint=null,partnerBusy=false,pendingInvite=null;
  const sharedApi=window.TabiSharing;
  let protectedInvite={roomId:'',password:'',url:'',pending:false},inviteGeneration=0,inviteDebounce=0;
  const sharing=sharedApi?sharedApi.create({
    getContext:()=>({id:state.id,trip:state,metadata:state.collaboration}),
    isBusy:()=>!!(drag||resizeSession||placeSwipe||$('#modalBackdrop.open')||$('#settingsBackdrop.open')||$('#packingBackdrop.open')||$('#groupsBackdrop.open')||$('#tripsBackdrop.open')),
    applyTrip:trip=>{const previous=state;state=normalizeState({...state,...trip});selectedDay=Math.max(0,Math.min(selectedDay,dayCount()-1));persist(false);renderAll();notifications?.notice(previous,state);},
    setMetadata:metadata=>{state.collaboration=metadata;persist(false);},
    onStatus:updatePartnerStatus,
    onConflict:()=>showToast('同じ時間の予定を未配置のピースに戻しました')
  }):null;
  const notifications=window.TabiNotifications?.create({getMetadata:()=>state.collaboration,listMetadata:()=>trips.map(t=>t.collaboration).filter(Boolean),sync:()=>sharing?.sync()});
  if(sharedApi){pendingInvite=sharedApi.parseInvite(location.hash);if(pendingInvite)history.replaceState(null,'',location.pathname+location.search);}


  function openDB(){return new Promise((resolve)=>{if(!('indexedDB' in window)){resolve(null);return;}const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});}
  async function loadState(){db=await openDB();let value=null,needsMigration=false;if(db){try{value=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}catch(e){console.warn('Local data could not be read',e);}}else{try{const raw=localStorage.getItem(DB_NAME);if(raw)value=JSON.parse(raw);}catch{}}
    if(value?.trips?.length){const loaded=value.trips.map(normalizeState);trips=cleanRedundantTrips(loaded,value.activeTripId);needsMigration=trips.length!==loaded.length;activeTripId=value.activeTripId||trips[0].id;state=trips.find(t=>t.id===activeTripId)||trips[0];activeTripId=state.id;}
    else if(value){state=normalizeState(value);trips=[state];activeTripId=state.id;needsMigration=true;}
    else{state=normalizeState(DEFAULTS);trips=[state];activeTripId=state.id;}
    renderAll();if(value||needsMigration)persist(false);notifications?.restore();if(pendingInvite||location.hash==='#invite-partner')openPartner();
  }
  function isEmptyTrip(t){
    return !t?.collaboration&&!String(t?.destination||'').trim()&&!t?.startDate&&!t?.endDate&&!t?.datesConfigured
      &&!(t?.hotels||[]).some(h=>h.name||h.start||h.end)&&!(t?.places||[]).length
      &&!(t?.groups||[]).some(g=>!CATEGORIES.some(c=>c.name===g))
      &&!(t?.packingItems||[]).some(p=>p.checked||!PACKING_DEFAULTS.some(d=>d.id===p.id&&d.name===p.name));
  }
  // Preserve distinct journeys (even when they share the same destination).
  // Only remove generated blank placeholders and genuinely equivalent non-shared copies.
  function cleanRedundantTrips(items,preferredId){
    if(items.length<=1)return items;
    const meaningful=items.filter(t=>!isEmptyTrip(t));
    if(!meaningful.length)return [items.find(t=>t.id===preferredId)||items[0]];
    const unique=[];
    for(const trip of meaningful){
      if(trip.collaboration){unique.push(trip);continue;}
      const same=unique.find(existing=>{
        if(existing.collaboration)return false;
        if(existing.destination.trim().toLocaleLowerCase()!==trip.destination.trim().toLocaleLowerCase())return false;
        if(existing.startDate!==trip.startDate||existing.endDate!==trip.endDate)return false;
        const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
        const emptyDetails=t=>!(t.places||[]).length&&!(t.hotels||[]).some(h=>h.name||h.start||h.end)
          &&!(t.packingItems||[]).some(p=>p.checked||!PACKING_DEFAULTS.some(d=>d.id===p.id&&d.name===p.name))
          &&!(t.groups||[]).some(g=>!CATEGORIES.some(c=>c.name===g));
        if(emptyDetails(trip)&&!emptyDetails(existing))return true;
        if(emptyDetails(existing)&&!emptyDetails(trip))return true;
        return identical({places:existing.places,hotels:existing.hotels,groups:existing.groups,packingItems:existing.packingItems,travelers:existing.travelers},
          {places:trip.places,hotels:trip.hotels,groups:trip.groups,packingItems:trip.packingItems,travelers:trip.travelers});
      });
      if(!same){unique.push(trip);continue;}
      // A more detailed trip is always kept. No user-added places are dropped.
      const existingIsEmpty=!(same.places||[]).length&&!(same.hotels||[]).some(h=>h.name||h.start||h.end);
      const candidateIsEmpty=!(trip.places||[]).length&&!(trip.hotels||[]).some(h=>h.name||h.start||h.end);
      if(existingIsEmpty&&!candidateIsEmpty){unique[unique.indexOf(same)]=trip;continue;}
      if(existingIsEmpty===candidateIsEmpty&&trip.id===preferredId){unique[unique.indexOf(same)]=trip;}
    }
    return unique;
  }
  function normalizeState(data){const s={...structuredClone(DEFAULTS),...data};s.id=data.id||id();s.hotels=Array.isArray(data.hotels)?data.hotels.map(h=>({...h?.id?{id:h.id}:{},name:h?.name||'',start:h?.start||'',end:h?.end||''})):structuredClone(DEFAULTS.hotels);s.places=Array.isArray(data.places)?data.places.map(p=>({...p,reservationRequired:p.reservationRequired??!!p.booked})):[];s.groups=cleanGroupNames(Array.isArray(data.groups)?data.groups:[...CATEGORIES.map(c=>c.name),...s.places.map(p=>p.category)]);s.places=s.places.map(p=>({...p,category:s.groups.includes(p.category)?p.category:UNGROUPED}));s.packingItems=Array.isArray(data.packingItems)?data.packingItems:structuredClone(PACKING_DEFAULTS);s.datesConfigured=hasTripDates(s)&&(typeof data.datesConfigured==='boolean'?data.datesConfigured:!!(s.destination?.trim()||s.hotels.some(h=>h.name)||s.places.some(p=>p.start!=null)));if(!s.datesConfigured){s.startDate='';s.endDate='';}return s;}
  function storagePayload(){trips=trips.map(t=>t.id===state.id?state:t);activeTripId=state.id;return {version:2,activeTripId,trips};}
  function persist(sync=true){if(sync&&sharedApi){if(undoSnapshot&&undoCheckpoint?.before!==undoSnapshot)undoCheckpoint={before:undoSnapshot,after:sharedApi.wire(state)};sharing.changed();}storagePayload();clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{const payload=storagePayload();if(db){try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(payload,'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{showToast('保存できませんでした。端末の空き容量をご確認ください');}}else{try{localStorage.setItem(DB_NAME,JSON.stringify(payload));}catch{showToast('保存容量が不足しています');}}},100);}
  function id(){return crypto.randomUUID?crypto.randomUUID():`p-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;}
  function dateAt(index){const date=parseDate(state.startDate);date.setDate(date.getDate()+index);return date;}
  function parseDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return new Date(NaN);const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:new Date(NaN);}
  function hasTripDates(trip=state){const start=parseDate(trip.startDate),end=parseDate(trip.endDate);return Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>=start;}
  function tripDatesButton(){return '<button type="button" class="trip-dates-button" data-open-trip-settings>旅行日程を設定</button>';}
  function emptyTripMarkup(){return `<div class="trip-not-configured">${icon('clock')}<p>日程未設定</p>${tripDatesButton()}</div>`;}
  function requestTripDates(){showToast('旅行日程を先に設定してください');openSettings();}

  function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function dayCount(){if(!hasTripDates())return 0;return Math.max(1,Math.min(21,Math.round((parseDate(state.endDate)-parseDate(state.startDate))/86400000)+1));}
  function fmtDate(d,opts=dateOptions){return new Intl.DateTimeFormat(window.TabiLocale?.getLanguage()==='en'?'en-US':'ja-JP',opts).format(d);}
  function cleanGroupNames(names){return [...new Set(names.filter(n=>typeof n==='string').map(n=>n.trim().slice(0,32)).filter(n=>n&&n!=='すべて'&&n!==UNGROUPED))];}
  function groupNames(){return state.groups||CATEGORIES.map(c=>c.name);}
  function categoryFilters(){return ['すべて',...groupNames(),UNGROUPED];}
  function cat(name){const preset=CATEGORIES.find(c=>c.name===name);if(preset)return preset;if(!name||name===UNGROUPED)return {...CATEGORIES.at(-1),name:UNGROUPED};let hash=0;for(const char of name)hash=(hash*31+char.codePointAt(0))>>>0;return {...CATEGORIES[hash%(CATEGORIES.length-1)],name,icon:'○'};}
  function renderCategoryField(value=$('#category').value){const names=[...groupNames(),UNGROUPED];$('#category').innerHTML=names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');$('#category').value=names.includes(value)?value:names[0];}
  function renderGroupManager(){const list=$('#groupEditList');if(!list)return;list.innerHTML=groupNames().map(name=>{const c=cat(name),count=state.places.filter(p=>p.category===name).length;return `<div class="group-edit-row"><i class="group-color" style="background:${c.color}" aria-hidden="true"></i><span class="group-edit-name">${esc(name)}</span><small>${count}件</small><button type="button" class="group-delete-button" data-delete-group="${esc(name)}" aria-label="${esc(name)}グループを削除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></div>`;}).join('')||'<p class="group-empty">グループはまだありません</p>';}
  function openGroups(){renderGroupManager();openModal($('#groupsBackdrop'));}
  function addGroup(event){event.preventDefault();const input=$('#groupName'),name=input.value.trim();if(!name){showToast('グループ名を入力してください');return;}if(name==='すべて'||name===UNGROUPED||groupNames().some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase())){showToast('別のグループ名を入力してください');return;}if(name.length>32){showToast('グループ名は32文字以内で入力してください');return;}undoSnapshot=structuredClone(state);undoMessage='グループの追加を戻しました';state.groups=[...groupNames(),name];selectedCategory=name;input.value='';persist();renderAll();showToast('グループを追加しました');}
  function deleteGroup(name){if(!groupNames().includes(name))return;undoSnapshot=structuredClone(state);undoMessage='グループを復元しました';state.groups=groupNames().filter(n=>n!==name);state.places=state.places.map(p=>p.category===name?{...p,category:UNGROUPED}:p);if(selectedCategory===name)selectedCategory=UNGROUPED;persist();renderAll();showUndoToast('グループを削除しました。場所は未分類に移動しました');}

  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function icon(name){const paths={pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',bed:'<path d="M3 20v-9m0 4h18v5M3 15V8h6a4 4 0 0 1 4 4v3m0 0v-4a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v4"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>'};return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.pin}</svg>`;}
  function showToast(message){const el=$('#appToast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
  function showUndoToast(message){const el=$('#appToast');el.innerHTML=`<span>${esc(message)}</span><button type="button" id="toastUndo">元に戻す</button>`;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),5000);}
  function dateHotel(day){if(!hasTripDates())return null;const key=dateKey(dateAt(day));return state.hotels.find(h=>h.name&&h.start&&h.end&&key>=h.start&&key<h.end)||null;}
  function sortPlaces(a,b){return (a.start==null?1:b.start==null?-1:a.start-b.start)||a.name.localeCompare(b.name,'ja');}
  function renderAll(){renderCategoryField();renderGroupManager();renderHeader();renderWishlist();renderDays();renderTimeline();renderItinerary();renderPacking();renderNavDot();renderTrips();}
  function renderHeader(){const summary=$('#tripSummary');summary.textContent=state.destination||'行き先未設定';$('#travelerCount').textContent=`${state.travelers||2}人`;$('#itinerarySubtitle').textContent=hasTripDates()?`${state.destination||'行き先未設定'} · ${fmtDate(parseDate(state.startDate),{year:'numeric',month:'long'})}`:'日程未設定';$('#tripPickerButton').setAttribute('aria-label',`旅行を切り替え。現在：${summary.textContent}`);sharing?.attach();updatePartnerStatus();syncPageAccess();}
  function renderTrips(){if(!$('#tripList'))return;$('#tripList').innerHTML=trips.map(trip=>{const selected=trip.id===state.id;const destination=trip.destination||'行き先未設定';const dates=hasTripDates(trip)?`${fmtDate(parseDate(trip.startDate),{year:'numeric',month:'numeric',day:'numeric'})} — ${fmtDate(parseDate(trip.endDate),{month:'numeric',day:'numeric'})}`:'日程未設定';return `<div class="trip-row ${selected?'current':''}"><button class="trip-row-select" type="button" data-trip="${esc(trip.id)}" aria-current="${selected?'true':'false'}"><span class="trip-row-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16.5 10.5 13 6 7.5a1 1 0 0 1 1.2-1.6l8 3.5 5-2a2 2 0 0 1 2.4 1.2 2 2 0 0 1-1.2 2.4L6 18l-3-.5Z"/></svg></span><span class="trip-row-copy"><b data-edit-trip="${esc(trip.id)}">${esc(destination)} <span class="trip-edit-hint">編集</span></b><small>${esc(dates)} · ${trip.travelers||2}人 · ${trip.places.length} SPOT</small></span>${selected?'<span class="trip-current-tag">NOW</span>':''}</button>${trips.length>1?`<button class="trip-delete" type="button" data-delete-trip="${esc(trip.id)}" aria-label="${esc(destination)}を削除"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>`:''}</div>`;}).join('');}
  function renderWishlist(){placeSwipe?.();if(!categoryFilters().includes(selectedCategory))selectedCategory='すべて';$('#filterToggle span').textContent=selectedCategory;const query=$('#searchPlaces').value.trim().toLowerCase();const items=state.places.filter(p=>(selectedCategory==='すべて'||p.category===selectedCategory)&&(!query||`${p.name} ${p.address} ${p.notes}`.toLowerCase().includes(query)));
    $('#placeCount').textContent=`${state.places.length} SPOT${state.places.length===1?'':'S'}`;
    const unplaced=state.places.filter(p=>p.start==null).length;
    $('#placementCta').hidden=unplaced===0;
    $('#placementCount').textContent=`${unplaced}件`;
    $('#placeHeading').textContent='PLACES TO GO';
    $('#categoryChips').innerHTML=categoryFilters().map(name=>`<button class="chip ${selectedCategory===name?'active':''}" data-cat="${esc(name)}">${esc(name)}</button>`).join('');
    $('#placeGrid').innerHTML=items.map(p=>placeCard(p)).join('');
    $('#emptyWishlist').classList.toggle('visible',state.places.length===0);
    $('#placeGrid').style.display=state.places.length===0?'none':'grid';
  }
  function placeCard(p){const c=cat(p.category),remove='<span><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>削除</span>';return `<div class="place-row"><div class="place-swipe-background" aria-hidden="true">${remove}${remove}</div><article class="place-card" data-edit="${esc(p.id)}" style="--card-color:${c.color};--card-soft:${c.soft}"><div class="place-thumb">${p.photos?.[0]?`<img src="${esc(p.photos[0])}" alt="" draggable="false">`:`<svg viewBox="0 0 40 40"><path d="M6 25c4-8 8.7-12 14-12s10 4 14 12M8 30c3.6-4 7.6-6 12-6s8.4 2 12 6"/><circle cx="20" cy="8" r="2"/></svg>`}</div><div class="place-body"><div class="place-topline"><span class="category-tag"><i class="tag-dot"></i>${esc(p.category||'その他')}</span>${p.mustGo?'<span class="must-badge">絶対行きたい</span>':''}${p.booked?'<span class="reservation-badge booked">予約済み</span>':p.reservationRequired?'<span class="reservation-badge">要予約</span>':''}</div><h2 class="place-name">${esc(p.name)}</h2><p class="place-address">${esc(p.address||'住所未設定')}</p><div class="place-meta"><span>${icon('clock')}${p.duration||60}分</span>${p.start!=null?`<span>${esc(dayLabel(p.day))}</span>`:''}</div></div></article></div>`;}
  function dayLabel(day){if(!hasTripDates())return '日程未設定';return `${dateAt(day).getMonth()+1}/${dateAt(day).getDate()}`;}
  function renderDays(){const count=dayCount();$('#autoArrange').disabled=!count;$('#dayClear').disabled=!count;if(!count){selectedDay=0;$('#dayTabs').innerHTML='';$('#dayContext').innerHTML=tripDatesButton();$('#selectedDateLabel').textContent='日程未設定';$('#placedCount').textContent='';return;}if(selectedDay>=count)selectedDay=count-1;$('#dayTabs').innerHTML=Array.from({length:count},(_,i)=>{const date=dateAt(i);return `<button class="day-tab ${i===selectedDay?'selected':''} ${state.places.some(p=>p.day===i&&p.start!=null)?'has-place':''}" data-day="${i}" role="tab" aria-selected="${i===selectedDay}"><span class="day-week">${i===0?'DAY 1':`DAY ${i+1}`}</span><b class="day-number">${date.getMonth()+1}/${date.getDate()}</b></button>`;}).join('');
    const stay=dateHotel(selectedDay);$('#dayContext').innerHTML=`<span class="hotel-symbol">${icon('bed')}</span><span>${stay?`宿泊：${esc(stay.name)}`:'宿泊先未設定 · '}</span><span>${fmtDate(dateAt(selectedDay),{month:'long',day:'numeric',weekday:'short'})}</span>`;
    $('#selectedDateLabel').textContent=fmtDate(dateAt(selectedDay),{month:'long',day:'numeric',weekday:'short'});
    $('#placedCount').textContent=`${state.places.filter(p=>p.day===selectedDay&&p.start!=null).length}件 · タップで調整 / 長押しで移動`;
  }
  const START_MIN=6*60, END_MIN=23*60, PX_PER_HOUR=44, PX_PER_MIN=PX_PER_HOUR/60;
  function renderTimeline(){renderDays();const inner=$('#timelineInner');if(!hasTripDates()){selectedPieceId=null;inner.style.height='100%';inner.innerHTML=emptyTripMarkup();renderTimelineAdjuster();renderTray();return;}inner.innerHTML='';inner.style.height=`${(END_MIN-START_MIN)*PX_PER_MIN}px`;
    for(let t=START_MIN;t<=END_MIN;t+=60){const y=(t-START_MIN)*PX_PER_MIN;const line=document.createElement('div');line.className='timeline-hour-line';line.style.top=`${y}px`;inner.appendChild(line);if(t<END_MIN){const label=document.createElement('span');label.className='time-label';label.style.top=`${y}px`;label.textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:00`;inner.appendChild(label);const half=document.createElement('div');half.className='timeline-half-line';half.style.top=`${y+PX_PER_HOUR/2}px`;inner.appendChild(half);}}
    const stay=dateHotel(selectedDay);if(stay){const band=document.createElement('div');band.className='timeline-hotel-band';band.style.top=`${(7*60-START_MIN)*PX_PER_MIN}px`;band.style.height=`${55*PX_PER_MIN}px`;band.innerHTML=`<b>${esc(stay.name)}</b> <span>· 滞在中</span>`;inner.appendChild(band);}
    const dayPlaces=state.places.filter(p=>p.day===selectedDay&&p.start!=null).sort(sortPlaces);
    if(dayPlaces.length===0){const hint=document.createElement('div');hint.className='drop-zone-hint';hint.style.top=`${(9*60-START_MIN)*PX_PER_MIN}px`;hint.textContent='空いている時間にピースを置いてください';inner.appendChild(hint);}
    for(const p of dayPlaces){const c=cat(p.category);const el=document.createElement('article');el.className=`timeline-piece${p.id===selectedPieceId?' selected':''}`;el.dataset.pid=p.id;el.style.setProperty('--piece-color',c.color);el.style.background=c.soft;el.style.top=`${(p.start-START_MIN)*PX_PER_MIN}px`;el.style.height=`${Math.max(28,(p.duration||60)*PX_PER_MIN-3)}px`;el.innerHTML=`${p.photos?.[0]?`<img class="piece-photo" src="${esc(p.photos[0])}" alt="">`:`<span class="piece-photo" style="display:grid;place-items:center;color:${c.color};font-size:13px">${c.icon}</span>`}<span class="piece-info"><span class="piece-time">${fmtTime(p.start)} — ${fmtTime(p.start+(p.duration||60))}</span><span class="piece-title">${esc(p.name)}</span></span><span class="piece-duration">${p.duration||60}分</span>`;inner.appendChild(el);}
    for(const el of inner.querySelectorAll('.timeline-piece')){const place=state.places.find(p=>p.id===el.dataset.pid);for(const edge of ['start','end']){const handle=document.createElement('button');handle.type='button';handle.className=`resize-handle resize-handle--${edge}`;handle.dataset.resizeEdge=edge;handle.hidden=place?.id!==selectedPieceId;handle.title=edge==='start'?'開始時刻を上下にドラッグ':'終了時刻を上下にドラッグ';handle.setAttribute('aria-label',`${place?.name||'予定'}の${edge==='start'?'開始':'終了'}時刻を調整`);handle.innerHTML=`<span class="resize-grip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16m-4-12 4-4 4 4m-8 8 4 4 4-4"/></svg><span>${edge==='start'?'開始':'終了'}</span></span>`;el.appendChild(handle);}}
    renderTimelineAdjuster();
    renderTray();
  }
  function fmtTime(min){return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}
  function renderTray(){const items=state.places.filter(p=>p.start==null),tray=$('#trayPieces');$('#trayCount').textContent=items.length;tray.classList.toggle('is-empty',items.length===0);tray.innerHTML=items.length?items.map(p=>{const c=cat(p.category);return `<article class="tray-piece" data-pid="${esc(p.id)}" style="--piece-bg:${c.soft};--piece-color:${c.color}">${p.photos?.[0]?`<img class="piece-photo" src="${esc(p.photos[0])}" alt="">`:`<span class="piece-photo" style="display:grid;place-items:center;color:${c.color};font-size:15px">${c.icon}</span>`}<span class="piece-info"><b class="piece-title">${esc(p.name)}</b><small class="piece-category">${esc(p.category)} · ${p.duration||60}分${p.booked?' · 予約済':p.reservationRequired?' · 要予約':''}</small></span>${p.mustGo?'<span class="must-mini">必</span>':''}<button type="button" class="tray-place-button" data-place-now="${esc(p.id)}" aria-label="${esc(p.name)}を空き時間に置く">置く</button></article>`;}).join(''):state.places.length?'<div class="tray-empty tray-complete">すべて予定に入りました ✦</div>':'<div class="tray-empty"><span class="tray-empty-message">場所を集めると、ここに並びます</span><button type="button" class="tray-add-link" data-back-to-spots><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>場所を追加</span></button></div>';$('#navDot').classList.toggle('visible',items.some(p=>p.mustGo));}
  function placeAtNextSlot(pid){if(!hasTripDates()){requestTripDates();return;}const place=state.places.find(p=>p.id===pid);if(!place||place.start!=null)return;const start=findFreeStart(selectedDay,place.duration||60);if(start==null){showToast('この日に置ける空き時間がありません');return;}undoSnapshot=structuredClone(state);place.day=selectedDay;place.start=start;persist();renderAll();checkMustGo();showToast(`${fmtTime(start)} に配置しました`);if(navigator.vibrate)navigator.vibrate(12);}
  function renderItinerary(){const count=dayCount();if(!count){$('#itineraryContent').innerHTML=emptyTripMarkup();return;}$('#itineraryContent').innerHTML=Array.from({length:count},(_,day)=>{const date=dateAt(day),stay=dateHotel(day);const places=state.places.filter(p=>p.day===day&&p.start!=null).sort(sortPlaces);const dayTitle=`${day+1}日目`;return `<article class="itinerary-day"><header class="itinerary-day-head"><span class="date-badge"><b>${date.getDate()}</b><small>${new Intl.DateTimeFormat('ja-JP',{weekday:'short'}).format(date)}</small></span><div class="itinerary-day-title"><h2>${esc(dayTitle)}</h2><p>${fmtDate(date,{year:'numeric',month:'long',day:'numeric'})}</p></div>${stay?`<span class="day-stay">${icon('bed')}${esc(stay.name)}</span>`:''}</header>${places.length?`<div class="itinerary-stops">${places.map(p=>itineraryStop(p)).join('')}</div>`:`<div class="itinerary-empty">予定なし</div>`}</article>`;}).join('');}
  function itineraryStop(p){const c=cat(p.category);const query=p.latitude!=null&&p.longitude!=null?`${p.latitude},${p.longitude}`:[p.name,p.address].filter(Boolean).join(' ');const url=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;return `<div class="itinerary-stop" data-pid="${esc(p.id)}"><time class="stop-time">${fmtTime(p.start)}</time><i class="stop-dot" style="--stop-color:${c.color}"></i><div class="stop-details"><h3><span>${esc(p.name)}</span><button type="button" class="stop-remove" data-unplan="${esc(p.id)}" aria-label="${esc(p.name)}を旅程から外す"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></h3><p>${esc(p.category)} · ${p.duration||60}分${p.booked?' · 予約済み':p.reservationRequired?' · 要予約':''}${p.notes?`<br>${esc(p.notes)}`:''}</p><a class="map-link" href="${esc(url)}" target="_blank" rel="noopener">${icon('map')}${p.address?'場所を確認':'Googleマップで見る'}</a></div>${p.photos?.[0]?`<img class="stop-photo" src="${esc(p.photos[0])}" alt="">`:''}</div>`;}
  function renderPacking(){const items=state.packingItems||[];const checked=items.filter(x=>x.checked).length;$('#packingProgress').textContent=`${checked} / ${items.length} 完了`;$('#packingProgressBar').style.width=items.length?`${checked/items.length*100}%`:'0%';const groups=[...new Set(items.map(x=>x.category||'その他'))];$('#packingList').innerHTML=groups.map(group=>`<section class="packing-group"><h3>${esc(group)}</h3><div>${items.filter(x=>(x.category||'その他')===group).map(x=>`<div class="packing-item ${x.checked?'checked':''}"><label class="packing-check-row"><input type="checkbox" data-pack-toggle="${esc(x.id)}" ${x.checked?'checked':''}><span class="packing-check"></span><span class="packing-name">${esc(x.name)}</span></label><button type="button" class="packing-remove" data-pack-remove="${esc(x.id)}" aria-label="${esc(x.name)}を削除">×</button></div>`).join('')}</div></section>`).join('')||'<p class="packing-empty">持ち物はまだありません</p>'; }
  function addPackingItem(event){event.preventDefault();const input=$('#packingName'),name=input.value.trim();if(!name)return;state.packingItems.unshift({id:id(),name,category:'その他',checked:false});input.value='';persist();renderPacking();input.focus({preventScroll:true});}
  function removePackingItem(itemId){state.packingItems=state.packingItems.filter(x=>x.id!==itemId);persist();renderPacking();}
  function unplanPlace(pid,direction=1){const place=state.places.find(x=>x.id===pid);if(!place||place.start==null)return;undoSnapshot=structuredClone(state);undoMessage='予定に戻しました';place.day=null;place.start=null;persist();const el=document.querySelector(`[data-pid="${CSS.escape(pid)}"]`);if(el){el.style.setProperty('--swipe-offset',direction<0?'-110%':'110%');el.classList.add('swipe-away');setTimeout(renderAll,170);}else renderAll();showUndoToast('旅程から外しました');if(navigator.vibrate)navigator.vibrate(10);}
  function deleteSpotBySwipe(pid,direction=-1){const place=state.places.find(p=>p.id===pid);if(!place)return false;if(!confirm(`「${place.name}」を本当に削除しますか？`))return false;undoSnapshot=structuredClone(state);undoMessage='場所を復元しました';state.places=state.places.filter(p=>p.id!==pid);persist();const el=document.querySelector(`.place-card[data-edit="${CSS.escape(pid)}"]`);if(el){el.style.setProperty('--swipe-offset',direction<0?'-110%':'110%');el.classList.add('swipe-away');const tripId=state.id;setTimeout(()=>{if(state.id===tripId)renderAll();},250);}else renderAll();showUndoToast('場所を削除しました');if(navigator.vibrate)navigator.vibrate(10);return true;}
  function watchPlaceSwipe(e,pid,element){
    if(e.isPrimary===false||(e.button!=null&&e.button!==0)||!element)return;
    if(e.pointerType==='touch'&&(e.clientX<20||e.clientX>window.innerWidth-20))return;
    const row=element.closest('.place-row');if(!row||element.classList.contains('swipe-away'))return;
    placeSwipe?.();swipeStart=null;
    const x=e.clientX,y=e.clientY,pointerId=e.pointerId,tripId=state.id;
    const threshold=Math.min(64,Math.max(48,element.getBoundingClientRect().width*.16));
    let active=true,horizontal=false,offset=0,ready=false;
    const restore=()=>{element.classList.remove('is-swiping');element.style.transform='';row.classList.remove('swipe-ready');row.classList.add('swipe-settling');setTimeout(()=>{if(!element.classList.contains('is-swiping')&&!element.classList.contains('swipe-away'))row.classList.remove('swiping','swipe-settling');},250);};
    const cleanup=()=>{
      active=false;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('touchmove',touchMove);window.removeEventListener('touchend',touchEnd);window.removeEventListener('touchcancel',touchCancel);window.removeEventListener('blur',abort);element.removeEventListener('lostpointercapture',captureLost);
      if(placeSwipe===abort)placeSwipe=null;
      try{if(element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);}catch{}
    };
    const finish=(ev,cancelled=false)=>{
      if(!active||(ev&&ev.pointerId!==pointerId))return;
      if(horizontal&&!cancelled&&ev)offset=ev.clientX-x;
      const commit=horizontal&&!cancelled&&state.id===tripId&&element.isConnected&&Math.abs(offset)>=threshold;
      cleanup();if(horizontal)ignorePlaceClickUntil=Date.now()+500;
      if(commit){element.classList.remove('is-swiping');element.style.transform='';if(!deleteSpotBySwipe(pid,offset))restore();}else if(horizontal)restore();
      if(horizontal)ignorePlaceClickUntil=Date.now()+500;
    };
    const abort=()=>finish(null,true),cancel=ev=>finish(ev,true),up=ev=>finish(ev);
    const captureLost=ev=>{if(ev.target===element)cancel(ev);};
    const touchEvent=(event,touch)=>({clientX:touch.clientX,clientY:touch.clientY,pointerId:touch.identifier,target:event.target,preventDefault:()=>event.preventDefault()});
    const touchMove=event=>{const touch=Array.from(event.changedTouches).find(t=>t.identifier===pointerId);if(touch)move(touchEvent(event,touch));};
    const touchEnd=event=>{const touch=Array.from(event.changedTouches).find(t=>t.identifier===pointerId);if(touch)up(touchEvent(event,touch));};
    const touchCancel=event=>{const touch=Array.from(event.changedTouches).find(t=>t.identifier===pointerId);if(touch)cancel(touchEvent(event,touch));};
    const move=ev=>{
      if(!active||ev.pointerId!==pointerId)return;
      if(state.id!==tripId||!element.isConnected){abort();return;}
      const dx=ev.clientX-x,dy=ev.clientY-y;
      if(!horizontal){
        if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)*1.35){abort();return;}
        if(Math.abs(dx)<12||Math.abs(dx)<=Math.abs(dy)*1.2)return;
        horizontal=true;element.classList.add('is-swiping');row.classList.remove('swipe-settling');row.classList.add('swiping');
        if(e.pointerType!=='touch')try{element.setPointerCapture(pointerId);}catch{}
      }
      ev.preventDefault();offset=dx;element.style.transform=`translate3d(${dx}px,0,0)`;
      const nextReady=Math.abs(dx)>=threshold;row.classList.toggle('swipe-ready',nextReady);
      if(nextReady&&!ready&&navigator.vibrate)navigator.vibrate(8);ready=nextReady;
    };
    placeSwipe=abort;
    if(e.fromTouch){window.addEventListener('touchmove',touchMove,{passive:false});window.addEventListener('touchend',touchEnd);window.addEventListener('touchcancel',touchCancel);}
    else{window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);element.addEventListener('lostpointercapture',captureLost);}
    window.addEventListener('blur',abort);
  }
  function watchScheduleSwipe(e,pid){if(e.pointerType!=='touch')return;let active=true;const x=e.clientX,y=e.clientY;const finish=()=>{if(!active)return;active=false;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);};const move=ev=>{if(!active)return;const dx=ev.clientX-x,dy=ev.clientY-y;if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.25){ev.preventDefault();finish();unplanPlace(pid,dx);}else if(Math.abs(dy)>18)finish();};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish,{once:true});window.addEventListener('pointercancel',finish,{once:true});}
  function handleTimelinePointerDown(e,element){
    if(e.button!=null&&e.button!==0)return;
    const pid=element.dataset.pid,handle=e.target.closest('.resize-handle');
    if(handle){if(selectedPieceId===pid)startResize(e,element,handle.dataset.resizeEdge);return;}
    if(drag||resizeSession)return;
    const x=e.clientX,y=e.clientY,initialScroll=timelineScroll.scrollTop;
    let active=true,scrolled=false,lastEvent=e,timer=0;
    const finish=()=>{if(!active)return;active=false;clearTimeout(timer);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',finish);};
    const begin=()=>{if(!active)return;finish();startDrag(lastEvent,element);};
    const move=ev=>{if(!active||ev.pointerId!==e.pointerId)return;lastEvent=ev;const dx=ev.clientX-x,dy=ev.clientY-y;
      if(e.pointerType!=='touch'&&Math.hypot(dx,dy)>5){begin();return;}
      if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.25){ev.preventDefault();finish();unplanPlace(pid,dx);return;}
      if(Math.abs(dy)>10||scrolled){clearTimeout(timer);scrolled=true;ev.preventDefault();timelineScroll.scrollTop=initialScroll-dy;}
    };
    const up=ev=>{if(ev.pointerId!==e.pointerId)return;const tapped=!scrolled&&Math.hypot(ev.clientX-x,ev.clientY-y)<10;finish();if(tapped)selectTimelinePiece(pid);};
    if(e.pointerType==='touch')timer=setTimeout(begin,320);
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',finish,{once:true});
  }
  function selectTimelinePiece(pid){selectedPieceId=pid;$$('.timeline-piece').forEach(el=>{const selected=el.dataset.pid===pid;el.classList.toggle('selected',selected);$$('.resize-handle',el).forEach(handle=>handle.hidden=!selected);});renderTimelineAdjuster();}
  function renderTimelineAdjuster(preview){
    const panel=$('#timelineAdjuster'),place=state.places.find(p=>p.id===selectedPieceId&&p.day===selectedDay&&p.start!=null);
    panel.hidden=!place;if(!place)return;
    const start=preview?.start??place.start,duration=preview?.duration??(place.duration||60);
    $('#adjusterName').textContent=place.name;$('#adjusterTime').textContent=`${fmtTime(start)} – ${fmtTime(start+duration)} · ${duration}分`;
    $('[data-duration-delta="-15"]',panel).disabled=duration<=15;
    $('[data-duration-delta="15"]',panel).disabled=start+duration>=END_MIN;
  }
  function adjustSelectedDuration(delta){
    const place=state.places.find(p=>p.id===selectedPieceId&&p.start!=null);if(!place)return;
    const duration=(place.duration||60)+delta;
    if(duration<15||place.start+duration>END_MIN)return;
    if(overlaps(place.day,place.start,duration,place.id)){showToast('次の予定と重なります。予定を移動してから延長してください');return;}
    undoSnapshot=structuredClone(state);undoMessage='時間の変更を戻しました';place.duration=duration;persist();renderAll();if(navigator.vibrate)navigator.vibrate(10);
  }
  function renderNavDot(){const remaining=state.places.some(p=>p.mustGo&&p.start==null);$('#navDot').classList.toggle('visible',remaining);}

  function openTripPicker(){renderTrips();openModal($('#tripsBackdrop'));}
  function selectTrip(tripId){const trip=trips.find(t=>t.id===tripId);if(!trip||trip.id===state.id){closeModal($('#tripsBackdrop'));return;}state=trip;activeTripId=trip.id;selectedDay=0;selectedCategory='すべて';undoSnapshot=null;$('#searchPlaces').value='';completionShown=false;pageIndex=0;pages.style.transform='translate3d(0,0,0)';$$('.nav-item').forEach((n,i)=>n.classList.toggle('active',i===0));closeModal($('#tripsBackdrop'));persist();renderAll();showToast('旅行を切り替えました');}
  function localDateString(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function createTrip(){const trip=normalizeState({id:id(),destination:'',travelers:2,startDate:'',endDate:'',datesConfigured:false,hotels:[],places:[],packingItems:structuredClone(PACKING_DEFAULTS)});trips=trips.filter(t=>!isEmptyTrip(t));trips.push(trip);state=trip;activeTripId=trip.id;selectedDay=0;selectedCategory='すべて';undoSnapshot=null;$('#searchPlaces').value='';pageIndex=0;pages.style.transform='translate3d(0,0,0)';$$('.nav-item').forEach((n,i)=>n.classList.toggle('active',i===0));closeModal($('#tripsBackdrop'));persist();renderAll();openSettings();}
  function deleteTrip(tripId){if(trips.length<2)return;const trip=trips.find(t=>t.id===tripId);if(!trip)return;const title=trip.destination||'行き先未設定';if(!confirm(`「${title}」と登録したスポット・旅程を削除しますか？`))return;const wasActive=state.id===tripId;trips=trips.filter(t=>t.id!==tripId);if(wasActive){state=trips[0];activeTripId=state.id;selectedDay=0;selectedCategory='すべて';$('#searchPlaces').value='';undoSnapshot=null;completionShown=false;}persist();renderAll();showToast('旅行を削除しました');}

  function syncPageAccess(){$('#quickAdd').hidden=pageIndex!==0;$$('.page',pages).forEach((page,i)=>{page.inert=i!==pageIndex;page.setAttribute('aria-hidden',i===pageIndex?'false':'true');});if(viewport.scrollLeft)viewport.scrollLeft=0;}
  function navigate(index){index=Math.max(0,Math.min(2,index));if(index===pageIndex)return;pageIndex=index;pages.style.transform=`translate3d(-${index*33.333333}%,0,0)`;$$('.nav-item').forEach((n,i)=>n.classList.toggle('active',i===index));syncPageAccess();}
  function setVisualHeight(){window.TabiViewport?.refresh();}
  function updateConnectionStatus(){const status=$('#connectionStatus');if(status)status.hidden=navigator.onLine;}

  function openPlace(idValue){const p=state.places.find(x=>x.id===idValue);editingPhotos=p?.photos?[...p.photos]:[];candidate=null;$('#candidateBox').hidden=true;$('#candidateBox').innerHTML='';const form=$('#placeForm');form.reset();form.elements.id.value=p?.id||'';form.elements.latitude.value=p?.latitude??'';form.elements.longitude.value=p?.longitude??'';form.elements.name.value=p?.name||'';renderCategoryField(p?.category||(groupNames().includes(selectedCategory)?selectedCategory:groupNames()[0])||UNGROUPED);form.elements.duration.value=String(p?.duration||60);form.elements.address.value=p?.address||'';form.elements.url.value=p?.url||'';form.elements.hours.value=p?.hours||'';form.elements.phone.value=p?.phone||'';form.elements.notes.value=p?.notes||'';$('#optionalDetails').open=!!(p&&(p.address||p.url||p.hours||p.phone||p.notes));form.elements.mustGo.checked=!!p?.mustGo;form.elements.reservationStatus.value=p?.booked?'booked':p?.reservationRequired?'required':'none';$('#sheetTitle').textContent=p?'場所を編集':'場所を追加';$('#sheetEyebrow').textContent=p?'EDIT PLACE':'NEW PLACE';$('#deletePlace').hidden=!p;renderPhotos();openModal($('#modalBackdrop'));}
  function openModal(el){el.classList.add('open');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';setTimeout(()=>{if($('#rangeBackdrop.open'))return;const field=el.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');if(!matchMedia('(pointer: coarse)').matches)field?.focus({preventScroll:true});},260);}
  function closeModal(el){if(el.contains(document.activeElement))document.activeElement.blur();el.classList.remove('open');el.setAttribute('aria-hidden','true');if(!$('.modal-backdrop.open'))document.body.style.overflow='';}
  function initFields(){renderCategoryField(groupNames()[0]||UNGROUPED);const dur=$('#duration');dur.innerHTML=Array.from({length:32},(_,i)=>15*(i+1)).map(m=>`<option value="${m}">${m>=60?`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}`:`${m}分`}</option>`).join('');}
  function renderPhotos(){const preview=$('#photoPreview');preview.innerHTML=editingPhotos.length?editingPhotos.map((src,i)=>`<div class="photo-item"><img src="${esc(src)}" alt="追加した写真"><button type="button" data-remove-photo="${i}" aria-label="写真を削除">×</button></div>`).join(''):'';}
  async function compressImage(file){if(!file.type.startsWith('image/'))return null;return new Promise(resolve=>{const img=new Image();const object=URL.createObjectURL(file);img.onload=()=>{const ratio=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(object);resolve(canvas.toDataURL('image/jpeg',.82));};img.onerror=()=>{URL.revokeObjectURL(object);resolve(null);};img.src=object;});}
  async function addFiles(files){for(const f of Array.from(files||[])){const data=await compressImage(f);if(data)editingPhotos.push(data);}renderPhotos();}
  function savePlace(event){event.preventDefault();const f=event.currentTarget.elements;const item={id:f.id.value||id(),name:f.name.value.trim(),category:f.category.value,address:f.address.value.trim(),duration:Number(f.duration.value)||60,notes:f.notes.value.trim(),photos:editingPhotos,url:f.url.value.trim(),hours:f.hours.value.trim(),phone:f.phone.value.trim(),latitude:f.latitude.value?Number(f.latitude.value):null,longitude:f.longitude.value?Number(f.longitude.value):null,mustGo:f.mustGo.checked,reservationRequired:f.reservationStatus.value!=='none',booked:f.reservationStatus.value==='booked',day:null,start:null};const old=state.places.find(p=>p.id===item.id);if(old){item.day=old.day;item.start=old.start;state.places=state.places.map(p=>p.id===item.id?item:p);}else state.places.push(item);persist();renderAll();closeModal($('#modalBackdrop'));showToast(old?'スポットを更新しました':'スポットを保存しました');}
  function deletePlace(){const idValue=$('#placeForm').elements.id.value;if(!idValue)return;state.places=state.places.filter(p=>p.id!==idValue);persist();renderAll();closeModal($('#modalBackdrop'));showToast('スポットを削除しました');}

  function renderHotelEditor(){const list=$('#hotelEditList');if(!hotelDraft.length){list.innerHTML='<p class="hotel-empty">宿泊先はまだ登録されていません</p>';return;}list.innerHTML=hotelDraft.map((h,i)=>`<article class="hotel-edit-card"><header class="hotel-edit-card-head"><span>宿泊先 ${i+1}</span><button class="hotel-remove-button" type="button" data-remove-hotel="${i}" aria-label="宿泊先 ${i+1} を削除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></header><label class="field"><span>ホテル名</span><input data-hotel-index="${i}" data-hotel-field="name" value="${esc(h.name)}" placeholder="宿泊先の名前" maxlength="100"></label><div class="field hotel-range-field"><span>宿泊期間</span><button class="date-range-button" type="button" data-hotel-range="${i}">${calendarIcon()}<span>${esc(window.TabiDateRange.label(h.start,h.end,true))}</span></button></div></article>`).join('');}
  function calendarIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';}
  function updateTripRangeLabel(){const f=$('#settingsForm').elements;$('#tripDateRange').innerHTML=`${calendarIcon()}<span>${esc(window.TabiDateRange.label(f.startDate.value,f.endDate.value))}</span>`;}
  function openTripDateRange(){const f=$('#settingsForm').elements;window.TabiDateRange.open({start:f.startDate.value,end:f.endDate.value,maxDays:21,onApply:({start,end})=>{f.startDate.value=start;f.endDate.value=end;updateTripRangeLabel();}});}
  function openHotelDateRange(index){const h=hotelDraft[index];if(!h)return;window.TabiDateRange.open({start:h.start,end:h.end,initialMonth:$('#settingsForm').elements.startDate.value,stay:true,onApply:({start,end})=>{if(hotelDraft[index]!==h)return;h.start=start;h.end=end;renderHotelEditor();$(`[data-hotel-range="${index}"]`)?.focus({preventScroll:true});}});}
  function openSettings(focusHotels=false,preferences=false){$('#notificationSettings').hidden=!preferences;$('#settingsTitle').textContent=preferences?'設定':'旅行の設定';const f=$('#settingsForm').elements;f.destination.value=state.destination;f.travelers.value=state.travelers;f.startDate.value=state.startDate;f.endDate.value=state.endDate;hotelDraft=(state.hotels||[]).filter(h=>h.name||h.start||h.end).map(h=>({...h}));renderHotelEditor();updateTripRangeLabel();notifications?.restore();openModal($('#settingsBackdrop'));if(focusHotels)requestAnimationFrame(()=>{const sheet=$('#settingsBackdrop .edit-sheet');sheet.scrollTop=$('#hotelEditor').offsetTop-sheet.offsetTop-16;});}
  function saveSettings(e){e?.preventDefault();if(!commitSettings())return;closeModal($('#settingsBackdrop'));showToast('旅行の設定を更新しました');}
  function commitSettings(){
    const form=$('#settingsForm'),f=form.elements,start=f.startDate.value,end=f.endDate.value,hasDates=!!(start||end);
    const oldStart=parseDate(state.startDate),newStart=parseDate(start),newEnd=parseDate(end);
    if(hasDates&&(!Number.isFinite(newStart.getTime())||!Number.isFinite(newEnd.getTime())||newEnd<newStart)){showToast('出発日と帰着日を確認してください');return false;}
    const travelers=Number(f.travelers.value)||2;if(travelers<1||travelers>20){showToast('人数は1〜20人で入力してください');return false;}
    const delta=hasDates&&Number.isFinite(oldStart.getTime())?Math.round((newStart-oldStart)/86400000):0;
    state.destination=f.destination.value.trim();state.travelers=travelers;state.startDate=start;state.endDate=end;state.datesConfigured=hasDates;
    state.places=state.places.map(p=>p.day==null?p:hasDates?{...p,day:Math.min(Math.max(0,p.day-delta),Math.max(0,dayCount()-1))}:{...p,day:null,start:null});
    state.hotels=hotelDraft.map(h=>({id:h.id||id(),name:h.name.trim(),start:h.start,end:h.end})).filter(h=>h.name||h.start||h.end);
    selectedDay=Math.max(0,Math.min(selectedDay,dayCount()-1));persist();renderAll();return true;
  }

  function startDrag(e,element){
    if(!hasTripDates()){requestTripDates();return;}
    if(e.button!=null&&e.button!==0)return;
    const place=state.places.find(p=>p.id===element.dataset.pid);if(!place||drag||resizeSession)return;
    e.preventDefault();const rect=element.getBoundingClientRect(),ghost=element.cloneNode(true);
    ghost.classList.remove('selected');ghost.classList.add('drag-ghost');$$('.resize-handle',ghost).forEach(h=>h.remove());
    Object.assign(ghost.style,{position:'fixed',zIndex:40,pointerEvents:'none',width:`${Math.min(rect.width,260)}px`,right:'auto',bottom:'auto',opacity:'.94',transform:'translate(-50%,-50%) scale(1.03)',boxShadow:'0 18px 42px rgba(22,57,58,.25)'});
    document.body.appendChild(ghost);element.classList.add('dragging');
    drag={pid:place.id,source:element,ghost,pointerId:e.pointerId,pointerX:e.clientX,pointerY:e.clientY,wasPlaced:place.start!=null,grabOffset:place.start==null?0:Math.max(0,Math.min((place.duration||60)*PX_PER_MIN,e.clientY-rect.top)),targetDay:null};
    try{element.setPointerCapture(e.pointerId);}catch{}
    moveDrag(e);if(navigator.vibrate)navigator.vibrate(10);
    window.addEventListener('pointermove',moveDrag,{passive:false});window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',cancelDrag);
  }
  function startResize(e,element,edge='end'){
    const place=state.places.find(p=>p.id===element.dataset.pid);if(!place||place.start==null||drag||resizeSession)return;
    e.preventDefault();e.stopPropagation();
    const capture=e.target.closest('.resize-handle'),duration=place.duration||60;
    resizeSession={pid:place.id,element,capture,edge,pointerId:e.pointerId,pointerX:e.clientX,pointerY:e.clientY,initialY:e.clientY,initialScroll:timelineScroll.scrollTop,initialStart:place.start,initialEnd:place.start+duration,currentStart:place.start,currentDuration:duration,blocked:false};
    element.classList.add('resizing');try{capture.setPointerCapture(e.pointerId);}catch{}
    window.addEventListener('pointermove',moveResize,{passive:false});window.addEventListener('pointerup',finishResize);window.addEventListener('pointercancel',cancelResize);
  }
  function moveResize(e){if(!resizeSession||e.pointerId!==resizeSession.pointerId)return;e.preventDefault();resizeSession.pointerX=e.clientX;resizeSession.pointerY=e.clientY;previewResize();updateTimelineAutoScroll();}
  function previewResize(){
    const r=resizeSession;if(!r)return;const place=state.places.find(p=>p.id===r.pid);if(!place)return;
    const delta=Math.round((r.pointerY-r.initialY+timelineScroll.scrollTop-r.initialScroll)/(PX_PER_MIN*15))*15;
    const start=r.edge==='start'?Math.max(START_MIN,Math.min(r.initialEnd-15,r.initialStart+delta)):r.initialStart;
    const end=r.edge==='end'?Math.max(r.initialStart+15,Math.min(END_MIN,r.initialEnd+delta)):r.initialEnd;
    r.blocked=overlaps(place.day,start,end-start,place.id);r.element.classList.toggle('resize-blocked',r.blocked);if(r.blocked)return;
    r.currentStart=start;r.currentDuration=end-start;
    r.element.style.top=`${(start-START_MIN)*PX_PER_MIN}px`;r.element.style.height=`${Math.max(28,(end-start)*PX_PER_MIN-3)}px`;
    $('.piece-time',r.element).textContent=`${fmtTime(start)} — ${fmtTime(end)}`;$('.piece-duration',r.element).textContent=`${end-start}分`;
    renderTimelineAdjuster({start,duration:end-start});
  }
  function cleanupResize(){const r=resizeSession;if(!r)return null;stopTimelineAutoScroll();window.removeEventListener('pointermove',moveResize);window.removeEventListener('pointerup',finishResize);window.removeEventListener('pointercancel',cancelResize);try{r.capture.releasePointerCapture(r.pointerId);}catch{}resizeSession=null;return r;}
  function finishResize(e){if(!resizeSession||e.pointerId!==resizeSession.pointerId)return;const r=cleanupResize(),place=state.places.find(p=>p.id===r.pid);if(place&&!r.blocked&&(r.currentStart!==r.initialStart||r.currentDuration!==r.initialEnd-r.initialStart)){undoSnapshot=structuredClone(state);undoMessage='時間の変更を戻しました';place.start=r.currentStart;place.duration=r.currentDuration;persist();if(navigator.vibrate)navigator.vibrate(10);}renderAll();if(r.blocked)showToast('ほかの予定と重なる時間には変更できません');}
  function cancelResize(){if(!cleanupResize())return;renderAll();}
  function moveDrag(e){if(!drag||e.pointerId!==drag.pointerId)return;e.preventDefault();drag.pointerX=e.clientX;drag.pointerY=e.clientY;drag.ghost.style.left=`${e.clientX}px`;drag.ghost.style.top=`${e.clientY}px`;const tab=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-tab');$$('.day-tab').forEach(x=>x.classList.remove('drag-hover'));if(tab){tab.classList.add('drag-hover');drag.targetDay=Number(tab.dataset.day);}else drag.targetDay=null;renderDragPreview();updateTimelineAutoScroll();}
  function proposedDragStart(active){const place=state.places.find(p=>p.id===active.pid),rect=timelineScroll.getBoundingClientRect();const localY=active.pointerY-rect.top+timelineScroll.scrollTop-active.grabOffset;return Math.max(START_MIN,Math.min(END_MIN-(place?.duration||60),START_MIN+Math.round(localY/(PX_PER_MIN*15))*15));}
  function renderDragPreview(){
    if(!drag)return;const rect=timelineScroll.getBoundingClientRect(),inside=drag.pointerX>=rect.left&&drag.pointerX<=rect.right&&drag.pointerY>=rect.top&&drag.pointerY<=rect.bottom;
    let preview=$('#dragPreview');if(!inside){if(preview)preview.hidden=true;return;}if(!preview){preview=document.createElement('div');preview.id='dragPreview';preview.className='drag-preview';$('#timelineInner').appendChild(preview);}preview.hidden=false;
    const place=state.places.find(p=>p.id===drag.pid),start=proposedDragStart(drag),duration=place?.duration||60;
    preview.style.top=`${(start-START_MIN)*PX_PER_MIN}px`;preview.style.height=`${Math.max(28,duration*PX_PER_MIN-3)}px`;preview.textContent=`${fmtTime(start)} – ${fmtTime(start+duration)}`;preview.classList.toggle('blocked',overlaps(selectedDay,start,duration,drag.pid));
  }
  function timelineEdgeVelocity(action){const r=timelineScroll.getBoundingClientRect(),edge=Math.min(64,r.height/3);if(action.pointerX<r.left||action.pointerX>r.right||action.pointerY<r.top-12||action.pointerY>r.bottom+12)return 0;const up=Math.max(0,r.top+edge-action.pointerY),down=Math.max(0,action.pointerY-(r.bottom-edge));return Math.max(-420,Math.min(420,(down-up)*8));}
  function updateTimelineAutoScroll(){
    const action=resizeSession||drag;if(!action||!timelineEdgeVelocity(action)){stopTimelineAutoScroll();return;}if(dragAutoFrame)return;let last=performance.now();
    const tick=now=>{dragAutoFrame=0;const current=resizeSession||drag;if(!current)return;const velocity=timelineEdgeVelocity(current);if(!velocity)return;const before=timelineScroll.scrollTop;timelineScroll.scrollTop+=velocity*Math.min(32,now-last)/1000;last=now;if(timelineScroll.scrollTop===before)return;if(resizeSession)previewResize();else renderDragPreview();dragAutoFrame=requestAnimationFrame(tick);};dragAutoFrame=requestAnimationFrame(tick);
  }
  function stopTimelineAutoScroll(){if(dragAutoFrame)cancelAnimationFrame(dragAutoFrame);dragAutoFrame=0;}
  function cleanupDrag(){if(!drag)return null;const active=drag;stopTimelineAutoScroll();window.removeEventListener('pointermove',moveDrag);window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',cancelDrag);try{active.source.releasePointerCapture(active.pointerId);}catch{}active.ghost.remove();active.source.classList.remove('dragging');$('#dragPreview')?.remove();$$('.day-tab').forEach(x=>x.classList.remove('drag-hover'));drag=null;return active;}
  function cancelDrag(){cleanupDrag();}
  function endDrag(e){
    if(!drag||e.pointerId!==drag.pointerId)return;drag.pointerX=e.clientX;drag.pointerY=e.clientY;
    const active=drag,hit=document.elementFromPoint(e.clientX,e.clientY),targetDayTab=hit?.closest('.day-tab'),onTimeline=hit?.closest('#timelineScroll');
    const place=state.places.find(p=>p.id===active.pid);let next=null;
    if(place&&targetDayTab){const day=Number(targetDayTab.dataset.day),start=place.start==null?findFreeStart(day,place.duration||60):place.start;if(start!=null&&!overlaps(day,start,place.duration||60,place.id))next={day,start};else dragError(active.source);}
    else if(place&&onTimeline){const start=proposedDragStart(active);if(!overlaps(selectedDay,start,place.duration||60,place.id))next={day:selectedDay,start};else dragError(active.source);}
    else if(place&&active.wasPlaced&&hit?.closest('.tray-card'))next={day:null,start:null};
    cleanupDrag();if(next){undoSnapshot=structuredClone(state);undoMessage='予定の移動を戻しました';Object.assign(place,next);if(next.day!=null)selectedDay=next.day;selectedPieceId=next.start==null?null:place.id;persist();renderAll();const el=$(`.timeline-piece[data-pid="${CSS.escape(place.id)}"]`);el?.classList.add('snap');if(navigator.vibrate)navigator.vibrate(12);checkMustGo();}
  }
  function dragError(el){el.classList.add('invalid');setTimeout(()=>el.classList.remove('invalid'),360);if(navigator.vibrate)navigator.vibrate([25,35,25]);showToast('その時間はほかの予定と重なります');}
  function overlaps(day,start,duration,exclude){const end=start+duration;return state.places.some(p=>p.id!==exclude&&p.day===day&&p.start!=null&&start<p.start+(p.duration||60)&&end>p.start);}
  function findFreeStart(day,duration){if(!hasTripDates()||day<0||day>=dayCount())return null;for(let t=9*60;t<=END_MIN-duration;t+=15)if(!overlaps(day,t,duration,null))return t;return null;}
  function autoArrange(){if(!hasTripDates()){requestTripDates();return;}undoSnapshot=structuredClone(state);let moved=0;const pending=state.places.filter(p=>p.start==null).sort((a,b)=>Number(b.mustGo)-Number(a.mustGo));for(const p of pending){let day=selectedDay,start=null;for(let offset=0;offset<dayCount()&&!start;offset++){day=(selectedDay+offset)%dayCount();start=findFreeStart(day,p.duration||60);}if(start!=null){p.day=day;p.start=start;moved++;}}persist();renderAll();checkMustGo();showToast(moved?`${moved}件を空き時間に配置しました`:'配置できる空き時間がありません');}
  function undo(){if(!undoSnapshot){showToast('戻せる操作がありません');return;}if(state.collaboration&&sharedApi&&undoCheckpoint?.before===undoSnapshot){const reverted=sharedApi.merge(undoCheckpoint.after,sharedApi.wire(undoSnapshot),sharedApi.wire(state));state=normalizeState({...state,...reverted});}else state=undoSnapshot;undoSnapshot=null;undoCheckpoint=null;persist();renderAll();showToast(undoMessage);}
  function clearDay(){const count=state.places.filter(p=>p.day===selectedDay&&p.start!=null).length;if(!count){showToast('この日に配置したピースはありません');return;}state.places=state.places.map(p=>p.day===selectedDay?{...p,day:null,start:null}:p);persist();renderAll();showToast(`${count}件を未配置に戻しました`);}
  function checkMustGo(){const must=state.places.filter(p=>p.mustGo);if(must.length&&must.every(p=>p.start!=null)&&!completionShown){completionShown=true;const toast=$('#completionToast');toast.classList.add('visible');if(navigator.vibrate)navigator.vibrate([15,30,15]);setTimeout(()=>toast.classList.remove('visible'),5000);}if(must.some(p=>p.start==null))completionShown=false;}

  async function extractUrl(){const input=$('#placeForm').elements.url.value.trim();if(!input){showToast('先にURLを入力してください');return;}let url;try{url=new URL(input);}catch{showToast('URLの形式を確認してください');return;}if(!['http:','https:'].includes(url.protocol)){showToast('httpまたはhttpsのURLを入力してください');return;}if(!navigator.onLine){candidate={url:url.href,title:'',description:'',image:'',address:'',phone:'',hours:'',lat:null,lng:null,source:'手入力'};showCandidate(candidate,false,url.hostname.replace(/^www\./,''));showToast('オフラインです。URLは保存できるので、場所の情報を入力してください');return;}const btn=$('#fetchUrl'),box=$('#candidateBox');btn.disabled=true;btn.innerHTML='<span class="fetch-icon">…</span>情報を確認中';box.hidden=false;box.innerHTML='<div class="candidate-loading"><strong>候補を探しています</strong><br>対応していないサイトの場合も、URLは保存できます。</div>';
    try{const response=await fetch(`/api/extract?url=${encodeURIComponent(url.href)}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('fetch_failed');const data=await response.json();candidate={...data,url:url.href};showCandidate(candidate,true);}catch{candidate={url:url.href,title:'',description:'',image:'',address:'',phone:'',hours:'',lat:null,lng:null,source:'手入力'};const hostname=url.hostname.replace(/^www\./,'');showCandidate(candidate,false,hostname);}
    finally{btn.disabled=false;btn.innerHTML='<span class="fetch-icon">↗</span> URLから情報を読み込む';}}
  function showCandidate(data,success,hostname=''){
    const box=$('#candidateBox');box.hidden=false;const title=data.title||hostname||'ページ情報を取得できませんでした';
    const thumbnail=data.image?`<img src="${esc(data.image)}" alt="ページのサムネイル" loading="lazy">`:'';
    const lat=Number(data.latitude),lng=Number(data.longitude),hasCoords=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
    const mapPreview=hasCoords?(()=>{const dLat=.005,dLng=.008;const bbox=`${lng-dLng},${lat-dLat},${lng+dLng},${lat+dLat}`;const src=`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;return `<iframe class="candidate-map-frame" title="場所の地図プレビュー" loading="lazy" src="${src}"></iframe>`;})():'';
    box.innerHTML=`<strong>${success?'確認候補':'URLを保存できます'}</strong><div class="candidate-top">${thumbnail}<span>${esc(title)}${data.address?`<br>住所候補：${esc(data.address)}`:''}${data.phone?`<br>電話：${esc(data.phone)}`:''}${data.hours?`<br>営業時間：${esc(data.hours)}`:''}</span></div>${mapPreview}<div class="candidate-actions"><button type="button" id="useCandidate">候補を反映</button><button type="button" id="keepUrl">URLだけ保存</button></div>${!success?'<span class="field-hint">取得に失敗しました。名前や住所を入力してください。</span>':''}`;
    $('#useCandidate').onclick=()=>{const f=$('#placeForm').elements;if(data.title&&!f.name.value.trim())f.name.value=data.title;if(data.address&&!f.address.value.trim())f.address.value=data.address;if(data.phone&&!f.phone.value.trim())f.phone.value=data.phone;if(data.hours&&!f.hours.value.trim())f.hours.value=data.hours;if(data.description&&!f.notes.value.trim())f.notes.value=data.description;if(hasCoords){f.latitude.value=lat;f.longitude.value=lng;}if(data.image&&!editingPhotos.length)fetch(data.image).then(r=>r.blob()).then(blob=>addFiles([new File([blob],'page-image.jpg',{type:blob.type||'image/jpeg'})])).catch(()=>{});showToast(success?'候補を入力欄に反映しました':'名前などを入力して保存してください');box.hidden=true;};
    $('#keepUrl').onclick=()=>{box.hidden=true;showToast('URLを保存できます。名前も入力してください');};
  }
  async function pasteUrl(){try{const text=await navigator.clipboard.readText();if(/^https?:\/\//i.test(text.trim())){$('#placeForm').elements.url.value=text.trim();showToast('URLを貼り付けました');}else showToast('クリップボードにURLがありません');}catch{showToast('貼り付け欄を長押しして貼り付けてください');}}

  function getShareText(){if(!hasTripDates())return `${state.destination||'旅行'} · 日程未設定`;const lines=[`✈ ${state.destination} · ${fmtDate(parseDate(state.startDate),{month:'short',day:'numeric'})}–${fmtDate(parseDate(state.endDate),{month:'short',day:'numeric'})}`,`${state.travelers}人の旅程`,''];for(let d=0;d<dayCount();d++){const places=state.places.filter(p=>p.day===d&&p.start!=null).sort(sortPlaces);lines.push(`${d+1}日目 · ${fmtDate(dateAt(d),{month:'numeric',day:'numeric',weekday:'short'})}${dateHotel(d)?` · ${dateHotel(d).name}`:''}`);if(places.length)places.forEach(p=>lines.push(`  ${fmtTime(p.start)}  ${p.name} (${p.duration}分)`));else lines.push('  予定なし');lines.push('');}return lines.join('\n');}
  function exportJSON(){const blob=new Blob([JSON.stringify({...state,collaboration:undefined,exportedAt:new Date().toISOString(),appVersion:1},null,2)],{type:'application/json'});download(blob,`trip-plan-${state.startDate||'undated'}.json`);}
  function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function shareText(){try{if(navigator.share)await navigator.share({title:`${state.destination||'旅行'}の旅程`,text:getShareText()});else{await navigator.clipboard.writeText(getShareText());showToast('旅程テキストをコピーしました');}}catch(e){if(e.name!=='AbortError')showToast('共有できませんでした');}}
  function exportImage(){if(!hasTripDates()){requestTripDates();return;}const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=1080;canvas.height=1350;ctx.fillStyle='#f5f5f7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#1d1d1f';ctx.font='600 32px sans-serif';ctx.fillText('TRIP PLAN',70,84);ctx.font='600 44px sans-serif';ctx.fillText(state.destination,70,157);ctx.font='22px sans-serif';ctx.fillStyle='#7d7d83';ctx.fillText(`${state.startDate} — ${state.endDate}  ·  ${state.travelers}人`,70,204);let y=280;
    for(let d=0;d<dayCount();d++){const places=state.places.filter(p=>p.day===d&&p.start!=null).sort(sortPlaces);ctx.fillStyle='#e9eff7';ctx.beginPath();ctx.roundRect(60,y,960,places.length?Math.max(116,92+places.length*66):112,22);ctx.fill();ctx.fillStyle='#526e91';ctx.font='600 22px sans-serif';ctx.fillText(`DAY ${d+1}  ·  ${fmtDate(dateAt(d),{month:'short',day:'numeric',weekday:'short'})}`,88,y+42);ctx.fillStyle='#74808d';ctx.font='18px sans-serif';const stay=dateHotel(d);ctx.fillText(stay?`Stay · ${stay.name}`:'',88,y+71);let py=y+112;if(places.length){for(const p of places){ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(82,py-24,915,54,14);ctx.fill();ctx.fillStyle='#526e91';ctx.font='600 18px sans-serif';ctx.fillText(fmtTime(p.start),100,py+9);ctx.fillStyle='#1d1d1f';ctx.font='20px sans-serif';ctx.fillText(p.name,210,py+9);ctx.fillStyle='#85858b';ctx.font='15px sans-serif';ctx.fillText(`${p.duration} min`,888,py+8);py+=66;}}y+=places.length?Math.max(135,100+places.length*66):132;if(y>1250)break;}
    canvas.toBlob(blob=>{if(blob)download(blob,`trip-plan-${state.startDate}.png`);else showToast('画像を書き出せませんでした');},'image/png');}
  function importJSON(file){const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result);if(!raw||typeof raw!=='object'||!Array.isArray(raw.places))throw new Error();const incoming=normalizeState({...raw,collaboration:state.collaboration});incoming.id=state.id;state=incoming;selectedDay=0;persist();renderAll();showToast('旅程データを読み込みました');}catch{showToast('JSONデータを読み込めませんでした');}};reader.readAsText(file);}

  function bind(){document.body.append($('#sharePanel'));initFields();bindPartner();$('#tripDateRange').onclick=openTripDateRange;document.addEventListener('click',e=>{if(e.target.closest('[data-open-trip-settings]')){e.preventDefault();openSettings();}});$('#editGroups').onclick=openGroups;$('#closeGroups').onclick=()=>closeModal($('#groupsBackdrop'));$('#groupForm').onsubmit=addGroup;$('#groupEditList').onclick=e=>{const b=e.target.closest('[data-delete-group]');if(b)deleteGroup(b.dataset.deleteGroup);};$('#groupsBackdrop').addEventListener('click',e=>{if(e.target===$('#groupsBackdrop'))closeModal($('#groupsBackdrop'));});$('#registerPlace').onclick=()=>openPlace();$('#quickAdd').onclick=()=>openPlace();$('#emptyAdd').onclick=()=>openPlace();$('#closeSheet').onclick=()=>closeModal($('#modalBackdrop'));$('#cancelSheet').onclick=()=>closeModal($('#modalBackdrop'));$('#placeForm').onsubmit=savePlace;$('#deletePlace').onclick=deletePlace;$('#settingsButton').onclick=()=>openSettings(false,true);$('#hotelShortcut').onclick=()=>openSettings(true);$('#tripPickerButton').onclick=e=>{if(e.target.closest('#tripSummary')&&!state.destination.trim())openSettings();else openTripPicker();};$('#closeTrips').onclick=()=>closeModal($('#tripsBackdrop'));$('#tripsBackdrop').addEventListener('click',e=>{if(e.target===$('#tripsBackdrop'))closeModal($('#tripsBackdrop'));});$('#tripList').addEventListener('click',e=>{const remove=e.target.closest('[data-delete-trip]');if(remove){e.stopPropagation();deleteTrip(remove.dataset.deleteTrip);return;}const edit=e.target.closest('[data-edit-trip]');const select=e.target.closest('[data-trip]');if(select){const target=trips.find(t=>t.id===select.dataset.trip);selectTrip(select.dataset.trip);if(edit||!target?.destination?.trim())openSettings();}});$('#newTripButton').onclick=createTrip;$('#appToast').addEventListener('click',e=>{if(e.target.closest('#toastUndo'))undo();});$('#closeSettings').onclick=()=>closeModal($('#settingsBackdrop'));$('#cancelSettings').onclick=()=>closeModal($('#settingsBackdrop'));$('#settingsForm').onsubmit=saveSettings;$('#addHotelButton').onclick=()=>{hotelDraft.push({name:'',start:'',end:''});renderHotelEditor();if(!matchMedia('(pointer: coarse)').matches)$$('#hotelEditList [data-hotel-field="name"]').at(-1)?.focus({preventScroll:true});};$('#hotelEditList').addEventListener('input',e=>{const input=e.target.closest('[data-hotel-index][data-hotel-field]');if(input&&hotelDraft[Number(input.dataset.hotelIndex)])hotelDraft[Number(input.dataset.hotelIndex)][input.dataset.hotelField]=input.value;});$('#hotelEditList').addEventListener('click',e=>{const range=e.target.closest('[data-hotel-range]');if(range){openHotelDateRange(Number(range.dataset.hotelRange));return;}const button=e.target.closest('[data-remove-hotel]');if(button){hotelDraft.splice(Number(button.dataset.removeHotel),1);renderHotelEditor();}});$('#searchPlaces').oninput=renderWishlist;$('#filterToggle').onclick=()=>{const names=categoryFilters();const next=(names.indexOf(selectedCategory)+1)%names.length;selectedCategory=names[next];renderWishlist();};$('#placeGrid').onclick=e=>{if(Date.now()<ignorePlaceClickUntil)return;const card=e.target.closest('[data-edit]');if(card)openPlace(card.dataset.edit);};$('#placeGrid').addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;const card=e.target.closest('.place-card[data-edit]');if(card)watchPlaceSwipe(e,card.dataset.edit,card);});$('#placeGrid').addEventListener('touchstart',e=>{if(e.touches.length!==1){placeSwipe?.();return;}const card=e.target.closest('.place-card[data-edit]'),touch=e.changedTouches[0];if(card&&touch)watchPlaceSwipe({clientX:touch.clientX,clientY:touch.clientY,pointerId:touch.identifier,pointerType:'touch',button:0,fromTouch:true},card.dataset.edit,card);},{passive:true});$('#categoryChips').onclick=e=>{const b=e.target.closest('[data-cat]');if(b){selectedCategory=b.dataset.cat;renderWishlist();}};
    $('#timelineAdjuster').onclick=e=>{const button=e.target.closest('[data-duration-delta]');if(button){adjustSelectedDuration(Number(button.dataset.durationDelta));return;}if(e.target.closest('[data-deselect]'))selectTimelinePiece(null);};$('#dayTabs').onclick=e=>{const b=e.target.closest('[data-day]');if(b){selectedPieceId=null;selectedDay=Number(b.dataset.day);renderTimeline();}};$('#timelineInner').addEventListener('pointerdown',e=>{const piece=e.target.closest('.timeline-piece');if(piece)handleTimelinePointerDown(e,piece);else if(!drag&&!resizeSession)selectTimelinePiece(null);});$('#itineraryContent').addEventListener('click',e=>{const remove=e.target.closest('[data-unplan]');if(remove){e.stopPropagation();unplanPlace(remove.dataset.unplan,-1);}});$('#itineraryContent').addEventListener('pointerdown',e=>{const stop=e.target.closest('.itinerary-stop[data-pid]');if(stop)watchScheduleSwipe(e,stop.dataset.pid);});$('#trayPieces').addEventListener('pointerdown',e=>{const piece=e.target.closest('.tray-piece');if(piece)startDrag(e,piece);});$('#autoArrange').onclick=autoArrange;$('#undoMove').onclick=undo;$('#dayClear').onclick=clearDay;$('#toastClose').onclick=()=>$('#completionToast').classList.remove('visible');$('#fetchUrl').onclick=extractUrl;$('#pasteUrl').onclick=pasteUrl;const urlInput=$('#url'),pasteSuggestion=$('#pasteSuggestion');let clipboardUrl='';urlInput.addEventListener('focus',async()=>{if(urlInput.value||!navigator.clipboard?.readText)return;try{const value=(await navigator.clipboard.readText()).trim();if(/^https?:\/\//i.test(value)){clipboardUrl=value;pasteSuggestion.hidden=false;}}catch{}});$('#useClipboardUrl').onclick=()=>{if(clipboardUrl){urlInput.value=clipboardUrl;pasteSuggestion.hidden=true;showToast('クリップボードのURLを貼り付けました');}};urlInput.addEventListener('input',()=>{pasteSuggestion.hidden=true;});$('#photoGallery').onclick=()=>$('#photoInput').click();$('#photoInput').onchange=e=>addFiles(e.target.files);$('#cameraInput').onchange=e=>addFiles(e.target.files);$('#photoPreview').onclick=e=>{const b=e.target.closest('[data-remove-photo]');if(b){editingPhotos.splice(Number(b.dataset.removePhoto),1);renderPhotos();}};
    const drop=$('#photoDrop');['dragenter','dragover'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('drag-over');}));['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('drag-over');}));drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));$('#modalBackdrop').addEventListener('paste',e=>{const files=Array.from(e.clipboardData?.items||[]).filter(x=>x.type.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);if(files.length)addFiles(files);});
    $$('.nav-item').forEach(b=>b.onclick=()=>navigate(Number(b.dataset.nav)));$('#packingButton').onclick=()=>{renderPacking();openModal($('#packingBackdrop'));};$('#closePacking').onclick=()=>closeModal($('#packingBackdrop'));$('#packingBackdrop').addEventListener('click',e=>{if(e.target===$('#packingBackdrop'))closeModal($('#packingBackdrop'));});$('#packingList').addEventListener('change',e=>{const input=e.target.closest('[data-pack-toggle]');if(!input)return;const item=state.packingItems.find(x=>x.id===input.dataset.packToggle);if(item){item.checked=input.checked;persist();renderPacking();}});$('#packingList').addEventListener('click',e=>{const button=e.target.closest('[data-pack-remove]');if(button){e.preventDefault();e.stopPropagation();removePackingItem(button.dataset.packRemove);}});$('#packingForm').addEventListener('submit',addPackingItem);$('#shareMenu').onclick=()=>$('#sharePanel').classList.toggle('open');$('#sharePanel').onclick=async e=>{const button=e.target.closest('[data-share]');if(!button)return;const action=button.dataset.share;$('#sharePanel').classList.remove('open');if(action==='partner')openPartner();if(action==='text')await shareText();if(action==='image')exportImage();if(action==='json')exportJSON();if(action==='import')$('#importFile').click();};$('#importFile').onchange=e=>{if(e.target.files?.[0])importJSON(e.target.files[0]);e.target.value='';};
    document.addEventListener('click',e=>{if(!e.target.closest('#shareMenu')&&!e.target.closest('#sharePanel'))$('#sharePanel').classList.remove('open');});
    $('#settingsBackdrop').addEventListener('click',e=>{if(e.target===$('#settingsBackdrop'))closeModal($('#settingsBackdrop'));});$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal($('#modalBackdrop'));});document.addEventListener('keydown',e=>{if(e.key==='Escape'){$$('.modal-backdrop.open').forEach(closeModal);$('#sharePanel').classList.remove('open');}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')undo();});
    viewport.addEventListener('scroll',()=>{if(viewport.scrollLeft)viewport.scrollLeft=0;},{passive:true});
    viewport.addEventListener('pointerdown',e=>{if(e.target.closest('input,textarea,select,button,a,.edit-sheet,.place-row,.place-card,.timeline-piece,.tray-piece,.itinerary-stop'))return;swipeStart={x:e.clientX,y:e.clientY,time:Date.now()};});viewport.addEventListener('pointerup',e=>{if(!swipeStart)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.25){navigate(pageIndex+(dx<0?1:-1));}swipeStart=null;});
    window.addEventListener('tabi-language-changed',()=>{renderAll();});window.visualViewport?.addEventListener('resize',setVisualHeight);window.addEventListener('resize',setVisualHeight);window.addEventListener('online',updateConnectionStatus);window.addEventListener('offline',updateConnectionStatus);setVisualHeight();updateConnectionStatus();window.addEventListener('beforeunload',()=>{if(db)db.close();});
  }
  const partnerStatusText={local:'',synced:'同期済み',syncing:'同期中…',waiting:'同期待ち',offline:'オフライン · 接続後に同期します',retry:'接続を確認しています · 変更は端末に保存済み',invalid:'共有リンクを確認してください', 'too-large':'写真の容量が大きいため同期できません'};
  function updatePartnerStatus(){
    notifications?.render();
    const status=$('#partnerStatus');if(!status)return;
    status.textContent=partnerBusy?'接続中…':state.collaboration?(partnerStatusText[sharing?.getStatus()]||'同期待ち'):'';
    status.dataset.status=sharing?.getStatus()||'local';
    const shortcut=$('#partnerShortcutStatus');if(shortcut)shortcut.textContent=state.collaboration?'共有中':'未共有';
  }
  function partnerInviteMessage(){return window.TabiLineInvite.message($('#partnerSenderName').value,state.destination);}
  function renderInviteMessage(){
    $('#partnerMessagePreview').textContent=partnerInviteMessage();$('#partnerInviteTitle').textContent=state.destination?`${state.destination}へ、一緒に。`:'一緒に旅しよう';$('#partnerInviteDestination').textContent=state.destination||'TRAVEL TOGETHER';
  }
  function readyInviteUrl(){
    if(!state.collaboration)return null;
    const password=$('#partnerInvitePassword').value;
    return !password?sharedApi.link(state.collaboration):protectedInvite.roomId===state.collaboration.roomId&&protectedInvite.password===password&&!protectedInvite.pending?protectedInvite.url:null;
  }
  function prepareInviteUrl(){
    const room=state.collaboration;if(!room)return;
    const password=$('#partnerInvitePassword').value;
    if(protectedInvite.roomId===room.roomId&&protectedInvite.password===password&&(protectedInvite.url||protectedInvite.pending))return;
    clearTimeout(inviteDebounce);
    const task=++inviteGeneration,hint=$('#invitePasswordHint');
    protectedInvite={roomId:room.roomId,password,url:'',pending:!!password};
    if(!password){protectedInvite.url=sharedApi.link(room);$('#partnerLink').value=protectedInvite.url;hint.textContent='パスワードなし：招待リンクを知る人が参加できます。';return;}
    $('#partnerLink').value='暗号化中…';
    if(password.length<12||password.length>128){protectedInvite.pending=false;hint.textContent='12～128文字のパスワードを入力してください。';return;}
    hint.textContent='安全な招待リンクを作成しています…';
    inviteDebounce=setTimeout(()=>sharedApi.protectInvite(room,password).then(url=>{
      if(task!==inviteGeneration||state.collaboration?.roomId!==room.roomId)return;
      protectedInvite={roomId:room.roomId,password,url,pending:false};
      $('#partnerLink').value=url;hint.textContent='パスワードで保護しました。パスワードは別の方法で伝えてください。';
    }).catch(()=>{if(task!==inviteGeneration)return;protectedInvite.pending=false;hint.textContent='リンクを暗号化できませんでした。再入力してください。';}),500);
  }
  function renderPartner(){
    const joined=!!state.collaboration&&!pendingInvite;
    $('#partnerInviteIdentity').hidden=!!pendingInvite;$('#partnerJoinPasswordWrap').hidden=!pendingInvite?.locked;renderInviteMessage();
    $('#partnerTitle').textContent=pendingInvite?'旅行に参加':'パートナーを招待';
    $('#partnerDescription').textContent=pendingInvite?'参加すると、相手と同じ旅行を編集できます。':joined?'場所・旅程・宿泊先・持ち物は自動で共有されます。':'招待URLを作成して、パートナーに送ってください。';
    $('#partnerMore').hidden=!joined;$('#partnerJoinDetails').hidden=!!pendingInvite;
    $('#partnerJoinDetails').open=false;
    $('#partnerCreate').hidden=joined||!!pendingInvite;$('#partnerJoin').hidden=!pendingInvite;
    ['partnerLinkRow','partnerCopy','partnerSend','partnerSendHint','partnerSendOptions','partnerNative','partnerSync','partnerLeave'].forEach(key=>$('#'+key).hidden=!joined);
    if(joined)prepareInviteUrl();
    $('#partnerSendHint').textContent=navigator.share?'LINEなど、送りたいアプリを選べます。':'この端末ではURLをコピーして、送りたいアプリに貼り付けられます。';
    $$('.partner-actions button,#partnerSendOptions button,#partnerInviteForm button').forEach(button=>button.disabled=partnerBusy||!sharing);
    $('#partnerCreate').textContent=partnerBusy?'作成中…':'招待URLを作成する';
    updatePartnerStatus();
  }
  function openPartner(){if($('#settingsBackdrop.open')){if(!commitSettings())return;closeModal($('#settingsBackdrop'));}notifications?.restore();$('#partnerError').hidden=true;renderPartner();openModal($('#partnerBackdrop'));}
  function partnerError(error){
    const message=error.message==='wrong_password'?'招待パスワードが違います。':error.message==='password_required'?'招待パスワードを入力してください。':error.message==='offline'?'オンラインでリンクを作成・参加してください。':error.message==='invalid_invite'?'招待リンクが無効です。パートナーにもう一度リンクをもらってください。':error.message==='browser_update'?'ブラウザを更新してから参加してください。':error.message==='photos_too_large'?'写真の容量が大きすぎます。写真を減らしてもう一度お試しください。':'接続できませんでした。旅行は端末に保存されています。もう一度お試しください。';
    $('#partnerError').textContent=message;$('#partnerError').hidden=false;
  }
  async function createPartnerRoom(){
    if(state.collaboration){renderPartner();return;}
    if(pendingInvite){return joinPartnerRoom();}
    if(!sharing||partnerBusy)return;partnerBusy=true;$('#partnerError').hidden=true;renderPartner();
    const tripId=state.id;state.hotels=state.hotels.map(h=>({...h,id:h.id||id()}));persist(false);
    try{const metadata=await sharing.createRoom(state),trip=state.id===tripId?state:trips.find(t=>t.id===tripId);if(!trip)return;trip.collaboration=metadata;persist(false);if(state.id===tripId){sharing.attach();sharing.changed();notifications?.restore();showToast('「招待URLを送る」から相手に送れます');}}
    catch(error){partnerError(error);}finally{partnerBusy=false;renderPartner();}
  }
  async function joinPartnerRoom(){
    if(!sharing||partnerBusy||!pendingInvite)return;partnerBusy=true;$('#partnerError').hidden=true;renderPartner();
    try{
      const invite=pendingInvite.locked?await sharedApi.unlockInvite(pendingInvite,$('#partnerJoinPassword').value):pendingInvite;
      const existing=trips.find(trip=>trip.collaboration?.roomId===invite.roomId&&trip.collaboration?.key===invite.key);
      if(existing){selectTrip(existing.id);pendingInvite=null;closeModal($('#partnerBackdrop'));notifications?.restore();sharing.sync();return;}
      const result=await sharing.join(invite),trip=normalizeState({...result.trip,id:id(),collaboration:result.metadata});
      trips.push(trip);state=trip;activeTripId=trip.id;selectedDay=0;selectedCategory='すべて';selectedPieceId=null;undoSnapshot=null;undoCheckpoint=null;pendingInvite=null;
      $('#searchPlaces').value='';pageIndex=0;pages.style.transform='translate3d(0,0,0)';$$('.nav-item').forEach((button,i)=>button.classList.toggle('active',i===0));persist(false);renderAll();closeModal($('#partnerBackdrop'));closeModal($('#settingsBackdrop'));notifications?.restore();showToast('共有の旅行に参加しました');
    }catch(error){partnerError(error);}finally{partnerBusy=false;renderPartner();}
  }
  function returnToHome(){
    $$('.modal-backdrop.open').forEach(closeModal);$('#sharePanel').classList.remove('open');navigate(0);syncPageAccess();$('.wishlist-page').scrollTop=0;
  }
  async function sendPartnerLink(){
    if(!state.collaboration||partnerBusy)return;
    if(!$('#partnerSenderName').value.trim()){$('#partnerSenderName').focus({preventScroll:true});showToast('招待するあなたの名前を入力してください');return;}
    const url=readyInviteUrl();if(!url){showToast('パスワードの長さとリンクの準備状況を確認してください');return;}
    if(!navigator.share){await copyPartnerLink();return;}
    const button=$('#partnerSend');button.disabled=true;
    try{
      await navigator.share({title:'tabi 旅行への招待',text:partnerInviteMessage(),url});
      returnToHome();
    }catch(error){
      if(error.name!=='AbortError')showToast('共有を開けませんでした。「招待URLをコピー」をお使いください');
    }finally{button.disabled=partnerBusy;}
  }
  async function copyPartnerLink(){const url=readyInviteUrl();if(!url){showToast('パスワードが12文字以上か確認してください');return;}try{await navigator.clipboard.writeText(url);returnToHome();showToast('招待リンクをコピーしました。送りたい相手に貼り付けてください');}catch{$('#partnerMore').open=true;$('#partnerLink').focus({preventScroll:true});$('#partnerLink').select();showToast('リンクを長押ししてコピーしてください');}}
  function bindPartner(){
    try{$('#partnerSenderName').value=localStorage.getItem('tabi-invite-sender')||'';}catch{}
    $('#partnerInvitePassword').addEventListener('input',prepareInviteUrl);
    $('#partnerSenderName').addEventListener('input',()=>{try{localStorage.setItem('tabi-invite-sender',$('#partnerSenderName').value.trim());}catch{}renderInviteMessage();});
    $('#partnerShortcut').onclick=openPartner;$('#closePartner').onclick=()=>{pendingInvite=null;$('#partnerJoinPassword').value='';$('#partnerInvitePassword').value='';protectedInvite={roomId:'',password:'',url:'',pending:false};clearTimeout(inviteDebounce);++inviteGeneration;closeModal($('#partnerBackdrop'));};
    $('#partnerBackdrop').addEventListener('click',e=>{if(e.target===$('#partnerBackdrop')){$('#closePartner').click();}});
    $('#partnerInviteForm').onsubmit=e=>{e.preventDefault();let invite;try{invite=sharedApi.parseInvite(new URL($('#partnerInviteInput').value.trim()).hash);}catch{}if(!invite){showToast('正しい招待リンクを貼り付けてください');return;}pendingInvite=invite;renderPartner();if(invite.locked)$('#partnerJoinPassword').focus({preventScroll:true});else joinPartnerRoom();};
    $('#partnerSend').onclick=sendPartnerLink;$('#partnerCreate').onclick=createPartnerRoom;$('#partnerJoin').onclick=joinPartnerRoom;$('#partnerCopy').onclick=copyPartnerLink;
    $('#partnerNative').onclick=async()=>{
      if(!$('#partnerSenderName').value.trim()){$('#partnerSenderName').focus({preventScroll:true});showToast('招待するあなたの名前を入力してください');return;}
      const button=$('#partnerNative');button.disabled=true;
      try{
        const api=window.TabiLineInvite,config=await api.config();
        if(!api.configured(config)){showToast('LINE招待は接続準備中です');return;}
        const url=readyInviteUrl();if(!url){showToast('招待リンクの準備をお待ちください');return;}const invite={sender:$('#partnerSenderName').value.trim(),destination:state.destination,url};
        api.remember(invite);location.href='./line-share.html#invite='+api.encode(invite);
      }catch{showToast('招待を準備できませんでした。接続を確認してください');}finally{button.disabled=false;}
    };
    $('#partnerSync').onclick=()=>sharing?.sync();
    $('#partnerLeave').onclick=()=>{if(!state.collaboration)return;notifications?.leave(state.collaboration);delete state.collaboration;undoSnapshot=null;undoCheckpoint=null;sharing.attach();persist(false);renderPartner();showToast('旅行をこの端末のみに保存しました');};
    window.addEventListener('hashchange',()=>{const invite=sharedApi?.parseInvite(location.hash);if(invite){pendingInvite=invite;history.replaceState(null,'',location.pathname+location.search);openPartner();}});
  }
  function bindPlacementHelpers(){
    $('#goToBoard').onclick=()=>navigate(1);
    $('#trayPieces').addEventListener('click',e=>{const button=e.target.closest('[data-place-now]');if(button){e.preventDefault();placeAtNextSlot(button.dataset.placeNow);return;}if(e.target.closest('[data-back-to-spots]'))navigate(0);});
    $('#trayPieces').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.stopImmediatePropagation();},true);
  }
  async function registerSW(){if('serviceWorker' in navigator&&location.protocol.startsWith('http'))try{const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});registration.update().catch(()=>{});}catch(e){console.warn('PWA offline cache could not start',e);}}
  bind();bindPlacementHelpers();loadState();registerSW();
})();
