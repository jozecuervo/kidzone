---
name: kidzone-new-game
description: Creatively capture requirements and parent/architect review before building a new Kidzone game or mini-project. Use when the user asks to make, build, add, design, brainstorm, or start a new game in the Kidzone repo, especially when the theme, player fantasy, mechanics, safety boundaries, technical approach, dependencies, or implementation scope are not already explicit.
---

# Kidzone New Game

Use this skill to slow the first move down in the right way: discover the game
before creating files, but do not turn simple low-risk ideas into paperwork.

## First Move

Do not scaffold, draw a board, generate assets, or write game code yet unless
the user has already provided a clear enough brief and explicitly asked to build
immediately.

Start by capturing the creative requirement in a playful, compact way. Ask no more than three questions at once. Prefer questions that reveal the game rather than generic product requirements.

Good opening questions:

1. What is the game about: a place, creature, feeling, craft, puzzle, story, or silly rule?
2. What should the player do every few seconds: move, sort, build, dodge, match, decorate, remember, experiment, or invent?
3. What should make it feel safe and kind for kids: no timers, no losing, quiet feedback, adult help, local-only play, accessible controls, or something else?

If the user says "surprise me" or gives only a tiny prompt, offer three distinct game seeds and ask them to pick or remix one. Keep each seed to 2-3 sentences.

## Risk Tiers

Use the smallest useful process for the risk level.

Low-risk clear brief:

- Static local-only project.
- No camera, microphone, uploads, downloads, accounts, chat, public sharing,
  leaderboards, storage, external network calls, or open-ended communication.
- The user gave the core loop, progression, and theme.

For a low-risk clear brief, write a short Game Brief and Parent/Architect Review,
then proceed if the user has already asked you to build. Do not force a second
approval turn unless something is ambiguous.

Medium-risk brief:

- Includes timers, losing, punishment, cartoon conflict, scary content, uploads,
  downloads, audio, motion-heavy effects, or external libraries.
- The idea is still local and does not involve identity, communication, or public
  sharing.

For medium risk, give the Game Brief and Parent/Architect Review, then ask for
approval or changes before building.

High-risk brief:

- Includes camera, microphone, saved kid data, accounts, chat, public sharing,
  leaderboards, location, analytics, remote services, or identity.

For high risk, stop for explicit approval after the review. Call out privacy,
adult oversight, and whether the feature should be removed, mocked, or made
local-only.

## Requirement Capture

Turn the user's answers into a short Game Brief before implementation:

- Title and likely `projects/<slug>/` path
- Player fantasy in one sentence
- Core loop: what the player repeatedly does and why it changes
- Main interaction: keyboard, mouse, touch, or mixed
- Progress rule: win, complete, collect, discover, or open-ended creation
- Safety and privacy boundaries
- Accessibility notes for kids
- Visual/audio mood, using static assets only when helpful
- Build scope for the first playable version

For medium- or high-risk projects, ask the user to confirm the brief or change
it. Treat confirmation as the handoff from discovery to review, not straight to
building. For low-risk clear briefs, confirmation can be implicit when the user
has already asked to build.

## Kidzone Fit

Favor active creation over attention traps. Prefer mechanics where kids make, arrange, explore, or solve something.

Avoid public sharing, chat, accounts, leaderboards, surveillance, dark patterns, streak pressure, and punish-heavy loops unless the user explicitly asks and the safety design is clear.

Use plain language, forgiving interactions, visible reset/undo where useful, and controls that work on touch as well as keyboard when practical.

## Build Handoff

Before implementation, give the user a short Parent/Architect Review so they can guide the direction.

Parent review:

- Age fit: who the first version seems best for and why
- Safety/kindness: how the game avoids pressure, public sharing, chat, surprise collection, or harsh failure
- Adult oversight: what a parent might want to know before a kid plays
- Accessibility: touch/keyboard support, readable language, motion/sound restraint, reset/undo/help affordances
- Content risks: anything that could be scary, addictive, confusing, or culturally sensitive

Architect review:

- Proposed files under `projects/<project-slug>/`
- Runtime approach: static HTML/CSS/JavaScript unless there is a clear reason otherwise
- Libraries or engines: name any proposed dependency, why it helps, whether it needs a build step/CDN/npm install, and the no-library fallback
- Game state: what is stored, whether it stays local, and whether persistence is needed at all
- Assets: generated, hand-coded, searched, or repo-local; include licensing/privacy considerations when relevant
- Technical risks: mobile layout, performance, canvas/SVG/DOM choice, input handling, audio autoplay limits, browser support
- Runtime lifecycle: one owner for timers, animation frames, listeners, and
  engine objects; reset invalidates old work; motion uses elapsed time or a fixed
  step and pauses while hidden
- Accessible state: DOM instructions/status for canvas or SVG gameplay, planned
  focus movement, and a reduced-motion behavior that preserves game meaning
- Random generation: a deterministic seed for tests/debugging and a solvability
  check before a generated level is offered
- Project contract: age range, interactions, safety/privacy notes, storage,
  network access, and dependency declarations for `project.json`
- Validation plan: project-level behavior tests plus exact local commands and
  browser paths. Exercise every interaction declared in metadata on desktop and
  mobile, including keyboard, touch, blur/return, reset, reduced motion, and
  console/page errors where applicable. Screenshots verify appearance only.

Ask for approval or changes after this review for medium- and high-risk projects.
If the project is low risk and the user has already explicitly asked to build,
continue into the build after the review.

After the review is approved, follow the repo's Kidzone conventions:

- Keep the project self-contained under `projects/<project-slug>/`.
- Prefer static HTML, CSS, and JavaScript that publish on GitHub Pages without a build step.
- Use relative links and asset paths.
- Include `projects/<project-slug>/index.html` and `project.json`.
- Make `project.json` follow `projects/PROJECT_CONTRACT.md`.
- Use `projects/_template/` or `node ./scripts/new-project.mjs` when the repo state allows it.
- Run `node ./scripts/update-project-index.mjs` after metadata changes when possible.
- Run `node ./scripts/check.mjs` before considering the work done when possible.
- Add focused project tests for the core loop, win/progress rules, reset, and
  failure-prone state transitions. A P0/P1 fix always needs a regression test.
- Document asset authorship/source and license, then remove unused assets or
  explain why they remain.

If existing unrelated project folders or dirty worktree state block index/check scripts, report that clearly and keep the new game's files correct without modifying unrelated work.
