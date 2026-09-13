# Splat Lab

Drop a watermelon from five different heights, pick how tough the rind is,
and find out whether it survives the fall or smashes into rind chunks,
flesh cubes, and seeds.

## How it works

- `rules.js`: pure game rules (height presets, break-speed thresholds, a
  seeded PRNG, result-text formatting). No engine, no DOM, no imports.
- `sim.js`: the only module that imports `cannon-es`. Runs the physics at a
  fixed 1/60 s step and exposes plain data (`bodies()`, `summary`, `phase`,
  `steps`) — no cannon-es object ever leaves this file.
- `view.js`: the only module that imports `three`. Owns the render loop,
  every DOM listener, and the mapping from sim bodies to meshes.
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

- All geometry (melon, rind chunks, flesh cubes, seeds, ground) is
  hand-coded with `three.js` primitives — no external models or textures.
- [three.js](https://github.com/mrdoob/three.js) — MIT License. Used for
  rendering.
- [cannon-es](https://github.com/pmndrs/cannon-es) — MIT License. Used for
  physics simulation.
