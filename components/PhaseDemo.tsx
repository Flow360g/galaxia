"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  ClusterView,
  DemoScene,
  DemoStep,
  EarthView,
  McqView,
  PhaseDemo as Demo,
  VectorView,
} from "@/lib/game/phases";
import { DEMO, STATION } from "@/lib/game/Tuning";
import { prefersReducedMotion } from "./useTyped";
import styles from "./PhaseDemo.module.css";
import feed from "./StationFeed.module.css";

/**
 * A phase played once as an example, on its phase card, in place of a list of
 * rules: a sample question, a finger that taps through it, and a caption per
 * step. Testers skimmed three lines of rules and still did not know what BANK
 * was for; watching it pressed says it faster.
 *
 * Every step runs in the same order: the caption types in, fast, and only once
 * it has landed does the finger move and act. Captions that sat still while
 * the finger moved read as too quick to read and too slow to watch at once;
 * typing them first leads the eye from the words to the action.
 *
 * It is a picture, not a control. Spans, no pointer events, `aria-hidden`:
 * the card's own tap is still the only one it takes, and the card carries the
 * rules as text for screen readers. The scripts, figures and all, are `demo`
 * in `lib/game/phases.ts`; timings are `DEMO` in `Tuning.ts`.
 */
export function PhaseDemo({
  demo,
  compact = false,
  onSkip,
}: {
  demo: Demo;
  compact?: boolean;
  /** Skip the example and move straight on to play. No SKIP without it. */
  onSkip?: () => void;
}) {
  switch (demo.kind) {
    case "cluster":
      return (
        <DemoShell<ClusterView> scenes={demo.scenes} compact={compact} onSkip={onSkip}>
          {(view, reg, step) => <ClusterBoard demo={demo} view={view} reg={reg} step={step} />}
        </DemoShell>
      );
    case "vector":
      return (
        <DemoShell<VectorView> scenes={demo.scenes} compact={compact} onSkip={onSkip}>
          {(view, reg) => <VectorBoard demo={demo} view={view} reg={reg} />}
        </DemoShell>
      );
    case "mcq":
      return (
        <DemoShell<McqView> scenes={demo.scenes} compact={compact} onSkip={onSkip}>
          {(view, reg) => <McqBoard demo={demo} view={view} reg={reg} />}
        </DemoShell>
      );
    case "earth":
      return (
        <DemoShell<EarthView> scenes={demo.scenes} compact={compact} onSkip={onSkip}>
          {(view, reg) => <EarthBoard demo={demo} view={view} reg={reg} />}
        </DemoShell>
      );
  }
}

/** Registers a board element as a finger target under `key`. */
type Register = (key: string) => (el: HTMLElement | null) => void;

/** Where a step is: its caption typing, the finger gliding, dragging, or landed. */
type Phase = "typing" | "moving" | "dragging" | "done";

const HAND =
  "M18.84 15.87l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z";

