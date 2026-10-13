(() => {
  'use strict';
  const pad=n=>String(n).padStart(2,'0');
  function parse(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;}
  function iso(date){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
  function daysBetween(start,end){const a=parse(start),b=parse(end);return a&&b?Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/86400000):NaN;}
  function calendarDays(year,month){const first=new Date(year,month,1,12),last=new Date(year,month+1,0,12),days=Array(first.getDay()).fill(null);for(let d=1;d<=last.getDate();d++)days.push(iso(new Date(year,month,d,12)));while(days.length<42)days.push(null);return days;}
  function selectRange(current,value,options={}){
    if(!parse(value))return current;
    if(current.phase!=='end'||!parse(current.start))return{start:value,end:'',phase:'end',error:''};
    const start=value<current.start?value:current.start,end=value<current.start?current.start:value,days=daysBetween(start,end);
    if(options.stay&&days===0)return{start,end:'',phase:'end',error:'チェックアウトは翌日以降を選んでください'};
    if(options.maxDays&&days+1>options.maxDays)return{start:current.start,end:'',phase:'end',error:`旅行日程は${options.maxDays}日以内で選んでください`};
    return{start,end,phase:'done',error:''};
  }
  function label(start,end,stay=false){const a=parse(start),b=parse(end),days=daysBetween(start,end);if(!a||!b||days<0||(stay&&days===0))return stay?'宿泊期間を選ぶ':'旅行日程を選ぶ';const from=`${a.getFullYear()}/${a.getMonth()+1}/${a.getDate()}`,to=`${a.getFullYear()===b.getFullYear()?'':b.getFullYear()+'/'}${b.getMonth()+1}/${b.getDate()}`;return `${from} — ${to} · ${stay?days+'泊':(days+1)+'日間'}`;}
  const root=document.querySelector('#rangeBackdrop'),$=s=>root?.querySelector(s);
  let options={},selection={},month=new Date(),opener=null,parent=null,parentWasInert=false,parentAria=null;
  function open(value){if(!root)return;options=value;opener=document.activeElement;parent=opener?.closest('.modal-backdrop');if(parent){parentWasInert=parent.inert;parentAria=parent.getAttribute('aria-hidden');parent.inert=true;parent.setAttribute('aria-hidden','true');}selection={start:parse(value.start)?value.start:'',end:parse(value.end)?value.end:'',phase:'start',error:''};month=parse(value.start)||parse(value.initialMonth)||new Date();month=new Date(month.getFullYear(),month.getMonth(),1,12);$('#rangeTitle').textContent=value.stay?'宿泊期間を選ぶ':'旅行日程を選ぶ';root.classList.add('open');root.setAttribute('aria-hidden','false');render();$('#rangeClose').focus({preventScroll:true});}
  function close(){root.classList.remove('open');root.setAttribute('aria-hidden','true');if(parent){parent.inert=parentWasInert;if(parentAria==null)parent.removeAttribute('aria-hidden');else parent.setAttribute('aria-hidden',parentAria);}opener?.focus({preventScroll:true});}
  function render(){
    const start=parse(selection.start),end=parse(selection.end),days=daysBetween(selection.start,selection.end),ready=!!(start&&end&&days>=0&&(!options.stay||days>0)&&(!options.maxDays||days+1<=options.maxDays));
    $('#rangeStartLabel').textContent=options.stay?'チェックイン':'出発日';$('#rangeEndLabel').textContent=options.stay?'チェックアウト':'帰着日';
    $('#rangeStartValue').textContent=start?`${start.getFullYear()}/${start.getMonth()+1}/${start.getDate()}`:'開始日を選択';$('#rangeEndValue').textContent=end?`${end.getFullYear()}/${end.getMonth()+1}/${end.getDate()}`:'終了日を選択';
    $('#rangeStart').classList.toggle('active',selection.phase==='start');$('#rangeEnd').classList.toggle('active',selection.phase==='end');
    $('#rangeHint').textContent=selection.error||(ready?(options.stay?`${days}泊`:`${days+1}日間`):(selection.phase==='end'?'終了日をタップ':'開始日をタップ'));$('#rangeApply').disabled=!ready;
    const now=new Date(),current=now.getFullYear()*12+now.getMonth(),selected=month.getFullYear()*12+month.getMonth(),min=Math.min(current-24,selected-12),max=Math.max(current+60,selected+12);
    $('#rangeMonth').innerHTML=Array.from({length:max-min+1},(_,i)=>{const n=min+i,y=Math.floor(n/12),m=n%12+1,key=`${y}-${pad(m)}`;return `<option value="${key}"${n===selected?' selected':''}>${y}年 ${m}月</option>`;}).join('');
    const today=iso(now);
    $('#rangeDays').innerHTML=calendarDays(month.getFullYear(),month.getMonth()).map(value=>{
      if(!value)return '<span class="range-spacer" aria-hidden="true"></span>';
      const a=value===selection.start,b=value===selection.end,inside=start&&end&&value>=selection.start&&value<=selection.end;
      const cls=['range-day',a?'range-start':'',b?'range-end':'',inside?'in-range':'',a&&b?'range-single':'',value===today?'range-today':''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-range-day="${value}" aria-label="${value.replace(/-/g,'/')}" aria-pressed="${a||b}"><span>${Number(value.slice(-2))}</span></button>`;
    }).join('');
  }
  window.TabiDateRange={open,label,utils:{parse,iso,daysBetween,calendarDays,selectRange}};
  if(!root)return;
  $('#rangeDays').onclick=e=>{const button=e.target.closest('[data-range-day]');if(!button)return;selection=selectRange(selection,button.dataset.rangeDay,options);render();$(`[data-range-day="${button.dataset.rangeDay}"]`)?.focus({preventScroll:true});};
  $('#rangeStart').onclick=()=>{selection.phase='start';selection.error='';render();};$('#rangeEnd').onclick=()=>{selection.phase=selection.start?'end':'start';selection.error='';render();};
  $('#rangeMonth').onchange=e=>{month=parse(`${e.target.value}-01`);render();};
  root.querySelectorAll('[data-range-month]').forEach(button=>button.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+Number(button.dataset.rangeMonth),1,12);render();});
  $('#rangeClose').onclick=close;$('#rangeCancel').onclick=close;root.onclick=e=>{if(e.target===root)close();};
  $('#rangeApply').onclick=()=>{if($('#rangeApply').disabled)return;const {start,end}=selection;close();options.onApply?.({start,end});};
  document.addEventListener('keydown',e=>{if(!root.classList.contains('open'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled),select')].filter(el=>!el.hidden),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}},true);
})();
