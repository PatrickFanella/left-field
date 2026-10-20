import Link from "next/link";
import type { ReactNode } from "react";
export function fmtDate(value: string | null | undefined) {
  if (!value) return "Not published";
  // Leave a value that is not a date readable instead of throwing on it.
  if (Number.isNaN(Date.parse(value))) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
export function fmtNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    value,
  );
}
export function fmtCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}
export function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
export function words(value: string) {
  return value.replace(/_/g, " ");
}
/** Party values arrive lower-case from the release; show them as names. */
export function partyLabel(value: string) {
  const text = words(value);
  return text.charAt(0).toLocaleUpperCase("en-US") + text.slice(1);
}
export function incumbencyLabel(status: string) {
  if (status === "unknown") return "incumbency not recorded";
  if (status === "open") return "open seat";
  return words(status);
}
export function missing(reason: string) {
  return `Unavailable — ${words(reason)}`;
}
export function fact(
  value: { kind: "value"; value: number } | { kind: "missing"; reason: string },
  formatter = fmtNumber,
) {
  return value.kind === "value"
    ? formatter(value.value)
    : missing(value.reason);
}
export function Status({ children }: { children: string }) {
  return (
    <span className={`status status-${children.replace(/_/g, "-")}`}>
      {words(children)}
    </span>
  );
}
export function Lineage({
  status,
  asOf,
  methodology,
  inputs,
}: {
  status: string;
  asOf: string;
  methodology: string;
  inputs: readonly unknown[];
}) {
  return (
    <p className="lineage">
      <Status>{status}</Status>
      <span>As of {fmtDate(asOf)}</span>
      <span>{words(methodology)}</span>
      <span>
        {inputs.length} input {inputs.length === 1 ? "snapshot" : "snapshots"}
      </span>
    </p>
  );
}
/** The approved LF mark from the Studio pack (logos/mark-primary.svg), drawn in the page's own ink and rust. */
export function LeftFieldMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="18 18 126 126" aria-hidden="true" focusable="false">
      <path d="M18 18h26v100h50v26H18z M68 18h74v26H94v24h40v26H94v50H68z" fill="currentColor" />
      <rect x="68" y="118" width="26" height="26" fill="var(--signal)" />
    </svg>
  );
}
export function ReleaseStrip({
  release,
}: {
  release: {
    label: string;
    status: string;
    sourceCutoff: string;
    publishedAt: string | null;
  };
}) {
  return (
    <div className="release-strip">
      <span>
        <b>FACTUAL FEDERAL RECORD</b> · nationwide release scope
      </span>
      <span>
        {release.label} · <Status>{release.status}</Status> · source cutoff{" "}
        {fmtDate(release.sourceCutoff)}
      </span>
    </div>
  );
}
export function Shell({
  children,
  release,
}: {
  children: ReactNode;
  release?: {
    label: string;
    status: string;
    sourceCutoff: string;
    publishedAt: string | null;
  };
}) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="masthead">
        <Link prefetch={false} className="wordmark" href="/">
          <LeftFieldMark />
          LEFT FIELD
        </Link>
        <nav aria-label="Primary navigation">
          <Link prefetch={false} href="/">
            Priority index
          </Link>
          <Link prefetch={false} href="/browse">
            Browse
          </Link>
          <Link prefetch={false} href="/sources">
            Sources
          </Link>
          <Link prefetch={false} href="/methodology">
            Method
          </Link>
        </nav>
      </header>
      {release && <ReleaseStrip release={release} />}
      {children}
      <footer>
        <span>
          LEFT FIELD · Seat research for Congress, governorships, and state
          legislatures · Published by SUBCULT,{" "}
          <a href="https://subcult.tv">subcult.tv</a>. Support goes to the studio’s development work, not a campaign, and cannot buy a conclusion or change a score. <a href="https://subcult.tv/support">Support SUBCULT</a>
        </span>
        <nav aria-label="Footer navigation">
          <Link prefetch={false} href="/">
            Priority index
          </Link>
          <Link prefetch={false} href="/methodology">
            Method
          </Link>
          <Link prefetch={false} href="/sources">
            Source ledger
          </Link>
          <Link prefetch={false} href="/corrections">
            Corrections
          </Link>
          <Link prefetch={false} href="/about">
            About
          </Link>
        </nav>
      </footer>
    </>
  );
}
export function Notice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="notice" aria-labelledby="notice-title">
      <h2 id="notice-title">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
export function RouteState({
  code,
}: {
  code:
    | "invalid_request"
    | "not_found"
    | "page_not_found"
    | "unavailable"
    | "configuration";
}) {
  const copy = {
    invalid_request: [
      "Request not available",
      "This URL includes a filter or value this factual release does not accept.",
    ],
    not_found: [
      "Seat not in this release",
      "This seat is not present in the active factual release.",
    ],
    page_not_found: [
      "Page not found",
      "This address does not match a page, seat record, or brief in the current release.",
    ],
    unavailable: [
      "Data temporarily unavailable",
      "The research record cannot be loaded right now. Please try again later.",
    ],
    configuration: [
      "Research data unavailable",
      "This deployment is not configured to serve the factual release.",
    ],
  }[code];
  return (
    <Shell>
      <main id="content" className="page state">
        <p className="eyebrow">RECORD STATUS</p>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
        <div className="state-actions">
          <Link prefetch={false} className="button" href="/">
            Open the Priority Index
          </Link>
          <Link prefetch={false} className="button" href="/browse">
            Browse seat records
          </Link>
        </div>
      </main>
    </Shell>
  );
}
