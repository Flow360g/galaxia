/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampTile,
  commonsUrl,
  earthLadder,
  latToTile,
  lonToTile,
  MAX_ZOOM,
  TILE,
  tileUrl,
  WINDOW,
  wrapTile,
  type EarthRung,
} from "@/lib/game/feed";
import { SCORE, STATION } from "@/lib/game/Tuning";
import type { EarthQuestion, EarthShot, GameState } from "@/lib/game/types";
import styles from "./StationFeed.module.css";

interface Props {
  question: EarthQuestion;
  state: GameState;
  onFeedReady: () => void;
  onBuyIntel: () => void;
  onOptics: (step: number) => void;
  onSubmit: (text: string) => void;
  onNext: () => void;
  /** Whether another site follows this one, for the continue button's wording. */
  more: boolean;
}

/**
 * The satellite feed: WHERE ON EARTH, played.
 *
 * An instrument, not a picture box. The square is the housing and the circle
 * inside it is the aperture; the aperture's diameter is the housing's width, so
 * the ground covered across the widest axis is exactly the site's authored
 * framing and only the corners are given up to the bezel. That matters, because
 * each site's zoom is chosen so its giveaway fits.
 *
 * Nothing here may narrow the site down by accident. There are no coordinates
 * on the readouts, and a Commons filename is never rendered: "A street in
 * Cairo" and "Barcelona - Casa Mila" both name the answer, so only the
 * hand-written description is shown and the file goes in the URL.
 */
