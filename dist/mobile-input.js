(() => {
  'use strict';
  const root=document.documentElement,vv=window.visualViewport;
  let timer=0;
  const editable=el=>el?.matches?.('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),select');
  function reveal(){
    const field=document.activeElement;if(!editable(field))return;
    const sheet=field.closest('.edit-sheet');if(!sheet)return;
    let scroller=field.parentElement;
    while(scroller!==sheet&&scroller){if(/auto|scroll/.test(getComputedStyle(scroller).overflowY)&&scroller.scrollHeight>scroller.clientHeight)break;scroller=scroller.parentElement;}
    scroller=scroller||sheet;
    const box=field.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();
    const top=Math.max(bounds.top,(vv?.offsetTop||0))+14,bottom=Math.min(bounds.bottom,(vv?.offsetTop||0)+(vv?.height||innerHeight))-20;
    if(box.bottom>bottom)scroller.scrollTop+=box.bottom-bottom;
    else if(box.top<top)scroller.scrollTop-=top-box.top;
  }
  function update(){
    root.style.setProperty('--visible-height',(vv?.height||innerHeight)+'px');
    root.style.setProperty('--visible-top',(vv?.offsetTop||0)+'px');
    clearTimeout(timer);if(editable(document.activeElement))timer=setTimeout(reveal,120);
  }
  document.addEventListener('focusin',e=>{if(!editable(e.target))return;root.classList.add('editing-input');update();});
  document.addEventListener('focusout',()=>setTimeout(()=>{if(editable(document.activeElement))return;root.classList.remove('editing-input');update();},0));
  vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);update();
})();
