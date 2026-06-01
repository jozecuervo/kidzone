# JANICE Puppet Workshop

JANICE means JavaScript Armature Notation for Interactive Character Engines.
This project is the browser-safe schema lab for animatable digital puppets.

## MVP Fixtures

- `JANICE` is the main runway model fixture. She loves green and must prove
  dress-up, accessories, walking left/right, and fashion poses.
- `Orbit` is a very different stress-test puppet with wheels, wings, a tail,
  and no normal legs.

## Static Boundary

Keep this project compatible with GitHub Pages:

- use plain browser-safe JavaScript modules;
- avoid build steps, backend routes, accounts, uploads, and remote services;
- keep any local file-system use in explicit development scripts or tests;
- treat network requests as deliberate design decisions, not defaults.

## Schema Files

- `janice-schema.js` defines the JANICE vocabulary and MVP rules.
- `janice-validator.js` validates puppet fixtures without browser or file-system
  dependencies.
- `janice-runtime.js` computes rooted, parent-local skeleton transforms,
  visibility sets, body-part variants, and attachment-point positions.
- `puppets/*.puppet.js` are executable schema fixtures.
- `tests/janice-validator.test.js` runs in both the browser and Node.

## Current Schema Split

- `moves` are kid-facing buttons such as "Walk" or "Wave".
- `clips` are the rig-facing animation recipes behind those buttons.
- `visibilitySets` can hide/show body parts and select visual variants such as
  front legs, side legs, flat shoes, or high shoes.

## Future Tools

- TODO: Explore a very simple Bezier curve editor for puppet body-part paths so
  we can tune organic contours visually while keeping the exported rig plain
  browser-safe JavaScript.
