import type { Metadata } from "next";
import { EndingMock } from "@/components/EndingMock";

/**
 * Ending mockup: the reinforcements going in after WHERE ON EARTH.
 *
 * A prototype surface, not part of the run, like `/satellite-mock`. It exists
 * to be looked at before the ending is built into the station screen. Delete
 * the route, the component and `lib/mock/ending.ts` once that is decided.
 * `?sites=2|1|0` picks how many landing sites the run named.
 */

export const metadata: Metadata = {
  title: "Ending prototype",
  robots: { index: false, follow: false },
};

export default async function EndingMockPage({
  searchParams,
}: {
  searchParams: Promise<{ sites?: string }>;
}) {
  const { sites } = await searchParams;
  const named = sites === "0" ? 0 : sites === "1" ? 1 : 2;
  return <EndingMock initialSites={named} />;
}