function DemoShell<V>({
  scenes,
  compact,
  onSkip,
  children,
}: {
  scenes: DemoScene<V>[];
  compact: boolean;
  onSkip?: () => void;
  children: (view: V, reg: Register, step: DemoStep<V>) => ReactNode;
}) {
  const steps = useMemo(
    () => scenes.flatMap((scene) => scene.steps.map((step) => ({ step, label: scene.label }))),
    [scenes],
  );
  const [index, setIndex] = useState(0);
  // Both are stamped with the step they belong to, so a new step starts from
  // "typing" and no characters without an effect having to reset them.
  const [phaseAt, setPhaseAt] = useState<{ index: number; phase: Phase }>({ index: 0, phase: "typing" });
  const [typedAt, setTypedAt] = useState<{ index: number; chars: number }>({ index: 0, chars: 0 });
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const targets = useRef(new Map<string, HTMLElement>());
  const reg = useCallback<Register>(
    (key) => (el) => {
      if (el) targets.current.set(key, el);
      else targets.current.delete(key);
    },
    [],
  );

  const total = steps.length;
  const current = steps[index % total]!;
  const { step } = current;
  const phase = phaseAt.index === index ? phaseAt.phase : "typing";
  const chars = typedAt.index === index ? typedAt.chars : 0;

  // Keyed on primitives only: the card rebuilds the script on every render of
  // its parent, and a timer keyed on the objects would never fire.
  const { caption, action, hold } = step;
  const length = caption.length;
  useEffect(() => {
    const still = prefersReducedMotion();
    const typeMs = still ? 0 : DEMO.typeMs;
    const typed = length * typeMs;
    const moves = action === "none" ? 0 : action === "drag" ? 2 : 1;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    if (typeMs > 0) {
      for (let c = 1; c <= length; c++) at(c * typeMs, () => setTypedAt({ index, chars: c }));
    } else {
      at(0, () => setTypedAt({ index, chars: length }));
    }
    if (moves > 0) at(typed, () => setPhaseAt({ index, phase: "moving" }));
    if (moves > 1) at(typed + DEMO.moveMs, () => setPhaseAt({ index, phase: "dragging" }));
    const landed = typed + moves * DEMO.moveMs;
    at(landed, () => setPhaseAt({ index, phase: "done" }));
    // Then NEXT is up; if nobody taps it, the example moves on by itself.
    at(landed + hold, () => setIndex((i) => (i + 1) % total));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [index, length, action, hold, total]);

  const previous = steps[(index - 1 + total) % total]!.step;
  // The view changes when the finger does something: on a tap as it lands, on
  // a drag as the slide starts. Pointing and resting show the step's own view.
  const changes = action === "tap" ? phase === "done" : action === "drag" ? phase === "dragging" || phase === "done" : true;
  const shown = changes ? step.view : previous.view;

  // Until the caption has landed, the finger stays where the last step left it.
  const aim =
    phase === "typing"
      ? previous.target
      : action === "drag" && phase === "moving"
        ? (step.from ?? step.target)
        : step.target;
  // Hidden while a step with nothing to touch types in, and while the last
  // step rested; a loop starting over does not leave it on the old button.
  const away =
    step.target === null ||
    (phase === "typing" && (previous.target === null || previous.action === "none"));

  const place = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const f = frame.getBoundingClientRect();
    const [key, along] = (aim ?? "").split("@");
    const target = key ? targets.current.get(key) : undefined;
    if (!target) {
      // Resting: stay where the last tap left it, or wait under the board.
      setFinger((prev) => prev ?? { x: f.width * 0.5, y: f.height * 0.9 });
      return;
    }
    const t = target.getBoundingClientRect();
    const x = along === undefined ? t.left + t.width / 2 : t.left + t.width * Number(along);
    setFinger({ x: x - f.left, y: t.top - f.top + t.height * 0.6 });
  }, [aim]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  const tapped = action === "tap" && phase === "done";
  const typing = chars < length;
  // NEXT arrives once the step has played out, so it is never a way to skip
  // the words; the demo's own pace is the floor, the player sets the rest.
  const waiting = phase === "done";
  const last = index === total - 1;
  const next = useCallback(
    (event: React.MouseEvent) => {
      // The waypoint card moves the run on with a tap anywhere on it. This
      // tap is the demo's, never the card's.
      event.stopPropagation();
      setIndex((i) => (i + 1) % total);
    },
    [total],
  );

  return (
    <div
      className={`${styles.demo} ${compact ? styles.compact : ""}`}
      style={{ "--move": `${DEMO.moveMs}ms` } as CSSProperties}
      data-testid="phase-demo"
    >
      <p className={styles.caption} aria-hidden="true">
        {caption.slice(0, chars)}
        {typing ? <span className={styles.cursor} /> : null}
        {/* The rest of the line, invisible, holds the caption's height so the
            board under it does not jump as the words arrive. */}
        <span className={styles.ghost}>{caption.slice(chars)}</span>
      </p>
      <div className={styles.frame} ref={frameRef} aria-hidden="true">
        <span className={`${styles.label} arcade`}>
          EXAMPLE <span className={styles.labelScene}>· {current.label}</span>
        </span>
        {children(shown, reg, step)}
        {finger ? (
          <span
            className={`${styles.finger} ${away ? styles.fingerAway : ""} ${
              phase === "dragging" ? styles.fingerDrag : ""
            }`}
            style={{ transform: `translate(${finger.x}px, ${finger.y}px)` }}
          >
            <span key={`${index}-${tapped}`} className={`${styles.fingerBody} ${tapped ? styles.fingerTap : ""}`}>
              {tapped ? <span className={styles.ripple} /> : null}
              <svg viewBox="0 0 24 24" className={styles.hand}>
                <path d={HAND} />
              </svg>
            </span>
          </span>
        ) : null}
      </div>
      <div className={styles.controls}>
        {onSkip ? (
          <button
            type="button"
            className={`${styles.link} ${styles.skip} arcade`}
            onClick={(event) => {
              // Its own tap, then the card's move on: never both.
              event.stopPropagation();
              onSkip();
            }}
            data-testid="demo-skip"
          >
            SKIP
          </button>
        ) : null}
        <span className={styles.dots} aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === index ? styles.dotOn : ""}`} />
          ))}
        </span>
        <button
          type="button"
          className={`${styles.link} ${styles.next} ${waiting ? styles.nextUp : ""} arcade`}
          onClick={next}
          disabled={!waiting}
          tabIndex={waiting ? 0 : -1}
          aria-label={last ? "Watch the example again" : "Next step of the example"}
          data-testid="demo-next"
        >
          <span className={styles.nextLabel}>
            {last ? "AGAIN" : "NEXT"} <span aria-hidden="true">&rsaquo;</span>
            {/* Drains over the wait, so moving on by itself is never a surprise. */}
            {waiting ? (
              <span
                key={index}
                className={styles.nextClock}
                style={{ animationDuration: `${hold}ms` }}
              />
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}

type Of<K extends Demo["kind"]> = Extract<Demo, { kind: K }>;

function Status({ text, tone }: { text: string; tone: "good" | "bad" | "kept" | "plain" }) {
  return (
    <span key={text} className={`${styles.status} ${styles[tone]} arcade`}>
      {text}
    </span>
  );
}

function ClusterBoard({
  demo,
  view,
  reg,
  step,
}: {
  demo: Of<"cluster">;
  view: ClusterView;
  reg: Register;
  step: DemoStep<ClusterView>;
}) {
  const tone = view.wrong !== null ? "bad" : view.unbanked === 0 && view.got.length > 0 ? "kept" : "good";
  return (
    <>
      <p className={styles.prompt}>{demo.prompt}</p>
      <div className={styles.lanes}>
        {demo.options.map((option, lane) => (
          <span
            key={option}
            ref={reg(`lane:${lane}`)}
            className={`${styles.lane} ${view.got.includes(lane) ? styles.laneGot : ""} ${
              view.wrong === lane ? styles.laneWrong : ""
            }`}
          >
            <span className={`${styles.laneKey} arcade`}>{lane + 1}</span>
            <span className={styles.laneText}>{option}</span>
          </span>
        ))}
      </div>
      <div className={styles.foot}>
        <Status text={view.status} tone={tone} />
        <span
          ref={reg("bank")}
          className={`${styles.bank} ${view.unbanked > 0 ? styles.bankLive : ""} ${
            step.target === "bank" && step.action === "point" ? styles.bankCalled : ""
          }`}
        >
          <span className={styles.bankCap}>
            <span className={`${styles.bankLabel} arcade`}>BANK</span>
            {view.unbanked > 0 ? (
              <>
                <span className={`${styles.bankValue} arcade`}>+{view.unbanked}</span>
                <span className={`${styles.bankValue} arcade`}>PTS</span>
              </>
            ) : null}
          </span>
        </span>
      </div>
    </>
  );
}

function VectorBoard({ demo, view, reg }: { demo: Of<"vector">; view: VectorView; reg: Register }) {
  return (
    <>
      <p className={styles.prompt}>{demo.prompt}</p>
      <div className={styles.slider}>
        <span className={`${styles.sliderEnd} arcade`}>{demo.min}</span>
        <span className={styles.track} ref={reg("track")}>
          <span className={styles.thumb} style={{ left: `${view.guess * 100}%` }} />
          {view.fired ? (
            <span className={styles.answerMark} style={{ left: `${demo.answer * 100}%` }}>
              <span className={`${styles.answerLabel} arcade`}>ANSWER</span>
            </span>
          ) : null}
        </span>
        <span className={`${styles.sliderEnd} arcade`}>{demo.max}</span>
      </div>
      <div className={styles.foot}>
        <Status text={view.status} tone={view.fired ? "good" : "plain"} />
        <span ref={reg("fire")} className={`${styles.tool} ${styles.toolFire} arcade`}>
          FIRE
        </span>
      </div>
    </>
  );
}

function McqBoard({ demo, view, reg }: { demo: Of<"mcq">; view: McqView; reg: Register }) {
  const right = view.picked === demo.answer;
  return (
    <>
      <p className={styles.prompt}>{demo.prompt}</p>
      <div className={`${styles.lanes} ${styles.lanesFour}`}>
        {demo.options.map((option, lane) => (
          <span
            key={option}
            ref={reg(`lane:${lane}`)}
            className={`${styles.lane} ${view.picked === lane ? (right ? styles.laneGot : styles.laneWrong) : ""}`}
          >
            <span className={`${styles.laneKey} arcade`}>{lane + 1}</span>
            <span className={styles.laneText}>{option}</span>
          </span>
        ))}
      </div>
      {/* The verdict gets its own line: beside two tools it would wrap. */}
      <div className={`${styles.foot} ${styles.footTools}`}>
        <span className={styles.tools}>
          <span className={`${styles.tool} ${styles.toolHint} arcade`}>HINT</span>
          <span
            ref={reg("boost")}
            className={`${styles.tool} ${styles.toolBoost} ${view.boost ? styles.toolBoostOn : ""} arcade`}
          >
            BOOST
          </span>
        </span>
      </div>
      <span className={styles.statusLine}>
        <Status text={view.status} tone={view.picked === null ? "plain" : right ? "good" : "bad"} />
      </span>
    </>
  );
}

/** The zoom dial's picture scale, Out to In. */
const MAP_SCALE: Record<number, number> = { [-1]: 1, 0: 1.5, 1: 2.3 };

/**
 * NAME THE PLACE, drawn with the station feed's own classes for the zoom dial,
 * the hint button and the answer row, so what the example taps is exactly what
 * the player will tap. Only the photograph is drawn here: the demo fetches
 * nothing.
 */
function EarthBoard({ demo, view, reg }: { demo: Of<"earth">; view: EarthView; reg: Register }) {
  const left = demo.hintsTotal - view.hints;
  return (
    <>
      {/* The optic, as the station draws it: a round view with a ring of
          ticks and a crosshair over a drawn lagoon city. Only the ground is
          invented; the demo fetches nothing. */}
      <div className={styles.optic}>
        <div className={styles.opticView}>
          {/* Drawn wider than the view, water all round, so the circle is
              filled at every step of the dial and zooming out shows more sea
              rather than the edge of the picture. */}
          <svg
            viewBox="-60 -60 220 220"
            className={styles.map}
            style={{ transform: `scale(${MAP_SCALE[view.zoom] ?? 1})` }}
          >
            <rect x="-60" y="-60" width="220" height="220" fill="#0c2436" />
            <path d="M-60 118 C -20 104, 30 128, 70 116 S 140 96, 160 112 L 160 160 L -60 160 Z" fill="#0f2c42" />
            {/* The mainland, with its beaches picked out. */}
            <path
              d="M-60 -60 L 160 -60 L 160 8 C 132 2, 118 20, 104 14 C 90 8, 84 22, 70 20 C 52 18, 40 4, 22 10 C 4 16, -10 2, -30 8 C -44 12, -52 4, -60 6 Z"
              fill="#2f3d2c"
              stroke="#b9ad86"
              strokeWidth="1.2"
            />
            {/* The lagoon city on its islands. */}
            <path
              d="M18 38 C 30 26, 64 24, 80 34 C 92 42, 90 66, 78 74 C 64 84, 34 84, 22 72 C 12 62, 10 48, 18 38 Z"
              fill="#6e6a58"
              stroke="#b9ad86"
              strokeWidth="0.9"
            />
            <g fill="#8a856f">
              {[
                [26, 44], [34, 40], [42, 38], [50, 38], [58, 40], [66, 42], [74, 46],
                [24, 54], [32, 58], [40, 62], [62, 60], [70, 58], [78, 56],
                [28, 66], [36, 70], [44, 74], [52, 74], [60, 70], [68, 68],
              ].map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width="5" height="4" />
              ))}
            </g>
            <path d="M22 50 C 34 42, 44 64, 56 54 S 72 42, 84 50" fill="none" stroke="#0c2436" strokeWidth="2.6" />
            <path d="M36 44 L 40 76 M 60 42 L 56 76" stroke="#0c2436" strokeWidth="0.9" />
            {/* A causeway to the mainland, and green on the far shore. */}
            <path d="M80 36 L 104 16" stroke="#8a856f" strokeWidth="1.6" />
            <path d="M-20 -20 C 0 -34, 30 -24, 40 -40 L 80 -60 L -60 -60 Z" fill="#26341f" />
            <circle cx="120" cy="90" r="10" fill="#2f3d2c" stroke="#b9ad86" strokeWidth="0.8" />
          </svg>
        </div>
        <svg viewBox="0 0 100 100" className={styles.opticRing} aria-hidden="true">
          {/* The bezel, then the tick ring and the crosshair on the glass. */}
          <circle cx="50" cy="50" r="46.6" fill="none" stroke="#06101b" strokeWidth="2.2" />
          <circle cx="50" cy="50" r="47.8" fill="none" stroke="rgba(79,241,255,0.55)" strokeWidth="0.5" />
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const inner = i % 5 === 0 ? 41.5 : 43.5;
            return (
              <line
                key={i}
                x1={50 + Math.cos(a) * inner}
                y1={50 + Math.sin(a) * inner}
                x2={50 + Math.cos(a) * 45.4}
                y2={50 + Math.sin(a) * 45.4}
                stroke="rgba(79,241,255,0.85)"
                strokeWidth={i % 5 === 0 ? 0.9 : 0.45}
              />
            );
          })}
          <line x1="50" y1="6" x2="50" y2="94" stroke="rgba(79,241,255,0.3)" strokeWidth="0.3" />
          <line x1="6" y1="50" x2="94" y2="50" stroke="rgba(79,241,255,0.3)" strokeWidth="0.3" />
          <rect x="45" y="45" width="10" height="10" fill="none" stroke="rgba(79,241,255,0.75)" strokeWidth="0.5" />
        </svg>
        {/* The housing's corner brackets, as the station draws them. */}
        <span className={`${styles.bracket} ${styles.bracketTl}`} />
        <span className={`${styles.bracket} ${styles.bracketTr}`} />
        <span className={`${styles.bracket} ${styles.bracketBl}`} />
        <span className={`${styles.bracket} ${styles.bracketBr}`} />
      </div>
      <div className={feed.optics}>
        <span className={`${feed.opticsLabel} arcade`}>Zoom</span>
        <div className={feed.opticsDial}>
          {STATION.zoomSteps.map((value) => (
            <span
              key={value}
              ref={reg(`zoom:${value}`)}
              className={`${feed.opticsStep} ${view.zoom === value ? feed.opticsOn : ""} arcade`}
            >
              {value === -1 ? "Out" : value === 0 ? "Normal" : "In"}
            </span>
          ))}
        </div>
      </div>
      {view.hints > 0 ? (
        <p className={styles.hintLine}>{demo.hints.slice(0, view.hints).join(" ")}</p>
      ) : null}
      <span ref={reg("hint")} className={`${feed.intelButton} ${styles.still} arcade`}>
        <span className={feed.intelMain}>Get a hint</span>
        <span className={feed.intelSub}>
          {left} {left === 1 ? "hint" : "hints"} left &middot; {demo.hintCost} points each
        </span>
      </span>
      <div className={feed.typedRow}>
        <span ref={reg("input")} className={`${feed.input} ${styles.inputBox} ${view.typed ? styles.inputFilled : ""}`}>
          {view.typed || "Type the city here"}
        </span>
        <span ref={reg("send")} className={`${feed.submit} ${styles.sendBox} arcade`}>
          Send
        </span>
      </div>
      <span className={styles.statusLine}>
        <Status text={view.status} tone="good" />
      </span>
    </>
  );
}
