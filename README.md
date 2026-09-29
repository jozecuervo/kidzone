# Kidzone

Play it: https://jozecuervo.github.io/kidzone/

Kidzone is a small open-source playground where kids make web games, creative tools and playful experiments, with help from a parent or trusted adult. Built by Jose Miguel Hernandez (https://jose.io) with dezi-bot and a crew of young game designers.

The projects are meant to be simple enough to open, read, change, and share.
Most of them use plain HTML, CSS, and JavaScript, so a first contribution can be
as small as changing a color, adding a level, editing some text, or inventing a
new rule.

## For Coding Kids

Welcome. This is a place to make things.

Good first ideas:

- Change how a game looks.
- Add a new level.
- Rename a button.
- Make a character move differently.
- Build a tiny new game in `projects/<your-game-name>/`.

Try to keep your project kind, clear, and fun to explore. A good Kidzone project
helps someone make, solve, decorate, experiment, or learn.

## For Parents And Helpers

Kidzone is designed for parent-assisted coding. The repo favors:

- Local-only play with no accounts or chat.
- No public sharing features inside games.
- Static projects that can run on GitHub Pages.
- Clear project metadata for age fit, privacy, storage, network access, and
  adult-help notes.
- Small pull requests that kids can understand and talk through.

Please help kids avoid adding personal information, photos of themselves,
addresses, school names, private API keys, or open-ended communication features.

## How It's Built

Kids bring the idea. An AI coding agent builds a rough first draft. Then the kid and a parent iterate together: they play it, talk about how they want the game to work, and make refinements, with the parent reviewing and guiding each step. Kidzone is as much about that creative back-and-forth as it is about agentic coding.

The guardrails follow the pattern that keeps production AI agents safe: say what the tool may do, check it automatically, and keep a person in the loop.

- `skills/kidzone-new-game` starts every new game with questions: what the player does, what makes it fun, and what it must never do. A parent reviews the plan before anything is built. Measure twice, cut once.
- `skills/kidzone-game-iteration` handles changes to an existing game, one small pull request at a time.
- `AGENTS.md` gives any agent the house rules: no network, storage, camera, microphone or sharing unless the project declares it, and controls that really work.
- `scripts/check.mjs` enforces those declarations on every pull request, so a rule an agent forgets still gets caught.
- Ten games have Playwright tests that play the main path, so a game that can't be won, or controls that stop working, turn up before a kid finds them.

## Play Locally

Run the static preview server from this folder:

```sh
node ./server.mjs
```

Then open:

```text
http://127.0.0.1:4173
```

If that port is busy:

```sh
PORT=4174 node ./server.mjs
```

## Add A New Mini-Project

Create a project from the template:

```sh
node ./scripts/new-project.mjs sky-catcher "Sky Catcher"
```

This creates:

```text
projects/sky-catcher/
  index.html
  project.json
  README.md
  styles.css
```

Keep the project self-contained in its folder. Use relative links like
`./styles.css`, `./assets/star.png`, and `../../` so the project works locally
and on GitHub Pages.

Before publishing, update `project.json` using the
[Kidzone project contract](./projects/PROJECT_CONTRACT.md). That metadata helps
parents and maintainers see what a project does before a kid plays it.

## Before You Open A Pull Request

Refresh the project shelf if you changed project metadata:

```sh
node ./scripts/update-project-index.mjs
```

Run the checks:

```sh
node ./scripts/check.mjs
```

The check looks for stale project metadata, JavaScript syntax errors, undeclared
external URLs, and privacy-sensitive features that are missing from
`project.json`.

## Run The Browser Tests

Install the Playwright package and Chromium browser once:

```sh
npm install
npm run snapshots:install
```

Capture a fresh screenshot of every published project:

```sh
npm run snapshots
```

Screenshots are written to `snapshots/projects/`, which is ignored by Git.

## Project Shape

```text
kidzone/
  index.html
  projects/
    <project-slug>/
      index.html
      project.json
```

Each mini-project gets its own folder under `projects/`. Shared infrastructure
should stay small until more than one project truly needs it.

## Helpful Links

- [Contributing](./CONTRIBUTING.md)
- [Kidzone project contract](./projects/PROJECT_CONTRACT.md)
- [Next ideas](./docs/NEXT.md)

## License

Kidzone is open source under the [MIT License](./LICENSE).
