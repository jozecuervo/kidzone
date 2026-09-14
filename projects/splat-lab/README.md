# Splat Lab

Pick a fruit, a drop height (0.3-60 m, a continuous slider with named
landmarks like Knee, Roof and Plane), and a toughness, then find out whether
it survives the fall or smashes into rind/shell pieces and seeds, with a
synthesized splat sound (toggle it off any time). Fruit, height and
toughness stay editable after a drop settles — there's no Reset button;
changing a control or pressing Drop again clears the debris and starts
fresh.

## Fruits

| Fruit | Radius | Mass | Break speed (t=5) | Outer pieces | Inner pieces | Seeds |
| --- | --- | --- | --- | --- | --- | --- |
| Tomato | 3.5 cm | 0.15 kg | 2.0 m/s | 10 | 10 | 30 |
| Watermelon | 15 cm | 6 kg | 3.5 m/s | 12 | 12 | 40 |
| Apple | 4 cm | 0.2 kg | 6.3 m/s | 8 | 8 | 6 |
| Orange | 4 cm | 0.2 kg | 8.5 m/s | 10 | 8 | 5 |
| Coconut | 10 cm | 1.5 kg | 18.5 m/s | 10 | 8 | 0 |

These numbers (size, mass, break speed, piece counts) are approximate,
chosen for a readable range of held/cracked/split/smashed outcomes across
the height slider, not measured from real fruit. A toughness slider (1-10)
scales each fruit's break speed by a multiplier that is 1x at the default
toughness (5), roughly 0.4x at the softest setting, and roughly 4x at the
toughest.

## How it works

- `rules.js`: pure game rules (the fruit table, the height-slider mapping,
  the toughness multiplier, severity tiers, break-speed thresholds, a
  seeded PRNG, release-wobble and layout-hash helpers, result-text
  formatting, chunk/shell shape generation, and per-fruit camera framing).
  No engine, no DOM, no imports.
- `sim.js`: the only module that imports `cannon-es`. Runs the physics at a
  fixed 1/60 s step and exposes plain data (`bodies()`, `summary`, `phase`,
  `uiPhase`, `steps`, `lastSplit`, `firstImpact`) — no cannon-es object ever
  leaves this file. `phase` is the true physics state (settles once every
  piece sleeps or the 480-step limit is hit); `uiPhase` settles 72 steps
  (1.2s) after the impact step, so the UI doesn't wait out debris that keeps
  moving for several more seconds.
- `view.js`: the only module that imports `three`. Owns the render loop,
  every DOM listener, the fruit selector, the height/toughness sliders, the
  height bar, per-drop seeding (`crypto.getRandomValues`, with a `?seed=`
  URL override for reproducible sessions), the mapping from sim bodies to
  meshes (procedurally built `BufferGeometry` chunks/shells, no external
  models), and the synthesized splat sound (Web Audio: a white-noise burst
  through a lowpass filter, an oscillator thud, and a coconut crack — no
  audio files). The `AudioContext` is created only inside the Drop click/key
  handler, per autoplay rules.
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
- [three.js](https://github.com/mrdoob/three.js) — MIT License. Used for
  rendering.
- [cannon-es](https://github.com/pmndrs/cannon-es) — MIT License. Used for
  physics simulation.
