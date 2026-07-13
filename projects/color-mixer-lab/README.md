# Color Mixer Lab

Author: Lu

Color Mixer Lab is a five-level color mixing game. Players only get red,
yellow, blue, white, and brown, then try to mix the target color for each level.
Correct mixes move forward. Misses restart the same level.

The game models digital paint by averaging RGB values. Because screen colors are
only an approximation of real paint, a small RGB distance of 18 or less counts
as a match. A text closeness label and light/dark or warm/cool hint accompany
the swatches so progress does not depend on color perception alone. Feedback
waits for the player to choose Continue or Retry; there are no timed rounds.
The cup holds at most 60 drops—well above the longest nine-drop recipe—to keep
long play sessions bounded while leaving plenty of room to experiment.

## Original Prompt

> I want you to make me a game where you only get 5 colors, red, yellow, blue,
> white, and brown. The game gives me a color like light gold or pumpkin orange
> and I have to create that color with the 5 colors I have. If I make the right
> color I get to move on to the next level. If I don't make the right color I
> have to do that level again. There are 5 levels. Do you have any questions?
