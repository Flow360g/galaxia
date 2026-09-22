# Writing questions for Astro Run

The daily round is the product. Eight questions, the same eight for
everybody, and a score people compare in a group chat. That only works if a
Tuesday is worth about what a Wednesday is worth, which means difficulty has
to be a thing the build can hold you to rather than a thing each question
happens to land on.

This file is the rubric. `lib/content/difficulty.ts` holds the numbers the
build enforces; everything here is the judgement the numbers cannot make.

Read `CLAUDE.md` first for the shape of a round and the plain-English copy
rules. This file only covers how hard a question is allowed to be.

## The one test

**Would most people get this, and would anyone be pleased to?**

A question fails if a ten year old gets it without reading the options, and it
fails if nobody in the room has a route to the answer. Both end the run the
same way: the player stops thinking. Everything below is that test, made
specific.

## The three levels

Every cluster, vector and PICK ONE declares `difficulty`: 1, 2 or 3. The
anchor is the share of adults who would get it right.

| level | gets it | what it is for |
| --- | --- | --- |
| **1** | 75 to 90% | a warm-up. Still needs the options read. |
| **2** | 45 to 75% | the spine of the game. Most questions are 2. |
| **3** | 20 to 45% | the one worth bragging about. |

Two rejects, and they matter more than the three levels:

- **Above 90% is trivial.** "Which of these are made from milk", answered by
  butter, yoghurt and cheese against honey, olive oil and vinegar. Nobody
  learns anything and the round has wasted a slot.
- **Below 20% is obscure.** The player does not feel beaten, they feel the
  game is unfair, and they do not come back tomorrow.

A question that is only hard because it is badly worded is not a 3. It is a
rewrite.

## The round profile

The build holds every authored day to this (`ROUND_PROFILE`):

- the six quiz difficulties **sum to 11, 12 or 13**
- **at most two** at level 1
- **at most two** at level 3
- **the opening question is never a 3**

`1,2,2,2,2,3` and `2,2,2,2,2,2` and `1,1,2,2,3,3` all pass. The counts are
there because a round can otherwise hit the sum by pairing a gift with an
obscurity, which is the swing the profile exists to stop, wearing a disguise.
The opener is capped because a hard first question ends the run before the
player is warm.

## FIND THE 3: the difficulty is in the decoys

Six options, three right. **The category is not what makes it hard, the three
wrong lanes are.** This is the rule that was broken most.

- Every wrong lane must be a plausible member of the category to somebody who
  half knows the subject. If a decoy comes from another universe, the question
  is trivial no matter how the prompt is worded.
- **Reject:** milk products against honey, olive oil and vinegar. The decoys
  are not even foods of the same kind.
- **Level 1:** a category everyone knows, decoys that are the right shape.
  Noble gases, with nitrogen, oxygen and hydrogen as the wrong lanes.
- **Level 3:** decoys that are near misses. US presidents, with Franklin,
  Hamilton and Burr in the wrong lanes: all founding-era, all on the money or
  in the musical, none of them president.
- All three right lanes must be **unarguably** right and all three wrong lanes
  unarguably wrong. One debatable lane ruins the encounter, and the player has
  five seconds and no way to argue.

## GUESS THE NUMBER: the slider is not a difficulty knob

The scoring bands are fractions of the **answer** and are the same for every
question: within 5% is a direct hit, within 10% is half, within 15% is a
graze that costs nothing. Nothing about closeness is ever authored.

What you do author is `min` and `max`, and that quietly decides everything.
The bands cover a share of the slider track, and that share is the real
difficulty. The pool once ran from 2.8% to 100%: the Sun's surface
temperature was unhittable even after a hint, and every date question was a
direct hit from any position at all.

So the build now checks three things, and the error message names the range to
use instead:

1. The close band covers **10% to 20% of the slider**.
2. The answer sits at least **20% in from either end**.
3. The slider does not open on the answer. It opens at the midpoint, so an
   answer parked in the middle scores for touching nothing.

Run `npm run audit:rounds` and it will print a compliant range for anything
that fails. In practice this means a linear slider spans **one to two times
the answer**, whatever the magnitude. Big numbers are completely fine: light
speed is a good vector at 50,000 to 400,000 km/s. It was a terrible one at
10,000 to 3,000,000.

**No dates.** A relative band needs a magnitude measured from a true zero, and
a calendar year has an arbitrary one: 5% of 2001 is a century. The build
rejects the shape by name so nobody "fixes" it by widening the range. Ask for
a duration or a count instead: how long the Berlin Wall stood, how many people
were aboard the Titanic.

Difficulty here is whether the player has an anchor to reason from.

- **Level 1:** a number most people have heard. A marathon is 42 km.
- **Level 2:** a number you can get close to by reasoning. How fast a
  passenger jet cruises.
- **Level 3:** a number you have to build up to. How deep an emperor penguin
  dives.

## PICK ONE: every distractor is a real temptation

Four options, one right.

- All three wrong options must be answers somebody would actually choose. Three
  obviously wrong names is a level 1 question wearing a level 2 prompt.
- **The hint narrows the field. It never names the answer.** "The only one of
  the four that is not played with a ball" is not a hint, it is the answer
  with an extra step. A good hint removes one or two options or gives a way to
  reason, and a player who reads it should still have to choose.
- A question whose answer is counterintuitive is a fine level 3 (the country
  with the most time zones is France). A question whose answer is a trick is
  not.

## WHERE ON EARTH

The two landing sites are not authored per round. They come from
`lib/content/sites.ts`, and each carries its own `tier`. The finale ramps: the
first site is drawn from easy or medium, the second from medium or hard, so
the run does not finish on two gifts or two walls.

Adding a site means judging its tier the same way as everything above: easy is
a place most people could name from one photograph, hard is one that needs the
intel bought and the optic used.

## Shelf life

**No question whose answer can change.** Records, "the most" of anything that
is still being counted, the tallest or fastest or newest. The pool carried
"which planet has the most known moons" with a hint that conceded the answer
only became true in 2023; the next survey makes the game wrong, and nobody is
watching for it.

Counts that are fixed by definition are fine: the number of bones in an adult
human body, the number of lines in a sonnet, the number of countries in
Africa.

## Spread the correct lane

Questions written in one sitting put the answer in the same place. Twelve in a
row once used the first square, and twenty-seven of thirty-four clusters used
lanes 1, 3 and 5. A player who notices stops reading the question.

`npm run audit:rounds` prints the spread. Check it after adding a batch rather
than trusting the order the questions were written in.

## No two questions ask the same thing

Checked across the whole pool at import, not per round, because a duplicate is
only visible with every round in hand. Rewording is not a fix: the check
normalises hard, and a question that survives it but asks the same thing in
other words is still a duplicate and the author has to spot it.

## Before you commit

```bash
npm run audit:rounds   # the spread, the geometry, the profile
npm run build          # a round that breaks a rule fails here
```
