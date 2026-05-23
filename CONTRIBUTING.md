# Contributing To Kidzone

Kidzone is meant to be a friendly place to make small web projects and learn how
pull requests work.

## First Pull Request

1. Run `node ./server.mjs` from the Kidzone folder.
2. Open the local Kidzone page and choose a project.
3. Change one small thing you can see: a color, a rule, a line of copy, a game
   object, or a sound.
4. Preview the change before opening a pull request.

## New Mini-Project

Create a new project folder with:

```sh
node ./scripts/new-project.mjs rainbow-dash "Rainbow Dash"
```

Edit the new project folder and its `project.json` card metadata. When project
metadata changes outside the new-project script, refresh the landing-page index:

```sh
node ./scripts/update-project-index.mjs
```

Keep project files self-contained and links relative so the same work runs on
the local server and GitHub Pages.

## Before A Pull Request

Run:

```sh
node ./scripts/check.mjs
```

The check catches stale project-card metadata, missing project files, and broken
JavaScript syntax before CI has to tell you.
