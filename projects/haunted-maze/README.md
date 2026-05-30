# Haunted Maze Walk

Walk through gentle Halloween mazes by clicking open paths to move, using
footprints as clues toward the locked door, searching dark areas that may hide
the key or a spooky surprise, and spotting glowing pirate gold on the path.
There is no timer, losing, score pressure, saved data, network access, or
public sharing.

## First Playable

- Five static maze levels with increasing size.
- Keyboard, pointer, and touch controls inside the maze frame.
- Clickable open paths so players can walk in any direction.
- Searchlight footprints that lead only to the locked door.
- Dark areas that hide the key or a vampire, witch, werewolf, or zombie.
- Glowing pirate gold discoveries that open a pirate booty picture popup.
- Hidden key discoveries that open a key picture popup before the door unlocks.
- Local-only static HTML, CSS, and JavaScript.

## Safety Notes

This is a Halloween-themed game with spooky decorations and cartoon jump-outs.
Adult preview is useful for kids who are sensitive to spooky content. The game
stays local in the browser and does not store, upload, download, or share
anything.

## Validation

From the repository root:

```sh
node ./scripts/check.mjs
git diff --check
node ./server.mjs
```

Then open `http://127.0.0.1:4173/projects/haunted-maze/` and play through the
levels with keyboard and touch or pointer controls.
