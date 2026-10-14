import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { Notice, Shell } from "@/components/presentational";
import { readFeatureGates } from "@/features/gates";
import { parseAddressConfig } from "@/address/config";
import { isolatedDatabaseReady } from "@/features/runtime-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { ...pageMetadata("/lookup", "Address lookup"), robots: { index: false, follow: true } };

function DisabledLookup() {
  return <Shell><main id="content" className="page prose lookup-page">
    <p className="eyebrow">ADDRESS LOOKUP / DEPLOYMENT STATUS</p>
    <h1>Address lookup is not enabled here</h1>
    <Notice title="Address collection is privacy-gated"><p>This shared deployment does not accept or send addresses. Lookup stays off until the privacy review approves address collection.</p></Notice>
    <section className="record-section"><h2>Privacy boundary</h2><p>This status page has no address form, client-side address code, analytics, session replay, or address-service request.</p></section>
    <section className="record-section"><h2>Activation status</h2><dl><dt>Address collection</dt><dd>Disabled by the checked-in feature gate.</dd><dt>Canary</dt><dd>Off. No address form is served.</dd></dl></section>
  </main></Shell>;
}

export default async function Lookup() {
  const gates = await readFeatureGates().catch(() => undefined);
  if (gates?.address?.mode !== "enabled") return <DisabledLookup />;
  let databaseUrl: string | undefined;
  try { databaseUrl = parseAddressConfig(process.env, gates.address.mode, gates.address).databaseUrl; } catch { return <DisabledLookup />; }
  if (!await isolatedDatabaseReady(databaseUrl)) return <DisabledLookup />;

  // Import only after the gate is verified so dark and canary responses need no form chunk.
  const { AddressForm } = await import("./address-form");
  return <Shell><main id="content" className="page prose lookup-page"><p className="eyebrow">ADDRESS LOOKUP / APPROVED ENVIRONMENT</p><h1>Find the federal seats for an address</h1><p className="lede">This tool returns the applicable House seat and Senate representation for the active release. It does not store your address in the browser.</p><AddressForm /></main></Shell>;
}
