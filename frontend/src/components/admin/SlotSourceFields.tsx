import { Label, Select } from "@/components/ui/input";

// Where a knockout match's team slot gets its team from once it isn't a fixed
// pick: an earlier match's winner, or a pool's qualifier at a rank. Backend
// counterpart: routers/matches.py _check_slot_sources / _fill_slots_from_sources.
export interface SlotSource {
  kind: "none" | "match" | "pool";
  matchId: string;
  poolId: string;
  rank: string;
}

export const NO_SLOT_SOURCE: SlotSource = { kind: "none", matchId: "", poolId: "", rank: "1" };

export interface SlotSourceOptions {
  matches: { id: number; label: string }[];
  pools: { id: number; label: string }[];
}

const RANK_LABELS = ["Winner (1st)", "Runner-up (2nd)", "3rd", "4th"];

// Builds the four source_* fields for one slot, nulling whichever kind isn't
// in use so a re-link never leaves a stale source behind.
export function slotSourcePayload(slot: "a" | "b", v: SlotSource) {
  return {
    [`source_match_${slot}_id`]: v.kind === "match" && v.matchId ? Number(v.matchId) : null,
    [`source_pool_${slot}_id`]: v.kind === "pool" && v.poolId ? Number(v.poolId) : null,
    [`source_pool_${slot}_rank`]: v.kind === "pool" && v.poolId ? Number(v.rank) : null,
  } as Record<string, number | null>;
}

export function SlotSourcePicker({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: SlotSource;
  onChange: (next: SlotSource) => void;
  options: SlotSourceOptions;
  testId: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value.kind}
        onChange={(e) => onChange({ ...NO_SLOT_SOURCE, kind: e.target.value as SlotSource["kind"] })}
        data-testid={`${testId}-kind`}
      >
        <option value="none">Use the team picked above</option>
        <option value="match">Winner of an earlier match</option>
        <option value="pool">Qualifier from a pool</option>
      </Select>

      {value.kind === "match" && (
        <Select
          value={value.matchId}
          onChange={(e) => onChange({ ...value, matchId: e.target.value })}
          data-testid={`${testId}-match`}
        >
          <option value="">Choose a match…</option>
          {options.matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      )}

      {value.kind === "pool" && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select
            value={value.poolId}
            onChange={(e) => onChange({ ...value, poolId: e.target.value })}
            data-testid={`${testId}-pool`}
          >
            <option value="">Choose a pool…</option>
            {options.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select
            value={value.rank}
            onChange={(e) => onChange({ ...value, rank: e.target.value })}
            data-testid={`${testId}-rank`}
          >
            {RANK_LABELS.map((r, i) => (
              <option key={i} value={i + 1}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
