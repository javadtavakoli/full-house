import Link from "next/link";

export function IssueCard({ keyId, summary, description }: { keyId: string; summary: string; description: string | null }) {
  const href = `${process.env.NEXT_PUBLIC_YT_BASE_URL ?? ""}/issue/${keyId}`;
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Current Issue</div>
      <h2 className="text-2xl font-semibold mt-1">
        <Link href={href} target="_blank" className="hover:underline">{keyId}</Link>
        <span className="mx-2 text-muted-foreground">—</span>{summary}
      </h2>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-prose mx-auto">{description}</p>}
    </div>
  );
}
