# Kidzone Project Contract

Each publishable Kidzone project should be small, static by default, and clear
about kid safety before it appears on the landing page.

## Required Files

```text
projects/<project-slug>/
  index.html
  project.json
```

Projects may use a different entry file when `project.json` sets `entry`, but
the entry must stay inside the project folder.

## Required Metadata

`project.json` is the source of truth for the landing page and safety review:

```json
{
  "title": "Paper Plane Lab",
  "summary": "Build paper planes and test tiny flight changes.",
  "description": "A playful experiment about changing wings and watching what happens.",
  "date": "2026-05-23",
  "dateSource": "project metadata",
  "entry": "index.html",
  "cta": "Start experimenting",
  "tags": ["science", "craft"],
  "order": 90,
  "ageRange": "7-11",
  "interaction": ["pointer", "touch", "keyboard"],
  "safety": {
    "privacy": "Local-only play with no accounts, chat, sharing, or saved data.",
    "adultHelp": "None required for ordinary play.",
    "notes": "No timer pressure, public posting, or open-ended communication."
  },
  "runtime": {
    "type": "static",
    "requiresServer": false,
    "networkAccess": "none",
    "storesData": false,
    "externalDependencies": []
  }
}
```

The landing page shelf lists projects **newest first by `date`**; `order` only
breaks ties between projects with the same date. Set `"shelf": false` to keep a
project published and in `projects/index.json` but off the shelf (the
`make-a-game` starter uses this; the hero links to it instead).

## Safety Defaults

- Prefer active creation, experiments, puzzles, and making things.
- Avoid accounts, public sharing, chat, leaderboards, streak pressure, and
  surveillance unless the project has an explicit safety design.
- Declare camera, microphone, uploads, downloads, storage, external scripts, and
  optional servers in metadata before shipping.
- Keep project links and assets relative so GitHub Pages works under a repository
  path such as `/kidzone/`.

## Runtime Defaults

The default runtime is static HTML, CSS, and JavaScript served from the repository
root. External scripts and per-project servers should be rare and declared in
`runtime` with a reason.

## Interaction And Behavior Contract

- Only list an input in `interaction` if you tried it and it works.
- Motion uses elapsed time or a fixed step, pauses when the tab is hidden, and
  respects reduced motion.
- Put the important status and instructions in the DOM, not only on the canvas.
- Add a regression test when you fix a bug a kid would notice, such as a crash,
  a game that can't be won, or broken controls.

## Verification And Assets

Before publishing, play it on desktop and at phone width, try each declared
input, and check the console is clean. Camera, microphone, or other permission
flows must start from an explicit user action and handle denial. Mention
untested devices in the PR.

Document asset authorship or source and license in the project README (or an
adjacent credits file). Remove unused assets or state why they are retained.
