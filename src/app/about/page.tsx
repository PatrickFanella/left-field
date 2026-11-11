import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LeftFieldMark, Shell, fmtCount, fmtDate } from "@/components/presentational";
import { getDefaultPriorityRepository } from "@/lib/priority-index-store";

export const metadata: Metadata = pageMetadata("/about", "About", "Who publishes Left Field, what the index covers, how to read a score, and what the site does and does not collect.");

export default function About() {
  const repo = getDefaultPriorityRepository();
  const model = repo.getModelRelease();
  const seats = repo.getBriefs().length;
  return (
    <Shell>
      <main id="content" className="page prose about-page">
        <figure className="about-banner">
          <Image
            src="/brand/left-field-hero.svg"
            width={1600}
            height={1000}
            unoptimized
            priority
            alt="Left Field, by SUBCULT. Where the field bends. Seat research and source context."
          />
        </figure>
        <p className="eyebrow">ABOUT</p>
        <h1>Who publishes this</h1>
        <p className="lede">
          Left Field is published by SUBCULT and is part of the{" "}
          <a href="https://subcult.tv">subcult.tv</a> network.
        </p>
        <dl className="about-facts" aria-label="Current index">
          <div>
            <dt>Index model</dt>
            <dd>{model.version}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{fmtDate(model.publishedAt)}</dd>
          </div>
          <div>
            <dt>Seats scored</dt>
            <dd>{fmtCount(seats)}</dd>
          </div>
        </dl>

        <section className="record-section">
          <h2>What it is</h2>
          <p>
            A research index of seats in Congress, governorships, and state
            legislatures. Each seat is scored from public election, geography,
            and campaign-finance records, and every score shows the inputs
            behind it. Start with the <Link href="/">Priority Index</Link>, or{" "}
            <Link prefetch={false} href="/browse">browse the factual seat records</Link>{" "}
            for the House and Senate.
          </p>
        </section>

        <section className="record-section">
          <h2>How to read a score</h2>
          <dl>
            <dt>A score is a research priority</dt>
            <dd>
              It orders where investigation may be most useful. It is not a
              forecast, a poll, or an endorsement.
            </dd>
            <dt>Evidence varies by seat</dt>
            <dd>
              Each seat says how many inputs were measured. An input with no
              retained data reads “Not in this score” and is never counted as
              zero.
            </dd>
            <dt>Ties are shown as ties</dt>
            <dd>
              Seats with the same score share one rank. Seats scored on a
              single input often tie, so the index opens on seats with two or
              more.
            </dd>
          </dl>
          <p>
            The <Link href="/methodology">Method</Link> page gives the formulas
            and limits. The <Link href="/sources">source ledger</Link> lists
            what is retained and what is missing.
          </p>
        </section>

        <section className="record-section">
          <h2>What the site collects</h2>
          <dl>
            <dt>Accounts and tracking</dt>
            <dd>
              There are no accounts, no advertising, and no third-party
              scripts. The site does not profile voters.
            </dd>
            <dt>Page-view counts</dt>
            <dd>
              The edge adds a self-hosted Umami counter served from this
              domain. It records the page path and the referring site, not the
              query string, and stays off when a browser sends Do Not Track or
              Global Privacy Control.
            </dd>
            <dt>Address lookup</dt>
            <dd>
              Off unless a deployment has passed privacy review. The{" "}
              <Link prefetch={false} href="/lookup">lookup page</Link> states
              its current status.
            </dd>
            <dt>Corrections</dt>
            <dd>
              Correction intake follows the same rule. The{" "}
              <Link prefetch={false} href="/corrections">corrections page</Link>{" "}
              states whether reports are being accepted.
            </dd>
          </dl>
        </section>

        <section className="record-section">
          <h2>The mark</h2>
          <div className="about-mark">
            <LeftFieldMark size={72} />
            <p>
              The LF mark sets an L and an F on one baseline, with a rust
              square where they meet. The square is not a ballot, a result, or
              a certification symbol, and a seat&apos;s rank does not imply
              an endorsement by any organization.
            </p>
          </div>
        </section>

        <section className="record-section">
          <h2>Contact</h2>
          <p>
            Write to <a href="mailto:info@subcult.tv">info@subcult.tv</a>, or
            reach the publisher through{" "}
            <a href="https://subcult.tv">subcult.tv</a>. To report an error in
            a published record, use the correction link on that seat record.
          </p>
        </section>
      </main>
    </Shell>
  );
}
