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

## GUESS THE NUMBER: a ruler, and a range you would believe

The slider is a ruler of 100 steps, straight from `min` to `max`. The guess
and the answer are both read off it to the nearest step, and **the gap between
them is the score**: every step off costs 5 points, and more than 40 steps off
is a wild shot that costs 25 points and a shield. What the player sees is what
they are scored on. This is how Estimatle does it, and it plays well.

It used to be scored against the answer ("33% off"), which made a wide range
harder rather than more forgiving and made every year a free hit. That is
gone, and so is most of the old rulebook. What is left:

- **The range is the band of believable answers.** Both ends should be
  numbers a sensible person might actually say. Usually that means starting
  from 0: a CD's diameter on 0 to 200 mm, a waterfall on 0 to 2,000 m.
- **Where the answer sits is how forgiving it is.** On a ruler from 0, a guess
  of double the answer lands as many steps away as the answer's own position.
  At step 25, doubling it still scores 75 points. At step 60, doubling it is
  a wild shot. `npm run audit:rounds` prints both numbers.
- **The build checks two things.** Each step must be a round number (1, 2, 2.5
  or 5 times a power of ten), so the ruler reads 5.8, 6, 6.2 and never 5.88,
  6, 6.12. And the answer must sit between step 10 and step 90, so a guess
  in the middle is never a wild shot. The error message names a range that
  passes.
- **Small counts do not fit.** A 100-step ruler over 0 to 10 guitar strings
  reads "6.3 strings". A whole-number answer needs a ruler where one step is
  at least one of it, which in practice means an answer of 25 or more. Ask
  something bigger.
- **Dates are fine.** Set `"year": true` so 1913 never prints as 1,913, and
  give it a window that stops at the present: 1825 to 2025, not 1850 to 2050,
  because a ruler that runs into the future says the answer is not there.

**A route is the best kind of number question.** A route is one line of
working that gets someone close without knowing the answer, and it goes in
`route`, where the reveal shows it in place of the fact:

| route | example |
| --- | --- |
| Multiply what you know | Minutes in a week: 60 x 24 x 7 = 10,080 |
| Picture it and count | Piano keys: 7 octaves of 12, plus a few spare = 88 |
| Anchor and adjust | Laps in a 10,000 m race: a track is 400 m, so 25 |
| Pure logic | Handshakes between 10 people, once each: 10 x 9 / 2 = 45 |

The test for a route: write it in one line using only numbers a 12 year old
anywhere already knows. If you cannot, it is recall. Recall is allowed (the
scoring makes a rough idea worth plenty) but a route is better, because the
player who reasons their way close is the player the stage is for.

## The audience is the whole world

A question and its route may lean only on what a player anywhere carries: the
body, the clock, the calendar, everyday objects, world-famous places and
people. Nothing that only one country's players have an anchor for: a
national sport, a local stadium, a law, a census, a currency, a school
syllabus. A question that is easy in Melbourne and blind in Mumbai makes two
players' scores mean different things, and comparing scores is the game.

Units are metric and named in the prompt. A question whose best-known figure
is in another unit (the Moon's distance, which most people know as 239,000
miles) is out, because knowing it right is not enough.

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
