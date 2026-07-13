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

- Every value in `interaction` is a user-facing promise. Its main path must work
  and be exercised by project tests or browser QA before publishing.
- Behavior changes require focused checks. P0/P1 bug fixes require a regression
  test that fails against the broken behavior.
- Animation and simulation must use elapsed time or a fixed step rather than
  frame count, pause when the document is hidden, and honor reduced-motion
  preferences without removing required feedback.
- Timers, animation frames, listeners, and engine objects must have one lifecycle
  owner. Reset or restart must dispose them or invalidate stale callbacks.
- Canvas and SVG projects must provide equivalent essential instructions, game
  state, and status in accessible DOM content and keep focus usable across views.
- Random level generation must be reproducible with a deterministic seed for
  debugging/tests and reject or repair unsolvable levels before play.

## Verification And Assets

Before publishing, exercise relevant desktop and mobile layouts, declared
keyboard and touch paths, blur/tab-away and return, reduced motion, reset, focus
transitions, and console/page errors. Screenshots verify appearance, not game
behavior.

Document asset authorship or source and license in the project README (or an
adjacent credits file). Remove unused assets or state why they are retained.
