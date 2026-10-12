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
- **Files** — the drawing is saved to `localStorage` as you work; export SVG or PNG, and save or
  open a JSON file.

Press `⋮` → **Keyboard shortcuts** for the full list.

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

Not implemented: multiplayer, sign-in and sharing, comments, multiple pages, embeds, rich text,
snapping, and frames that clip or own their children (a frame only carries the shapes inside it
when moved). Text in PNG exports falls back to system fonts.

## Layout

```
src/editor/      types, theme, geometry, path generation, store, tools, actions, shortcuts, export
src/components/  canvas, shapes, overlays, toolbar, style panel, menus, minimap
```
