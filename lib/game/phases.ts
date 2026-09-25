import { maxPointsAt, vectorShare } from "./Score";
import { CLUSTER_FIND, PHASE_TITLE } from "./phaseTitles";
import { CLUSTER, DEMO, ENCOUNTER, NOVA, SCORE, SHIELDS, STATION, VECTOR } from "./Tuning";
import type { Question, Round, RunSummary } from "./types";

/**
 * What each phase is and what it pays, in plain words.
 *
 * The one place the game explains itself. The briefing, the launch card, the
 * waypoint card and the cluster's read screen all read from here, so a player
 * is told the same thing before the run, at the start of it and between its
 * phases, and a retune of `SCORE` or `VECTOR` cannot leave any of them lying:
 * every figure below is computed, none is typed.
 *
 * The voice is written for someone who has never seen the game. No word of
 * the game's own (plasma, shield, boost) appears without, in the same
 * sentence, what it is, what it does for you and what it is worth. Answers
 * are "correct" or "wrong", never "right", because "right" is also a
 * direction on a row of squares. Every score figure says POINTS, because the
 * run also counts speed and distance and a bare +100 could be either.
 */

export interface ScoringRow {
  /** What happened, e.g. "2 FOUND" or "WITHIN 10%". */
  label: string;
  /** What it is worth, e.g. "60 POINTS" or "LOSE 25 POINTS AND A SHIELD". */
  worth: string;
  /** Colours the row: earned, nothing, or lost. */
  tone: "good" | "neutral" | "bad";
}

export interface PhaseGuide {
  type: Question["type"];
  /** The phase's name as the cards shout it: FIND THE 3, PICK ONE, ... */
  title: string;
  /** For the rulebook's opening table: what you do, in about ten words. */
  oneLiner: string;
  /**
   * The phase, the way you would text it to your mum: two or three short
   * lines, nothing she would have to ask about. This is all a phase card
   * shows until MORE DETAIL is tapped, so it has to be enough to play on.
   */
  rules: string[];
  /**
   * The finer print, behind MORE DETAIL and in full on the rulebook: the
   * clock, the shields, what a wrong answer really costs. Read by the few
   * who want it, never put in front of a player who has not asked.
   */
  details: string[];
  /** The scoring table, top row the best outcome, bottom row the worst. */
  scoring: ScoringRow[];
  /**
   * For the cluster's read screen: what its own shield does, in one breath.
   * Read from here so the HUD never carries a second wording of the rule.
   */
  readNote?: string;
  /**
   * A worked example the launch card plays in place of `rules`: a sample
   * question, a finger tapping through it, and a caption a step at a time.
   * Only FIND THE 3 has one so far.
   */
  demo?: PhaseDemo;
}

/** One beat of a phase demo: where the finger goes, and what the card says. */
export interface DemoStep {
  /** A square (0-based lane) or the BANK button; null leaves the finger resting. */
  target: number | "bank" | null;
  /** Whether the finger taps when it gets there, or only points. */
  tap: boolean;
  caption: string;
  /** Squares lit correct once this step has played. */
  got: number[];
  /** The square struck wrong, if any. */
  wrong: number | null;
  /** Points on the BANK button, not yet kept. */
  unbanked: number;
  /** The line under the squares, e.g. "CORRECT · 1 OF 3". */
  status: string;
  /** How long the step holds, tap included. */
  ms: number;
}

export interface DemoScene {
  /** The corner label: "PLAY IT SAFE", "PUSH YOUR LUCK". */
  label: string;
  steps: DemoStep[];
}

export interface PhaseDemo {
  prompt: string;
  options: string[];
  scenes: DemoScene[];
}

/** Points for a share of the base, as the tally would print them. */
function pts(share: number, base: number = SCORE.perEncounter): string {
  return `${Math.round(base * share)} POINTS`;
}

/** Points lost, as a thing that happens to you rather than a signed figure. */
function lose(points: number): string {
  return `LOSE ${Math.round(points)} POINTS`;
}

