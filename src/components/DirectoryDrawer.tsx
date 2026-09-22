"use client";

import { useState } from "react";

export function DirectoryDrawer({
  title,
  triggerLabel,
  children,
}: {
  title: string;
  triggerLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full border border-line px-4 text-sm hover:bg-sand/70"
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close directory"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="serif text-2xl text-sage-deep">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-full border border-line px-4 text-sm"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
