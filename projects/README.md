# Kidzone Projects

Create one folder per mini-project:

```text
projects/
  paper-plane-lab/
    index.html
    project.json
    styles.css
    app.js
    assets/
```

Use short lowercase slugs for folder names. Keep each project self-contained and
prefer relative links such as `./styles.css`, `./assets/star.png`, and
`../../` for the Kidzone home page.

Create the folder from the project root with:

```sh
node ./scripts/new-project.mjs paper-plane-lab "Paper Plane Lab"
```

Edit `project.json` when a card title, summary, tags, or call to action changes,
then refresh the generated project index:

```sh
node ./scripts/update-project-index.mjs
```

The `_template` folder is the static starting point copied by the new-project
script.
