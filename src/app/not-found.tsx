import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <p className="text-sm uppercase tracking-[0.2em] text-sage">Reach</p>
      <h1 className="serif mt-2 text-4xl text-sage-deep">That card is not here</h1>
      <p className="mt-3 text-muted">It may have been archived or the link is old.</p>
      <Link href="/enquiries" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-sage px-5 text-paper">
        Back to Enquiries
      </Link>
    </div>
  );
}
