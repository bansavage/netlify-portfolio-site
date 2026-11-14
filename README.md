# Bansavage

The site for bansavage.dev: a one-engineer product studio in Miami and New York. Built with [Astro](https://astro.build) as a static site and deployed on Netlify from the `bansavage-digital` branch. The 2025 site is kept on `bansavage-legacy-2025`.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Where things live

- `src/data/site.ts`: every word on the site, including the five service pages.
- `src/pages/`: the homepage, one dynamic route for the service pages, and the 404.
- `src/components/`: one Astro component per part in the design system.
- `src/styles/bundle.css` and `src/scripts/bansavage-form.js`: copies of the design handoff's component bundle. `bundle.css` is verbatim. `bansavage-form.js` adds one thing, the load intro where the form starts as an orb and pushes out its arms (`intro` option); keep that when dropping in a newer handoff.
- `src/styles/tokens.css`: the design tokens from `tokens.json`. `src/styles/site.css`: the few site-level rules outside the bundle.
- `public/`: the favicon set (a white Geist SemiBold "B" on black) and robots.txt.

## Design rules, in short

Geist 400/500/600 from Google Fonts. White page, black type, hairlines, no accent colour. First person singular, sentence case, no exclamation marks, no eyebrow labels. One chrome form per page, in the hero only.
