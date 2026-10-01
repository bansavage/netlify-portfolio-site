# Portfolio Site

kylebansavage.com as a bootable Windows 95-style desktop ("Bansavage 95").
Static files, no build step, no dependencies.

## Run it locally

```bash
python3 -m http.server 8095
```

Then open http://localhost:8095.

## How it boots

1. **POST screen** (`#post`): BIOS text, any key or tap skips it.
2. **Desktop + control console**: the terminal types `access main program`, prints the
   ASCII portrait and a short dossier, then waits for ENTER (or a tap on phones).
3. **Welcome dialog**, then the desktop is yours.

Deep links skip the intro and open a window directly:
`/#about`, `/#work`, `/#contact`, `/#resume`, `/#links`, `/#computer`, `/#terminal`, or `/#desktop` for a bare desktop.

## Where things live

| File | What it is |
| --- | --- |
| `index.html` | The icon sprite (inline SVG), the shell, and **all content** inside `<main id="files">` |
| `styles/global.css` | The whole look: bevels, windows, taskbar, console, phone layout |
| `scripts/wm.js` | Window manager: drag, focus, minimize, maximize, resize |
| `scripts/terminal.js` | Console emulator: typing effects, prompt, portrait printer |
| `scripts/index.js` | Boot sequence, desktop, Start menu, and each app/window |
| `scripts/portrait.js` | The ASCII portrait data (characters + a brightness level per character) |

## Editing content

Everything a visitor reads is plain HTML in `<main id="files">`. The window manager borrows
those nodes when a window opens and puts them back when it closes, so with JavaScript
off the page is still a normal readable document.

- **Add a file to a folder**: add an `<article class="file" data-name="..." data-icon="txt">` inside the
  matching `<section class="folder">`. It shows up as an icon automatically.
  Icons: `txt`, `doc`, `bmp`, `mail`, `link`, `folder`. Add `data-href` to make it a web shortcut.
- **Resume**: edit `#doc-resume`. The Print button in that window prints just the resume.
- **Desktop icons / Start menu**: the `APPS`, `DESKTOP` and `START` lists near the bottom of `scripts/index.js`.
- **Console commands**: the `COMMANDS` object in `scripts/index.js`.
- **Welcome tips**: the `TIPS` array in `scripts/index.js`.

`wedding/` is a separate set of pages and is not part of the desktop.
