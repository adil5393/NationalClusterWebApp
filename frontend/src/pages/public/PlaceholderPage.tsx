import { Construction } from "lucide-react";

export function PlaceholderPage({ title, section }: { title: string; section: string }) {
  return (
    <div className="mx-auto max-w-7xl px-5 md:px-8 py-20 md:py-24 text-slate-100" data-testid={`placeholder-${section.toLowerCase()}`}>
      <span className="text-xs font-bold uppercase tracking-widest text-coral">{section}</span>
      <h1 className="mt-3 font-heading text-4xl font-black tracking-tight text-white sm:text-5xl">{title}</h1>
      <div className="mt-10 rounded-lg border border-dashed border-white/15 bg-white/5 p-10 md:p-14">
        <div className="grid h-12 w-12 place-items-center rounded-md bg-coral/20 text-coral border border-coral/30">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="mt-6 font-heading text-xl font-bold text-white">This section is coming soon</h2>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-300">
          The structure for <strong>{title}</strong> is in place. Detailed, verified event information will be
          published here as organizers finalise the arrangements. We intentionally avoid showing invented details.
        </p>
        <p className="mt-4 inline-block rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-400">
          [EXAMPLE] Placeholder page · no real event data shown yet
        </p>
      </div>
    </div>
  );
}
