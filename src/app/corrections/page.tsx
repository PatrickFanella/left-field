import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { Notice, Shell } from "@/components/presentational";
import { correctionReleaseIdSchema, correctionSeatCycleIdSchema } from "@/domain/corrections";
import { readFeatureGates } from "@/features/gates";
import { parseCorrectionSecurityConfig } from "@/corrections/security";
import { isolatedDatabaseReady } from "@/features/runtime-readiness";

type Props = { searchParams: Promise<{ release?: string | string[]; seat?: string | string[] }> };

const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = pageMetadata("/corrections", "Corrections");

function DisabledCorrections() {
  return <Shell><main id="content" className="page prose correction-page">
    <p className="eyebrow">RELEASE CORRECTION / DEPLOYMENT STATUS</p>
    <h1>Corrections are not enabled here</h1>
    <Notice title="Private collection is privacy-gated"><p>This shared deployment does not collect correction reports. No report details, source links, or submission controls are available until the approved privacy review enables this feature.</p></Notice>
    <section className="record-section"><h2>Privacy boundary</h2><p>This status page has no correction form, client-side collection code, or correction-service request. A seat record may still link here. The link shows where corrections will go; it does not open collection.</p></section>
    <section className="record-section"><h2>Activation status</h2><dl><dt>Collection</dt><dd>Disabled by the checked-in feature gate.</dd><dt>Review</dt><dd>Not available in this shared deployment.</dd></dl></section>
  </main></Shell>;
}

export default async function CorrectionsPage({ searchParams }: Props) {
  const gates = await readFeatureGates().catch(() => undefined);
  if (gates?.correction?.mode !== "enabled") return <DisabledCorrections />;
  try { parseCorrectionSecurityConfig(process.env, gates.correction); } catch { return <DisabledCorrections />; }
  if (!await isolatedDatabaseReady(process.env.CORRECTION_DATABASE_URL)) return <DisabledCorrections />;

  // Keep collection code out of disabled responses, including the client manifest boundary.
  const { CorrectionForm } = await import("@/components/correction-form");
  const query = await searchParams;
  const release = one(query.release);
  const seat = one(query.seat);
  return <Shell><main id="content" className="page correction-page">
    <p className="eyebrow">RELEASE CORRECTION / REVIEW QUEUE</p>
    <h1>Submit a correction</h1>
    <p className="lede">Point us to a specific published record and explain what needs review.</p>
    <CorrectionForm releaseId={correctionReleaseIdSchema.safeParse(release).data} seatCycleId={correctionSeatCycleIdSchema.safeParse(seat).data} />
  </main></Shell>;
}
