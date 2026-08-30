import { Construction } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div data-testid={`coming-soon-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-2xl font-black tracking-tight text-white">{title}</h1>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
          PLANNED MODULE
        </span>
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-obsidian-900/60 p-8 md:p-10">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
          <Construction className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-heading text-lg font-bold text-white">Module in development</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400 font-body">
          The <strong>{title}</strong> operations module is part of the operational deployment pipeline. Its backend schema and permission keys exist in the system, so this section can be enabled without breaking changes.
        </p>
      </div>
    </div>
  );
}
