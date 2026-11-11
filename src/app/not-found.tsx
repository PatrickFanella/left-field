import type { Metadata } from "next";
import { RouteState } from "@/components/presentational";
export const metadata: Metadata = { title: "Page not found" };
export default function NotFound() { return <RouteState code="page_not_found" />; }
