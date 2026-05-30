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

Open the target project path in a browser, check the console, and exercise the
changed behavior. Try a narrow viewport when layout or touch controls changed.
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
