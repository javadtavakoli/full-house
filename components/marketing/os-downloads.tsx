"use client";

import { useEffect, useState } from "react";
import { Apple, Download, Monitor, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

type Os = "windows" | "mac" | "linux";

export type OsAsset = { label: string; href: string; hint?: string };
export type OsGroup = { os: Os; title: string; assets: OsAsset[] };

const ICONS: Record<Os, typeof Monitor> = {
  windows: Monitor,
  mac: Apple,
  linux: Terminal,
};

function detectOs(ua: string): Os | null {
  const s = ua.toLowerCase();
  if (s.includes("windows")) return "windows";
  if (s.includes("mac")) return "mac";
  if (s.includes("linux") || s.includes("x11")) return "linux";
  return null;
}

export function OsDownloads({ groups }: { groups: OsGroup[] }) {
  // Render with nothing highlighted on the server; detect on the client.
  const [detected, setDetected] = useState<Os | null>(null);

  useEffect(() => {
    setDetected(detectOs(navigator.userAgent));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {groups.map((g) => {
        const Icon = ICONS[g.os];
        const isDetected = detected === g.os;
        return (
          <div
            key={g.os}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-5 transition-colors",
              isDetected && "border-primary ring-1 ring-primary",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className="size-5" />
              <h3 className="font-semibold">{g.title}</h3>
              {isDetected && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Your OS
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {g.assets.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Download className="size-4 shrink-0" />
                  <span className="font-medium">{a.label}</span>
                  {a.hint && (
                    <span className="ml-auto text-xs text-muted-foreground">{a.hint}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
