import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Left Field",
    short_name: "Left Field",
    description: "Ranked research briefs for Congress, governorships, and state legislatures, with the source record behind each score.",
    start_url: "/",
    display: "browser",
    background_color: "#f4f0e6",
    theme_color: "#f4f0e6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
