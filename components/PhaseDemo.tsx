"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DemoStep, PhaseDemo as Demo } from "@/lib/game/phases";
import { DEMO } from "@/lib/game/Tuning";
import styles from "./PhaseDemo.module.css";

/**
 * A phase played once as an example, on the launch card, in place of a list
 * of rules: a sample question, a finger that glides to a square or the BANK
 * button and taps it, and one caption at a time saying what just happened.
 * Testers skimmed three lines of rules and still did not know what BANK was
 * for; watching it pressed says it faster.
 *
 * It is a picture, not a control. Spans, no pointer events, `aria-hidden`:
 * the card's READY is still the only thing that takes a tap, and the card
 * carries the rules as text for screen readers. The script, figures and all,
 * is `demo` in `lib/game/phases.ts`; timings are `DEMO` in `Tuning.ts`.
 */
export function PhaseDemo({ demo }: { demo: Demo }) {
  const steps = useMemo(
    () => demo.scenes.flatMap((scene) => scene.steps.map((step) => ({ step, label: scene.label }))),
    [demo],
  );
  const [index, setIndex] = useState(0);
  // The step whose tap has landed; any other step is still gliding.
  const [tappedAt, setTappedAt] = useState<number | null>(null);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bankRef = useRef<HTMLSpanElement>(null);

  const current = steps[index]!;
  const { step } = current;
  const tapped = tappedAt === index;

  // Advance on the step's own clock; the tap lands after the glide.
  // Keyed on primitives only: the card rebuilds the script on every render
  // of its parent, and a timer keyed on the object would never fire.
  const { ms, tap } = step;
  const total = steps.length;
  useEffect(() => {
    const timers = [window.setTimeout(() => setIndex((i) => (i + 1) % total), ms)];
    if (tap) timers.push(window.setTimeout(() => setTappedAt(index), DEMO.moveMs));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [index, ms, tap, total]);

  // Until the tap lands, the scene still shows the step before it.
  const shown: DemoStep = step.tap && !tapped ? (steps[index - 1]?.step ?? step) : step;

  const place = useCallback(() => {
    const frame = frameRef.current;
    const target = step.target === "bank" ? bankRef.current : step.target === null ? null : laneRefs.current[step.target];
    if (!frame) return;
    const f = frame.getBoundingClientRect();
    // Resting: stay where the last tap left it, or wait under the row.
    if (!target) {
      setFinger((prev) => prev ?? { x: f.width * 0.5, y: f.height * 0.9 });
      return;
    }
    const t = target.getBoundingClientRect();
    setFinger({ x: t.left - f.left + t.width / 2, y: t.top - f.top + t.height * 0.6 });
  }, [step.target]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  const tone = shown.wrong !== null ? styles.bad : shown.unbanked === 0 && shown.got.length > 0 ? styles.kept : styles.good;

  return (
    <div className={styles.demo} data-testid="phase-demo" aria-hidden="true">
      <div className={styles.frame} ref={frameRef}>
        <span className={`${styles.label} arcade`}>
          EXAMPLE <span className={styles.labelScene}>· {current.label}</span>
        </span>
        <p className={styles.prompt}>{demo.prompt}</p>
        <div className={styles.lanes}>
          {demo.options.map((option, lane) => (
            <span
              key={option}
              ref={(el) => {
                laneRefs.current[lane] = el;
              }}
              className={`${styles.lane} ${shown.got.includes(lane) ? styles.laneGot : ""} ${
                shown.wrong === lane ? styles.laneWrong : ""
              }`}
            >
              <span className={`${styles.laneKey} arcade`}>{lane + 1}</span>
              <span className={styles.laneText}>{option}</span>
            </span>
          ))}
        </div>
        <div className={styles.foot}>
          <span key={shown.status} className={`${styles.status} ${tone} arcade`}>
            {shown.status}
          </span>
          <span
            ref={bankRef}
            className={`${styles.bank} ${shown.unbanked > 0 ? styles.bankLive : ""} ${
              step.target === "bank" && !step.tap ? styles.bankCalled : ""
            }`}
          >
            <span className={styles.bankCap}>
              <span className={`${styles.bankLabel} arcade`}>BANK</span>
              {shown.unbanked > 0 ? (
                <>
                  <span className={`${styles.bankValue} arcade`}>+{shown.unbanked}</span>
                  <span className={`${styles.bankValue} arcade`}>PTS</span>
                </>
              ) : null}
            </span>
          </span>
        </div>
        {finger ? (
          <span
            className={`${styles.finger} ${step.target === null ? styles.fingerAway : ""}`}
            style={{ transform: `translate(${finger.x}px, ${finger.y}px)` }}
          >
            <span key={`${index}-${tapped}`} className={`${styles.fingerBody} ${tapped ? styles.fingerTap : ""}`}>
              {tapped ? <span className={styles.ripple} /> : null}
              <svg viewBox="0 0 24 24" className={styles.hand}>
                <path d="M18.84 15.87l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z" />
              </svg>
            </span>
          </span>
        ) : null}
      </div>
      <p key={index} className={styles.caption}>
        {step.caption}
      </p>
      <span className={styles.dots}>
        {steps.map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === index ? styles.dotOn : ""}`} />
        ))}
      </span>
    </div>
  );
}
