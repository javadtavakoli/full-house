"use client";

import { useState } from "react";
import { CodeBlock } from "./code-block";
import { cn } from "@/lib/utils";

export type CommandVariant = { label: string; code: string };

/**
 * Renders package-manager / runner variants of a command.
 * All variants are present in the DOM (good for crawlers + no-JS); JS only
 * toggles which one is visible.
 */
export function CommandTabs({
  variants,
  className,
}: {
  variants: CommandVariant[];
  className?: string;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="tablist" className="flex flex-wrap gap-1">
        {variants.map((v, i) => (
          <button
            key={v.label}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              i === active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {variants.map((v, i) => (
        <div key={v.label} hidden={i !== active}>
          <CodeBlock code={v.code} language="bash" />
        </div>
      ))}
    </div>
  );
}
