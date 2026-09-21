"use client";

import { useRouter } from "next/navigation";
import { newShuffleSeed } from "@/lib/content/round";

/**
 * The practice run button on `/profile?debug=1`.
 *
 * A client component for one reason: the seed. A practice round is built from
 * a seed on the URL so it can be opened again, and a seed made up while the
 * server renders the page would be neither fresh on the second press nor
 * reproducible. So the seed is drawn here, on the tap, and carried across.
 */
export function PracticeLink({ className }: { className: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      data-testid="profile-shuffle"
      onClick={() => router.push(`/play?shuffle=${newShuffleSeed()}&debug=1`)}
    >
      Practice run, random questions
    </button>
  );
}
