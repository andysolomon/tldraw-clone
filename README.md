# tldraw clone

An infinite-canvas whiteboard modelled on [tldraw](https://www.tldraw.com), written from scratch in
React and TypeScript. It does not use the tldraw SDK or any of tldraw's code, icons or fonts.

```sh
npm install
npm run dev      # http://localhost:5420
npm run build    # typecheck + production build into dist/
```

## What it does

- **Tools** — select, hand, draw, eraser, arrow, text, note, media (images), 16 geo shapes, line,
  highlight, laser and frame, with tldraw's keyboard shortcuts (`V H D E A T N R O L F K`, `⇧D`, …).
- **Select tool** — click, shift-click and brush selection; drag to move (`⇧` constrains, `⌥` clones);
  eight resize handles (`⇧` keeps proportions, `⌥` resizes from the center); rotation from just
  outside the corners (`⇧` snaps to 15°); endpoint and bend handles on arrows and lines.
- **Arrows** attach to the shapes they start or end on and follow them around.
- **Styles** — 12 colors, opacity, fill (none / semi / solid / pattern / fill), dash (draw / dashed /
  dotted / solid), size, font, horizontal and vertical alignment, and the geo type.
- **Text** — text shapes, sticky notes, and labels on geo shapes (double-click or `Enter` to edit).
- **Arrange** — align, distribute, z-order, rotate by 90°, group and ungroup.
- **Edit** — undo/redo, cut/copy/paste (shapes, plain text and images), duplicate, select all.
- **View** — wheel to pan, `⌘`/`Ctrl` + wheel or pinch to zoom, zoom menu, minimap, grid, dark mode.
- **Files** — the drawing is saved to `localStorage` as you work, and to your account when signed
  in; export SVG or PNG, and save or open a JSON file.

Press `⋮` → **Keyboard shortcuts** for the full list.

## Accounts

Sign-in is handled by [Clerk](https://clerk.com). With a publishable key set, a **Sign in** button
appears in the top-right corner, and signed-in users get Clerk's avatar menu.

Signing in saves your drawing to your account, so it follows you between browsers and devices:

- A drawing you made before signing in is merged into your account, not replaced by it.
- Edits are saved about a second after you stop; the label next to your avatar shows the state.
- If the same account is edited in two places at once, the shapes from both are kept.
- Signing out clears the canvas in that browser. The account keeps the drawing.
- Drawings over 4 MB (usually ones with large images) stay in the browser and are flagged as such.

Without a Clerk key the app has no account UI, and drawings stay in `localStorage` only.

### Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | browser and API | Clerk publishable key. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is read too. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | API | Upstash Redis REST credentials, as set by Vercel's Upstash integration. `UPSTASH_REDIS_REST_URL` / `_TOKEN` are read too. |

The account copy is served by one Vercel Function, `api/doc.ts`. It checks the caller's Clerk
session token against the instance's public keys, so it needs no Clerk secret. `npm run dev` runs
the front end only; use `vercel dev` to run the function alongside it.

```sh
cp .env.example .env.local   # then fill in the values
npm test                     # API tests
```

## How it relates to tldraw

The look and behaviour were worked out by inspecting tldraw.com (v5.5.0) in a browser with
[REA](https://github.com/morluto/rea): its rendered DOM, accessibility tree, stylesheet and shipped
JavaScript.

Taken from those observations:

- the color palettes for light and dark mode, and the stroke and font size tables (`src/editor/theme.ts`);
- UI design tokens and panel measurements (`src/styles.css`);
- the tool list and its order, menu contents, and key bindings (`src/editor/shortcuts.ts`);
- how shapes are built: an HTML layer of absolutely positioned shapes holding SVG paths, rounded
  double-pass "draw" outlines, fitted dash patterns, 200×200 defaults, and how each fill style maps
  to palette entries.

Designed independently here: the store and undo history, the pointer state machine, hit testing,
resize and rotate math, arrow binding, the freehand stroke settings (via
[perfect-freehand](https://github.com/steveruizok/perfect-freehand)), cloud and heart outlines, all
icons, and the SVG selection overlay (tldraw paints its overlay on a canvas).

Not implemented: live multiplayer, sharing, comments, multiple pages, embeds, rich text,
snapping, and frames that clip or own their children (a frame only carries the shapes inside it
when moved). Text in PNG exports falls back to system fonts.

## Layout

```
src/editor/      types, theme, geometry, path generation, store, tools, actions, shortcuts, export
src/components/  canvas, shapes, overlays, toolbar, style panel, menus, minimap
src/auth.tsx     Clerk provider and the account button
src/sync.ts      keeps the signed-in user's drawing in step with their account
api/doc.ts       Vercel Function that stores one drawing per account
tests/           API tests
```
