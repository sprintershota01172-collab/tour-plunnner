(() => {
  'use strict';
  const root=document.documentElement,vv=window.visualViewport;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const editable=el=>el?.matches?.('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]),select');
  let layoutHeight=innerHeight,layoutWidth=innerWidth,keyboardInset=0,timer=0,pendingField=null;
  function revealOnce(){
    const field=pendingField;pendingField=null;
    if(!field||field!==document.activeElement)return;
    const sheet=field.closest('.edit-sheet');if(!sheet)return;
    const box=field.getBoundingClientRect(),bounds=sheet.getBoundingClientRect();
    // Move only the form contents, once on focus, if the field is obscured.
    const top=bounds.top+12,bottom=bounds.bottom-16;
    if(box.bottom>bottom)sheet.scrollTop+=box.bottom-bottom;
    else if(box.top<top)sheet.scrollTop-=top-box.top;
  }
  function refresh(){
    const editing=editable(document.activeElement);
    const visible=vv?.height||innerHeight;
    if(Math.abs(innerWidth-layoutWidth)>80){layoutWidth=innerWidth;layoutHeight=innerHeight;}
    if(!editing&&visible>=layoutHeight-100){layoutHeight=innerHeight;keyboardInset=0;}
    else if(editing||keyboardInset){const inset=Math.max(0,layoutHeight-visible);keyboardInset=inset>100?inset:0;}
    root.style.setProperty('--vh',layoutHeight+'px');
    root.style.setProperty('--visible-height',layoutHeight+'px');
    root.style.setProperty('--keyboard-inset',keyboardInset+'px');
    if(pendingField){clearTimeout(timer);timer=setTimeout(revealOnce,300);}
  }
  document.addEventListener('focusin',e=>{
    if(!coarse||!editable(e.target))return;
    root.classList.add('editing-input');pendingField=e.target;refresh();
  });
  document.addEventListener('focusout',()=>setTimeout(()=>{
    if(editable(document.activeElement))return;
    pendingField=null;clearTimeout(timer);root.classList.remove('editing-input');refresh();
  },0));
  // No viewport-scroll or input handler: typing must not reposition the page.
  vv?.addEventListener('resize',refresh);window.addEventListener('resize',refresh);
  window.TabiViewport={refresh};refresh();
})();
