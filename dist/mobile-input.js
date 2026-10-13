(() => {
  'use strict';
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const editable = el => el?.matches?.('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]),select');
  let layoutHeight = window.innerHeight, layoutWidth = window.innerWidth;
  let lastHeight = -1, lastTop = -1, lastEditing = false;

  function refresh() {
    if (!coarse) return;
    const editing = !!editable(document.activeElement);
    const visualHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const visualTop = Math.max(0, Math.round(viewport?.offsetTop || 0));

    if (Math.abs(window.innerWidth - layoutWidth) > 80) {
      layoutWidth = window.innerWidth;
      layoutHeight = Math.max(window.innerHeight, visualHeight);
      lastHeight = -1;
    } else if (!editing && visualHeight >= layoutHeight - 80) {
      // Record the normal viewport height only when the keyboard is closed.
      layoutHeight = Math.max(window.innerHeight, visualHeight);
    }

    // VisualViewport.height ALREADY excludes the keyboard on iOS.
    // Never subtract a second keyboard inset from this measured height.
    const available = Math.max(160, Math.min(layoutHeight, visualHeight));
    const viewChanged = lastHeight < 0 || Math.abs(available - lastHeight) > 18 || lastEditing !== editing;
    if (viewChanged) {
      root.style.setProperty('--sheet-visual-height', available + 'px');
      lastHeight = available;
    }
    // iOS may pan the visual viewport while focusing a deeply nested input.
    // Keep the fixed dialog aligned with the visible viewport.
    if (lastTop < 0 || Math.abs(visualTop - lastTop) > 3 || !editing && lastEditing) {
      root.style.setProperty('--sheet-visual-top', visualTop + 'px');
      lastTop = visualTop;
    }

    root.style.setProperty('--vh', layoutHeight + 'px');
    root.style.setProperty('--visible-height', layoutHeight + 'px');
    root.classList.toggle('editing-input', editing);
    lastEditing = editing;
  }

  document.addEventListener('focusin', refresh);
  document.addEventListener('focusout', () => requestAnimationFrame(refresh));
  viewport?.addEventListener('resize', refresh, {passive: true});
  viewport?.addEventListener('scroll', refresh, {passive: true});
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', () => {
    layoutWidth = -1;
    requestAnimationFrame(refresh);
  });
  // Do not scroll the page or reposition an input while the user is typing.
  window.TabiViewport = {refresh};
  refresh();
})();
