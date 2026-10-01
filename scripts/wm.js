/* Bansavage 95 · window manager
   Movable, focusable, resizable windows. Positions use transforms so dragging
   never triggers layout (or layout-shift entries). */
(function () {
  'use strict';

  const B95 = (window.B95 = window.B95 || {});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compact = window.matchMedia('(max-width: 700px)');

  const wins = new Map();
  const subscribers = new Set();
  let layer = null;
  let active = null;
  let zTop = 10;
  let cascade = 0;

  const icon = (name, cls = 'ico') =>
    `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

  const GLYPH = {
    min: '<path d="M2 7h6v2H2z"/>',
    max: '<path fill-rule="evenodd" d="M1 0h9v9H1zm1 2v6h7V2z"/>',
    restore: '<path fill-rule="evenodd" d="M3 0h7v6H8V5h1V2H4v1H3zM1 3h7v6H1zm1 2v3h5V5z"/>',
    close: '<path d="M2 1h2v1H2zM8 1h2v1H8zM3 2h2v1H3zM7 2h2v1H7zM4 3h4v1H4zM5 4h2v1H5zM4 5h4v1H4zM3 6h2v1H3zM7 6h2v1H7zM2 7h2v1H2zM8 7h2v1H8z"/>'
  };
  const glyph = (name) => `<svg viewBox="0 0 12 10" aria-hidden="true">${GLYPH[name]}</svg>`;

  const emit = () => subscribers.forEach((fn) => fn());
  const bounds = () => ({ W: layer.clientWidth, H: layer.clientHeight });
  const titleHeight = (win) => win.bar.offsetHeight || 18;

  function apply(win) {
    const s = win.el.style;
    s.width = win.w + 'px';
    s.height = win.h == null ? '' : win.h + 'px';
    s.transform = `translate(${Math.round(win.x)}px, ${Math.round(win.y)}px)`;
  }

  // Keep the title bar reachable no matter where the window is dragged.
  function clamp(win) {
    const { W, H } = bounds();
    const w = win.el.offsetWidth || win.w;
    win.x = Math.min(Math.max(win.x, 60 - w), W - 60);
    win.y = Math.min(Math.max(win.y, 0), Math.max(0, H - titleHeight(win) - 4));
  }

  function place(win) {
    const o = win.o;
    const { W, H } = bounds();
    const small = compact.matches;
    const gutter = small ? 4 : 8;

    win.w = Math.min(o.width || 480, W - gutter * 2);
    win.h = o.height === 'auto' ? null : Math.min(o.height || 360, H - gutter * 2);

    if (small && !o.dialog) {
      // phones: content windows take the full width and most of the height
      win.w = W - gutter * 2;
      if (win.h != null) win.h = Math.min(H - gutter * 2, Math.max(win.h, Math.round(H * 0.86)));
    }

    // auto-height dialogs are measured at their final width
    win.el.style.width = win.w + 'px';
    const height = win.h == null ? win.el.offsetHeight : win.h;
    if (small && !o.dialog) {
      win.x = gutter;
      win.y = gutter;
    } else if (o.center || o.dialog) {
      win.x = (W - win.w) / 2;
      win.y = Math.max(gutter, (H - height) / 2.4);
    } else {
      const n = cascade++ % 7;
      win.x = Math.min(96 + n * 28, Math.max(gutter, W - win.w - gutter));
      win.y = Math.min(18 + n * 26, Math.max(gutter, H - height - gutter));
    }
  }

  function topmost() {
    let best = null;
    wins.forEach((w) => {
      if (!w.min && (!best || +w.el.style.zIndex > +best.el.style.zIndex)) best = w;
    });
    return best;
  }

  function focus(win) {
    if (win && win.min) return;
    if (win) win.el.style.zIndex = ++zTop;
    if (active !== win) {
      active = win || null;
      wins.forEach((w) => w.el.classList.toggle('is-active', w === active));
      emit();
    }
    if (win && win.o.onFocus) win.o.onFocus(win);
  }

  // The navy caption bar that zooms between two rects (Win95's window animation).
  function fly(from, to) {
    if (reduceMotion.matches || !from || !to) return Promise.resolve();
    const ghost = document.createElement('div');
    ghost.className = 'fly';
    document.body.appendChild(ghost);
    const frame = (r) => ({
      transform: `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px) scaleX(${Math.max(r.width, 20) / 100})`
    });
    const anim = ghost.animate([frame(from), frame(to)], { duration: 190, easing: 'steps(6, end)' });
    return anim.finished.catch(() => {}).then(() => ghost.remove());
  }

  const taskRect = (win) => {
    const btn = document.querySelector(`[data-task="${win.id}"]`);
    return btn ? btn.getBoundingClientRect() : null;
  };

  function minimize(win) {
    if (!win || win.min) return;
    const from = win.el.getBoundingClientRect();
    win.min = true;
    win.el.classList.add('is-min');
    if (active === win) {
      active = null;
      win.el.classList.remove('is-active');
      focus(topmost());
    }
    emit();
    fly(from, taskRect(win));
  }

  function restore(win) {
    if (!win) return;
    if (!win.min) return focus(win);
    win.min = false;
    win.el.classList.remove('is-min');
    win.el.classList.add('is-hidden');
    focus(win);
    emit();
    fly(taskRect(win), win.el.getBoundingClientRect()).then(() => win.el.classList.remove('is-hidden'));
  }

  function toggleMax(win) {
    if (!win || win.o.maximizable === false) return;
    win.max = !win.max;
    win.el.classList.toggle('is-max', win.max);
    const btn = win.el.querySelector('[data-act="max"]');
    if (btn) {
      btn.innerHTML = glyph(win.max ? 'restore' : 'max');
      btn.setAttribute('aria-label', win.max ? 'Restore' : 'Maximize');
    }
    if (win.o.onResize) win.o.onResize(win);
  }

  function close(win) {
    if (typeof win === 'string') win = wins.get(win);
    if (!win || !wins.has(win.id)) return;
    wins.delete(win.id);
    if (win.o.onClose) win.o.onClose(win);
    win.el.remove();
    if (active === win) {
      active = null;
      focus(topmost());
    }
    emit();
  }

  // Keep receiving moves when the pointer leaves the handle mid-drag.
  function capture(el, e) {
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {
      /* pointer already released */
    }
  }

  function drag(win, e) {
    if (win.max || e.button > 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = win.x;
    const originY = win.y;
    const bar = win.bar;
    capture(bar, e);

    const move = (ev) => {
      win.x = originX + ev.clientX - startX;
      win.y = originY + ev.clientY - startY;
      clamp(win);
      apply(win);
    };
    const end = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  function resize(win, e, dir) {
    if (win.max) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = win.el.offsetWidth;
    const startH = win.el.offsetHeight;
    const minW = win.o.minWidth || 240;
    const minH = win.o.minHeight || 150;
    capture(handle, e);

    const move = (ev) => {
      if (dir.includes('e')) win.w = Math.max(minW, startW + ev.clientX - startX);
      if (dir.includes('s')) win.h = Math.max(minH, startH + ev.clientY - startY);
      apply(win);
      if (win.o.onResize) win.o.onResize(win);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function create(id, o) {
    const el = document.createElement('section');
    el.className = 'window' + (o.className ? ' ' + o.className : '');
    el.dataset.win = id;
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', `win-${id}-title`);

    const controls = [];
    if (o.minimizable !== false) controls.push(`<button type="button" data-act="min" aria-label="Minimize">${glyph('min')}</button>`);
    if (o.maximizable !== false) controls.push(`<button type="button" data-act="max" aria-label="Maximize">${glyph('max')}</button>`);
    controls.push(`<button type="button" data-act="close" aria-label="Close">${glyph('close')}</button>`);

    el.innerHTML = `
      <header class="title-bar">
        ${icon(o.icon || 'txt', 'title-bar__icon')}
        <h2 class="title-bar__text" id="win-${id}-title"></h2>
        <div class="title-bar__controls">${controls.join('')}</div>
      </header>
      <div class="window__body"></div>
      ${o.resizable === false ? '' : `
      <div class="window__edge window__edge--e" data-resize="e"></div>
      <div class="window__edge window__edge--s" data-resize="s"></div>
      <div class="window__grip" data-resize="se"></div>`}`;

    const win = {
      id,
      o,
      el,
      bar: el.querySelector('.title-bar'),
      body: el.querySelector('.window__body'),
      title: o.title || id,
      x: 0,
      y: 0,
      w: 0,
      h: null,
      min: false,
      max: false
    };
    el.querySelector('.title-bar__text').textContent = win.title;

    el.addEventListener('pointerdown', () => focus(win), true);

    win.bar.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.title-bar__controls')) drag(win, e);
    });
    win.bar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.title-bar__controls')) toggleMax(win);
    });
    el.querySelector('.title-bar__controls').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'min') minimize(win);
      if (btn.dataset.act === 'max') toggleMax(win);
      if (btn.dataset.act === 'close') close(win);
    });
    el.querySelectorAll('[data-resize]').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => resize(win, e, handle.dataset.resize));
    });

    return win;
  }

  /**
   * Open (or re-focus) a window.
   * o: { title, icon, width, height|'auto', minWidth, minHeight, content, className,
   *      from (element to zoom out of), center, dialog, resizable, minimizable,
   *      maximizable, onFocus, onResize, onClose }
   */
  function open(id, o) {
    let win = wins.get(id);
    if (win) {
      restore(win);
      return win;
    }
    if (!o) return null;

    win = create(id, o);
    wins.set(id, win);
    if (typeof o.content === 'string') win.body.innerHTML = o.content;
    else if (o.content) win.body.appendChild(o.content);
    layer.appendChild(win.el);

    place(win);
    clamp(win);
    apply(win);
    focus(win);
    emit();

    const from = o.from && o.from.getBoundingClientRect ? o.from.getBoundingClientRect() : null;
    if (from && !reduceMotion.matches) {
      win.el.classList.add('is-hidden');
      fly(from, win.el.getBoundingClientRect()).then(() => win.el.classList.remove('is-hidden'));
    }
    win.el.focus({ preventScroll: true });
    return win;
  }

  function init(el) {
    layer = el;
    window.addEventListener('resize', () => {
      wins.forEach((win) => {
        const { W, H } = bounds();
        if (win.w > W - 8) win.w = Math.max(200, W - 8);
        if (win.h != null && win.h > H - 8) win.h = Math.max(140, H - 8);
        clamp(win);
        apply(win);
        if (win.o.onResize) win.o.onResize(win);
      });
    });
  }

  B95.icon = icon;
  B95.wm = {
    init,
    open,
    close,
    focus,
    minimize,
    restore,
    toggleMax,
    get: (id) => wins.get(id),
    list: () => [...wins.values()],
    blur: () => focus(null),
    subscribe: (fn) => subscribers.add(fn),
    get active() {
      return active;
    }
  };
})();
