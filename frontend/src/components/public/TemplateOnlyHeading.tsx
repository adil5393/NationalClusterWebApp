import { FlaskConical } from "lucide-react";

/** Marks a public page as showing placeholder/template data, not real event info. */
export function TemplateOnlyHeading() {
  return (
    <div
      data-testid="template-only-heading"
      className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5"
    >
      <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
      <h2 className="text-xs font-heading font-extrabold uppercase tracking-widest text-amber-300">
        Template Only
      </h2>
    </div>
  );
}
