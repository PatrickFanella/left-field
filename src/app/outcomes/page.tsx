import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { Shell } from "@/components/presentational";
import { OutcomesView } from "@/components/outcomes-view";
import { loadOutcomeLedger } from "@/lib/outcome-ledger-view";
import { readPreElectionSnapshot2026 } from "@/rapid-acquisition/pre-election-snapshot-2026";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("/outcomes", "How the index did in 2026", "The Priority Index as it stood on election day beside what the retained evidence says happened in each seat, with every unknown left visible.");

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

let snapshotMeta: { modelVersion: string; publishedAt: string } | undefined;
const frozen = (): { modelVersion: string; publishedAt: string } => {
  if (!snapshotMeta) {
    const snapshot = readPreElectionSnapshot2026();
    snapshotMeta = { modelVersion: snapshot.modelVersion, publishedAt: snapshot.publishedAt };
  }
  return snapshotMeta;
};

export default async function Outcomes({ searchParams }: Props) {
  const params = await searchParams;
  const { modelVersion, publishedAt } = frozen();
  return (
    <Shell>
      <OutcomesView ledger={loadOutcomeLedger()} params={params} modelVersion={modelVersion} publishedAt={publishedAt} />
    </Shell>
  );
}
