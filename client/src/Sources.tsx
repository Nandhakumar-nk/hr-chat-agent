// Clickable links back to the real policy PDFs a search_hr_policy call
// cited this turn - built from toolActivity's own structured data
// (source/file/page), not parsed from the model's free-form citation
// prose, which varies in wording turn to turn.

import { policyFileUrl, type ToolActivityEntry } from "./api";

interface SourceRef {
  source: string;
  file: string;
  page?: number;
}

export function Sources({ activity }: { activity: ToolActivityEntry[] }) {
  const refs = extractSources(activity);
  if (refs.length === 0) {
    return null;
  }

  return (
    <div className="sources">
      {refs.map((ref, i) => (
        <a key={i} href={policyFileUrl(ref.file, ref.page)} target="_blank" rel="noreferrer">
          {ref.source}
          {ref.page ? ` — page ${ref.page}` : ""}
        </a>
      ))}
    </div>
  );
}

function extractSources(activity: ToolActivityEntry[]): SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];

  for (const entry of activity) {
    if (entry.name !== "search_hr_policy") continue;

    let parsed: { results?: { source?: string; file?: string; page?: number }[] };
    try {
      parsed = JSON.parse(entry.result);
    } catch {
      continue;
    }

    for (const r of parsed.results ?? []) {
      if (!r.source || !r.file) continue;
      const key = `${r.source}-${r.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ source: r.source, file: r.file, page: r.page });
    }
  }

  return refs;
}
