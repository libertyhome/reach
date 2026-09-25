import { getActiveLeadFormBySlug } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const form = getActiveLeadFormBySlug(slug);
  if (!form) return new Response("Not found", { status: 404 });
  const body = `(() => {
  var slug = ${JSON.stringify(form.slug)};
  var script = document.currentScript;
  if (!script || !script.src) return;
  var src = new URL(script.src);
  var params = new URLSearchParams();
  var page = new URLSearchParams(window.location.search);
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(function (key) {
    var value = page.get(key);
    if (value) params.set(key, value);
  });
  params.set("landing_url", window.location.href);
  if (document.referrer) params.set("referrer_url", document.referrer);
  var iframe = document.createElement("iframe");
  iframe.title = "Liberty Home enquiry";
  iframe.src = src.origin + "/f/" + encodeURIComponent(slug) + "/embed?" + params.toString();
  iframe.style.width = "100%";
  iframe.style.minHeight = "920px";
  iframe.style.border = "0";
  iframe.setAttribute("loading", "lazy");
  script.insertAdjacentElement("afterend", iframe);
})();`;
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
