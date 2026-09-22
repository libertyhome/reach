type Variant = "lockup" | "header";

export function BrandMark({
  variant = "header",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === "lockup") {
    return (
      <div className={className}>
        <p className="text-sm uppercase tracking-[0.22em] text-sage">Liberty Home</p>
        <p className="serif mt-1 text-5xl text-sage-deep">Reach</p>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-sage">Liberty Home</p>
      <p className="serif text-2xl leading-none text-sage-deep">Reach</p>
    </div>
  );
}
