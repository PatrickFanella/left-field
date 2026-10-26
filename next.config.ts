import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const csp = ["default-src 'self'", `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "form-action 'self'", "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");
const protectedHeaders = [{ key: "Cache-Control", value: "no-store" }, { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Frame-Options", value: "DENY" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Permissions-Policy", value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()" }, { key: "Content-Security-Policy", value: csp }];
// CI containers have two CPUs and 6 GiB; host CPU detection overcommits workers.
const nextConfig: NextConfig = { ...(process.env.CI === "true" ? { experimental: { cpus: 2 } } : {}), async headers() { return [{ source: "/lookup", headers: protectedHeaders }, { source: "/corrections", headers: protectedHeaders }, { source: "/api/address/:path*", headers: protectedHeaders }, { source: "/api/corrections/:path*", headers: protectedHeaders }]; } };

export default nextConfig;
