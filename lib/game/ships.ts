import { SHIPS } from "./Tuning";
import {
  loadFlown,
  loadOwnedShips,
  loadShipId,
  saveOwnedShip,
  saveShipId,
} from "./storage";

/**
 * The hangar, read side.
 *
 * `SHIPS` in Tuning.ts is the catalogue; this is everything that decides what
 * the player may fly and what they are looking at in the bay. Nothing here
 * touches three.js or React, so the unlock rules can be reasoned about (and
 * tested) on their own.
 *
 * A hull is cosmetic. Whatever is selected, the flight model is identical, so
 * two players comparing the same daily round are still comparing like with
 * like.
 */

export type ShipSpec = (typeof SHIPS)[number];
export type ShipId = ShipSpec["id"];

/** Why a hull is or is not flyable right now. */
export type ShipAvailability =
  /** Flyable: standard issue, earned, or bought. */
  | { state: "available"; earned: boolean }
  /** Earned by flying, not there yet. */
  | { state: "locked"; runsFlown: number; runsNeeded: number }
  /** Limited edition, not bought. */
  | { state: "forSale"; priceCents: number; currency: string };

/** What the bay needs to know about the player, gathered in one read. */
export interface HangarStatus {
  runsFlown: number;
  owned: string[];
}

export const DEFAULT_SHIP: ShipSpec = SHIPS[0];

export function allShips(): readonly ShipSpec[] {
  return SHIPS;
}

/** The hull with this id, or the standard issue one if the id is unknown. */
export function shipById(id: string | null): ShipSpec {
  return SHIPS.find((ship) => ship.id === id) ?? DEFAULT_SHIP;
}

/** Everything the bay reads about the player, from localStorage. */
export function readHangarStatus(): HangarStatus {
  return { runsFlown: loadFlown(), owned: loadOwnedShips() };
}

export function shipAvailability(
  ship: ShipSpec,
  status: HangarStatus,
): ShipAvailability {
  if (ship.unlock.kind === "default") return { state: "available", earned: false };

  if (ship.unlock.kind === "runs") {
    const runsNeeded = ship.unlock.runs;
    return status.runsFlown >= runsNeeded
      ? { state: "available", earned: true }
      : { state: "locked", runsFlown: status.runsFlown, runsNeeded };
  }

  return status.owned.includes(ship.id)
    ? { state: "available", earned: true }
    : {
        state: "forSale",
        priceCents: ship.unlock.priceCents,
        currency: ship.unlock.currency,
      };
}

export function isAvailable(ship: ShipSpec, status: HangarStatus): boolean {
  return shipAvailability(ship, status).state === "available";
}

/**
 * The hull to fly: what the player chose, if they may still fly it, and the
 * standard issue one otherwise.
 *
 * The fallback matters. A selection is a plain string in localStorage, so it
 * can name a hull that was removed, or one that was never unlocked, and a run
 * must never fail to start over a cosmetic choice.
 */
export function selectedShip(): ShipSpec {
  const status = readHangarStatus();
  const chosen = shipById(loadShipId());
  return isAvailable(chosen, status) ? chosen : DEFAULT_SHIP;
}

/** Records the choice. Refuses a hull the player has not unlocked. */
export function selectShip(id: string): ShipSpec {
  const status = readHangarStatus();
  const ship = shipById(id);
  if (!isAvailable(ship, status)) return selectedShip();
  saveShipId(ship.id);
  return ship;
}

/**
 * Grants a bought hull.
 *
 * NOTE: this is the seam and not the checkout. There is no payment provider
 * in this project, so the call records the entitlement locally and nothing
 * more: it must be called only once a real charge has been confirmed. Wiring
 * a provider means taking the money server-side, storing the entitlement
 * against an account, and having this read that instead of localStorage.
 * Until then the limited edition is honour-system on the device.
 */
export function purchaseShip(id: string): ShipSpec {
  const ship = shipById(id);
  if (ship.unlock.kind !== "purchase") return ship;
  saveOwnedShip(ship.id);
  saveShipId(ship.id);
  return ship;
}

/** "$4.99". Currency is always the one the catalogue quotes. */
export function formatPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amount,
    );
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
