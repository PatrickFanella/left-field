import type { Metadata } from "next";

export const publicOrigin = "https://left-field.subcult.tv";

export function pageMetadata(path: string, title: string, description?: string): Metadata {
  const url = new URL(path, publicOrigin).href;
  const fullTitle = `${title} | Left Field`;
  return {
    title: { absolute: fullTitle },
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: { siteName: "Left Field", type: "website", title: fullTitle, url, ...(description ? { description } : {}) },
  };
}