/** Points one step on the slider costs, at the base every question shares. */
function stepCost(): number {
  return Math.round(SCORE.perEncounter / VECTOR.zeroAt);
}

/**
 * GUESS THE NUMBER's table, one row per verdict, each quoting what that band
 * of steps is worth. Built from `VECTOR.verdicts` and the straight line in
 * `vectorShare`, so the card cannot disagree with what the run pays.
 */
function vectorRows(): ScoringRow[] {
  const rows: ScoringRow[] = [];
  let from = 0;
  for (const { within, label } of VECTOR.verdicts) {
    const best = Math.round(SCORE.perEncounter * vectorShare(from));
    const worst = Math.round(SCORE.perEncounter * vectorShare(within));
    const figure = best === worst ? `${best} POINTS` : `${worst} TO ${best} POINTS`;
    const graze = from > VECTOR.hitWithin;
    rows.push({
      label,
      worth: from === 0 ? `${figure} + SHIELD` : graze ? `${figure} · NO HARM` : figure,
      tone: graze ? "neutral" : "good",
    });
    from = within + 1;
  }
  rows.push({
    label: "WAY OFF",
    worth: `-${SCORE.penalty.collision} POINTS · SHIELD USED`,
    tone: "bad",
  });
  return rows;
}

const FULL_CHARGE = CLUSTER.chargeMultiplier.length - 1;
const LANES = CLUSTER.laneCount;

if (FULL_CHARGE !== CLUSTER_FIND) {
  throw new Error(
    `phaseTitles.CLUSTER_FIND is ${CLUSTER_FIND} but a cluster holds ${FULL_CHARGE} answers`,
  );
}

/** "2 questions", or nothing when the round is not to hand. */
function count(n: number | undefined, noun: string): string {
  if (n === undefined || n <= 0) return "";
  return `${n} ${noun}${n === 1 ? "" : "s"}. `;
}

/**
 * FIND THE 3, played once as an example: two scenes on a loop, one that banks
 * and one that pushes its luck into a wrong answer. Figures come from `SCORE`
 * like everything else here, so a retune cannot leave the example lying.
 */
function clusterDemo(n?: number): PhaseDemo {
  const found = (k: number) => Math.round(SCORE.perEncounter * (SCORE.clusterShare[k - 1] ?? 0));
  const one = found(1);
  const two = found(2);
  const beat = { tap: true, wrong: null, ms: DEMO.beatMs } as const;
  const lead = count(n, "question");
  return {
    prompt: "Which of these are fruits?",
    options: ["Apple", "Carrot", "Pear", "Potato", "Grape", "Onion"],
    scenes: [
      {
        label: "PLAY IT SAFE",
        steps: [
          {
            ...beat,
            target: null,
            tap: false,
            caption: `${lead}Each one has ${LANES} answers and ${FULL_CHARGE} of them are correct.`,
            got: [],
            unbanked: 0,
            status: `0 OF ${FULL_CHARGE} FOUND`,
            ms: DEMO.holdMs,
          },
          {
            ...beat,
            target: 0,
            caption: "Tap one you are sure of. A correct answer scores points.",
            got: [0],
            unbanked: one,
            status: `CORRECT · 1 OF ${FULL_CHARGE}`,
          },
          {
            ...beat,
            target: 2,
            caption: "Every correct answer you tap is worth more points.",
            got: [0, 2],
            unbanked: two,
            status: `CORRECT · 2 OF ${FULL_CHARGE}`,
          },
          {
            ...beat,
            target: "bank",
            tap: false,
            caption: `Now choose. Tap BANK to keep ${two} points, or keep going for more.`,
            got: [0, 2],
            unbanked: two,
            status: `CORRECT · 2 OF ${FULL_CHARGE}`,
            ms: DEMO.holdMs,
          },
          {
            ...beat,
            target: "bank",
            caption: `Banked. The ${two} points are yours to keep.`,
            got: [0, 2],
            unbanked: 0,
            status: `${two} POINTS KEPT`,
            ms: DEMO.endMs,
          },
        ],
      },
      {
        label: "PUSH YOUR LUCK",
        steps: [
          {
            ...beat,
            target: 1,
            tap: false,
            caption: `Same question, but this time you keep going for all ${FULL_CHARGE}.`,
            got: [0, 2],
            unbanked: two,
            status: `CORRECT · 2 OF ${FULL_CHARGE}`,
            ms: DEMO.holdMs,
          },
          {
            ...beat,
            target: 1,
            caption: "Tap a wrong one and you lose the points you did not bank.",
            got: [0, 2],
            wrong: 1,
            unbanked: 0,
            status: `WRONG · ${two} POINTS LOST`,
            ms: DEMO.holdMs,
          },
          {
            ...beat,
            target: null,
            tap: false,
            caption: "You can carry on after one wrong answer. Two wrong and the question is over.",
            got: [0, 2],
            wrong: 1,
            unbanked: 0,
            status: `WRONG · ${two} POINTS LOST`,
            ms: DEMO.endMs,
          },
        ],
      },
    ],
  };
}

