# Kidzone Shared Assets

Kidzone provides free sprites for common game elements. Use them in any of your games.

## Playing Cards

52 standard playing card sprites covering all four suits and ranks.

**Location:** `assets/img/cards/`

**Files:** Named by rank and suit, e.g. `ace-of-hearts.gif`, `king-of-spades.gif`

**Available ranks:**
- Number cards: `2-of-*.gif` through `9-of-*.gif`
- Special cards: `10-of-*.gif`, `jack-of-*.gif`, `queen-of-*.gif`, `king-of-*.gif`, `ace-of-*.gif`

**Available suits:**
- `*-of-clubs.gif`
- `*-of-diamonds.gif`
- `*-of-hearts.gif`
- `*-of-spades.gif`

**Example:** How to load a card in your game:

```javascript
const cardImage = new Image();
cardImage.src = '../../assets/img/cards/queen-of-hearts.gif';
document.body.appendChild(cardImage);
```

## Dice

6 standard six-sided dice face sprites.

**Location:** `assets/img/dice/`

**Files:** `1.gif`, `2.gif`, `3.gif`, `4.gif`, `5.gif`, `6.gif`

**Example:** How to load a die in your game:

```javascript
const diceImage = new Image();
diceImage.src = '../../assets/img/dice/4.gif';
document.body.appendChild(diceImage);
```

## Tips

- Use relative paths like `../../assets/img/` so your game works both locally and on GitHub Pages.
- You can also put your own images inside your project folder if you prefer to keep everything self-contained.
- Sprites are `.gif` files, which support transparency.
