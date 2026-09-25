import { headers } from "next/headers";

export async function publicOrigin() {
  const configured = process.env.REACH_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}