const HINT_LINE = `Stuck? Tap HINT. You get ${NOVA.perRun} for the whole run, free. Each one takes away a wrong answer or gives you a clue, and adds ${NOVA.bonusSeconds} second${NOVA.bonusSeconds === 1 ? "" : "s"} to the clock.`;

function guides(n?: number): Record<Question["type"], PhaseGuide> {
  return {
    cluster: {
      type: "cluster",
      title: PHASE_TITLE.cluster,
      oneLiner: `${LANES} answers, ${FULL_CHARGE} are correct. Find them.`,
      rules: [
        `${count(n, "question")}Each one has ${LANES} answers and ${FULL_CHARGE} of them are correct.`,
        `Every correct answer you tap is worth more points. Tap BANK to keep them, or keep going for more.`,
        `Tap a wrong one and you lose what you have not banked. Two wrong and the question is over.`,
      ],
      details: [
        `Read the question, then tap READY. You get ${ENCOUNTER.thrustSeconds} seconds for each answer, ${ENCOUNTER.thrustSeconds + CLUSTER.firstPickBonusSeconds} for the first.`,
        `Correct answers collect plasma, which speeds your ship up. Each question comes with its own shield, which saves you from one wrong answer: you lose the plasma you have not banked but can keep going. You never lose points here.`,
        HINT_LINE,
      ],
      readNote: `One wrong answer is allowed. Two ends the question.`,
      demo: clusterDemo(n),
      scoring: [
        ...SCORE.clusterShare.map((share, index) => ({
          label: index + 1 === FULL_CHARGE ? `ALL ${FULL_CHARGE} FOUND` : `${index + 1} FOUND`,
          worth: pts(share),
          tone: "good" as const,
        })),
        { label: "FIRST WRONG", worth: "UNBANKED POINTS LOST", tone: "neutral" },
        {
          label: "SECOND WRONG",
          worth: `${SCORE.penalty.cluster} POINTS`,
          tone: "bad",
        },
      ],
    },
    vector: {
      type: "vector",
      title: PHASE_TITLE.vector,
      oneLiner: "Guess a number. The closer, the better.",
      rules: [
        `${count(n, "question")}The answer is always a number.`,
        "The slider starts in the middle. Slide it to where you think the answer is, then tap FIRE. The closer you are, the more points you get.",
      ],
      details: [
        `The slider has ${VECTOR.notches} steps. It starts in the middle, with that number showing. Slide it to your guess, then tap FIRE. Every step away from the answer costs ${stepCost()} points. Land within ${VECTOR.deadOnWithin} step${VECTOR.deadOnWithin === 1 ? "" : "s"} of it and you are dead on, which wins back a shield.`,
        `More than ${VECTOR.wildBeyond} steps away is way off: you lose ${SCORE.penalty.collision} points and a shield. You have ${SHIELDS.perRun} shields for the whole run, and each one saves you from a wrong answer. With none left, a miss costs more.`,
        HINT_LINE,
      ],
      scoring: vectorRows(),
    },
    mcq: {
      type: "mcq",
      title: PHASE_TITLE.mcq,
      oneLiner: "4 answers, 1 is correct. Boost doubles your points, but wrong loses points.",
      rules: [
        `${count(n, "question")}4 answers, and 1 is correct.`,
        "Really sure? Tap BOOST first for double points. But if you BOOST and get it wrong, you lose points.",
      ],
      details: [
        `You get ${ENCOUNTER.thrustSeconds + ENCOUNTER.mcqBonusSeconds} seconds. A correct answer scores ${pts(SCORE.laneShare).toLowerCase()}, or ${pts(1).toLowerCase()} with BOOST.`,
        `A wrong answer scores ${SCORE.penalty.lane} points and uses one of your ${SHIELDS.perRun} shields. Wrong with BOOST on loses ${SCORE.penalty.laneBoosted} points as well.`,
        HINT_LINE,
      ],
      scoring: [
        { label: "CORRECT + BOOST", worth: pts(1), tone: "good" },
        { label: "CORRECT", worth: pts(SCORE.laneShare), tone: "good" },
        { label: "WRONG", worth: `${SCORE.penalty.lane} POINTS · SHIELD USED`, tone: "neutral" },
        {
          label: "WRONG + BOOST",
          worth: lose(SCORE.penalty.laneBoosted),
          tone: "bad",
        },
      ],
    },
    earth: {
      type: "earth",
      title: PHASE_TITLE.earth,
      oneLiner: "Look at the satellite view. Name the city.",
      rules: [
        `${count(n, "place")}You get a satellite photo of somewhere on Earth. Type the name of the city, not the country. A few are a famous landmark or island instead, and the answer box says so.`,
        "Zoom in or out as much as you like, for free. Stuck? Get a hint. Each one costs a few points.",
      ],
      details: [
        `You have ${STATION.answerSeconds} seconds for each place, and the clock waits until the photo has loaded.`,
        `A correct answer with no help scores ${pts(1, SCORE.earthBase).toLowerCase()}. Each hint costs ${pts(SCORE.earthIntelCost, SCORE.earthBase).toLowerCase()}, so a correct answer with help still beats a wrong one. Zooming is free.`,
      ],
      scoring: [
        { label: "CORRECT", worth: pts(1, SCORE.earthBase), tone: "good" },
        {
          label: "EACH HINT",
          worth: `-${pts(SCORE.earthIntelCost, SCORE.earthBase)}`,
          tone: "neutral",
        },
        { label: "WRONG", worth: lose(SCORE.penalty.collision), tone: "bad" },
      ],
    },
  };
}

