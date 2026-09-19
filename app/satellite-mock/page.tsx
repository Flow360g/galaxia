import type { Metadata } from "next";
import { SatelliteMock } from "@/components/SatelliteMock";

/**
 * Satellite geoguess difficulty mockup.
 *
 * A prototype surface, not part of the run. It exists to find the settings band
 * where naming a place from orbit is hard but fair, before any of this is built
 * into an encounter. Delete the route, the component and lib/mock once that
 * question is answered.
 */

export const metadata: Metadata = {
  title: "Satellite recon prototype",
  robots: { index: false, follow: false },
};

export default function SatelliteMockPage() {
  return <SatelliteMock />;
}
