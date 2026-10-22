import { mapStateDetail } from "@/lib/national-map";

export const runtime = "nodejs";

/** Seats and FEC candidates for one state, read by the /map client when a state is opened. */
export async function GET(_request: Request, context: { params: Promise<{ state: string }> }): Promise<Response> {
  const { state } = await context.params;
  const detail = /^[A-Z]{2}$/.test(state) ? mapStateDetail(state) : undefined;
  if (!detail) return Response.json({ status: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(detail, { headers: { "Cache-Control": "public, max-age=300" } });
}
