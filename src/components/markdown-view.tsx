// Single source of truth for rendering Card markdown. Used by the editor preview
// and (when issue #17 lands) the review session UI. Pipeline matches ADR-0006:
// react-markdown + remark-gfm + rehype-sanitize. Sanitization is non-negotiable —
// shared decks come from strangers (ADR-0006).

import { cn } from "@/lib/cn";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-slate max-w-none dark:prose-invert prose-img:rounded-md",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
