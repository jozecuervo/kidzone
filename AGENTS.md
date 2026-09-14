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

## Game Quality

These are toys, so keep the loop fast. Iterate by playing it, and let the
checks catch real breakage, not every edge case.

Always hold:

- Privacy and safety: no undeclared network, storage, camera, microphone, or
  sharing. `check.mjs` enforces the declarations.
- Declared inputs actually work. Don't list touch or keyboard in `project.json`
  unless you tried it.
- Motion uses elapsed time or a fixed step, pauses when the tab is hidden, and
  respects `prefers-reduced-motion`.
- Put important status in the DOM, not only on the canvas, so the game is
  playable without seeing it.
- Record where assets came from and their licence.

Good sense, not gates:

- Add a test when you fix a bug that would bother a kid: a crash, a game that
  can't be won, controls that stop working. Tests for pure logic are cheap;
  browser tests are for the main path only.
- One owner for timers, listeners, and animation frames, so restart doesn't
  leave stale work running.
- Seed randomness when it helps debugging.

## Game Change Done

A game change is ready to merge when:

- `node --test` for the project's tests and `node ./scripts/check.mjs` pass.
- The project's Playwright spec passes, if it has one.
- You played it once on desktop and at phone width, and the console is clean.
- The PR says what changed and any known rough edges, such as untested devices.

No independent reviewer, level solver, repeated-sequence tests, or mutation
checks are required. Use them only when a change is risky enough to need them.

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
- Run Playwright per spec file, and split a large spec with `--grep` or line
  numbers plus `--global-timeout=280000`. Agent sessions stall on a 10-minute
  no-output watchdog, and `tests/splat-lab.spec.mjs` alone takes about 5 minutes.
- Stop a preview or test server by the PID you started, never with
  `pkill -f server.mjs`: that also kills anyone else's preview on another port.
