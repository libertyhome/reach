export function SourceBadge({ label, campaign }: { label: string; campaign?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-sage px-3 py-1 text-xs font-medium text-paper">
      <span>{label}</span>
      {campaign ? <span className="font-normal opacity-80">· {campaign}</span> : null}
    </span>
  );
}
