/* Bansavage 95 · control console
   A small terminal emulator: scripted "typing" output, a real prompt with
   history, and an ASCII portrait printer. Every wait is skippable. */
(function () {
  'use strict';

  const B95 = (window.B95 = window.B95 || {});
  const NOISE = '#%&$?!<>/|=+*^~:;XMW01';
  const SCAN_BAND = 4;
  const MAX_LINES = 400;

  const noiseFor = (row) => {
    let out = '';
    for (let i = 0; i < row.length; i++) {
      out += row[i] === ' ' ? ' ' : NOISE[(Math.random() * NOISE.length) | 0];
    }
    return out || ' ';
  };

  // One portrait row -> runs of same-brightness characters wrapped in <i class="tN">.
  const rowHTML = (portrait, index) => {
    const chars = portrait.rows[index];
    const tones = portrait.tones[index];
    let out = '';
    let run = '';
    let tone = null;
    const flush = () => {
      if (run) out += tone === ' ' ? run : `<i class="t${tone}">${run}</i>`;
      run = '';
    };
    for (let i = 0; i < chars.length; i++) {
      if (tones[i] !== tone) {
        flush();
        tone = tones[i];
      }
      run += chars[i];
    }
    flush();
    return out || ' ';
  };

  class Terminal {
    constructor({ prompt = '> ', commands = {}, instant = false } = {}) {
      this.prompt = prompt;
      this.commands = commands;
      this.instant = instant; // no typing animation at all (prefers-reduced-motion)
      this.onIdleEnter = null;
      this.tapToType = true;
      this.history = [];
      this.cursor = 0;
      this.locked = true;
      this.fast = false;
      this.dead = false;
      this.pending = new Set();

      const el = (this.el = document.createElement('div'));
      el.className = 'term is-locked';
      el.innerHTML = `
        <div class="term__out" role="log"></div>
        <div class="term__in"><span class="term__prompt"></span><span class="term__typed"></span><span class="term__cursor"></span><input class="term__field" type="text" aria-label="Console input" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send"></div>`;
      this.out = el.querySelector('.term__out');
      this.typed = el.querySelector('.term__typed');
      this.field = el.querySelector('.term__field');
      el.querySelector('.term__prompt').textContent = prompt;

      this.field.addEventListener('input', () => {
        if (this.locked) this.field.value = '';
        this.typed.textContent = this.field.value;
        this.scroll();
      });
      this.field.addEventListener('keydown', (e) => this.key(e));
      this.field.addEventListener('focus', () => el.classList.add('is-focused'));
      this.field.addEventListener('blur', () => el.classList.remove('is-focused'));
      // click anywhere to type, unless the visitor is selecting output to copy
      el.addEventListener('click', (e) => {
        if (!this.tapToType || e.target.closest('button, a')) return;
        if (!String(window.getSelection())) this.focus();
      });
    }

    /* ---- output ---------------------------------------------------------- */

    scroll() {
      this.el.scrollTop = this.el.scrollHeight;
    }

    line(cls) {
      const div = document.createElement('div');
      if (cls) div.className = cls;
      this.out.appendChild(div);
      while (this.out.childElementCount > MAX_LINES) this.out.firstElementChild.remove();
      return div;
    }

    print(text = '', cls) {
      const div = this.line(cls);
      div.textContent = text;
      this.scroll();
      return div;
    }

    html(markup, cls) {
      const div = this.line(cls);
      div.innerHTML = markup;
      this.scroll();
      return div;
    }

    clear() {
      this.out.textContent = '';
    }

    wait(ms) {
      if (this.fast || this.dead || this.instant) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.pending.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        this.pending.add(done);
      });
    }

    /** Fast-forward whatever is currently animating. */
    skip() {
      this.fast = true;
      [...this.pending].forEach((done) => done());
    }

    /** Teletype a line of output. */
    async type(text, { cps = 420, cls } = {}) {
      const div = this.line(cls);
      const step = Math.max(1, Math.round(cps / 60));
      for (let i = 0; i < text.length && !this.fast && !this.dead; i += step) {
        div.textContent = text.slice(0, i + step);
        this.scroll();
        await this.wait(16);
      }
      div.textContent = text;
      this.scroll();
      return div;
    }

    /** Type at the prompt the way a person would, then "press enter". */
    async human(text) {
      const div = this.line();
      div.innerHTML = '<span></span><span class="term__cursor"></span>';
      const span = div.firstChild;
      const wasFocused = this.el.classList.contains('is-focused');
      this.el.classList.add('is-focused');
      span.textContent = this.prompt;
      this.scroll();
      await this.wait(420);
      for (let i = 0; i < text.length && !this.fast && !this.dead; i++) {
        span.textContent = this.prompt + text.slice(0, i + 1);
        await this.wait(38 + Math.random() * 70);
      }
      await this.wait(260);
      div.textContent = this.prompt + text;
      if (!wasFocused && document.activeElement !== this.field) this.el.classList.remove('is-focused');
    }

    /** Print the ASCII portrait with a scanning "decode" band. */
    async portrait(portrait, into, size) {
      const pre = document.createElement('pre');
      pre.className = 'portrait portrait--' + size;
      pre.setAttribute('role', 'img');
      pre.setAttribute('aria-label', 'ASCII art portrait of Kyle Bansavage');
      const rows = portrait.rows.map(() => {
        const row = document.createElement('span');
        row.className = 'portrait__row';
        row.textContent = ' ';
        pre.appendChild(row);
        return row;
      });
      (into || this.line()).appendChild(pre);
      this.scroll();

      const total = rows.length;
      for (let head = 0; head < total + SCAN_BAND && !this.fast && !this.dead; head++) {
        const settled = head - SCAN_BAND;
        if (settled >= 0) rows[settled].innerHTML = rowHTML(portrait, settled);
        for (let r = Math.max(0, settled + 1); r <= Math.min(head, total - 1); r++) {
          rows[r].textContent = noiseFor(portrait.rows[r]);
        }
        await this.wait(24);
      }
      rows.forEach((row, i) => (row.innerHTML = rowHTML(portrait, i)));
      this.scroll();
      return pre;
    }

    /* ---- input ----------------------------------------------------------- */

    focus() {
      if (this.dead) return;
      this.field.focus({ preventScroll: true });
    }

    lock() {
      this.locked = true;
      this.fast = false;
      this.field.value = '';
      this.typed.textContent = '';
      this.el.classList.add('is-locked');
    }

    unlock() {
      if (this.dead) return;
      this.locked = false;
      this.fast = false;
      this.el.classList.remove('is-locked');
      this.scroll();
    }

    key(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.enter();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.locked || !this.history.length) return;
        this.cursor = Math.min(this.history.length, Math.max(0, this.cursor + (e.key === 'ArrowUp' ? -1 : 1)));
        this.field.value = this.history[this.cursor] || '';
        this.typed.textContent = this.field.value;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home') {
        e.preventDefault(); // the block cursor always sits at the end of the line
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        this.clear();
      }
    }

    enter() {
      if (this.dead) return;
      if (this.locked) return this.skip();
      const raw = this.field.value;
      const command = raw.trim();
      this.field.value = '';
      this.typed.textContent = '';
      this.print(this.prompt + raw);
      if (!command) {
        if (this.onIdleEnter) this.onIdleEnter();
        return;
      }
      if (this.history[this.history.length - 1] !== command) this.history.push(command);
      this.cursor = this.history.length;
      this.run(command);
    }

    async run(command) {
      const [name, ...args] = command.split(/\s+/);
      const entry = this.commands[name.toLowerCase()];
      this.lock();
      try {
        if (entry) await entry.run(args, this, command);
        else this.print(`${name}: command not found. Type "help" for a list.`);
      } finally {
        this.unlock();
      }
    }

    destroy() {
      this.dead = true;
      this.skip();
    }
  }

  B95.Terminal = Terminal;
})();
