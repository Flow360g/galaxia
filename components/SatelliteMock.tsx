/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TARGETS, type Target, type Tier } from "@/lib/mock/targets";
import styles from "./SatelliteMock.module.css";

/**
 * Satellite geoguess: difficulty mockup.
 *
 * Throwaway. Nothing in the game imports this and it imports nothing from the
 * engine. Its only job is to find the settings band where the encounter is hard
 * but fair, so the real build starts from a known difficulty instead of a guess.
 *
 * It lives in the app rather than in a published page because artifact pages
 * refuse images from third party hosts at the CSP level, and every frame here is
 * a map tile fetched from one.
 */

// ------------------------------------------------------------------ imagery

const TILE = 256;
/** Side of the crop taken from the 3x3 mosaic, in mosaic pixels. */
const WINDOW = 512;

interface Source {
  label: string;
  note: string;
  maxZoom: number;
  host: string;
  url: (z: number, x: number, y: number) => string;
}

const SOURCES = {
  esri: {
    label: "ESRI WORLD IMAGERY",
    note: "Sub-metre aerial. Sharper than anything we could ship, so treat it as the easy end of the dial.",
    maxZoom: 18,
    host: "services.arcgisonline.com",
    url: (z, x, y) =>
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  s2: {
    label: "SENTINEL-2 CLOUDLESS",
    note: "10 m, openly licensed, and close to what the game could actually ship. Caps out around zoom 14.",
    maxZoom: 14,
    host: "tiles.maps.eox.at",
    url: (z, x, y) =>
      `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/${z}/${y}/${x}.jpg`,
  },
} satisfies Record<string, Source>;

type SourceKey = keyof typeof SOURCES;

/** Slippy map maths. Fractional tile coordinates, so the target can be centred. */
function lonToTile(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ----------------------------------------------------------------- settings

interface Settings {
  source: SourceKey;
  /** Shifts every target's authored zoom by the same amount. The main difficulty dial. */
  zoomOffset: number;
  clockSeconds: number;
  hintModel: "auto" | "manual";
  answerMode: "lanes" | "typed";
}

const DEFAULTS: Settings = {
  source: "esri",
  zoomOffset: 0,
  clockSeconds: 30,
  hintModel: "manual",
  answerMode: "lanes",
};

/** Base value of the encounter, and what each intel drop costs. */
const BASE_SCORE = 200;
const HINT_COST = 50;
const MIN_SCORE = 50;
/** Fractions of the clock at which auto mode drops intel. */
const AUTO_AT = [0.33, 0.6, 0.83];
/** How far the wide scan pulls back. */
const WIDE_SCAN_STEPS = 2;

function worthNow(hints: number): number {
  return Math.max(MIN_SCORE, BASE_SCORE - HINT_COST * hints);
}

// ------------------------------------------------------------------ results

type Verdict = "hard" | "right" | "easy";

interface Result {
  /** Identity for the stored copy, so a re-rating replaces rather than duplicates. */
  stamp: number;
  id: string;
  name: string;
  tier: Tier;
  correct: boolean;
  timedOut: boolean;
  hints: number;
  score: number;
  seconds: number;
  zoom: number;
  source: SourceKey;
  hintModel: Settings["hintModel"];
  answerMode: Settings["answerMode"];
  verdict: Verdict | null;
}

const STORE_KEY = "galaxia:satmock";

function loadStored(): Result[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Result[]) : [];
  } catch {
    return [];
  }
}

function store(results: Result[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(results.slice(-200)));
  } catch {
    // Best effort. A full or blocked store must never break the playtest.
  }
}

// -------------------------------------------------------------------- utils

