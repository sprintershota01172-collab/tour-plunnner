(() => {
  'use strict';
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) {
    window.TabiViewport = {refresh() {}};
    return;
  }
  const editable = el => el?.matches?.('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]),select');
  const hasModal = () => !!document.querySelector?.('.modal-backdrop.open');
  const visibleSize = () => ({
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight)),
    top: Math.max(0, Math.round(viewport?.offsetTop || 0))
  });
  let layoutHeight = window.innerHeight, layoutWidth = window.innerWidth;
  let lastHeight = -1, lastTop = -1;
  let focusRelease = 0, settleTimer = 0, keyboardActive = false;

  function commit() {
    settleTimer = 0;
    const editing = !!editable(document.activeElement);
    const {height, top} = visibleSize();
    // The app shell remains anchored to the keyboard-closed layout.
    // A changing visual viewport must never resize the background page.
    const available = Math.max(160, Math.min(layoutHeight, height));
    const largeChange = Math.abs(available - lastHeight) > (editing ? 28 : 12);
    if (lastHeight < 0 || largeChange) {
      root.style.setProperty('--sheet-visual-height', available + 'px');
      lastHeight = available;
    }
    // iOS can pan its viewport repeatedly when moving between text fields.
    // Apply the final offset only after those movements have settled.
    const newTop = editing && hasModal() ? top : 0;
    if (lastTop < 0 || Math.abs(newTop - lastTop) > (editing ? 12 : 2)) {
      root.style.setProperty('--sheet-visual-top', newTop + 'px');
      lastTop = newTop;
    }
    root.style.setProperty('--vh', layoutHeight + 'px');
    root.style.setProperty('--visible-height', layoutHeight + 'px');
  }

  function schedule(delay = 110) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(commit, delay);
  }

  function refresh() {
    const editing = !!editable(document.activeElement);
    const {height} = visibleSize();
    const rotated = Math.abs(window.innerWidth - layoutWidth) > 80;
    if (rotated) {
      layoutWidth = window.innerWidth;
      layoutHeight = Math.max(window.innerHeight, height);
      lastHeight = -1;
      schedule(0);
    } else if (!editing && !keyboardActive && height >= layoutHeight - 70) {
      layoutHeight = Math.max(window.innerHeight, height);
    }
    if (editing) {
      clearTimeout(focusRelease);
      keyboardActive = true;
      root.classList.add('editing-input');
    } else if (!keyboardActive) {
      root.classList.remove('editing-input');
    }
    // Do not reflow the modal once for each intermediate animation frame.
    // The keyboard itself remains free to open and close normally.
    if (!rotated) schedule(editing || keyboardActive ? 110 : 0);
  }

  function focusOut() {
    // Switching to the next field fires blur before focus. Keep the
    // existing layout throughout that short transition.
    clearTimeout(focusRelease);
    focusRelease = setTimeout(() => {
      if (editable(document.activeElement)) return;
      keyboardActive = false;
      root.classList.remove('editing-input');
      refresh();
    }, 150);
  }

  document.addEventListener('focusin', refresh);
  document.addEventListener('focusout', focusOut);
  viewport?.addEventListener('resize', refresh, {passive: true});
  viewport?.addEventListener('scroll', refresh, {passive: true});
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', () => {
    layoutWidth = -1;
    refresh();
  });
  window.TabiViewport = {refresh};
  // Establish stable geometry once; do not animate the initial app shell.
  commit();
})();