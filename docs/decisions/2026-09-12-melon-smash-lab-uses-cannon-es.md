# Melon Smash Lab uses cannon-es, not Rapier

Date: 2026-09-12

The toy was renamed **Splat Lab** (`projects/splat-lab/`) the same day, after the fruit
selector made "Melon" too narrow. The decision is unchanged.

> **The rule:** Melon Smash Lab renders with three.js and simulates with cannon-es, both
> loaded from pinned jsDelivr URLs through an import map. The same pinned versions are
> devDependencies so node tests and offline Playwright tests run the real engine. All
> engine calls live in one module (`sim.js`), so swapping engines later touches that file
> only.

## Why

A spike on 2026-09-12 compared three.js with `@dimforge/rapier3d-compat` against three.js
with `cannon-es` on the toy's hardest planned scene: 12 rind chunks, 150 spheres and
30 stacked boxes.

| | Rapier | cannon-es |
|---|---|---|
| Loads with no build step | yes, but only from the raw `dist/` files; jsDelivr `+esm` fails to fetch the `.wasm` | yes, one ESM file |
| Bit-identical over 300 steps, same page | yes | yes |
| Compound body splits into pieces that inherit velocity | clean | clean |
| Step time, desktop avg / p95 | 0.71 / 1.7 ms | 1.36 / 1.8 ms |
| Step time, mobile emulation + 4x CPU throttle, avg / p95 | 2.6 / 6.9 ms | 5.5 / ~7.5 ms |
| Transferred size | ~1.73 MB (JS + WASM) | 77 KB |
| Runs under `node --test` | yes | yes |

Both engines meet the correctness needs, which are determinism and a clean split.
cannon-es is about 20x smaller and has no async WASM startup, which matters for a static
kids' page with no bundler.

## Alternatives

- **Rapier.** It is faster under a throttled CPU but costs 1.7 MB and a second binary
  request. Revisit if step 3 or 4 (marbles, box and bottle walls) breaks the frame budget
  on a throttled phone.
- **Hand-written physics.** Rejected. Stacked boxes toppling and hundreds of colliding
  balls are exactly what an engine exists for.
- **Vendoring the library into the repo.** Rejected in favour of pinned devDependencies.
  It would add a 77 KB copy and a `VENDORED.md` for no gain, while npm already pins the
  version.

## Accepted cost

- The toy needs the network, and `project.json` declares every URL the browser fetches.
  That is three URLs, not two: `three.module.js` imports `./three.core.js` from the same
  pinned package, a transitive fetch that `check.mjs`'s source scan cannot see. The
  Playwright spec closes that gap by asserting every external request is declared.
- Two devDependencies (`three`, `cannon-es`) are added purely for testing. A test asserts
  their versions match the CDN URLs, so the two cannot drift apart.
- cannon-es at 4x throttle has less headroom than Rapier. Each later step re-measures it.
