# Kidzone

Kidzone is a small open-source playground for kids who want to make web games,
creative tools, and playful experiments with help from a parent or trusted
adult.

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
