import { ThankYou } from "@/components/PublicLeadForm";

export const metadata = {
  title: "Thank you — Liberty Home",
  robots: { index: false, follow: false },
};

export default function LeadFormThanksPage() {
  return (
    <main>
      <ThankYou title="Thank you" body="Admissions has this enquiry and will be in touch." />
    </main>
  );
}
