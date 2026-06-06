import Link from "next/link";
import { ExternalLink } from "lucide-react";

export function IssueCard({
  youtrackBaseUrl, keyId, summary, description,
}: {
  youtrackBaseUrl: string;
  keyId: string;
  summary: string;
  description: string | null;
}) {
  const href = `${youtrackBaseUrl.replace(/\/$/, "")}/issue/${keyId}`;
  return (
    <div className="text-center flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Current Issue</div>
      <h2 className="text-2xl font-semibold flex items-center justify-center gap-2 flex-wrap">
        <Link href={href} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
          {keyId}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
        <span className="text-muted-foreground">—</span>
        <span>{summary}</span>
      </h2>
      {description ? (
        <p className="text-sm text-foreground whitespace-pre-wrap max-w-2xl mx-auto text-left">{description}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">No description in YouTrack.</p>
      )}
    </div>
  );
}
