import { maxPointsAt } from "./Score";
import { CLUSTER, ENCOUNTER, NOVA, SCORE, SHIELDS, VECTOR } from "./Tuning";
import type { Question, Round, RunSummary } from "./types";

/**
 * What each phase is and what it pays, in plain words.
 *
 * The one place the game explains itself. The briefing, the launch card and
 * the waypoint card all read from here, so a player is told the same thing
 * before the run, at the start of it and between its phases, and a retune
 * of `SCORE` or `VECTOR` cannot leave any of them lying: every figure below
 * is computed, none is typed.
 *
 * The voice is a 12 year old's reading level on purpose. A scoring system a
 * player cannot repeat to a friend is a scoring system nobody argues about
 * in the group chat, and the argument is the product.
 */

export interface ScoringRow {
  /** What happened, e.g. "2 PLASMA" or "WITHIN 10%". */
  label: string;
  /** What it is worth, e.g. "60" or "-25 AND A SHIELD". */
  worth: string;
  /** Colours the row: earned, nothing, or lost. */
  tone: "good" | "neutral" | "bad";
}

export interface PhaseGuide {
  type: Question["type"];
  /** The phase's name as the cards shout it: CLUSTER, VECTOR, ... */
  title: string;
  /** For the welcome table: what you do, in about ten words. */
  oneLiner: string;
  /** Two or three short sentences on how it is played. */
  how: string[];
  /** The scoring table, top row the best outcome, bottom row the worst. */
  scoring: ScoringRow[];
}

