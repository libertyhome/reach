export const metadata = {
  title: "Privacy notice — Liberty Home",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-sm uppercase tracking-[0.18em] text-sage">Liberty Home</p>
      <h1 className="serif mt-2 text-4xl text-sage-deep">Privacy notice for enquiries</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>
          Liberty Home Addiction Care, in Cape Town, uses Reach to handle commercial enquiries for Weltevreden Manor
          and Liberty Lodge. This notice covers the contact form and advertising lead forms. Clinical records stay in
          Within after someone is admitted, and are not collected on this form.
        </p>
        <p>
          We ask for the caller’s name, the resident’s name if it is different, a phone number or email address,
          country, preferred house, and any message you choose to leave. If you arrive from an advert, we also store
          the campaign name and the advertising identifiers that came with the click (UTM parameters, gclid, fbclid),
          plus the page you were on and the page that referred you. That lets admissions see which advert the enquiry
          came from.
        </p>
        <p>
          We use these details to reply to the enquiry, decide which house may be suitable, and understand which
          campaigns are working. We do not sell the details. Staff who work on admissions, accounts, and leadership
          can see them inside Reach.
        </p>
        <p>
          The tick box is your consent under the Protection of Personal Information Act (POPIA) for us to use the
          details for that purpose. You can ask admissions what we hold, ask us to correct it, or ask us to delete an
          enquiry we no longer need. Contact the admissions desk at Liberty Home and mention the enquiry.
        </p>
        <p>
          Leads that start on Meta (Facebook or Instagram) or Google Ads are sent to Reach by those platforms. Their
          own privacy notices apply to the form you filled in there. Reach then stores the lead as a New Enquiry with
          the matching source.
        </p>
      </div>
    </main>
  );
}