/** Stable shuffle, so lane order does not jump between renders. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const j = hash % (i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(target: Target, answer: string): boolean {
  const given = normalise(answer);
  if (given.length < 3) return false;
  return target.accept.some((entry) => given.includes(normalise(entry)));
}

// --------------------------------------------------------------------- feed

function Feed({
  target,
  zoom,
  source,
  onError,
}: {
  target: Target;
  zoom: number;
  source: SourceKey;
  onError: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(360);

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

  const spec = SOURCES[source];
  const z = clamp(Math.round(zoom), 2, spec.maxZoom);
  const span = 2 ** z;
  const fx = lonToTile(target.lon, z);
  const fy = latToTile(target.lat, z);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const dx = (fx - ix) * TILE;
  const dy = (fy - iy) * TILE;
  const scale = size / WINDOW;

  const tiles = [];
  for (let ty = -1; ty <= 1; ty += 1) {
    for (let tx = -1; tx <= 1; tx += 1) {
      const x = wrap(ix + tx, span);
      const y = clamp(iy + ty, 0, span - 1);
      tiles.push({
        key: `${z}-${x}-${y}-${tx}-${ty}`,
        src: spec.url(z, x, y),
        left: (tx + 1) * TILE,
        top: (ty + 1) * TILE,
      });
    }
  }

  return (
    <div className={styles.frame} ref={frame}>
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
            onError={(event) => {
              // A broken-image glyph in the feed reads as a bug. Hide the tile
              // and let the notice below the frame do the explaining.
              event.currentTarget.style.visibility = "hidden";
              onError();
            }}
            draggable={false}
          />
        ))}
      </div>
      <div className={styles.reticle} aria-hidden="true" />
      <div className={`${styles.frameTag} arcade`}>Z{z}</div>
    </div>
  );
}

// --------------------------------------------------------------------- main

type Phase = "setup" | "playing" | "revealed" | "summary";

export function SatelliteMock() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<Target[]>([]);
  const [index, setIndex] = useState(0);
  const [hints, setHints] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [typed, setTyped] = useState("");
  const [correct, setCorrect] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [tilesFailed, setTilesFailed] = useState(false);

  const target = queue[index];
  const remaining = Math.max(0, settings.clockSeconds - elapsed);

  const start = useCallback(() => {
    setQueue(seededShuffle(TARGETS, `${Date.now()}`));
    setIndex(0);
    setHints(0);
    setElapsed(0);
    setTyped("");
    setResults([]);
    setTilesFailed(false);
    setPhase("playing");
  }, []);

  const finish = useCallback(
    (wasCorrect: boolean, ranOut: boolean) => {
      if (!target) return;
      setCorrect(wasCorrect);
      setTimedOut(ranOut);
      setResults((prior) => [
        ...prior,
        {
          stamp: Date.now(),
          id: target.id,
          name: target.name,
          tier: target.tier,
          correct: wasCorrect,
          timedOut: ranOut,
          hints,
          score: wasCorrect ? worthNow(hints) : 0,
          seconds: Math.min(elapsed, settings.clockSeconds),
          zoom: target.zoom + settings.zoomOffset,
          source: settings.source,
          hintModel: settings.hintModel,
          answerMode: settings.answerMode,
          verdict: null,
        },
      ]);
      setPhase("revealed");
    },
    [target, hints, elapsed, settings],
  );

  // `finish` closes over the tick's own state, so the clock reads it through a
  // ref rather than rebuilding the interval ten times a second.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  /**
   * One clock drives everything: the countdown, auto mode's intel drops and the
   * timeout. Timing off a wall clock rather than counting ticks keeps the
   * countdown honest when the tab is throttled.
   */
  useEffect(() => {
    if (phase !== "playing") return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      if (settings.hintModel === "auto") {
        const due = AUTO_AT.filter((at) => seconds >= at * settings.clockSeconds).length;
        setHints((prior) => (due > prior ? due : prior));
      }
      if (seconds >= settings.clockSeconds) {
        window.clearInterval(id);
        finishRef.current(false, true);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, index, settings.hintModel, settings.clockSeconds]);

  const next = useCallback(() => {
    if (index + 1 >= queue.length) {
      setPhase("summary");
      return;
    }
    setIndex((prior) => prior + 1);
    setHints(0);
    setElapsed(0);
    setTyped("");
    setPhase("playing");
  }, [index, queue.length]);

  /**
   * Rating replaces the last result rather than appending, so tapping a
   * different verdict corrects the previous one instead of double counting.
   * The write to storage happens here, never inside the updater, which React
   * may call twice.
   */
  const rate = useCallback(
    (verdict: Verdict) => {
      const last = results[results.length - 1];
      if (!last) return;
      const rated = { ...last, verdict };
      setResults([...results.slice(0, -1), rated]);
      store([...loadStored().filter((r) => r.stamp !== rated.stamp), rated]);
    },
    [results],
  );

  const lanes = useMemo(() => {
    if (!target) return [];
    return seededShuffle([target.name, ...target.decoys], target.id);
  }, [target]);

  const zoom = target ? target.zoom + settings.zoomOffset - (hints >= 1 ? WIDE_SCAN_STEPS : 0) : 12;

  if (phase === "setup") {
    return (
      <Setup settings={settings} onChange={setSettings} onStart={start} stored={results.length} />
    );
  }

  if (phase === "summary") {
    return <Summary results={results} settings={settings} onRestart={() => setPhase("setup")} />;
  }

  if (!target) return null;

  const rated = results[results.length - 1]?.verdict ?? null;

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        <div className={styles.readout}>
          <span className={`${styles.readoutLabel} arcade`}>Target</span>
          <span className={`${styles.readoutValue} mono`}>
            {index + 1}/{queue.length}
          </span>
        </div>
        <div className={styles.readout}>
          <span className={`${styles.readoutLabel} arcade`}>Worth now</span>
          <span className={`${styles.readoutValue} ${styles.gold} mono`}>{worthNow(hints)}</span>
        </div>
        <div className={styles.readout}>
          <span className={`${styles.readoutLabel} arcade`}>Banked</span>
          <span className={`${styles.readoutValue} mono`}>
            {results.reduce((sum, r) => sum + r.score, 0)}
          </span>
        </div>
      </header>

      <div className={styles.clockRow}>
        <div className={styles.clockTrack}>
          <div
            className={styles.clockFill}
            style={{
              width: `${(remaining / settings.clockSeconds) * 100}%`,
              background: remaining < settings.clockSeconds * 0.25 ? "#ff6b5c" : "#4ff1ff",
            }}
          />
        </div>
        <span className={`${styles.clockValue} mono`}>{remaining.toFixed(1)}</span>
      </div>

      <Feed
        target={target}
        zoom={zoom}
        source={settings.source}
        onError={() => setTilesFailed(true)}
      />

      {tilesFailed ? (
        <p className={styles.warn}>
          Tiles from {SOURCES[settings.source].host} did not load. Switch source on the setup screen,
          or check this device can reach that host.
        </p>
      ) : null}

      <div className={styles.intel}>
        {hints >= 1 ? (
          <p className={`${styles.intelLine} ${styles.cyan}`}>
            <span className="arcade">Wide scan</span> Pulled back {WIDE_SCAN_STEPS} zoom steps.
          </p>
        ) : null}
        {hints >= 2 ? <p className={styles.intelLine}>{target.clue}</p> : null}
        {hints >= 3 ? (
          <p className={styles.intelLine}>
            Territory: {target.country}. Designation begins with {target.name.charAt(0)}.
          </p>
        ) : null}
        {hints === 0 ? <p className={styles.intelMuted}>No intel taken. Full value.</p> : null}
      </div>

      {phase === "playing" ? (
        <>
          {settings.hintModel === "manual" && hints < 3 ? (
            <button
              type="button"
              className={`${styles.intelButton} arcade`}
              onClick={() => setHints((prior) => prior + 1)}
            >
              Request intel &middot; costs {HINT_COST}
            </button>
          ) : null}

          {settings.answerMode === "lanes" ? (
            <div className={styles.lanes}>
              {lanes.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.lane} arcade`}
                  onClick={() => finish(option === target.name, false)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <form
              className={styles.typedRow}
              onSubmit={(event) => {
                event.preventDefault();
                finish(matches(target, typed), false);
              }}
            >
              <input
                id="satmock-answer"
                className={styles.input}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Name the city"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button type="submit" className={`${styles.submit} arcade`}>
                Send
              </button>
            </form>
          )}
        </>
      ) : (
        <div className={styles.reveal}>
          <p className={`${styles.verdict} arcade ${correct ? styles.cyan : styles.red}`}>
            {correct ? "Target identified" : timedOut ? "Signal lost" : "Wrong coordinates"}
          </p>
          <p className={`${styles.answer} arcade`}>
            {target.name}, {target.country}
          </p>
          <p className={`${styles.gained} mono`}>
            {correct ? `+${worthNow(hints)}` : "+0"} &middot; {hints} intel &middot;{" "}
            {Math.min(elapsed, settings.clockSeconds).toFixed(1)}s
          </p>
          <p className={styles.fact}>{target.fact}</p>

          <p className={`${styles.rateLabel} arcade`}>How did that feel?</p>
          <div className={styles.rateRow}>
            {(
              [
                ["hard", "Too hard"],
                ["right", "Just right"],
                ["easy", "Too easy"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${styles.rateButton} ${rated === value ? styles.rateOn : ""} arcade`}
                onClick={() => rate(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" className={`${styles.next} arcade`} onClick={next}>
            {index + 1 >= queue.length ? "See readout" : "Next target"}
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- setup

function Setup({
  settings,
  onChange,
  onStart,
  stored,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onStart: () => void;
  stored: number;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className={styles.sheet}>
      <p className={`${styles.eyebrow} arcade`}>Galaxia prototype</p>
      <h1 className={`${styles.title} arcade`}>Satellite recon</h1>
      <p className={styles.blurb}>
        Not the game. A dial board for one question: at what settings is naming a place from orbit
        hard but fair? Play a dozen, rate each one, then send me the readout.
      </p>

      <Row label="Imagery">
        {(Object.keys(SOURCES) as SourceKey[]).map((key) => (
          <Chip
            key={key}
            on={settings.source === key}
            onClick={() => set("source", key)}
            label={SOURCES[key].label}
          />
        ))}
      </Row>
      <p className={styles.note}>{SOURCES[settings.source].note}</p>

      <Row label="Zoom shift">
        {[-3, -2, -1, 0, 1].map((value) => (
          <Chip
            key={value}
            on={settings.zoomOffset === value}
            onClick={() => set("zoomOffset", value)}
            label={value > 0 ? `+${value}` : `${value}`}
          />
        ))}
      </Row>
      <p className={styles.note}>
        Minus is further out and harder. This is the dial that matters most.
      </p>

      <Row label="Clock">
        {[20, 30, 45].map((value) => (
          <Chip
            key={value}
            on={settings.clockSeconds === value}
            onClick={() => set("clockSeconds", value)}
            label={`${value}s`}
          />
        ))}
      </Row>

      <Row label="Intel">
        <Chip
          on={settings.hintModel === "manual"}
          onClick={() => set("hintModel", "manual")}
          label="You ask"
        />
        <Chip
          on={settings.hintModel === "auto"}
          onClick={() => set("hintModel", "auto")}
          label="Auto drops"
        />
      </Row>
      <p className={styles.note}>
        You ask: hints only cost points if you take them. Auto: they land at{" "}
        {AUTO_AT.map((at) => `${Math.round(at * settings.clockSeconds)}s`).join(", ")} whether you
        want them or not.
      </p>

      <Row label="Answer">
        <Chip
          on={settings.answerMode === "lanes"}
          onClick={() => set("answerMode", "lanes")}
          label="Four lanes"
        />
        <Chip
          on={settings.answerMode === "typed"}
          onClick={() => set("answerMode", "typed")}
          label="Type it"
        />
      </Row>

      <button type="button" className={`${styles.launch} arcade`} onClick={onStart}>
        Begin recon
      </button>

      {stored > 0 ? <p className={styles.note}>{stored} rated this session.</p> : null}
      <p className={styles.fineprint}>
        Prototype only. These tile services are not licensed for a shipped game; the provider
        question gets settled after the difficulty one does.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={`${styles.rowLabel} arcade`}>{label}</span>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${on ? styles.chipOn : ""} arcade`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ------------------------------------------------------------------ summary

function Summary({
  results,
  settings,
  onRestart,
}: {
  results: Result[];
  settings: Settings;
  onRestart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hit = results.filter((r) => r.correct).length;
  const score = results.reduce((sum, r) => sum + r.score, 0);
  const justRight = results.filter((r) => r.verdict === "right").length;

  const readout = useMemo(() => {
    const header = `SATELLITE RECON READOUT
source=${settings.source} zoomShift=${settings.zoomOffset} clock=${settings.clockSeconds}s intel=${settings.hintModel} answer=${settings.answerMode}
${hit}/${results.length} correct, ${score} points, ${justRight} rated just right
`;
    const rows = results
      .map(
        (r) =>
          `${r.correct ? "HIT " : r.timedOut ? "TIME" : "MISS"} ${r.name.padEnd(14)} z${r.zoom} ${r.hints} intel ${r.seconds.toFixed(1)}s ${r.verdict ?? "unrated"}`,
      )
      .join("\n");
    return `${header}${rows}`;
  }, [results, settings, hit, score, justRight]);

  return (
    <div className={styles.sheet}>
      <p className={`${styles.eyebrow} arcade`}>Session readout</p>
      <h1 className={`${styles.title} arcade`}>
        {hit}/{results.length} identified
      </h1>
      <p className={styles.blurb}>
        {score} points. {justRight} of {results.length} felt just right. If that number is low at
        every zoom, the mechanic needs rethinking rather than retuning.
      </p>

      <ul className={styles.list}>
        {results.map((r, i) => (
          <li key={`${r.id}-${i}`} className={styles.listRow}>
            <span
              className={`${styles.pip} ${r.correct ? styles.pipHit : styles.pipMiss}`}
              aria-hidden="true"
            />
            <span className={styles.listName}>{r.name}</span>
            <span className={`${styles.listMeta} mono`}>
              z{r.zoom} &middot; {r.hints} intel &middot; {r.seconds.toFixed(0)}s
            </span>
            <span className={`${styles.listVerdict} arcade`}>{r.verdict ?? "-"}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${styles.launch} arcade`}
        onClick={() => {
          navigator.clipboard?.writeText(readout).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy readout"}
      </button>
      <button type="button" className={`${styles.secondary} arcade`} onClick={onRestart}>
        Change the dials
      </button>
      <pre className={styles.dump}>{readout}</pre>
    </div>
  );
}
