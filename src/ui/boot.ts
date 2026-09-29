import { $$ } from './dom';

/** Re-types the boot log that is already in the HTML, line by line, with its status stamped at the end. */
export function runBoot(reduce: boolean): void {
  const rows = $$('#boot-log > div').map((row) => {
    const txt = row.querySelector<HTMLElement>('.txt');
    const st = row.querySelector<HTMLElement>('.st');
    return { txt, st, full: txt?.textContent ?? '', status: st?.textContent ?? '' };
  });
  if (reduce || rows.length === 0) return;

  for (const r of rows) {
    if (r.txt) r.txt.textContent = '';
    if (r.st) r.st.textContent = '';
  }

  let line = 0;
  let chars = 0;
  const type = (): void => {
    const r = rows[line];
    if (!r?.txt) return;
    chars += 2;
    r.txt.textContent = r.full.slice(0, chars);
    if (chars < r.full.length) {
      window.setTimeout(type, 16);
      return;
    }
    window.setTimeout(() => {
      if (r.st) r.st.textContent = r.status;
      line++;
      chars = 0;
      window.setTimeout(type, 90);
    }, 140);
  };
  window.setTimeout(type, 250);
}
