import { Construction } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div data-testid={`coming-soon-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-slate-900 text-white">
          <Construction className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-heading text-lg font-bold text-slate-900">Coming later</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          The <strong>{title}</strong> module is part of the roadmap (Phase 2+). Its data model already exists in the
          database, so this section can be built out without schema changes. No placeholder functionality is shown here
          on purpose.
        </p>
      </div>
    </div>
  );
}