/**
 * A phase's guide. Hand it the round and the short rules open on how many
 * questions the phase holds ("2 questions."), counted rather than typed.
 */
export function phaseGuide(type: Question["type"], round?: Round): PhaseGuide {
  const n = round ? round.questions.filter((question) => question.type === type).length : undefined;
  return guides(n)[type];
}

/**
 * The streak, in plain sentences. A run of correct answers keeps the ship
 * fast; it no longer scales the score (every phase is worth the same), so
 * this is a speed line, not a points one. See `SCORE.streakMultipliers`.
 */
export function streakLine(): string {
  return "A streak of correct answers keeps your ship fast. One wrong answer resets it.";
}

/** The streak as a tiny table: what it does, and what ends it. */
export function streakRows(): ScoringRow[] {
  return [
    { label: "A STREAK", worth: "KEEPS YOU FAST", tone: "good" },
    { label: "A WRONG ANSWER", worth: "RESETS IT", tone: "bad" },
  ];
}

export interface StageMax {
  name: string;
  phase: number;
  /** First question's kind, which is the phase's game. */
  type: Question["type"];
  /** What a perfect run scores across this stage's questions. */
  max: number;
}

/**
 * What each stage of the round is worth to a perfect run, in order. The
 * welcome page's table, and the four numbers that add up to the quoted total.
 */
