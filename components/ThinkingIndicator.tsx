"use client";

import Image from "next/image";

export function ThinkingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-live="polite" aria-label="Pensando">
      <div className="flex items-center gap-2 px-3 py-2">
        <Image
          src="/logo-cora.png"
          alt="CORA IA"
          width={32}
          height={32}
          className="rounded-full"
        />
        <span className="thinking-dots" aria-hidden>
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </span>
      </div>
    </div>
  );
}
