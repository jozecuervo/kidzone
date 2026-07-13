# Mini-Project Template

Use the new-project script from the Kidzone root to copy this folder into a new
`projects/<project-slug>/` directory, create its card metadata, and refresh the
project index:

```sh
node ./scripts/new-project.mjs light-race "Light Race"
```

Then rename the page title and heading and build the project inside that folder.

The links in this starter stay relative so the copied project can run on
GitHub Pages even when Kidzone is published below a repository path.

Before publishing, update `project.json` to follow
`projects/PROJECT_CONTRACT.md`: age fit, interactions, safety/privacy notes,
storage, network access, and dependencies should all be explicit.

Add project-level tests for the core loop and reset. Treat each interaction in
`project.json` as a tested promise, and add a regression test for every
critical/high-impact fix. Browser QA should exercise relevant desktop/mobile,
keyboard/touch, blur/return, reduced-motion, focus, reset, and console-error
paths; screenshots only verify appearance. For permission or device features,
test denial/cancel, say whether a real device or mocks were used, and record
remaining coverage risk.

For animation, use elapsed time or a fixed step and pause while the page is
hidden. Give timers, animation frames, listeners, media streams, object URLs,
pending async work, and engine objects one lifecycle owner so reset or replaced
input cannot leave stale work behind. Expose essential canvas/SVG state in
accessible DOM content. Make random levels seedable and verify solvability.

List asset authorship/source and license here, and remove or explain unused
assets before publishing.
