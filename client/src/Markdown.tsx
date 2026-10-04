// Agent answers contain markdown (bold, lists, occasionally tables from
// cited policy text) - this renders it properly instead of showing
// "**like this**" as raw text. remark-gfm adds GitHub-flavored markdown
// (tables, strikethrough) since RAG citations sometimes include tables.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
