---
name: kidzone-game-iteration
description: Modify, polish, verify, or stack work on an existing Kidzone mini-project. Use when the user asks to tweak an existing game, add levels or mechanics, adjust visuals, fix controls, validate browser behavior, or prepare a focused follow-up pull request on top of another project branch.
---

# Kidzone Game Iteration

Use this skill when the project already exists and the work is an iteration, not
a new game discovery pass.

## First Move

Identify the target mini-project before editing. Use the user's browser URL,
project name, branch name, or changed files to find `projects/<project-slug>/`.

Read the local project context first:

- `projects/<project-slug>/README.md`, when present
- `projects/<project-slug>/project.json`
- the files directly involved in the requested behavior
- existing project tests and the game invariants they cover
- the current Git branch and working tree status

If the work is meant to stack on another PR, branch from the current PR branch
before editing and keep the follow-up narrowly scoped.

## Iteration Principles

- Preserve the project's existing style, file layout, controls, and plain
  language unless the user asks for a redesign.
- Keep changes self-contained inside the project folder unless shared docs,
  scripts, or metadata genuinely need to change.
- Keep the project static and GitHub Pages friendly: relative paths, no
  server-only behavior, and no new build step unless the project already has one.
- Treat kid-safety metadata as part of the change. If storage, network access,
  dependencies, uploads, audio, public sharing, or sensitive content changes,
  update `project.json` and refresh `projects/index.json`.
- Prefer visible, forgiving feedback over pressure loops. Keep reset/reload/help
  affordances reachable and understandable.
- Treat each interaction listed in `project.json` as a tested promise. Update the
  implementation, tests, or metadata when that promise changes.
- Behavior changes need focused project-level checks; every critical/high-impact
  fix needs a regression test that demonstrates the former failure. This
  includes privacy/safety, crashes, progression, declared-input, and stale-work
  failures.

## Gameplay And UI Changes

For new mechanics, update the full loop rather than only the code path:

- game state and scoring
- visual state classes or canvas rendering
- player feedback text
- pointer, touch, and keyboard behavior when relevant
- accessible labels or help text
- narrow-screen layout if the control surface changes

For animated or timing-sensitive behavior, verify the real interaction in a
browser. DOM checks are helpful, but do not replace at least one live gameplay
path for the feature being changed.

Keep timing and teardown explicit:

- Base motion on elapsed time or a fixed simulation step, not frame count.
- Pause on page visibility loss and provide meaningful reduced-motion behavior.
- Give timers, animation frames, listeners, media streams, object URLs, pending
  async work, and engine objects one lifecycle owner; reset/restart or replaced
  input must dispose them or invalidate every stale callback.
- If levels are random, make failures reproducible with a seed and verify each
  generated level is solvable.
- For canvas or SVG games, mirror essential instructions, state, and status in
  accessible DOM content and restore focus after view/dialog changes.

Before changing code, name the affected invariants: win/progress gates,
collectible requirements, damage/loss rules, legal phases, and reset behavior.
For authored levels, validate a complete route through every gate and exit. For
generated levels, test deterministic seeds and reject unsolvable output.

Treat input press and release as separate contracts. Native controls must work
with their standard keyboard behavior, including Enter/Space for button-like
controls. Release held input even if focus moves before keyup, and on blur,
visibility loss, pointer cancellation/loss, reset, and phase transitions.

## Validation

Run the repo check before calling the work done:

```sh
node ./scripts/check.mjs
```

Also run `git diff --check` for whitespace and patch hygiene.

For significant frontend changes, preview with the local static server:

```sh
node ./server.mjs
```

If the default port is busy, use a nearby port:

```sh
PORT=4174 node ./server.mjs
```

Open the target project path in a browser, check console and page errors, and
exercise the changed behavior. In proportion to the change, cover desktop and
mobile, keyboard and touch when declared, blur/tab-away and return, reset,
reduced motion, and focus transitions. Screenshots verify layout and appearance;
they do not verify behavior. Exercise permission/device features from an explicit
user action and cover denial or cancellation. State whether testing used a real
device or mocks, and record unavailable device/browser coverage as residual risk.

For lifecycle, input, progression, or phase changes, repeat each applicable
transition twice in one page session, such as `start -> reset -> start`,
`level -> next -> restart`, or a pending action interrupted by reset. Confirm
enabled controls, instructions, and status copy all match the current phase.

Make assertions demonstrate the expected state change and fail against the old
bug; avoid vacuous checks that only prove code did not throw. Before marking a
PR ready, fetch current `origin/main`, inspect the merge diff, rerun focused and
repository checks on the final commit, and get an independent review for changes
to gameplay, lifecycle, input, level data, or safety. The reviewer must not be the
implementer and must inspect the final diff, challenge the tests, and replay the
affected paths rather than relying on the author's summary.

When assets change, record source/authorship and license, and review for unused
files rather than silently carrying them forward.

Stop the preview server before handing off if the user asks to shut down or the
server is no longer needed.

## Stacked Pull Requests

When the user asks to stack a PR:

- Create the follow-up branch from the current feature branch.
- Keep the commit focused on the follow-up concern.
- In the PR notes, name the parent branch or PR that the stack depends on.
- Use the parent feature branch as the PR base when creating the PR.
- If pushing to the main repo fails with permission denied and the user does not
  want a fork, report that the repository owner needs to grant write access to
  the pushing account, or the branch must be pushed by someone with access.

Before final handoff, summarize the branch, commit, checks, browser QA, and any
server shutdown state that matters.
