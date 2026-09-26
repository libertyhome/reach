export function ExportExcelLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-12 items-center rounded-full border border-line bg-paper px-5 py-3 text-sm"
    >
      Export to Excel
    </a>
  );
}
