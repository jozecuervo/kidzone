# Kidzone

Kidzone is a home for small kid-friendly web projects: playful experiments,
creative tools, learning games, and other self-contained ideas that can publish
cleanly on GitHub Pages.

## Early Direction

- Put creation and exploration ahead of passive scrolling.
- Keep each mini-project small enough to open, understand, and share on its own.
- Make safety, clarity, and age fit part of the project shape from the start.

## Repository Shape

```text
kidzone/
  index.html
  projects/
    <project-slug>/
      index.html
      project.json
```

Each mini-project gets its own folder under `projects/`. The `project.json`
metadata feeds the landing page project index. Keep project files and assets
inside that folder unless there is a strong reason to share code.

## GitHub Pages Bias

- Publish the repository root as a static GitHub Pages site.
- Give every publishable mini-project an `index.html`.
- Use relative links and asset paths so pages work under `/kidzone/` project
  URLs as well as local file or dev-server previews.
- Keep build tooling optional. Plain HTML, CSS, and JavaScript are a good
  default for tiny projects.

## Local Server

Run the tiny static preview server from this directory:

```sh
node ./server.mjs
```

It serves the Kidzone repository root at `http://127.0.0.1:4173` by default.
Set `PORT` or `HOST` when another local address is needed:

```sh
PORT=4174 node ./server.mjs
```

The server only previews static files. Mini-projects should still stay
GitHub Pages compatible.

## Project Scripts

Create a new mini-project from the template:

```sh
node ./scripts/new-project.mjs sky-catcher "Sky Catcher"
```

Refresh `projects/index.json` after editing project metadata:

```sh
node ./scripts/update-project-index.mjs
```

The landing page reads that generated index, so preview it through the local
server or GitHub Pages instead of relying on a raw file open.

## More Notes

- [Kidzone next features](./docs/NEXT.md)
- [Contributing](./CONTRIBUTING.md)

## Open Questions

- Which age range should the first few projects target?
- Should projects lean toward creative tools, learning games, or a broad mix?
- Which projects need guardian context, privacy notes, or saved data at all?
