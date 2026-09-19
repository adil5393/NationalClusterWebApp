import { useState } from "react";
import { IdCard, Download } from "lucide-react";
import { BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

// Mirrors backend/app/id_card.py's A4_SHEET/SHEET_12X18 grids (cols * rows
// cards per sheet) plus the "a7" one-card-per-own-page option, for the "how
// many sheets/pages will this need" hint below. Update this alongside
// id_card.py if those layouts ever change.
const SHEETS = [
  { value: "a7", label: "Single card page", cardsPerSheet: 1 },
  { value: "a4", label: "A4 (21 x 29.7cm) grid sheet", cardsPerSheet: 6 },
  { value: "12x18", label: "12in x 18in print-shop stock grid sheet", cardsPerSheet: 12 },
] as const;

type Role = "Coach" | "Manager" | "Participant" | "Volunteer" | "Official";

// Physical single-card page size per card type (id_card.py CARD_*_CM /
// STAFF_PAGE_*_CM).
const SINGLE_CARD_SIZE: Record<Role, string> = {
  Coach: "8.2 x 11.5cm",
  Manager: "8.2 x 11.5cm",
  Participant: "6.6 x 11.5cm",
  Volunteer: "6.6 x 11.5cm",
  Official: "8.2 x 11.5cm",
};

// Coach/Manager/Official (8.2 x 11.5cm) cards fit fewer per sheet than participant/
// volunteer (6.6 x 11.5cm) ones — mirrors id_card.staff_sheet_layout.
const STAFF_PER_SHEET: Record<string, number> = { a4: 4, "12x18": 9 };

const MAX_COUNT = 500;

export default function BlankIdCards() {
  const [role, setRole] = useState<Role>("Coach");
  const [sheet, setSheet] = useState<(typeof SHEETS)[number]["value"]>("a7");
  const [count, setCount] = useState("25");

  const countNum = Number(count);
  const valid = Number.isFinite(countNum) && countNum > 0 && countNum <= MAX_COUNT;
  const isStaff = role === "Coach" || role === "Manager" || role === "Official";
  const cardsPerSheet =
    isStaff && STAFF_PER_SHEET[sheet] ? STAFF_PER_SHEET[sheet] : SHEETS.find((s) => s.value === sheet)?.cardsPerSheet ?? 1;
  const sheetsNeeded = valid ? Math.ceil(countNum / cardsPerSheet) : 0;

  const downloadUrl = `${BASE_URL}/api/export/idcards/blank/staff.pdf?role=${role}&count=${countNum || 0}&sheet=${sheet}`;

  return (
    <div data-testid="admin-blank-idcards" className="space-y-6 max-w-xl">
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          PRE-PRINTING STOCK
        </span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Blank ID Card Stock
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Download a sheet of blank Participant, Volunteer, Official, Coach or Manager cards — no name, photo, or team data filled in — for
          pre-printing before anyone's been assigned a card.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Card Type</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} data-testid="blank-idcard-role-select">
              <option value="Participant">Participant</option>
              <option value="Volunteer">Volunteer</option>
              <option value="Official">Official</option>
              <option value="Coach">Coach</option>
              <option value="Manager">Manager</option>
            </Select>
          </div>
          <div>
            <Label>Sheet / Paper Size</Label>
            <Select value={sheet} onChange={(e) => setSheet(e.target.value as (typeof SHEETS)[number]["value"])} data-testid="blank-idcard-sheet-select">
              {SHEETS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value === "a7" ? `Single card page (${SINGLE_CARD_SIZE[role]}) — one card per page` : s.label}
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
            data-testid="blank-idcard-count-input"
          />
          {!valid && (
            <p className="mt-1 text-xs text-red-400">Enter a number between 1 and {MAX_COUNT}.</p>
          )}
        </div>

        {valid && (
          <p className="text-xs text-slate-400 font-body" data-testid="blank-idcard-sheets-hint">
            {sheet === "a7" ? (
              <>
                One card per page — this will print{" "}
                <strong className="text-white">{sheetsNeeded}</strong> {sheetsNeeded === 1 ? "page" : "pages"}.
              </>
            ) : (
              <>
                {cardsPerSheet} cards per sheet — this will print on{" "}
                <strong className="text-white">{sheetsNeeded}</strong> {sheetsNeeded === 1 ? "sheet" : "sheets"}.
              </>
            )}
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
          data-testid="download-blank-idcards-btn"
        >
          <IdCard className="h-4 w-4" />
          <Download className="h-4 w-4" />
          Download Blank {role} Cards (PDF)
        </a>
      </div>
    </div>
  );
}
