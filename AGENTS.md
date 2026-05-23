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

## Pages Layout

- The repository root is the Kidzone landing page.
- A publishable mini-project should expose `projects/<project-slug>/index.html`.
- A publishable mini-project should include `project.json` metadata for the
  generated landing page index.
- `projects/_template/` is the starting point for a new mini-project.
- Use `node ./scripts/new-project.mjs` for new folders and
  `node ./scripts/update-project-index.mjs` after metadata changes.
- Run `node ./scripts/check.mjs` before pushing project metadata or script
  changes.
- Do not assume deployment at `/`; Kidzone may be served below a repository path.
- Use the local static server for preview needs, but keep publishable projects
  deployable to GitHub Pages without server-only behavior.
