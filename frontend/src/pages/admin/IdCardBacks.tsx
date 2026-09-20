import { useState } from "react";
import { IdCard, Download } from "lucide-react";
import { BASE_URL } from "@/lib/api";
import { Input, Label, Select } from "@/components/ui/input";

// Mirrors backend/app/id_card.py: the two back-side sizes match the fronts
// (participant/volunteer vs. coach/manager/official) and the sheet grids are
// A4_SHEET/SHEET_12X18 vs. their staff_sheet_layout equivalents.
const SIZES = [
  { value: "participant", label: "Participant / Volunteer (6.6 x 11.5cm)", perSheet: { a4: 6, "12x18": 12 } },
  { value: "staff", label: "Coach / Manager / Official (8.2 x 11.5cm)", perSheet: { a4: 4, "12x18": 9 } },
] as const;

const SHEETS = [
  { value: "a7", label: "Single card page — one card per page" },
  { value: "a4", label: "A4 (21 x 29.7cm) grid sheet" },
  { value: "12x18", label: "12in x 18in print-shop stock grid sheet" },
] as const;

const MAX_COUNT = 500;

export default function IdCardBacks() {
  const [size, setSize] = useState<(typeof SIZES)[number]["value"]>("participant");
  const [sheet, setSheet] = useState<(typeof SHEETS)[number]["value"]>("a7");
  const [count, setCount] = useState("25");

  const countNum = Number(count);
  const valid = Number.isFinite(countNum) && countNum > 0 && countNum <= MAX_COUNT;
  const perSheet = sheet === "a7" ? 1 : SIZES.find((s) => s.value === size)!.perSheet[sheet];
  const pagesNeeded = valid ? Math.ceil(countNum / perSheet) : 0;
  const downloadUrl = `${BASE_URL}/api/export/idcards/back.pdf?size=${size}&count=${countNum || 0}&sheet=${sheet}`;

  return (
    <div data-testid="admin-idcard-backs" className="space-y-6 max-w-xl">
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">PRE-PRINTING STOCK</span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">ID Card Back</h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Download the back side of the ID card in the size that matches the front — one for Participant / Volunteer
          cards, one for Coach / Manager / Official cards.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Card Size</Label>
            <Select value={size} onChange={(e) => setSize(e.target.value as typeof size)} data-testid="idcard-back-size-select">
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Sheet / Paper Size</Label>
            <Select value={sheet} onChange={(e) => setSheet(e.target.value as typeof sheet)} data-testid="idcard-back-sheet-select">
              {SHEETS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Number of Cards</Label>
          <Input
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            data-testid="idcard-back-count-input"
          />
          {!valid && <p className="mt-1 text-xs text-red-400">Enter a number between 1 and {MAX_COUNT}.</p>}
        </div>

        {valid && (
          <p className="text-xs text-slate-400 font-body" data-testid="idcard-back-sheets-hint">
            {sheet === "a7" ? "One card per page" : `${perSheet} cards per sheet`} — this will print{" "}
            <strong className="text-white">{pagesNeeded}</strong>{" "}
            {sheet === "a7" ? (pagesNeeded === 1 ? "page" : "pages") : pagesNeeded === 1 ? "sheet" : "sheets"}.
          </p>
        )}

        <a
          href={valid ? downloadUrl : undefined}
          aria-disabled={!valid}
          className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-heading font-extrabold uppercase tracking-wide transition-colors ${
            valid
              ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/15 cursor-pointer"
              : "border-white/10 bg-white/5 text-slate-500 cursor-not-allowed pointer-events-none"
          }`}
          data-testid="download-idcard-backs-btn"
        >
          <IdCard className="h-4 w-4" />
          <Download className="h-4 w-4" />
          Download ID Card Backs (PDF)
        </a>
      </div>
    </div>
  );
}
