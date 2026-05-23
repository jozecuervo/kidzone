# Mini-Project Template

Use the new-project script from the Kidzone root to copy this folder into a new
`projects/<project-slug>/` directory, create its card metadata, and refresh the
project index:

```sh
node ./scripts/new-project.mjs light-race "Light Race"
```

Then rename the page title and heading and build the project inside that folder.

The links in this starter stay relative so the copied project can run on
GitHub Pages even when Kidzone is published below a repository path.

Before publishing, update `project.json` to follow
`projects/PROJECT_CONTRACT.md`: age fit, interactions, safety/privacy notes,
storage, network access, and dependencies should all be explicit.
