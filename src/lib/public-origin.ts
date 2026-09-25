import { headers } from "next/headers";

type HeaderSource = { get(name: string): string | null };

function firstForwarded(value: string | null) {
  if (!value) return "";
  return value.split(",")[0]?.trim() ?? "";
}

/** Public site origin. REACH_PUBLIC_URL wins, then the proxy's forwarded host. */
export function originFrom(headerList: HeaderSource) {
  const configured = process.env.REACH_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = firstForwarded(headerList.get("x-forwarded-proto")) || "http";
  const host = firstForwarded(headerList.get("x-forwarded-host")) || headerList.get("host") || "localhost:3001";
  return `${proto}://${host}`;
}

export async function publicOrigin(headerList?: HeaderSource) {
  return originFrom(headerList ?? (await headers()));
}
