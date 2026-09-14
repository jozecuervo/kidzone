# Splat Lab

Pick a fruit (tomato, watermelon, apple, orange, or coconut) and a drop
height on a continuous 0.3-60 m slider (with named landmark ticks like Knee,
Roof and Plane), then press Drop. Press it again as fast as you like — up to
5 fruit can be falling or resting in the drop zone at once. A 6th press pops
the oldest one away to make room, and a very crowded scene (lots of broken
pieces) also pops the oldest fruit to stay within a body budget. Each fruit
holds, cracks, splits or smashes depending on its own real break speed and
how far it fell. Once everything goes quiet, the result is announced once.

There's a synthesized splat sound (a Sound on/off toggle, on by default) and
`?seed=<n>` in the URL pins randomness for debugging — the k-th Drop press
since the page loaded uses seed `n + k`, so a pinned session is reproducible
press-by-press.

## Fruits

| Fruit | Radius | Mass | Break speed | Outer pieces | Inner pieces | Seeds |
| --- | --- | --- | --- | --- | --- | --- |
| Tomato | 3.5 cm | 0.15 kg | 2.0 m/s | 10 | 10 | 30 |
| Watermelon | 15 cm | 6 kg | 3.5 m/s | 12 | 12 | 40 |
| Apple | 4 cm | 0.2 kg | 6.3 m/s | 8 | 8 | 6 |
| Orange | 4 cm | 0.2 kg | 8.5 m/s | 10 | 8 | 5 |
| Coconut | 10 cm | 1.5 kg | 18.5 m/s | 10 | 8 | 0 |

These numbers (size, mass, break speed, piece counts) are playful
approximations, chosen for a readable range of held/cracked/split/smashed
outcomes across the height slider, not measured from real fruit.

## How it works

- `rules.js`: pure game rules (the fruit table, the height-slider mapping,
  severity tiers, break-speed thresholds, a seeded PRNG, release-wobble and
  layout-hash helpers, single- and batch-result-text formatting, the
  rolling-window spawn plan, body-budget trimming, chunk/shell shape
  generation, and per-fruit camera framing). No engine, no DOM, no imports.
- `sim.js`: the only module that imports `cannon-es`. Runs the physics at a
  fixed 1/60 s step and exposes plain data (`bodies()`, `fruits()`, `phase`,
  `steps`, `consumeImpacts()`, `consumeRemovals()`, `consumeAnnouncement()`)
  — no cannon-es object ever leaves this file. `drop()` can be called at any
  time, in any phase, and never clears the scene; it raises the new fruit's
  spawn above anything already falling in the way, removes any landed body
  it would otherwise land on, and — once the window already holds 5 fruit —
  removes the oldest one entirely. `phase` is `ready` (empty scene),
  `active` (something falling, or an impact in the last 72 steps), or
  `settled` (quiet).
- `view.js`: the only module that imports `three`. Owns the render loop,
  every DOM listener, the fruit selector, the height slider, the height
  bar (one marker per fruit currently in the scene), the incoming markers
  (one per currently-falling fruit), per-drop seeding
  (`crypto.getRandomValues`, with the `?seed=` override above), the mapping
  from sim bodies to meshes (procedurally built `BufferGeometry`
  chunks/shells, no external models, with a short shrink-to-zero pop
  animation when a fruit is removed), and the synthesized splat sound (Web
  Audio: a white-noise burst through a lowpass filter, an oscillator thud,
  and a coconut crack — no audio files), routed through one shared master
  gain and compressor so several overlapping splats don't clip. The
  `AudioContext` is created only inside the Drop click/key handler, per
  autoplay rules.
- `index.html` / `style.css`: markup and layout. `three.js` and `cannon-es`
  load from pinned jsDelivr URLs through an import map — there is no build
  step. `three.module.js` itself imports `three.core.js` from the same
  pinned package, a third URL the browser fetches transitively; all three
  are declared in `project.json`.

## Running the tests

From the repository root:

```
node --test tests/splat-lab-rules.test.mjs tests/splat-lab-sim.test.mjs
npx playwright test tests/splat-lab.spec.mjs
```

## Credits

- All geometry (fruit, rind/shell chunks, seeds, ground) is hand-coded with
  `three.js` primitives and procedurally built `BufferGeometry` — no
  external models or textures.
- The splat sound is synthesized entirely in the browser with the Web Audio
  API (white noise, a lowpass filter, and an oscillator) — no audio files.
- [three.js](https://github.com/mrdoob/three.js) — MIT License. Used for
  rendering.
- [cannon-es](https://github.com/pmndrs/cannon-es) — MIT License. Used for
  physics simulation.
