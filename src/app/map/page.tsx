import type { Metadata } from "next";

import { NationalMap } from "@/components/national-map";
import { Shell } from "@/components/presentational";
import { mapSummary } from "@/lib/national-map";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("/map", "Seat map", "A map of U.S. House districts, Senate seats, governorships and state-legislative districts, with the seat holder, priority score and registered federal candidates for each.");

export default function MapPage() {
  const summary = mapSummary();
  return <Shell><main id="content" className="page map-page">
    <div className="map-hero"><p className="eyebrow">Seat map / {summary.cycle} cycle</p><h1>Every seat on one map</h1><p className="lede">Switch between House districts, the Senate, governors and state legislatures. Select a district or state to see who holds it, how it scores, and who has registered to run for it.</p></div>
    <NationalMap summary={summary} />
    <p className="map-source">Boundaries: U.S. Census Bureau 2025 cartographic boundary files (119th Congress; state-legislative districts as of 2024). New Hampshire floterial boundaries: NH Office of Planning and Development, 2022. Federal candidates: FEC filings retained {summary.snapshotDate}. Scores: the current Priority Index release.</p>
  </main></Shell>;
}
