import { maxPointsAt, vectorShare } from "./Score";
import { CLUSTER_FIND, PHASE_TITLE } from "./phaseTitles";
import { CLUSTER, ENCOUNTER, NOVA, SCORE, SHIELDS, STATION, VECTOR } from "./Tuning";
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
        "Tap the slider where you think the answer is, then tap FIRE. The closer you are, the more points you get.",
      ],
      details: [
        `The slider has ${VECTOR.notches} steps. Tap it to put your guess on it, then tap FIRE. Every step away from the answer costs ${stepCost()} points. Land within ${VECTOR.deadOnWithin} step${VECTOR.deadOnWithin === 1 ? "" : "s"} of it and you are dead on, which wins back a shield.`,
        `More than ${VECTOR.wildBeyond} steps away is way off: you lose ${SCORE.penalty.collision} points and a shield. You have ${SHIELDS.perRun} shields for the whole run, and each one saves you from a wrong answer. With none left, a miss costs more.`,
        HINT_LINE,
      ],
      scoring: vectorRows(),
    },
    mcq: {
      type: "mcq",
      title: PHASE_TITLE.mcq,
      oneLiner: "4 answers, 1 is correct. Boost if you are sure.",
      rules: [
        `${count(n, "question")}4 answers, and 1 is correct.`,
        "Really sure? Tap BOOST first for double points. Wrong with BOOST on and you lose points.",
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
        "Stuck? Get a hint or zoom out. Each one costs a few points.",
      ],
      details: [
        `You have ${STATION.answerSeconds} seconds for each place, and the clock waits until the photo has loaded.`,
        `A correct answer with no help scores ${pts(1, SCORE.earthBase).toLowerCase()}. Each hint costs ${pts(SCORE.earthIntelCost, SCORE.earthBase).toLowerCase()} and each zoom ${pts(SCORE.earthOpticsCost, SCORE.earthBase).toLowerCase()}, so a correct answer with help still beats a wrong one.`,
      ],
      scoring: [
        { label: "CORRECT", worth: pts(1, SCORE.earthBase), tone: "good" },
        {
          label: "EACH HINT",
          worth: `-${pts(SCORE.earthIntelCost, SCORE.earthBase)}`,
          tone: "neutral",
        },
        {
          label: "EACH ZOOM",
          worth: `-${pts(SCORE.earthOpticsCost, SCORE.earthBase)}`,
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

/** The mission, before the first flight: why the ship is out here at all. */
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
    "Tell me which city is on the satellite image. The name of the city, not just the country, so we can send reinforcements!",
  ],
};

/** The debrief, after a run that named every landing site. */
export const EARTH_SAVED_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  speaker: SOAP,
  lines: [
    "Earth Command to pilot. Landing sites confirmed.",
    "Reinforcements are inbound.",
    "You saved Earth today. Same sky tomorrow.",
  ],
};

/** Every NAME THE PLACE site was named, and there was at least one. */
export function earthSaved(round: Round, summary: RunSummary): boolean {
  let sites = 0;
  for (const [index, question] of round.questions.entries()) {
    if (question.type !== "earth") continue;
    sites += 1;
    if (!summary.outcomes[index]?.correct) return false;
  }
  return sites > 0;
}
