# Kidzone Agent Notes

## Product Guess

Kidzone should be a safe, engaging collection of small web projects that help
kids make things, play, and explore with confidence.

## Working Guidance

- Favor active creation over attention traps.
- Build privacy, consent, and adult oversight into early decisions.
- Use clear interactions and accessible language for the target age group.
- Avoid public sharing and open-ended communication until safety needs are explicit.
- Keep mini-projects self-contained under `projects/<project-slug>/`.
- Prefer relative links and asset paths so GitHub Pages project URLs work.

## Early Build Bias

When product details are missing, favor a static mini-project that can publish
directly from GitHub Pages without a build step. Add shared infrastructure only
after more than one project clearly needs it.

## Game Quality Contract

- Treat every interaction declared in `project.json` as a tested promise. Do not
  advertise pointer, touch, keyboard, upload, camera, or other input unless its
  main path works and is verified.
- Behavior changes need focused checks and project-level regression tests. Every
  P0/P1 bug fix must include a test that fails without the fix.
- Use elapsed time or a fixed simulation step for motion; do not tie game speed
  to display refresh rate. Pause cleanly when the page is hidden and honor
  `prefers-reduced-motion` without hiding required state or controls.
- Give timers, animation frames, listeners, and engine objects one lifecycle
  owner. Reset/restart must invalidate old callbacks and dispose old state.
- Keep canvas and SVG experiences operable and understandable without vision:
  expose meaningful state, instructions, and status in accessible DOM content,
  and manage focus when views or dialogs change.
- For random levels, support a deterministic seed for debugging/tests and verify
  generated levels are solvable before play.
- Browser QA must cover desktop and mobile layouts, keyboard and touch when
  declared, blur/tab-away and return, reduced motion, reset/restart, and console
  or page errors. Screenshots are visual evidence, not behavioral verification.
- Record asset source/license or authorship, and remove or explicitly justify
  unused assets before shipping.

## Game Change Definition Of Done

Before marking a game pull request ready:

- State the core invariants in the PR or tests: exact win/progress gate,
  damage/loss rule, required collectibles, legal phases, and reset result.
- Prove every authored level is completable. Use a route/state solver for gated
  levels; use deterministic seeds plus solvability checks for generated levels.
- Exercise every declared input on a meaningful path. Native controls must work
  with pointer/touch and Enter/Space; held input must release after focus changes,
  blur, visibility loss, reset, and phase changes.
- Exercise transition sequences at least twice in one page session, including
  `start -> reset -> start`, `level -> next -> restart`, and any pending action
  interrupted by reset.
- Derive enabled controls, instructions, and status copy from the current game
  phase so visible UI cannot contradict accepted behavior.
- Make regression assertions prove the intended state changed. Avoid tests that
  pass merely because code ran without throwing or because a fixture was empty.
- Fetch and compare against current `origin/main`, rerun focused and repository
  checks on the final commit, and require an independent review for gameplay,
  lifecycle, input, level-data, or safety changes.

## Agent Skills

- Use `skills/kidzone-new-game/` when a user wants to create or brainstorm a
  new mini-project.
- Use `skills/kidzone-game-iteration/` when a user wants to tweak, extend, or
  verify an existing mini-project, especially when the change needs live browser
  QA or should stack on top of another project PR.

## Pages Layout

- The repository root is the Kidzone landing page.
- A publishable mini-project should expose `projects/<project-slug>/index.html`.
- A publishable mini-project should include `project.json` metadata for the
  generated landing page index.
- `project.json` should follow `projects/PROJECT_CONTRACT.md`, including age
  range, interactions, safety/privacy notes, storage, network access, and
  dependency declarations.
- `projects/_template/` is the starting point for a new mini-project.
- Use `node ./scripts/new-project.mjs` for new folders and
  `node ./scripts/update-project-index.mjs` after metadata changes.
- Run `node ./scripts/check.mjs` before pushing project metadata or script
  changes.
- Do not assume deployment at `/`; Kidzone may be served below a repository path.
- Use the local static server for preview needs, but keep publishable projects
  deployable to GitHub Pages without server-only behavior.
