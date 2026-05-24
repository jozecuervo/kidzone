# Contributing To Kidzone

Kidzone is a friendly place for kids to make small web games with help from a
parent or trusted adult. This guide gets you from an idea to a pull request.

## What You Need

- A GitHub account, with parent help if needed.
- Git installed on your computer.
- Node.js installed so you can run the preview server and checks.
- A small game idea that can live in one folder.

Good Kidzone games are kind, clear, and safe. They should not include accounts,
chat, public sharing, leaderboards, private photos, addresses, school names, or
secret API keys.

## 1. Get The Project

Fork the Kidzone repo on GitHub, then clone your fork:

```sh
git clone https://github.com/<your-github-name>/kidzone.git
cd kidzone
```

Create a branch for your game:

```sh
git switch -c add-sky-catcher
```

Use a short branch name that says what you are making.

## 2. Preview Kidzone

Start the local server:

```sh
node ./server.mjs
```

Open this in a browser:

```text
http://127.0.0.1:4173
```

Keep the server running while you work. Stop it with `Ctrl+C`.

## 3. Create Your Game Folder

Use the project script:

```sh
node ./scripts/new-project.mjs sky-catcher "Sky Catcher"
```

Change `sky-catcher` and `Sky Catcher` to your own game slug and title.

This creates:

```text
projects/sky-catcher/
  index.html
  project.json
  README.md
  styles.css
```

Keep your game inside that folder. If you add images or sounds, put them in the
same project folder, usually under `assets/`.

## 4. Build A Small First Version

Start tiny. A good first version might have:

- One screen.
- One clear goal.
- A reset button.
- Touch or keyboard controls.
- Simple words a kid can understand.

Plain HTML, CSS, and JavaScript are perfect. Avoid adding build tools unless a
parent or maintainer agrees the project really needs them.

## 5. Update `project.json`

Your game card and safety notes come from `project.json`.

Fill in:

- `summary` and `description`
- `tags`
- `ageRange`
- `interaction`
- `safety`
- `runtime`

Use the [Kidzone project contract](./projects/PROJECT_CONTRACT.md) as the guide.

If your game uses camera, microphone, file upload, downloads, browser storage,
network access, or an outside library, ask a parent or maintainer before opening
the pull request.

## 6. Refresh The Project Shelf

After changing `project.json`, run:

```sh
node ./scripts/update-project-index.mjs
```

This updates `projects/index.json`, which powers the Kidzone home page.

## 7. Check Your Work

Run:

```sh
node ./scripts/check.mjs
```

Fix anything it reports. The check looks for stale metadata, JavaScript syntax
errors, undeclared external links, and privacy-sensitive features that are not
declared in `project.json`.

Preview your game again in the browser. Try it on a narrow window too, like a
phone screen.

## 8. Commit Your Game

See what changed:

```sh
git status
```

Stage your files:

```sh
git add projects/sky-catcher projects/index.json
```

Commit:

```sh
git commit -m "Add Sky Catcher game"
```

If you changed docs or scripts too, include those files in the same commit only
when they are part of your game.

## 9. Push Your Branch

```sh
git push -u origin add-sky-catcher
```

GitHub will show a button to open a pull request.

## 10. Open The Pull Request

In your pull request, include:

- What game you made.
- How to play it.
- What files changed.
- Any safety notes a parent should know.
- The result of `node ./scripts/check.mjs`.

It is okay if the first pull request is small. Small is good. It makes the game
easier to review, talk about, and improve together.
