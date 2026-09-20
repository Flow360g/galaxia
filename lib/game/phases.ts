import { maxPointsAt } from "./Score";
import { CLUSTER_FIND, PHASE_TITLE } from "./phaseTitles";
import { CLUSTER, NOVA, SCORE, VECTOR } from "./Tuning";
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
  /** For the welcome table: what you do, in about ten words. */
  oneLiner: string;
  /** Two or three short sentences on how it is played. */
  how: string[];
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

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const FULL_CHARGE = CLUSTER.chargeMultiplier.length - 1;
const LANES = CLUSTER.laneCount;

if (FULL_CHARGE !== CLUSTER_FIND) {
  throw new Error(
    `phaseTitles.CLUSTER_FIND is ${CLUSTER_FIND} but a cluster holds ${FULL_CHARGE} answers`,
  );
}

const GUIDES: Record<Question["type"], PhaseGuide> = {
  cluster: {
    type: "cluster",
    title: PHASE_TITLE.cluster,
    oneLiner: `${LANES} answers, ${FULL_CHARGE} are correct. Find them.`,
    how: [
      `Read the question, then tap READY. ${LANES} answers appear and ${FULL_CHARGE} of them are correct.`,
      `Tap an answer. If it is correct you collect plasma, which speeds your ship up and is worth points. Tap BANK to take the points you have, or keep going to find all ${FULL_CHARGE} and earn the most.`,
      `If you tap a wrong answer, your shield saves you: you lose the plasma you have banked, but you can keep going. A second wrong answer ends this question with ${SCORE.penalty.cluster} points. You never lose points on this question.`,
    ],
    readNote: `One wrong answer uses it up and you lose the plasma you have banked, but you can keep going. A second wrong answer ends this question with ${SCORE.penalty.cluster} points.`,
    scoring: [
      ...SCORE.clusterShare.map((share, index) => ({
        label: index + 1 === FULL_CHARGE ? `ALL ${FULL_CHARGE} FOUND` : `${index + 1} FOUND`,
        worth: pts(share),
        tone: "good" as const,
      })),
      { label: "FIRST WRONG", worth: "SHIELD USED · PLASMA LOST", tone: "neutral" },
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
    how: [
      "The answer is a number. Slide to your best guess, then tap FIRE.",
      `The closer you are, the more points you score. A guess that is way off costs you ${SCORE.penalty.collision} points and a shield.`,
    ],
    scoring: [
      {
        label: `WITHIN ${percent(VECTOR.bands.direct)}`,
        worth: `${pts(SCORE.vectorDirect)} + SHIELD`,
        tone: "good",
      },
      { label: `WITHIN ${percent(VECTOR.bands.close)}`, worth: pts(SCORE.vectorGlance), tone: "good" },
      {
        label: `WITHIN ${percent(VECTOR.bands.graze)}`,
        worth: "0 POINTS · NO HARM",
        tone: "neutral",
      },
      { label: "WAY OFF", worth: `-${SCORE.penalty.collision} POINTS · SHIELD USED`, tone: "bad" },
    ],
  },
  mcq: {
    type: "mcq",
    title: PHASE_TITLE.mcq,
    oneLiner: "4 answers, 1 is correct. Boost if you are sure.",
    how: [
      `4 answers, 1 is correct. Tap it. A correct answer scores ${pts(SCORE.laneShare).toLowerCase()}. A wrong answer scores ${SCORE.penalty.lane} points and uses a shield.`,
      `Sure of it? Tap BOOST before you answer to double the stakes: a correct answer scores ${pts(1).toLowerCase()}, a wrong one loses ${SCORE.penalty.laneBoosted} points.`,
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
    how: [
      "A satellite view of somewhere on Earth. Type the name of the city.",
      "Stuck? Zoom out or ask for a hint. Each one costs a few points, so a correct answer with no help scores the most.",
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

export function phaseGuide(type: Question["type"]): PhaseGuide {
  return GUIDES[type];
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

/** The hints, for the last briefing page: the free ones, and the ones that cost. */
export function hintRows(): ScoringRow[] {
  return [
    { label: "HINTS", worth: `${NOVA.perRun} FOR THE RUN`, tone: "good" },
    { label: "EACH HINT", worth: `+${NOVA.bonusSeconds} SEC ON THE CLOCK`, tone: "good" },
    {
      label: `${PHASE_TITLE.earth} HINT`,
      worth: `-${pts(SCORE.earthIntelCost, SCORE.earthBase)}`,
      tone: "neutral",
    },
    {
      label: `${PHASE_TITLE.earth} ZOOM`,
      worth: `-${pts(SCORE.earthOpticsCost, SCORE.earthBase)}`,
      tone: "neutral",
    },
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

export interface Transmission {
  from: string;
  lines: string[];
}

/** The mission, before the first flight: why the ship is out here at all. */
export const MISSION_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
  lines: [
    "MAYDAY. MAYDAY. This is Earth Command.",
    "Earth is under invasion. We need your help.",
    "MISSION: Escape the asteroid field. Lose the alien ship on your tail. Reach Wikiplanet Station and find where they landed.",
    "Call in the sites and we send the reinforcements. Fly well, pilot. Earth Command out.",
  ],
};

/** The debrief, after a run that named every landing site. */
export const EARTH_SAVED_TRANSMISSION: Transmission = {
  from: "EARTH COMMAND",
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
