"use client";
import Link from "next/link";
import { Shell } from "@/components/presentational";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <Shell><main id="content" className="page state"><p className="eyebrow">RECORD STATUS</p><h1>Record unavailable</h1><p>This record could not be displayed. Try again, or go back to the seat records.</p><div className="state-actions"><button type="button" onClick={reset}>Try again</button><Link prefetch={false} className="button" href="/browse">Return to browse</Link></div></main></Shell>; }