/** Points for a share of the base, as the tally would print them. */
function pts(share: number, base: number = SCORE.perEncounter): string {
  return String(Math.round(base * share));
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const FULL_CHARGE = CLUSTER.chargeMultiplier.length - 1;
const LANES = CLUSTER.laneCount;

const GUIDES: Record<Question["type"], PhaseGuide> = {
  cluster: {
    type: "cluster",
    title: "CLUSTER",
    oneLiner: `${LANES} answers, ${FULL_CHARGE} are right. Find them.`,
    how: [
      `Read the question, then tap READY. ${LANES} answers come up and ${FULL_CHARGE} of them are right. Tap one and the ship flies that lane.`,
      "Every right pick banks one plasma. Press BANK to cash in what you have, or pick again for more.",
      `You have ${CLUSTER.shields} shield${CLUSTER.shields === 1 ? "" : "s"} per cluster. A wrong lane costs it and you keep your plasma. With no shield left, a wrong lane loses the cluster for zero points. You never lose points here.`,
    ],
    scoring: [
      ...SCORE.clusterShare.map((share, index) => ({
        label: `${index + 1} PLASMA`,
        worth: pts(share),
        tone: "good" as const,
      })),
      { label: "WRONG LANE", worth: "-1 SHIELD · PLASMA KEPT", tone: "neutral" },
      { label: "NO SHIELD LEFT", worth: `${SCORE.penalty.cluster} · PLASMA LOST`, tone: "bad" },
    ],
  },
  vector: {
    type: "vector",
    title: "VECTOR",
    oneLiner: "Every question is a number. Get close.",
    how: [
      "Every question is a number. Slide the scout onto your answer and fire.",
      "The closer you are, the more you score. A wild shot and the scout fires back.",
    ],
    scoring: [
      {
        label: `WITHIN ${percent(VECTOR.bands.direct)}`,
        worth: `${pts(SCORE.vectorDirect)} + SHIELD BACK`,
        tone: "good",
      },
      { label: `WITHIN ${percent(VECTOR.bands.close)}`, worth: pts(SCORE.vectorGlance), tone: "good" },
      { label: `WITHIN ${percent(VECTOR.bands.graze)}`, worth: "0 · NO DAMAGE", tone: "neutral" },
      { label: "FURTHER OUT", worth: `-${SCORE.penalty.collision} AND A SHIELD`, tone: "bad" },
    ],
  },
  mcq: {
    type: "mcq",
    title: "GENERAL KNOWLEDGE",
    oneLiner: "Four answers, one right. Boost if you are sure.",
    how: [
      "Four answers, one right. Tap it. A wrong answer scores nothing and costs a shield.",
      `Sure of it? Press BOOST before you answer. A right answer is then worth double, and a wrong one costs ${SCORE.penalty.laneBoosted} points.`,
    ],
    scoring: [
      { label: "RIGHT WITH BOOST", worth: pts(1), tone: "good" },
      { label: "RIGHT", worth: pts(SCORE.laneShare), tone: "good" },
      { label: "WRONG", worth: `${SCORE.penalty.lane} AND A SHIELD`, tone: "neutral" },
      { label: "WRONG WITH BOOST", worth: `-${SCORE.penalty.laneBoosted} AND A SHIELD`, tone: "bad" },
    ],
  },
  earth: {
    type: "earth",
    title: "WHERE ON EARTH",
    oneLiner: "Read the satellite feed. Name the place.",
    how: [
      "Dock at the station and open the satellite feed. Somewhere on Earth is on screen: name it.",
      "Stuck? Tap GET INTEL for a hint, or ZOOM the feed in and out. Each one costs a few points.",
    ],
    scoring: [
      { label: "RIGHT", worth: pts(1, SCORE.earthBase), tone: "good" },
      {
        label: "EACH INTEL DROP",
        worth: `-${pts(SCORE.earthIntelCost, SCORE.earthBase)}`,
        tone: "neutral",
      },
      {
        label: "EACH ZOOM STEP",
        worth: `-${pts(SCORE.earthOpticsCost, SCORE.earthBase)}`,
        tone: "neutral",
      },
      { label: "WRONG", worth: `-${SCORE.penalty.collision}`, tone: "bad" },
    ],
  },
};

export function phaseGuide(type: Question["type"]): PhaseGuide {
  return GUIDES[type];
}

/**
 * The streak, in one sentence: at which run of right answers the multiplier
 * steps up. Read off `SCORE.streakMultipliers`, so "2 in a row doubles" is
 * true for as long as the table says so.
 */
export function streakLine(): string {
  const steps: string[] = [];
  let seen = 1;
  SCORE.streakMultipliers.forEach((multiplier, streak) => {
    if (multiplier <= seen) return;
    seen = multiplier;
    const word = multiplier === 2 ? "doubles" : multiplier === 3 ? "triples" : `x${multiplier}`;
    steps.push(`${streak} right in a row ${word} your points`);
  });
  const run = steps.length ? `${steps.join(", ")}.` : "";
  return `${run} A wrong answer resets it.`.trim();
}

/** The multiplier steps as a tiny table: "2 IN A ROW" / "x2". */
export function streakRows(): ScoringRow[] {
  const rows: ScoringRow[] = [];
  let seen = 1;
  SCORE.streakMultipliers.forEach((multiplier, streak) => {
    if (multiplier <= seen) return;
    seen = multiplier;
    rows.push({ label: `${streak} IN A ROW`, worth: `x${multiplier}`, tone: "good" });
  });
  rows.push({ label: "A WRONG ANSWER", worth: "BACK TO x1", tone: "bad" });
  return rows;
}

/** The kit, for the last briefing page. */
export function kitRows(): ScoringRow[] {
  return [
    { label: "SHIELDS", worth: `x${SHIELDS.perRun}`, tone: "good" },
    { label: "PER CLUSTER", worth: `+${CLUSTER.shields} SHIELD`, tone: "good" },
    { label: "NOVA", worth: `x${NOVA.perRun} · +${NOVA.bonusSeconds}S EACH`, tone: "good" },
    { label: "THE CLOCK", worth: `${ENCOUNTER.thrustSeconds} SECONDS`, tone: "neutral" },
    { label: "NO SHIELDS LEFT", worth: "A HIT LANDS DOUBLE", tone: "bad" },
  ];
}

export interface StageMax {
  name: string;
  phase: number;
  /** First encounter's kind, which is the phase's game. */
  type: Question["type"];
  /** What a perfect run scores across this stage's encounters. */
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
    "MISSION: Escape the asteroid field. Shake the scout on your tail. Reach Wikiplanet Station and find where they landed.",
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

/** Every WHERE ON EARTH site was named, and there was at least one. */
export function earthSaved(round: Round, summary: RunSummary): boolean {
  let sites = 0;
  for (const [index, question] of round.questions.entries()) {
    if (question.type !== "earth") continue;
    sites += 1;
    if (!summary.outcomes[index]?.correct) return false;
  }
  return sites > 0;
}
