"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { newShuffleSeed, practiceUrl } from "@/lib/content/round";
import { allShips } from "@/lib/game/ships";
import styles from "./Profile.module.css";

/**
 * The practice run button on `/profile?debug=1`, and the hull to fly it in.
 *
 * A client component for one reason: the seed. A practice round is built from
 * a seed on the URL so it can be opened again, and a seed made up while the
 * server renders the page would be neither fresh on the second press nor
 * reproducible. So the seed is drawn here, on the tap, and carried across.
 *
 * The hull row lists every ship in the catalogue, locked and limited edition
 * included, so a tester can see each one in flight without earning or buying
 * it. The pick rides on the URL (`&ship=`) and nowhere else: the player's own
 * selection, unlocks and purchases are never touched. "Yours" flies whatever
 * the hangar has selected, the same as a normal run.
 */
export function PracticeLink({ className }: { className: string }) {
  const router = useRouter();
  const [ship, setShip] = useState<string | undefined>(undefined);
  const options: { id: string | undefined; name: string }[] = [
    { id: undefined, name: "Yours" },
    ...allShips().map((s) => ({ id: s.id, name: s.name })),
  ];

  return (
    <>
      <span className={`${styles.shipLabel} label`}>Ship for practice</span>
      <div className={styles.shipPick} role="radiogroup" aria-label="Ship for practice">
        {options.map((option) => (
          <button
            key={option.id ?? "yours"}
            type="button"
            role="radio"
            aria-checked={ship === option.id}
            className={`${styles.shipOption} arcade`}
            data-testid={`practice-ship-${option.id ?? "yours"}`}
            onClick={() => setShip(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={className}
        data-testid="profile-shuffle"
        onClick={() => router.push(practiceUrl(newShuffleSeed(), ship))}
      >
        Practice run, random questions
      </button>
    </>
  );
}
