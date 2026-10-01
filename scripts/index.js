/* Bansavage 95 · boot sequence, desktop shell and apps */
(function () {
  'use strict';

  const B95 = window.B95;
  const { wm, Terminal, icon } = B95;

  const root = document.documentElement;
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const html = (markup) => {
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  };

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }
  };

  const fmtBytes = (n) =>
    n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;

  /* ==========================================================================
     Live page metrics, shown in Kyle's Computer > Performance
     ========================================================================== */

  const vitals = { fcp: null, lcp: null, cls: 0 };
  const entryTypes = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
  const observe = (type, fn) => {
    if (!entryTypes.includes(type)) return;
    new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
  };
  observe('paint', (e) => {
    if (e.name === 'first-contentful-paint') vitals.fcp = e.startTime;
  });
  observe('largest-contentful-paint', (e) => {
    vitals.lcp = e.startTime;
  });
  observe('layout-shift', (e) => {
    if (!e.hadRecentInput) vitals.cls += e.value;
  });

  function renderPerf(scope) {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const set = (key, value) => {
      const el = $(`[data-perf="${key}"]`, scope);
      if (el) el.textContent = value;
    };
    const ms = (v) => (v == null ? 'n/a' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`);
    const weight =
      (nav ? nav.encodedBodySize || 0 : 0) + resources.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);

    set('ttfb', nav ? ms(nav.responseStart) : 'n/a');
    set('fcp', ms(vitals.fcp));
    set('lcp', ms(vitals.lcp));
    set('cls', entryTypes.includes('layout-shift') ? vitals.cls.toFixed(2) : 'n/a');
    set('req', String(resources.length + 1));
    set('bytes', weight ? fmtBytes(weight) : 'n/a');
    set('dom', String(document.getElementsByTagName('*').length));

    let verdict = 'Measured live in your browser for this page load.';
    if (vitals.lcp != null) {
      verdict =
        vitals.lcp < 2500 && vitals.cls < 0.1
          ? 'Your system is configured for optimal performance.'
          : 'Measured live in your browser. Kyle would like a word with this connection.';
    }
    set('verdict', verdict);
  }

  /* ==========================================================================
     Small helpers
     ========================================================================== */

  // Kyle's first engineering role started June 2017.
  const CAREER_START = new Date(2017, 5, 1);
  function uptime() {
    const now = new Date();
    const months =
      (now.getFullYear() - CAREER_START.getFullYear()) * 12 + now.getMonth() - CAREER_START.getMonth();
    return { years: Math.floor(months / 12), months: months % 12 };
  }

  // Lend a content node from the "hard drive" (#files) to a window; returns a function that puts it back.
  function borrow(node) {
    const marker = document.createComment('on loan');
    node.replaceWith(marker);
    return () => marker.replaceWith(node);
  }

  /* --- popup menus ----------------------------------------------------------- */

  let openMenu = null;

  function setStart(open) {
    $('#start-menu').hidden = !open;
    $('#start').setAttribute('aria-expanded', String(open));
  }

  function closeMenus() {
    if (openMenu) {
      openMenu.el.remove();
      if (openMenu.anchor) openMenu.anchor.classList.remove('is-open');
      openMenu = null;
    }
    setStart(false);
  }

  function popup(items, x, y, anchor) {
    closeMenus();
    const el = html('<ul class="menu" role="menu"></ul>');
    items.forEach((item) => {
      if (!item) return el.appendChild(html('<li class="menu__sep" role="separator"></li>'));
      const li = html('<li role="none"><button type="button" role="menuitem"></button></li>');
      li.firstChild.textContent = item.label;
      li.firstChild.addEventListener('click', () => {
        closeMenus();
        item.run();
      });
      el.appendChild(li);
    });
    document.body.appendChild(el);
    const rect = el.getBoundingClientRect();
    el.style.left = Math.max(2, Math.min(x, window.innerWidth - rect.width - 2)) + 'px';
    el.style.top = Math.max(2, Math.min(y, window.innerHeight - rect.height - 2)) + 'px';
    if (anchor) anchor.classList.add('is-open');
    openMenu = { el, anchor };
  }

  // File / Edit / View / Help for a window. Every item does something real.
  function menubar(id, fileItems = []) {
    const bar = html('<div class="menubar" role="menubar"></div>');
    const content = () => $('[data-select]', wm.get(id).body) || wm.get(id).body;
    const menus = {
      File: [...fileItems, ...(fileItems.length ? [null] : []), { label: 'Close', run: () => wm.close(id) }],
      Edit: [
        { label: 'Select All', run: () => window.getSelection().selectAllChildren(content()) },
        {
          label: 'Copy',
          run: () => {
            const text = String(window.getSelection()) || content().innerText;
            if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
          }
        }
      ],
      View: [
        { label: 'Maximize / Restore', run: () => wm.toggleMax(wm.get(id)) },
        { label: 'Minimize', run: () => wm.minimize(wm.get(id)) }
      ],
      Help: [
        { label: 'Welcome Tips', run: () => launch('welcome') },
        { label: 'About Bansavage 95', run: aboutBox }
      ]
    };
    Object.keys(menus).forEach((name) => {
      const btn = html(`<button type="button" class="menubar__item" role="menuitem" aria-haspopup="true"><u>${name[0]}</u>${name.slice(1)}</button>`);
      btn.addEventListener('click', () => {
        if (openMenu && openMenu.anchor === btn) return closeMenus();
        const rect = btn.getBoundingClientRect();
        popup(menus[name], rect.left, rect.bottom, btn);
      });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* --- dialogs --------------------------------------------------------------- */

  function msgbox({ id = 'msgbox', title, icon: ico = 'info', body, buttons = [{ label: 'OK' }], from }) {
    wm.close(id);
    const app = html(`
      <div class="app dialog dialog--center">
        <div class="dialog__row">${icon(ico)}<div class="dialog__text"></div></div>
        <div class="dialog__actions"></div>
      </div>`);
    const text = $('.dialog__text', app);
    if (typeof body === 'string') text.innerHTML = body;
    else text.appendChild(body);
    buttons.forEach((button, i) => {
      const btn = html(`<button type="button" class="btn${i === 0 ? ' btn--default' : ''}"></button>`);
      btn.textContent = button.label;
      btn.addEventListener('click', () => {
        wm.close(id);
        if (button.run) button.run();
      });
      $('.dialog__actions', app).appendChild(btn);
    });
    wm.open(id, {
      title,
      icon: ico,
      width: 340,
      height: 'auto',
      dialog: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      content: app,
      from
    });
    $('.btn', app).focus({ preventScroll: true });
  }

  function aboutBox() {
    msgbox({
      id: 'aboutbox',
      title: 'About Bansavage 95',
      icon: 'computer',
      body: `<p><b>Bansavage 95</b><br>Version 9.5.0</p>
             <p>Hand-written HTML, CSS and vanilla JavaScript. No frameworks, no web fonts, no build step.</p>
             <p>&copy; ${new Date().getFullYear()} Kyle Bansavage</p>`
    });
  }

  /* ==========================================================================
     Apps
     ========================================================================== */

  /* --- folders: About, Work, Contact ---------------------------------------- */

  function openFolder(key, from) {
    if (wm.get(key)) return wm.open(key);
    const folder = $('#folder-' + key);
    const files = $$(':scope > .file', folder);
    const app = html(`
      <div class="app explorer">
        <div class="toolbar">
          <div class="address">
            <span>Address</span>
            <div class="address__box field">${icon('folder', 'ico ico--16')}<span class="address__path"></span></div>
          </div>
        </div>
        <div class="explorer__main">
          <div class="explorer__files field" role="listbox" aria-label="${folder.dataset.title} files"></div>
          <div class="explorer__view field" data-select></div>
        </div>
        <div class="statusbar"><span class="statusbar__cell statusbar__cell--grow"></span><span class="statusbar__cell"></span></div>
      </div>`);
    const list = $('.explorer__files', app);
    const view = $('.explorer__view', app);
    const path = $('.address__path', app);
    const [count, size] = $$('.statusbar__cell', app);
    let current = -1;

    const launchFile = (file) => {
      if (file.dataset.href) window.open(file.dataset.href, '_blank', 'noopener');
    };

    const buttons = files.map((file, i) => {
      const btn = html(`<button type="button" class="file-btn" role="option" aria-selected="false" tabindex="-1">${icon(file.dataset.icon || 'txt')}<span></span></button>`);
      btn.lastChild.textContent = file.dataset.name;
      btn.addEventListener('click', () => select(i));
      btn.addEventListener('dblclick', () => launchFile(file));
      list.appendChild(btn);
      return btn;
    });

    function select(index, moveFocus) {
      if (index < 0 || index >= files.length) return;
      current = index;
      files.forEach((file, i) => file.classList.toggle('is-open', i === index));
      buttons.forEach((btn, i) => {
        btn.setAttribute('aria-selected', String(i === index));
        btn.tabIndex = i === index ? 0 : -1;
      });
      const file = files[index];
      path.textContent = `${folder.dataset.path}\\${file.dataset.name}`;
      count.textContent = `${files.length} object(s)`;
      size.textContent = file.dataset.size || fmtBytes(new Blob([file.textContent.replace(/\s+/g, ' ').trim()]).size);
      view.scrollTop = 0;
      if (moveFocus) buttons[index].focus({ preventScroll: true });
      // keep the selected file visible (scrolls only the file pane, never the desktop)
      const btn = buttons[index].getBoundingClientRect();
      const pane = list.getBoundingClientRect();
      if (btn.left < pane.left) list.scrollLeft -= pane.left - btn.left;
      else if (btn.right > pane.right) list.scrollLeft += btn.right - pane.right;
      if (btn.top < pane.top) list.scrollTop -= pane.top - btn.top;
      else if (btn.bottom > pane.bottom) list.scrollTop += btn.bottom - pane.bottom;
    }

    list.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step) {
        e.preventDefault();
        select(current + step, true);
      } else if (e.key === 'Enter') {
        launchFile(files[current]);
      }
    });

    const giveBack = borrow(folder);
    view.appendChild(folder);
    wm.open(key, {
      title: folder.dataset.title,
      icon: folder.dataset.icon,
      width: 680,
      height: 450,
      minWidth: 280,
      minHeight: 240,
      className: 'window--status',
      content: app,
      from,
      onClose() {
        files.forEach((file) => file.classList.remove('is-open'));
        giveBack();
      }
    });
    app.prepend(menubar(key));
    select(0);
  }

  /* --- single-pane windows: Resume, Links, Recycle Bin ----------------------- */

  function openPane(id, { doc, title, ico, path, status, width, height, from, tools = '', paneClass = '', fileItems }) {
    if (wm.get(id)) return wm.open(id);
    const address = path
      ? `<div class="address"><span>Address</span><div class="address__box field">${icon(ico, 'ico ico--16')}<span>${path}</span></div></div>`
      : '';
    const app = html(`
      <div class="app">
        ${tools || address ? `<div class="toolbar">${tools}${address}</div>` : ''}
        <div class="pane field ${paneClass}" data-select></div>
        ${status ? `<div class="statusbar"><span class="statusbar__cell statusbar__cell--grow">${status}</span></div>` : ''}
      </div>`);
    const giveBack = borrow(doc);
    $('.pane', app).appendChild(doc);
    wm.open(id, {
      title,
      icon: ico,
      width,
      height,
      minWidth: 280,
      minHeight: 200,
      className: status ? 'window--status' : '',
      content: app,
      from,
      onClose: giveBack
    });
    app.prepend(menubar(id, fileItems));
    return app;
  }

  function printResume() {
    const copy = $('#doc-resume').cloneNode(true);
    copy.removeAttribute('id');
    const holder = html('<div class="print-root"></div>');
    holder.appendChild(copy);
    document.body.appendChild(holder);
    root.classList.add('is-printing');
    const done = () => {
      window.removeEventListener('afterprint', done);
      root.classList.remove('is-printing');
      holder.remove();
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  function openResume(from) {
    const app = openPane('resume', {
      doc: $('#doc-resume'),
      title: 'Resume.doc',
      ico: 'doc',
      width: 720,
      height: 520,
      from,
      paneClass: 'wordpad__paper',
      tools: `<button type="button" class="tool" data-print>${icon('print', 'ico ico--16')}Print / Save as PDF</button>`,
      fileItems: [{ label: 'Print...', run: printResume }]
    });
    if (app && app.querySelector) {
      $('[data-print]', app).addEventListener('click', printResume);
      $('.toolbar', app).after(html('<div class="wordpad__ruler" aria-hidden="true"></div>'));
    }
  }

  function openLinks(from) {
    openPane('links', {
      doc: $('#doc-links'),
      title: 'Links',
      ico: 'folder-links',
      path: 'C:\\Kyle\\Links',
      status: `${$$('#doc-links a').length} object(s)`,
      width: 520,
      height: 440,
      from,
      paneClass: 'pane--pad'
    });
  }

  function openTrash(from) {
    const doc = $('#doc-trash');
    const rows = () => $$('tbody tr:not(.details__none)', doc);
    const setStatus = () => {
      const cell = wm.get('trash') && $('.statusbar__cell', wm.get('trash').body);
      if (cell) cell.textContent = `${rows().length} object(s)`;
    };
    const empty = () => {
      if (!rows().length) return;
      msgbox({
        id: 'confirm-empty',
        title: 'Confirm Multiple File Delete',
        icon: 'trash',
        body: `<p>Are you sure you want to delete these ${rows().length} items?</p><p>The web gets faster every time.</p>`,
        buttons: [
          {
            label: 'Yes',
            run() {
              $('tbody', doc).innerHTML = '<tr class="details__none"><td class="details__empty" colspan="3">Nothing here. The page is clean.</td></tr>';
              setStatus();
            }
          },
          { label: 'No' }
        ]
      });
    };
    openPane('trash', {
      doc,
      title: 'Recycle Bin',
      ico: 'trash',
      status: `${rows().length} object(s)`,
      width: 470,
      height: 300,
      from,
      fileItems: [{ label: 'Empty Recycle Bin', run: empty }]
    });
  }

  /* --- Kyle's Computer -------------------------------------------------------- */

  function openSystem(from) {
    if (wm.get('computer')) return wm.open('computer');
    const doc = $('#doc-system');
    const panels = $$(':scope > .tabpanel', doc);
    const app = html(`
      <div class="app system-app">
        <div class="tabs" role="tablist"></div>
        <div class="tabpanels"></div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--default" data-done>OK</button>
          <button type="button" class="btn" data-done>Cancel</button>
        </div>
      </div>`);

    let timer = 0;
    const show = (index) => {
      panels.forEach((panel, i) => panel.classList.toggle('is-open', i === index));
      tabs.forEach((tab, i) => tab.setAttribute('aria-selected', String(i === index)));
      clearInterval(timer);
      if (panels[index].dataset.tab === 'Performance') {
        renderPerf(doc);
        timer = setInterval(() => renderPerf(doc), 1000);
      }
    };
    const tabs = panels.map((panel, i) => {
      const tab = html('<button type="button" class="tab" role="tab" aria-selected="false"></button>');
      tab.textContent = panel.dataset.tab;
      tab.addEventListener('click', () => show(i));
      $('.tabs', app).appendChild(tab);
      return tab;
    });

    const giveBack = borrow(doc);
    $('.tabpanels', app).appendChild(doc);
    $$('[data-done]', app).forEach((btn) => btn.addEventListener('click', () => wm.close('computer')));
    wm.open('computer', {
      title: 'System Properties',
      icon: 'computer',
      width: 480,
      height: 430,
      resizable: false,
      maximizable: false,
      content: app,
      from,
      onClose() {
        clearInterval(timer);
        panels.forEach((panel) => panel.classList.remove('is-open'));
        giveBack();
      }
    });
    show(0);
  }

  /* --- Welcome ---------------------------------------------------------------- */

  const TIPS = [
    'Kyle is a programmer and software engineer in Miami: founder of Bansavage, Lead AI Engineer at Harrison Benjamin AI, and Fractional Tech Director at Myntr.',
    'Kyle implements highly technical subscription integrations with some of the biggest brands in the world, as a Solutions Partner at Ordergroove.',
    'Every window on this desktop can be dragged by its title bar and resized from its bottom-right corner.',
    'Kyle co-founded a development agency that made $1M in its first year, grew from 3 to 30 people, and was acquired by Revyrie Global.',
    'This whole desktop is hand-written HTML, CSS and vanilla JavaScript. Open Kyle\'s Computer and check the Performance tab for live numbers.',
    'The Terminal takes real commands. Type "help". And whatever you do, say the magic word.',
    'Kyle once managed a distributed team of 20 developers across 6 countries.'
  ];
  let tipIndex = 0;

  function openWelcome(from) {
    if (wm.get('welcome')) return wm.open('welcome');
    const app = html(`
      <div class="app welcome">
        <h3 class="welcome__title">Welcome to <b>Bansavage</b><span>95</span></h3>
        <div class="welcome__grid">
          <div class="welcome__tip">${icon('bulb')}<div><b>Did you know...</b><p></p></div></div>
          <div class="welcome__buttons">
            <button type="button" class="btn" data-app="about">About Kyle</button>
            <button type="button" class="btn" data-app="work">Work</button>
            <button type="button" class="btn" data-app="resume">Resume</button>
            <button type="button" class="btn" data-app="contact">Contact</button>
            <hr>
            <button type="button" class="btn" data-next>Next Tip</button>
            <button type="button" class="btn btn--default" data-close>Close</button>
          </div>
        </div>
        <label class="check"><input type="checkbox"> Show this Welcome Screen next time you start</label>
      </div>`);
    const tip = $('.welcome__tip p', app);
    const check = $('input', app);
    tip.textContent = TIPS[tipIndex % TIPS.length];
    check.checked = store.get('kb95.welcome') !== 'off';
    check.addEventListener('change', () => store.set('kb95.welcome', check.checked ? 'on' : 'off'));
    app.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.app) launch(btn.dataset.app, btn);
      else if ('next' in btn.dataset) tip.textContent = TIPS[++tipIndex % TIPS.length];
      else if ('close' in btn.dataset) wm.close('welcome');
    });
    wm.open('welcome', {
      title: 'Welcome',
      icon: 'bulb',
      width: 470,
      height: 'auto',
      dialog: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      content: app,
      from
    });
  }

  /* --- "Free LLM Tokens.exe" -------------------------------------------------- */

  function openMagicWord(from) {
    if (wm.get('tokens')) return wm.open('tokens');
    const app = html(`
      <div class="app magic">
        <video src="./assets/theKing.mp4" loop playsinline preload="auto"
          aria-label="Dennis Nedry wagging a finger: ah ah ah, you didn't say the magic word"></video>
      </div>`);
    const video = $('video', app);
    wm.open('tokens', {
      title: "You didn't say the magic word",
      icon: 'error',
      width: 372,
      height: 396,
      minWidth: 220,
      minHeight: 240,
      dialog: true,
      maximizable: false,
      content: app,
      from,
      onClose: () => video.pause()
    });
    video.play().catch(() => {
      video.muted = true; // autoplay with sound was blocked: play it silently
      video.play().catch(() => {});
    });
  }

  /* --- Shut Down ---------------------------------------------------------------- */

  function restart() {
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }

  function powerOff() {
    wm.list().forEach((win) => wm.close(win));
    const screen = html(`
      <div class="safe" role="alertdialog" aria-label="Shut down">
        <p>It's now safe to turn off<br>your computer.<small>Click or press any key to restart</small></p>
      </div>`);
    document.body.appendChild(screen);
    setTimeout(() => {
      screen.addEventListener('click', restart);
      document.addEventListener('keydown', restart);
    }, 500);
  }

  function shutdownDialog() {
    const body = html(`
      <div>
        <p>Are you sure you want to:</p>
        <fieldset>
          <label class="check"><input type="radio" name="shutdown" value="off" checked> Shut down the computer?</label>
          <label class="check"><input type="radio" name="shutdown" value="restart"> Restart the computer?</label>
        </fieldset>
      </div>`);
    msgbox({
      id: 'shutdown',
      title: 'Shut Down Bansavage 95',
      icon: 'power',
      body,
      buttons: [
        { label: 'Yes', run: () => ($('input:checked', body).value === 'restart' ? restart() : powerOff()) },
        { label: 'No' }
      ]
    });
  }

  /* --- Control console ---------------------------------------------------------- */

  let consoleTerm = null;
  let strikes = 0;

  async function idCard(term) {
    // big portrait only when the console has room for it without scrolling
    const size = term.el.clientWidth >= 373 && term.el.clientHeight >= 630 ? 'lg' : 'sm';
    const card = term.line('idcard');
    const portrait = window.KB_PORTRAIT && window.KB_PORTRAIT[size];
    if (portrait) await term.portrait(portrait, card, size);

    const up = uptime();
    const rows = [
      ['NAME', 'Kyle Bansavage'],
      ['ROLE', 'Programmer / Software Engineer'],
      ['BASE', 'Miami, FL'],
      ['UPTIME', `${up.years} yrs ${up.months} mos`],
      ['FOCUS', 'AI technology / Web Dev / Shopify / Subscriptions / Page Speed'],
      ['ALSO', 'Founder @ Bansavage'],
      ['', 'Lead AI Engineer @ Harrison Benjamin AI'],
      ['', 'Fractional Tech Director @ Myntr'],
      ['STATUS', 'ONLINE']
    ];
    const list = document.createElement('dl');
    list.className = 'dossier';
    card.appendChild(list);
    for (const [key, value] of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = value;
      if (key === 'STATUS') dd.className = 'is-online';
      list.append(dt, dd);
      term.scroll();
      await term.wait(85);
    }
  }

  // The scripted intro: "access main program", portrait, dossier, press ENTER.
  async function mainProgram(term) {
    const close = () => wm.close('terminal');
    if (!finePointer) {
      // phones: no keyboard to press, so a tap skips the typing and a second tap continues
      term.tapToType = false;
      term.el.addEventListener('click', () => (term.locked ? term.skip() : close()));
    }

    await term.type('Bansavage Systems, Personnel Interface');
    await term.type('Version 9.5.0');
    await term.type('Ready...');
    await term.human('access main program');
    await term.wait(200);
    await term.type('access: PERMISSION GRANTED.', { cls: 'is-loud' });
    await term.wait(150);
    await term.type('Accessing main program...');
    await term.wait(320);
    await idCard(term);
    if (term.dead) return;
    const hint = term.html(
      `${finePointer ? 'Press' : 'Tap'} <button type="button" class="keycap">ENTER</button> to continue${finePointer ? ', or type "help".' : '.'}`
    );
    $('.keycap', hint).addEventListener('click', close);
    term.onIdleEnter = close;
    term.unlock();
    if (finePointer) term.focus();
  }

  async function session(term) {
    await term.type('Bansavage Systems, Personnel Interface');
    await term.type('Version 9.5.0');
    if (term.dead) return;
    term.print('Ready... type "help" for a list of commands.');
    term.unlock();
    if (finePointer) term.focus();
  }

  function openConsole({ boot = false, from } = {}) {
    if (wm.get('terminal')) return wm.open('terminal');
    const term = new Terminal({ commands: COMMANDS, instant: reduceMotion });
    const desk = $('#windows');
    consoleTerm = term;
    wm.open('terminal', {
      title: 'Bansavage Control Console',
      icon: 'terminal',
      // leave some desktop showing around the console on smaller screens
      width: Math.min(820, Math.max(560, desk.clientWidth - 86)),
      height: Math.min(664, Math.max(400, desk.clientHeight - 44)),
      minWidth: 280,
      minHeight: 200,
      className: 'window--term',
      content: term.el,
      center: boot,
      from,
      onFocus: () => {
        if (finePointer) term.focus();
      },
      onClose() {
        term.destroy();
        if (consoleTerm === term) consoleTerm = null;
        // closing the intro console leads into the Welcome dialog
        if (boot && store.get('kb95.welcome') !== 'off') setTimeout(() => launch('welcome'), 140);
      }
    });
    if (boot) mainProgram(term);
    else session(term);
  }

  const OPEN_NAMES = {
    about: 'about',
    work: 'work',
    clients: 'work',
    contact: 'contact',
    email: 'contact',
    resume: 'resume',
    cv: 'resume',
    links: 'links',
    computer: 'computer',
    system: 'computer',
    tokens: 'tokens',
    trash: 'trash',
    recycle: 'trash',
    welcome: 'welcome'
  };

  async function access(args, term) {
    const target = args.join(' ').toLowerCase();
    if (!target) return void term.print('usage: access <system>');
    const system = target.replace(/\s*\bplease\b\s*/g, ' ').trim();
    if (system !== target || system === 'main program') {
      strikes = 0;
      term.print('access: PERMISSION GRANTED.', 'is-loud');
      await term.wait(220);
      if (system === 'main program') return idCard(term);
      return void term.print('Nothing classified in there. Try "open work".');
    }
    term.print('access: PERMISSION DENIED.');
    if (++strikes < 3) return;
    strikes = 0;
    await sleep(350);
    term.print('...and...');
    await sleep(900);
    launch('tokens');
    const until = Date.now() + 2800;
    while (Date.now() < until && !term.dead) {
      term.print("YOU DIDN'T SAY THE MAGIC WORD!", 'is-loud');
      await sleep(55);
    }
  }

  const COMMANDS = {
    help: {
      usage: 'help',
      about: 'show this list',
      run(_, term) {
        Object.values(COMMANDS)
          .filter((c) => c.usage)
          .forEach((c) => term.print(`  ${c.usage.padEnd(17)}${c.about}`));
      }
    },
    whoami: { usage: 'whoami', about: 'print the personnel file', run: (_, term) => idCard(term) },
    ls: {
      usage: 'ls',
      about: 'list the desktop',
      run: (_, term) => term.print('about/  work/  contact/  links/  resume.doc  computer  tokens.exe  trash/')
    },
    open: {
      usage: 'open <name>',
      about: 'open something, e.g. open work',
      run(args, term) {
        const name = (args[0] || '').toLowerCase().replace(/[/\\]+$/, '').replace(/\.\w+$/, '');
        const app = OPEN_NAMES[name];
        if (!app) return term.print(name ? `open: ${args[0]}: no such file or folder` : 'usage: open <name>');
        term.print(`Opening ${APPS[app].title}...`);
        launch(app);
      }
    },
    access: { usage: 'access <system>', about: 'request access', run: access },
    date: { usage: 'date', about: 'current date and time', run: (_, term) => term.print(new Date().toString()) },
    clear: { usage: 'clear', about: 'clear the screen', run: (_, term) => term.clear() },
    reboot: { usage: 'reboot', about: 'restart Bansavage 95', run: restart },
    exit: { usage: 'exit', about: 'close the console', run: () => wm.close('terminal') },

    // unlisted
    echo: { run: (args, term) => term.print(args.join(' ')) },
    sudo: { run: (_, term) => term.print('visitor is not in the sudoers file. This incident will be reported.') },
    please: { run: (_, term) => term.print('Please what?') },
    hello: { run: (_, term) => term.print('Hello. Type "help" to see what this thing can do.') },
    shutdown: { run: powerOff }
  };
  COMMANDS.dir = { run: COMMANDS.ls.run };
  COMMANDS.cls = { run: COMMANDS.clear.run };
  COMMANDS.man = COMMANDS['?'] = { run: COMMANDS.help.run };
  COMMANDS.hi = { run: COMMANDS.hello.run };
  Object.keys(OPEN_NAMES).forEach((name) => {
    COMMANDS[name] = COMMANDS[name] || { run: (_, term) => COMMANDS.open.run([name], term) };
  });

  /* ==========================================================================
     Desktop shell
     ========================================================================== */

  const APPS = {
    computer: { title: "Kyle's Computer", icon: 'computer', run: openSystem },
    about: { title: 'About', icon: 'folder-about', run: (from) => openFolder('about', from) },
    work: { title: 'Work', icon: 'folder-work', run: (from) => openFolder('work', from) },
    contact: { title: 'Contact', icon: 'folder-contact', run: (from) => openFolder('contact', from) },
    resume: { title: 'Resume.doc', icon: 'doc', run: openResume },
    links: { title: 'Links', icon: 'folder-links', run: openLinks },
    terminal: { title: 'Terminal', icon: 'terminal', run: (from) => openConsole({ from }) },
    tokens: { title: 'Free LLM Tokens.exe', icon: 'coin', run: openMagicWord },
    trash: { title: 'Recycle Bin', icon: 'trash', run: openTrash },
    welcome: { title: 'Welcome', icon: 'bulb', run: openWelcome }
  };
  const DESKTOP = ['computer', 'about', 'work', 'contact', 'resume', 'links', 'terminal', 'tokens', 'trash'];
  const START = [
    { label: 'About Kyle', icon: 'folder-about', app: 'about' },
    { label: 'Work', icon: 'folder-work', app: 'work' },
    { label: 'Resume', icon: 'doc', app: 'resume' },
    { label: 'Contact', icon: 'folder-contact', app: 'contact' },
    { label: 'Links', icon: 'folder-links', app: 'links' },
    { label: 'Terminal', icon: 'terminal', app: 'terminal' },
    null,
    { label: 'Welcome', icon: 'bulb', app: 'welcome' },
    { label: 'Shut Down...', icon: 'power', run: shutdownDialog }
  ];

  function launch(key, from) {
    if (APPS[key]) APPS[key].run(from);
  }

  function selectIcon(btn) {
    $$('.icon.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (btn) btn.classList.add('is-selected');
  }

  function repaintDesktop() {
    root.classList.remove('is-desktop');
    void root.offsetWidth; // restart the icon paint animation
    root.classList.add('is-desktop');
  }

  function buildDesktop() {
    const list = $('#icons');
    DESKTOP.forEach((key, i) => {
      const li = html(`<li style="--i:${i}"><button type="button" class="icon" data-app="${key}">${icon(APPS[key].icon)}<span class="icon__label"></span></button></li>`);
      $('.icon__label', li).textContent = APPS[key].title;
      list.appendChild(li);
    });

    // Mouse: click selects, double-click opens. Touch and keyboard: one activation opens.
    let pointer = 'mouse';
    list.addEventListener('pointerdown', (e) => {
      pointer = e.pointerType;
    });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.icon');
      if (!btn) return;
      selectIcon(btn);
      if (pointer !== 'mouse' || e.detail === 0) launch(btn.dataset.app, btn);
    });
    list.addEventListener('dblclick', (e) => {
      const btn = e.target.closest('.icon');
      if (btn && pointer === 'mouse') launch(btn.dataset.app, btn);
    });

    const desktop = $('#desktop');
    desktop.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.window, .icon')) return;
      selectIcon(null);
      wm.blur();
    });
    desktop.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.window')) return;
      e.preventDefault();
      popup(
        [
          { label: 'Arrange Icons', run: repaintDesktop },
          { label: 'Refresh', run: repaintDesktop },
          null,
          { label: 'View Source', run: () => launch('tokens') },
          null,
          { label: 'Properties', run: () => launch('computer') }
        ],
        e.clientX,
        e.clientY
      );
    });
  }

  function buildTaskbar() {
    const tasks = $('#tasks');
    const buttons = new Map();
    wm.subscribe(() => {
      const list = wm.list();
      buttons.forEach((btn, id) => {
        if (!list.some((win) => win.id === id)) {
          btn.remove();
          buttons.delete(id);
        }
      });
      list.forEach((win) => {
        let btn = buttons.get(win.id);
        if (!btn) {
          btn = html(`<button type="button" class="task" data-task="${win.id}">${icon(win.o.icon || 'txt', 'ico ico--16')}<span></span></button>`);
          btn.lastChild.textContent = win.title;
          btn.addEventListener('click', () => {
            if (win.min) wm.restore(win);
            else if (wm.active === win) wm.minimize(win);
            else wm.focus(win);
          });
          tasks.appendChild(btn);
          buttons.set(win.id, btn);
        }
        btn.classList.toggle('is-active', wm.active === win);
      });
    });

    const list = $('#start-items');
    START.forEach((item) => {
      if (!item) return list.appendChild(html('<li class="menu__sep" role="separator"></li>'));
      const li = html(`<li role="none"><button type="button" role="menuitem">${icon(item.icon)}<span></span></button></li>`);
      $('span', li).textContent = item.label;
      li.firstChild.addEventListener('click', () => {
        closeMenus();
        if (item.app) launch(item.app);
        else item.run();
      });
      list.appendChild(li);
    });
    $('#start').addEventListener('click', () => {
      const willOpen = $('#start-menu').hidden;
      closeMenus();
      setStart(willOpen);
    });

    const clock = $('#clock');
    const tick = () => {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      clock.dateTime = now.toISOString();
      clock.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };
    tick();
    setInterval(tick, 10000);
  }

  function bindGlobal() {
    // any press outside an open menu closes it
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!e.target.closest('.menu, .start-menu, .start, .menubar__item')) closeMenus();
      },
      true
    );

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return closeMenus();
      // typing anywhere while the console is in front goes to the console
      const term = consoleTerm;
      if (!term || !wm.active || wm.active.id !== 'terminal' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, a, summary')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        term.enter();
      } else if (e.key.length === 1 || e.key === 'Backspace') {
        term.focus();
      }
    });

    // Contact > Email Kyle: hand the message to the visitor's own mail app
    $('#compose').addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = encodeURIComponent($('#compose-subject').value.trim());
      const body = encodeURIComponent($('#compose-body').value);
      location.href = `mailto:kyle@bansavage.dev?subject=${subject}&body=${body}`;
    });

    const up = uptime();
    $$('[data-uptime]').forEach((el) => {
      el.textContent = `${up.years} years${up.months ? `, ${up.months} month${up.months > 1 ? 's' : ''}` : ''}`;
    });
  }

  /* ==========================================================================
     Boot
     ========================================================================== */

  // BIOS power-on self test. Any key or tap skips it.
  async function post() {
    const screen = $('#post');
    const out = $('#post-text');
    const pending = new Set();
    let skipped = false;

    const wait = (ms) => {
      if (skipped) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          pending.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        pending.add(done);
      });
    };
    const skip = () => {
      skipped = true;
      [...pending].forEach((done) => done());
    };
    const onKey = (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) skip();
    };
    const say = async (text, pause = 110) => {
      out.append(text + '\n');
      await wait(pause);
    };

    document.addEventListener('keydown', onKey);
    screen.addEventListener('pointerdown', skip);

    await wait(380);
    await say('');
    await say('KB-95 CPU at 133MHz', 170);
    const memory = document.createElement('b');
    out.append('Memory Test :  ', memory, '\n');
    for (let k = 0; k <= 65536 && !skipped; k += 4096) {
      memory.textContent = `${k}K`;
      await wait(26);
    }
    memory.textContent = '65536K OK';
    await wait(220);
    await say('');
    await say('Detecting IDE Drive 0 ... KYLE-HD 1.2GB', 240);
    await say('Detecting IDE Drive 1 ... MIAMI CD-ROM', 200);
    await say('Detecting IDE Drive 2 ... None', 260);
    await say('');
    await say('Starting Bansavage 95...', 760);

    document.removeEventListener('keydown', onKey);
    screen.remove();
  }

  async function boot() {
    root.classList.add('js'); // in case the slow-load fallback in <head> already fired
    wm.init($('#windows'));
    buildDesktop();
    buildTaskbar();
    bindGlobal();
    B95.booted = true;

    // kylebansavage.com/#resume (or #work, #about, #contact...) skips the intro
    const hash = location.hash.slice(1).toLowerCase();
    const deepLink = APPS[hash] ? hash : null;

    if (deepLink || hash === 'desktop' || reduceMotion) {
      $('#post').remove();
    } else {
      root.classList.add('is-busy');
      await post();
    }

    root.classList.add('is-desktop');
    if (deepLink) return launch(deepLink);
    if (hash === 'desktop') return;

    await sleep(reduceMotion ? 0 : 950); // let the desktop paint first
    root.classList.remove('is-busy');
    openConsole({ boot: true });
  }

  boot();
})();
