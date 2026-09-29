# bansavage.dev

Kyle Bansavage's site: a WebGL data city you fly through, with the content as terminal panels on top.

Static site. Vite + TypeScript + three.js, no framework, no backend. Deployed on Netlify.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then build to dist/
npm run preview    # serve the production build locally
```

Node 22.12 or newer.

## Layout

```
index.html              All page content (panels, HUD, contact form)
src/main.ts             Entry: UI first, then lazy-loads the 3D scene
src/styles.css          Everything visual outside the canvas
src/ui/                 Boot log, text decode + terminal replay, HUD, contact form
src/scene/index.ts      Renderer, bloom, render loop
src/scene/city.ts       Where towers and hardware are placed
src/scene/hardware.ts   Towers, chips, capacitors, RAM banks, CPU blocks
src/scene/textures.ts   Canvas-drawn textures (tower data, circuit board, chip labels)
src/scene/shaders/      Floor shader (circuit traces + light pulses)
src/scene/rig.ts        Camera: drift, scroll flight, crane intro, mouse look
src/scene/packets.ts    Light streaks
src/scene/vocab.ts      Words and data printed on the towers and chips
```

The city is seeded (`mulberry32`), so it lays out the same way on every load. Change a seed in `src/scene/index.ts` to reshuffle it.

## Deploy

`netlify.toml` tells Netlify to run `npm run build` and publish `dist/`, so no dashboard settings are needed. Every branch pushed to GitHub can get its own deploy preview; `main` is production.

The contact form uses [Netlify Forms](https://docs.netlify.com/forms/setup/). After the first deploy, turn on form detection under **Site configuration → Forms** and add an email notification for the `contact` form.

## Still to do

- Replace sample data and `confirm before launch` items in the panels
- Social share image (`og:image`)
- Self-host the three Google Fonts
