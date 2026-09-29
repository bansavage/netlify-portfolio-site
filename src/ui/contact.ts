import { $ } from './dom';

/**
 * The contact form posts to Netlify Forms (the form is registered at deploy time from the
 * data-netlify attribute in index.html). Locally there is no handler, so it reports "not sent".
 */
export function initContact(): void {
  const form = $<HTMLFormElement>('#tx');
  const out = $('#tx-out');
  const slow = $<HTMLTextAreaElement>('#tx-slow');
  const mail = $<HTMLInputElement>('#tx-mail');

  if (form && out && slow && mail) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!slow.value.trim()) {
        out.textContent = '> ERR: describe what’s slow first.';
        slow.focus();
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(mail.value.trim())) {
        out.textContent = '> ERR: need a reply address.';
        mail.focus();
        return;
      }
      out.textContent = '> TRANSMITTING…';
      const body = new URLSearchParams();
      new FormData(form).forEach((value, key) => body.append(key, String(value)));
      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        out.textContent = '> RECEIVED. I’ll reply from kyle@bansavage.dev.';
      } catch {
        out.textContent = '> NOT SENT. Email kyle@bansavage.dev directly.';
      }
    });
  }

  const copy = $<HTMLButtonElement>('#copy');
  const address = $('#mail');
  if (copy && address) {
    copy.addEventListener('click', () => {
      const done = (label: string) => {
        copy.textContent = label;
        window.setTimeout(() => {
          copy.textContent = 'Copy';
        }, 1800);
      };
      const selectInstead = () => {
        const range = document.createRange();
        range.selectNodeContents(address);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        done('Press ⌘C');
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(address.textContent ?? '').then(() => done('Copied'), selectInstead);
      } else {
        selectInstead();
      }
    });
  }
}
