(() => {
  'use strict';
  const root=document.documentElement, vv=window.visualViewport;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const editable=el=>el?.matches?.('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]),select');
  let baseHeight=window.innerHeight,baseWidth=window.innerWidth,keyboardInset=0,keyboardLocked=false,lastInset=-1;
  function refresh(){
    if(!coarse)return;
    const editing=editable(document.activeElement),visible=vv?.height||innerHeight;
    if(Math.abs(innerWidth-baseWidth)>80){baseWidth=innerWidth;baseHeight=innerHeight;keyboardLocked=false;}
    if(!editing){keyboardInset=0;keyboardLocked=false;if(visible>=baseHeight-90)baseHeight=innerHeight;}
    else if(!keyboardLocked&&baseHeight-visible>140){keyboardInset=Math.max(0,Math.round(baseHeight-visible));keyboardLocked=true;}
    if(lastInset!==keyboardInset){root.style.setProperty('--keyboard-inset',keyboardInset+'px');lastInset=keyboardInset;}
    root.style.setProperty('--vh',baseHeight+'px');
    root.style.setProperty('--visible-height',baseHeight+'px');
    root.classList.toggle('editing-input',!!editing);
  }
  document.addEventListener('focusin',e=>{if(coarse&&editable(e.target))refresh();});
  document.addEventListener('focusout',()=>requestAnimationFrame(refresh));
  vv?.addEventListener('resize',refresh);
  window.addEventListener('resize',refresh);
  window.addEventListener('orientationchange',()=>{baseWidth=0;requestAnimationFrame(refresh);});
  // Never auto-scroll a form on focus or while typing.
  window.TabiViewport={refresh};refresh();
})();
