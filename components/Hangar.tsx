"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ShipBay } from "@/lib/game/ShipBay";
import {
  allShips,
  formatPrice,
  purchaseShip,
  readHangarStatus,
  selectShip,
  selectedShip,
  shipAvailability,
  type HangarStatus,
} from "@/lib/game/ships";
import styles from "./Hangar.module.css";

/**
 * The ship bay.
 *
 * One hull at a time, turning on a lit deck, with its name and papers under
 * it. `ShipBay` owns the canvas and its own loop exactly as `Engine` does on
 * the flight surface; React owns the DOM over it and hands the bay a spec
 * whenever the player flicks to another hull.
 *
 * What is unlocked decides what this screen SAYS, so the flight log is read
 * through a store snapshot like the title screen's record: undefined on the
 * server and until hydration, which reads out as a quiet bay for one frame
 * rather than as the wrong state confidently rendered.
 */
export function Hangar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bayRef = useRef<ShipBay | null>(null);
  const ships = useMemo(() => allShips(), []);

  /**
   * What is unlocked and what is selected, read through a store snapshot so
   * the server render and the hydrating pass agree and nothing flashes.
   * `undefined` until hydration; a purchase or a selection invalidates it.
   */
  const log = useSyncExternalStore(subscribeLog, logSnapshot, () => undefined);
  const status: HangarStatus | null = log?.status ?? null;
  const selectedId = log?.selectedId ?? null;

  /** Which hull the carousel is showing, once the player has flicked it. */
  const [picked, setPicked] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);

  const showing = picked ?? selectedId ?? ships[0]?.id ?? null;
  const index = Math.max(
    ships.findIndex((entry) => entry.id === showing),
    0,
  );
  const ship = ships[index];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bay = new ShipBay(container);
    bayRef.current = bay;
    bay.start();

    return () => {
      bay.dispose();
      bayRef.current = null;
    };
  }, []);

  // The hull on the turntable follows the carousel.
  useEffect(() => {
    if (ship) void bayRef.current?.setShip(ship);
  }, [ship]);

  const step = useCallback(
    (delta: number) => {
      setCheckout(false);
      const next = ships[(index + delta + ships.length) % ships.length];
      if (next) setPicked(next.id);
    },
    [ships, index],
  );

  // Desktop convenience. Every one of these has a tap target on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const choose = useCallback(() => {
    if (!ship) return;
    selectShip(ship.id);
    refreshLog();
  }, [ship]);

  const buy = useCallback(() => {
    if (!ship) return;
    const bought = purchaseShip(ship.id);
    refreshLog();
    setPicked(bought.id);
    setCheckout(false);
  }, [ship]);

  if (!ship) return null;

  const availability = status ? shipAvailability(ship, status) : null;
  const flying = selectedId === ship.id;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={`${styles.back} arcade`} data-testid="bay-back">
          Base
        </Link>
        <span className="eyebrow">Ship bay</span>
        <span className={`${styles.slot} arcade`}>
          {index + 1}/{ships.length}
        </span>
      </header>

      {/* The bay creates and owns its canvas inside this container. */}
      <div className={styles.stage}>
        <div ref={containerRef} className={styles.bay} />

        <button
          type="button"
          className={`${styles.arrow} ${styles.prev} arcade`}
          onClick={() => step(-1)}
          aria-label="Previous ship"
        >
          &lt;
        </button>
        <button
          type="button"
          className={`${styles.arrow} ${styles.next} arcade`}
          onClick={() => step(1)}
          aria-label="Next ship"
        >
          &gt;
        </button>

        {availability && availability.state !== "available" ? (
          <span className={`${styles.stamp} arcade`} data-testid="bay-stamp">
            {availability.state === "locked" ? "Locked" : "Limited edition"}
          </span>
        ) : null}
      </div>

      <section className={styles.plate}>
        <div className={styles.namePlate}>
          <h1 className={`${styles.name} arcade`} data-testid="ship-name">
            {ship.name}
          </h1>
          <span className={`${styles.class} arcade`}>{ship.className}</span>
        </div>

        <p className={styles.blurb}>{ship.blurb}</p>

        <Status availability={availability} flying={flying} />

        {checkout && availability?.state === "forSale" ? (
          <div className={styles.checkout} data-testid="bay-checkout">
            <span className={`${styles.checkoutPrice} arcade`}>
              {formatPrice(availability.priceCents, availability.currency)}
            </span>
            <p className={styles.checkoutText}>
              A one-time unlock for {ship.name}. Yours on this device, for
              good.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.secondary} arcade`}
                onClick={() => setCheckout(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.primary} arcade`}
                onClick={buy}
                data-testid="bay-confirm"
              >
                Pay{" "}
                {formatPrice(availability.priceCents, availability.currency)}
              </button>
            </div>
            {/* Honest while there is no provider behind it. Delete this line
                with the stub in ships.ts, not before. */}
            <p className={styles.note}>
              No payment provider is connected yet, so nothing is charged.
            </p>
          </div>
        ) : (
          <Action
            availability={availability}
            flying={flying}
            onSelect={choose}
            onBuy={() => setCheckout(true)}
          />
        )}

        <ul className={styles.rack}>
          {ships.map((entry, at) => {
            const entryState = status ? shipAvailability(entry, status).state : null;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`${styles.chip} arcade`}
                  data-on={at === index ? "true" : "false"}
                  data-state={entryState ?? "unknown"}
                  onClick={() => {
                    setCheckout(false);
                    setPicked(entry.id);
                  }}
                >
                  <span className={styles.chipName}>{entry.name}</span>
                  <span className={styles.chipMark} aria-hidden="true">
                    {entryState === "available"
                      ? selectedId === entry.id
                        ? "FLYING"
                        : "READY"
                      : entryState === "forSale"
                        ? "BUY"
                        : "LOCKED"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

/**
 * Store for what the bay reads out of localStorage: the flight log and the
 * current selection. A snapshot rather than an effect, so the read happens
 * during render on the client only and React never has to rerender to catch
 * up with it.
 */
interface Log {
  status: HangarStatus;
  selectedId: string;
}

let cachedLog: Log | null = null;
const listeners = new Set<() => void>();

function logSnapshot(): Log {
  if (!cachedLog) {
    cachedLog = { status: readHangarStatus(), selectedId: selectedShip().id };
  }
  return cachedLog;
}

function refreshLog(): void {
  cachedLog = null;
  listeners.forEach((listener) => listener());
}

function subscribeLog(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The one line that says where the player stands with this hull. */
function Status({
  availability,
  flying,
}: {
  availability: ReturnType<typeof shipAvailability> | null;
  flying: boolean;
}) {
  if (!availability) return <p className={styles.status} />;

  if (availability.state === "locked") {
    return (
      <p className={styles.status} data-testid="bay-status">
        <span className="label">Unlocks at</span>{" "}
        <span className={`${styles.statusValue} arcade`}>
          {availability.runsNeeded} runs flown
        </span>{" "}
        <span className={styles.statusAside}>
          {availability.runsFlown} on file
        </span>
      </p>
    );
  }

  if (availability.state === "forSale") {
    return (
      <p className={styles.status} data-testid="bay-status">
        <span className="label">Limited edition</span>{" "}
        <span className={`${styles.statusValue} arcade`}>
          {formatPrice(availability.priceCents, availability.currency)}
        </span>{" "}
        <span className={styles.statusAside}>Never issued twice</span>
      </p>
    );
  }

  return (
    <p className={styles.status} data-testid="bay-status">
      <span className="label">Status</span>{" "}
      <span className={`${styles.statusValue} arcade`}>
        {flying ? "In your hangar" : "Cleared to fly"}
      </span>{" "}
      {availability.earned ? (
        <span className={styles.statusAside}>Earned</span>
      ) : (
        <span className={styles.statusAside}>Standard issue</span>
      )}
    </p>
  );
}

function Action({
  availability,
  flying,
  onSelect,
  onBuy,
}: {
  availability: ReturnType<typeof shipAvailability> | null;
  flying: boolean;
  onSelect: () => void;
  onBuy: () => void;
}) {
  if (!availability) {
    return (
      <button type="button" className={`${styles.primary} arcade`} disabled>
        Reading log
      </button>
    );
  }

  if (availability.state === "locked") {
    return (
      <button
        type="button"
        className={`${styles.primary} arcade`}
        disabled
        data-testid="bay-action"
      >
        {availability.runsNeeded - availability.runsFlown} more runs
      </button>
    );
  }

  if (availability.state === "forSale") {
    return (
      <button
        type="button"
        className={`${styles.primary} arcade`}
        onClick={onBuy}
        data-testid="bay-action"
      >
        Unlock {formatPrice(availability.priceCents, availability.currency)}
      </button>
    );
  }

  if (flying) {
    return (
      <Link href="/play" className={`${styles.primary} arcade`} data-testid="bay-action">
        Press Start
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.primary} arcade`}
      onClick={onSelect}
      data-testid="bay-action"
    >
      Fly this hull
    </button>
  );
}
