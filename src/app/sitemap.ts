import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/seo";
import { getDefaultPriorityRepository } from "@/lib/priority-index-store";

export default function sitemap(): MetadataRoute.Sitemap {
  const repository = getDefaultPriorityRepository();
  const routes = ["/", "/about", "/browse", "/corrections", "/methodology", "/sources"];
  const briefs = repository.getBriefs().map(row => `/priorities/${encodeURIComponent(row.seatCycleId)}`);
  return [...new Set([...routes, ...briefs])].map(path => ({ url: new URL(path, publicOrigin).href }));
}