export function stageMaxima(round: Round): StageMax[] {
  const stages = round.stages ?? [];
  let from = 0;
  return stages.flatMap((stage, index) => {
    const first = round.questions[from];
    if (!first) return [];
    let max = 0;
    for (let i = from; i <= stage.after && i < round.questions.length; i += 1) {
      max += maxPointsAt(round.questions[i]!, i);
    }
    from = stage.after + 1;
    return [{ name: stage.name, phase: stage.phase ?? index + 1, type: first.type, max }];
  });
}

// ------------------------------------------------------------ transmissions

/** Who is talking, and the portrait that comes up on the panel with them. */
export interface Speaker {
  name: string;
  /** A sprite in `public`, square, drawn over the panel's dark ground. */
  portrait: string;
  width: number;
  height: number;
}

export interface Transmission {
  from: string;
  /** The face on the other end. Without one the panel is a voice alone. */
  speaker?: Speaker;
  lines: string[];
}

/**
 * Earth Command's voice has a face: the officer who calls the mayday in and
 * signs the debrief off is the same man both times, so the panel shows him
 * both times.
 */
const SOAP: Speaker = {
  name: "SERGEANT SOAP",
  portrait: "/sergeant-soap.png",
  width: 320,
  height: 320,
};

/** The mission, before each day's first run: why the ship is out here at all. */
export const MISSION_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "MAYDAY. MAYDAY. This is Earth Command.",
    "Earth is under invasion. We need your help.",
    "MISSION: Escape the asteroid field. Lose the alien ship on your tail. Reach Wikiplanet Station and find where they landed.",
    "Call in the sites and we send the reinforcements. Fly well, pilot. Earth Command out.",
  ],
};

/**
 * The standing order on the satellite feed, typed in when the station screen
 * opens. It is the only thing on screen while it arrives, so it carries the
 * task: a player who reads nothing else knows what the box under it is for.
 */
export const SITE_HAIL: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "Tell me which city is on the satellite image, so we can send reinforcements!",
  ],
};

/**
 * The ending, which Sergeant Soap calls in over the fleet before the tally
 * (see `endingFor`). The words and the picture land together: the win points
 * at the ships, a part win at the squadron, and a loss is a Mayday over the
 * invaders coming down.
 */
export const EARTH_SAVED_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "Earth Command to pilot. Both landing sites confirmed.",
    "Every ship we have is on its way. Look at them go.",
    "You saved Earth today. Same sky tomorrow.",
  ],
};

/** One site of two named: a squadron goes in, and the other site is still theirs. */
export const EARTH_HELD_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "Earth Command to pilot. One landing site confirmed.",
    "A squadron is on its way there. The other site is still dark.",
    "Same sky tomorrow, and we need you back.",
  ],
};

/** No site named: the invasion goes on, and Soap calls it in as a Mayday. */
export const EARTH_LOST_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "MAYDAY. MAYDAY. Earth Command to pilot.",
    "We could not confirm the landing sites. The invasion has not been stopped.",
    "We may have lost this battle, but not the war. Same sky tomorrow, pilot.",
  ],
};

/** How the run ends: sites named, what Soap says, and in what voice. */
export interface Ending {
  /** Landing sites named, which decides the fleet (`fleetFor`). */
  sites: number;
  script: Transmission;
  /** A loss is an incoming Mayday; anything else is a debrief. */
  kind: "incoming" | "debrief";
}

/**
 * Every run just flown ends on one: the fleet it earned, and Soap over it.
 * All sites named is the win; some is the squadron; none is the invasion.
 */
export function endingFor(round: Round, summary: RunSummary): Ending {
  let sites = 0;
  let named = 0;
  for (const [index, question] of round.questions.entries()) {
    if (question.type !== "earth") continue;
    sites += 1;
    if (summary.outcomes[index]?.correct) named += 1;
  }
  if (sites > 0 && named === sites) {
    return { sites: named, script: EARTH_SAVED_TRANSMISSION, kind: "debrief" };
  }
  if (named > 0) return { sites: named, script: EARTH_HELD_TRANSMISSION, kind: "debrief" };
  return { sites: 0, script: EARTH_LOST_TRANSMISSION, kind: "incoming" };
}