export function StationFeed({
  question,
  state,
  onFeedReady,
  onBuyIntel,
  onOptics,
  onSubmit,
  onNext,
  more,
}: Props) {
  const [typed, setTyped] = useState("");
  const ladder = useMemo(() => earthLadder(question), [question]);
  const shown = useMemo<Set<EarthRung>>(
    () => new Set(ladder.slice(0, state.earthIntel)),
    [ladder, state.earthIntel],
  );
  const [optics, setOptics] = useState(0);
  const outcome = state.outcome;
  const revealed = state.awaitingTap && outcome !== null;

  /**
   * Intel and the verdict both land at the bottom of the stack, which on a
   * phone is off the bottom of the scroll region. Bring it into view: the
   * player just spent points on it, so leaving it unseen is the same bug as
   * not being able to reach the input.
   *
   * The landmark is the one rung that lands on the map instead, so that
   * purchase scrolls back UP to the optic: scrolled down to its text line, the
   * pin dropped out of sight and a tester never saw it.
   */
  const scroll = useRef<HTMLDivElement>(null);
  const bought = ladder[state.earthIntel - 1];
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const top = !revealed && bought === "landmark" ? 0 : node.scrollHeight;
    node.scrollTo({ top, behavior: "smooth" });
  }, [state.earthIntel, revealed, bought]);

  // Per-site state is reset by keying this component on the question id in the
  // parent, which is cheaper and clearer than clearing it in an effect.

  const zoom = clampTile(Math.round(question.zoom + optics), 2, MAX_ZOOM);
  const remaining = state.feedSeconds;
  const left = Math.max(0, ladder.length - state.earthIntel);

  const pickOptics = useCallback(
    (next: number) => {
      setOptics(next);
      onOptics(next);
    },
    [onOptics],
  );

  return (
    <div className={styles.feed}>
      <div className={styles.clockRow}>
        <div className={styles.clockTrack}>
          <div
            className={styles.clockFill}
            style={{
              width: `${(remaining / STATION.answerSeconds) * 100}%`,
              background: remaining < STATION.answerSeconds * 0.25 ? "#ff6b5c" : "#4ff1ff",
            }}
          />
        </div>
        <span className={`${styles.clockValue} mono`} data-testid="feed-clock">
          {remaining.toFixed(1)}
        </span>
      </div>

      <div className={styles.scroll} ref={scroll} data-testid="feed-scroll">
        <Optic question={question} zoom={zoom} pin={shown.has("landmark")} onReady={onFeedReady} />

        {!state.feedReady ? (
          <p className={`${styles.acquiring} arcade`}>Acquiring feed</p>
        ) : null}

        {!revealed ? (
          <div className={styles.optics}>
            <span className={`${styles.opticsLabel} arcade`}>Zoom</span>
            <div className={styles.opticsDial}>
              {[-1, 0, 1].map((value) => {
                const free = value === 0 || state.earthOptics.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.opticsStep} ${optics === value ? styles.opticsOn : ""} arcade`}
                    disabled={!state.feedReady}
                    onClick={() => pickOptics(value)}
                    data-testid="zoom-step"
                  >
                    {value === -1 ? "Wider" : value === 0 ? "Standard" : "Closer"}
                    {free ? null : (
                      <span className={styles.opticsCost}>
                        -{Math.round(SCORE.earthBase * SCORE.earthOpticsCost)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className={styles.intel}>
          <p className={styles.opener}>{question.opener}</p>
          {shown.has("clue") ? <p className={styles.line}>{question.clue}</p> : null}
          {shown.has("street") && question.street ? (
            <Ground shot={question.street} label="Ground probe" caption={STREET_CAPTION} />
          ) : null}
          {shown.has("landmark") && question.landmark ? (
            <p className={`${styles.line} ${styles.cyan}`}>
              <span className="arcade">Landmark</span> {question.landmark.name}, pinned in frame.
            </p>
          ) : null}
          {shown.has("structure") && question.structure && question.landmark ? (
            <Ground shot={question.structure} label="Structure" caption={question.landmark.name} />
          ) : null}
          {shown.has("territory") ? (
            <p className={styles.line}>
              Territory: {question.country}. Designation begins with {question.name.charAt(0)}.
            </p>
          ) : null}
        </div>

        {revealed ? (
          <div className={styles.reveal}>
            <p className={`${styles.verdict} arcade ${outcome.correct ? styles.cyan : styles.red}`}>
              {outcome.correct
                ? "Site identified"
                : outcome.timedOut
                  ? "Signal lost"
                  : "Wrong coordinates"}
            </p>
            <p className={`${styles.answer} arcade`}>
              {question.name}, {question.country}
            </p>
            <p className={`${styles.gained} mono`}>
              {(outcome.points ?? 0) >= 0 ? "+" : ""}
              {outcome.points ?? 0} &middot; {state.earthIntel} intel &middot;{" "}
              {state.earthOptics.length} optics
            </p>
            {question.fact ? <p className={styles.fact}>{question.fact}</p> : null}
          </div>
        ) : null}
      </div>

      {/* Outside the scroll region, so the one control the player has to reach
          is the one control that cannot be scrolled away from. */}
      <div className={styles.controls}>
        {revealed ? (
          <button type="button" className={`${styles.next} arcade`} onClick={onNext} data-testid="next-site">
            {more ? "Next site" : "Call the fleet"}
          </button>
        ) : (
          <>
            {left > 0 ? (
              <button
                type="button"
                className={`${styles.intelButton} arcade`}
                disabled={!state.feedReady}
                onClick={onBuyIntel}
                data-testid="request-intel"
              >
                <span className={styles.intelMain}>Get intel</span>
                <span className={styles.intelSub}>
                  {left} {left === 1 ? "hint" : "hints"} left &middot;{" "}
                  {Math.round(SCORE.earthBase * SCORE.earthIntelCost)} pts each
                </span>
              </button>
            ) : (
              <p className={`${styles.spent} arcade`}>All intel used</p>
            )}

            <form
              className={styles.typedRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (!state.feedReady) return;
                onSubmit(typed);
              }}
            >
              <input
                id="station-answer"
                className={styles.input}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Name the city"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={!state.feedReady}
                data-testid="site-answer"
              />
              <button
                type="submit"
                className={`${styles.submit} arcade`}
                disabled={!state.feedReady}
                data-testid="site-submit"
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Fixed: per-site wording would risk naming the place. */
const STREET_CAPTION = "An ordinary street. Read the signage, the traffic, the build.";

function Ground({ shot, label, caption }: { shot: EarthShot; label: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className={styles.muted}>{label} unavailable. The clue stands without it.</p>;
  return (
    <figure className={styles.ground}>
      <span className={`${styles.groundLabel} arcade`}>{label}</span>
      <img
        className={styles.groundImg}
        src={commonsUrl(shot.file, 640)}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
      <figcaption className={styles.groundCap}>
        {caption}
        <span className={styles.groundCredit}>
          {shot.credit} &middot; {shot.licence} &middot; Wikimedia Commons
        </span>
      </figcaption>
    </figure>
  );
}

/** The aperture: a 3x3 mosaic under a circular crop, plus the instrument chrome. */
function Optic({
  question,
  zoom,
  pin,
  onReady,
}: {
  question: EarthQuestion;
  zoom: number;
  pin: boolean;
  onReady: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(320);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const span = 2 ** zoom;
  const fx = lonToTile(question.lon, zoom);
  const fy = latToTile(question.lat, zoom);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const dx = (fx - ix) * TILE;
  const dy = (fy - iy) * TILE;
  const scale = size / WINDOW;

  const tiles = [];
  for (let ty = -1; ty <= 1; ty += 1) {
    for (let tx = -1; tx <= 1; tx += 1) {
      const x = wrapTile(ix + tx, span);
      const y = clampTile(iy + ty, 0, span - 1);
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        src: tileUrl(zoom, x, y),
        left: (tx + 1) * TILE,
        top: (ty + 1) * TILE,
      });
    }
  }

  /**
   * Ready when every tile has settled, loaded or failed. `onLoad` alone is not
   * enough: a cached tile can already be complete before React attaches the
   * handler, and that site would then never start, so the ref checks
   * `complete` as each image mounts. A failure still counts as settled.
   */
  const signature = tiles.map((tile) => tile.src).join("|");
  const settled = useRef(new Set<string>());
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    settled.current = new Set<string>();
  }, [signature]);
  useEffect(() => {
    // The courtesy has a limit: past it the site starts with whatever arrived.
    const id = window.setTimeout(() => readyRef.current(), STATION.feedGraceMs);
    return () => window.clearTimeout(id);
  }, [signature]);

  const settle = useCallback((src: string, total: number) => {
    settled.current.add(src);
    if (settled.current.size >= total) readyRef.current();
  }, []);

  const mark = question.landmark;
  const marker = (() => {
    if (!pin || !mark) return null;
    const mx = (lonToTile(mark.lon, zoom) - fx) * TILE;
    const my = (latToTile(mark.lat, zoom) - fy) * TILE;
    const left = size / 2 + mx * scale;
    const top = size / 2 + my * scale;
    if (left < 0 || top < 0 || left > size || top > size) return null;
    return { left, top, name: mark.name };
  })();

  return (
    <div className={styles.scope}>
      <div className={styles.optic} ref={frame}>
        <div
          className={styles.mosaic}
          style={{ transform: `scale(${scale}) translate(${-dx}px, ${-dy}px)` }}
        >
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              width={TILE}
              height={TILE}
              style={{ left: tile.left, top: tile.top }}
              ref={(node) => {
                if (node?.complete) settle(tile.src, tiles.length);
              }}
              onLoad={() => settle(tile.src, tiles.length)}
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
                settle(tile.src, tiles.length);
              }}
              draggable={false}
            />
          ))}
        </div>

        {marker ? (
          <div
            className={styles.pin}
            style={{ left: marker.left, top: marker.top }}
            data-testid="landmark-pin"
          >
            <span className={styles.pinRing} aria-hidden="true" />
            <span className={`${styles.pinLabel} arcade`}>{marker.name}</span>
          </div>
        ) : null}

        <div className={styles.raster} aria-hidden="true" />
        <div className={styles.sweep} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.graticule} aria-hidden="true" />
        <div className={styles.reticle} aria-hidden="true" />
        <span className={`${styles.opticTop} arcade`}>Optical array</span>
        <span className={`${styles.opticBottom} arcade`}>Z{zoom}</span>
      </div>

      <div className={styles.bezel} aria-hidden="true" />
      <div className={styles.bezelMajor} aria-hidden="true" />
      <div className={styles.rim} aria-hidden="true" />
      <div className={styles.brackets} aria-hidden="true" />
    </div>
  );
}
