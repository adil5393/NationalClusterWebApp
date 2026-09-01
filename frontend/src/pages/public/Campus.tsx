import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapIcon,
  LocateFixed,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MapPin,
  Compass,
  Building,
  Info,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { MAP_VIEWBOX, findHotspot, type RoomHotspot } from "@/lib/campusMap";

type Mode = "view" | "find";

interface Team {
  id: number;
  name: string;
  school?: string;
  school_code?: string | null;
}

interface AccommodationRow {
  room?: string;
  floor?: string;
  building?: string;
  notes?: string;
}

interface TeamDetail {
  id: number;
  name: string;
  accommodation: AccommodationRow[];
}

interface ResolvedRoom extends AccommodationRow {
  hotspot?: RoomHotspot;
}

const MIN_ZOOM_MULT = 1;
const MAX_ZOOM_MULT = 6;
const FIND_ZOOM_MULT = 3.2;

export default function Campus() {
  const [mode, setMode] = useState<Mode>("view");
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [fitScale, setFitScale] = useState(0.1);
  const [scale, setScale] = useState(0.1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [animated, setAnimated] = useState(true);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    dragging: boolean;
  }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    dragging: false,
  });
  // Two-finger pinch-to-zoom: tracks every currently-down pointer by id so we
  // can tell a single-finger pan from a two-finger pinch (Pointer Events fire
  // for touch too, but give no gesture info on their own — this is what turns
  // raw pointer positions into a pinch distance/midpoint).
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startScale: number; startPos: { x: number; y: number } } | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [resolved, setResolved] = useState<ResolvedRoom[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Mirrored in refs so the native wheel listener always reads fresh values
  const posRef = useRef(pos);
  const scaleRef = useRef(scale);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  // Keeps the map filling the viewport rather than panning/zooming past edges
  const clampPan = (p: { x: number; y: number }, s: number, w: number, h: number) => {
    const contentW = MAP_VIEWBOX.width * s;
    const contentH = MAP_VIEWBOX.height * s;
    const x = contentW <= w ? (w - contentW) / 2 : Math.min(0, Math.max(w - contentW, p.x));
    const y = contentH <= h ? (h - contentH) / 2 : Math.min(0, Math.max(h - contentH, p.y));
    return { x, y };
  };

  const applyTransform = useCallback(
    (nextPos: { x: number; y: number }, nextScale: number, animate: boolean) => {
      if (!animate) {
        setAnimated(false);
        setScale(nextScale);
        setPos(nextPos);
        return;
      }
      setAnimated(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setScale(nextScale);
          setPos(nextPos);
        });
      });
    },
    [],
  );

  const centerAt = useCallback(
    (x: number, y: number, targetScale: number, animate = true) => {
      const { w, h } = viewportRef.current
        ? { w: viewportRef.current.clientWidth, h: viewportRef.current.clientHeight }
        : viewportSize;
      const next = clampPan(
        { x: w / 2 - x * targetScale, y: h / 2 - y * targetScale },
        targetScale,
        w,
        h,
      );
      applyTransform(next, targetScale, animate);
    },
    [viewportSize, applyTransform],
  );

  // Fit the whole map into viewport
  const fitToViewport = useCallback(
    (animate = false) => {
      const el = viewportRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = Math.min(w / MAP_VIEWBOX.width, h / MAP_VIEWBOX.height) * 0.96;
      setViewportSize({ w, h });
      setFitScale(s);
      centerAt(MAP_VIEWBOX.width / 2, MAP_VIEWBOX.height / 2, s, animate);
    },
    [centerAt],
  );

  useEffect(() => {
    fitToViewport(false);
    const onResize = () => fitToViewport(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get<Team[]>("/public/teams").then((r) => setTeams(r.data));
  }, []);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const layerX = (cx - pos.x) / scale;
    const layerY = (cy - pos.y) / scale;
    const next = clamp(scale * factor, fitScale * MIN_ZOOM_MULT, fitScale * MAX_ZOOM_MULT);
    applyTransform(clampPan({ x: cx - layerX * next, y: cy - layerY * next }, next, w, h), next, true);
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const curScale = scaleRef.current;
      const curPos = posRef.current;
      const layerX = (cx - curPos.x) / curScale;
      const layerY = (cy - curPos.y) / curScale;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clamp(
        curScale * factor,
        fitScaleRef.current * MIN_ZOOM_MULT,
        fitScaleRef.current * MAX_ZOOM_MULT,
      );
      const w = el.clientWidth;
      const h = el.clientHeight;
      applyTransform(clampPan({ x: cx - layerX * next, y: cy - layerY * next }, next, w, h), next, false);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTransform]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
      // Second finger just landed — stop panning, start a pinch instead.
      dragRef.current.dragging = false;
      const [p1, p2] = [...activePointers.current.values()];
      pinchRef.current = {
        startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        startScale: scaleRef.current,
        startPos: posRef.current,
      };
      setAnimated(false);
    } else if (activePointers.current.size === 1) {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        dragging: true,
      };
      setAnimated(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const el = viewportRef.current;
    const w = el ? el.clientWidth : viewportSize.w;
    const h = el ? el.clientHeight : viewportSize.h;

    if (activePointers.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...activePointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const rect = el?.getBoundingClientRect();
      const cx = (p1.x + p2.x) / 2 - (rect?.left ?? 0);
      const cy = (p1.y + p2.y) / 2 - (rect?.top ?? 0);
      const { startDist, startScale, startPos } = pinchRef.current;
      const nextScale = clamp(
        startScale * (dist / startDist),
        fitScale * MIN_ZOOM_MULT,
        fitScale * MAX_ZOOM_MULT,
      );
      // Anchor against the pinch's start position/scale (not the previous
      // frame's) so small per-frame rounding never compounds into drift.
      const layerX = (cx - startPos.x) / startScale;
      const layerY = (cy - startPos.y) / startScale;
      setScale(nextScale);
      setPos(clampPan({ x: cx - layerX * nextScale, y: cy - layerY * nextScale }, nextScale, w, h));
      return;
    }

    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clampPan({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy }, scale, w, h));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (activePointers.current.size < 2) {
      pinchRef.current = null;
    }
    if (activePointers.current.size === 1) {
      // One finger lifted off a pinch — resume panning from here instead of
      // jumping to wherever the old single-finger drag start was.
      const [remaining] = [...activePointers.current.values()];
      dragRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        startPosX: posRef.current.x,
        startPosY: posRef.current.y,
        dragging: true,
      };
    } else if (activePointers.current.size === 0) {
      dragRef.current.dragging = false;
    }
  };

  const selectTeam = async (id: string) => {
    setTeamId(id);
    setActiveIdx(0);
    if (!id) {
      setResolved([]);
      return;
    }
    setLoadingTeam(true);
    try {
      const res = await api.get<TeamDetail>(`/public/teams/${id}`);
      const acc = res.data.accommodation ?? [];
      const resList: ResolvedRoom[] = acc.map((r) => ({
        ...r,
        hotspot: r.room ? findHotspot(r.building, r.room) : undefined,
      }));
      setResolved(resList);
      const firstHit = resList.find((r) => r.hotspot);
      if (firstHit && firstHit.hotspot) {
        centerAt(firstHit.hotspot.x, firstHit.hotspot.y, fitScale * FIND_ZOOM_MULT, true);
      }
    } finally {
      setLoadingTeam(false);
    }
  };

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const lookupByCode = () => {
    const code = codeInput.trim();
    if (!code) return;
    const match = teams.find((t) => t.school_code && t.school_code.toLowerCase() === code.toLowerCase());
    if (!match) {
      setCodeError(`No team found with school code "${code}"`);
      return;
    }
    setCodeError(null);
    selectTeam(String(match.id));
  };

  const jumpTo = (idx: number) => {
    setActiveIdx(idx);
    const h = resolved[idx]?.hotspot;
    if (h) centerAt(h.x, h.y, fitScale * FIND_ZOOM_MULT, true);
  };

  const resolvedHits = useMemo(() => resolved.filter((r) => r.hotspot), [resolved]);
  const unresolved = useMemo(() => resolved.filter((r) => !r.hotspot), [resolved]);
  const selectedTeamName = useMemo(() => teams.find((t) => String(t.id) === teamId)?.name, [teams, teamId]);

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 bg-kabaddi-court min-h-screen"
      data-testid="public-campus"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              VENUE & INFRASTRUCTURE
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
              INTERACTIVE BLUEPRINT
            </span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Campus & Court Map
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-slate-400 font-body leading-relaxed">
            Navigate the host campus, inspect match courts, or pinpoint your team's assigned hostel room.
          </p>
        </div>

        {/* MODE TOGGLE */}
        <div
          className="inline-flex rounded-lg border border-white/10 bg-obsidian-900 p-1 shrink-0"
          data-testid="campus-mode-toggle"
        >
          <button
            onClick={() => {
              setMode("view");
              fitToViewport(true);
            }}
            data-testid="mode-view"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-xs font-heading font-bold transition-all",
              mode === "view"
                ? "bg-gold text-obsidian shadow-sm"
                : "text-slate-400 hover:text-white",
            )}
          >
            <Compass className="h-4 w-4" /> View Campus
          </button>
          <button
            onClick={() => setMode("find")}
            data-testid="mode-find"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-xs font-heading font-bold transition-all",
              mode === "find"
                ? "bg-gold text-obsidian shadow-sm"
                : "text-slate-400 hover:text-white",
            )}
          >
            <LocateFixed className="h-4 w-4" /> Find My Room
          </button>
        </div>
      </div>

      {/* FIND MY ROOM SEARCH PANEL */}
      {mode === "find" && (
        <div className="mt-6 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 via-obsidian-900 to-obsidian p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-heading text-sm font-bold text-white flex items-center gap-2">
                <Search className="h-4 w-4 text-gold" /> Search by School Code or Name
              </h3>
              <p className="text-xs text-slate-400 font-body mt-0.5">
                Enter your official school code (e.g. 101, DPS, KV) to highlight your rooms on the blueprint.
              </p>
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                lookupByCode();
              }}
            >
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Enter school code…"
                className="w-48 h-9 text-xs"
                data-testid="campus-school-code-input"
              />
              <Button
                type="submit"
                variant="gold"
                size="sm"
                className="h-9 text-xs font-bold"
                data-testid="campus-school-code-submit"
              >
                Locate
              </Button>
            </form>
          </div>

          {loadingTeam && (
            <div className="py-4">
              <Spinner label="Pinpointing team rooms on interactive map…" />
            </div>
          )}

          {codeError && <p className="mt-3 text-xs text-red-400 font-semibold">{codeError}</p>}

          {!loadingTeam && teamId && selectedTeamName && (
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-300 font-body">
                Team: <strong className="text-white font-bold">{selectedTeamName}</strong>
              </p>
              {resolvedHits.length > 0 && (
                <span className="text-[11px] text-gold font-mono font-bold">
                  {resolvedHits.length} Pinned Room{resolvedHits.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {!loadingTeam && teamId && resolved.length === 0 && (
            <p className="mt-3 text-xs text-slate-400">
              This squad does not have a designated room assigned yet. Please visit the reception desk in Admin Building.
            </p>
          )}

          {/* ROOM CHIPS */}
          {!loadingTeam && resolvedHits.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {resolved.map((r, i) =>
                r.hotspot ? (
                  <button
                    key={i}
                    onClick={() => jumpTo(i)}
                    data-testid={`room-chip-${i}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-heading font-bold transition-all",
                      i === activeIdx
                        ? "border-gold bg-gold text-obsidian shadow-gold-glow/50 font-black scale-105"
                        : "border-white/15 bg-obsidian-900 text-slate-300 hover:border-gold/50 hover:bg-white/10",
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{r.building} · Room {r.room}</span>
                  </button>
                ) : null,
              )}
            </div>
          )}

          {!loadingTeam && unresolved.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg border border-white/10 bg-obsidian-950 p-3">
              {unresolved.map((r, i) => (
                <p key={i} className="text-xs text-slate-400 flex items-center gap-2">
                  <Building className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-200">Room {r.room ?? "—"}</span>
                  {r.building && <span>· {r.building}</span>}
                  {r.floor && <span>· {r.floor}</span>}
                  <span className="text-[10px] text-slate-500 font-mono italic">(offline assignment)</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MAP VIEWPORT CONTAINER */}
      <div className="mt-6 rounded-2xl border border-white/15 bg-obsidian-950 overflow-hidden shadow-2xl relative">
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative h-[72vh] min-h-[460px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          data-testid="campus-map-viewport"
        >
          <div
            className={cn(
              "absolute left-0 top-0 origin-top-left will-change-transform",
              animated && "transition-transform duration-500 ease-out",
            )}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              width: MAP_VIEWBOX.width,
              height: MAP_VIEWBOX.height,
            }}
          >
            <img
              src="/campus-map.svg"
              alt="Campus map"
              width={MAP_VIEWBOX.width}
              height={MAP_VIEWBOX.height}
              draggable={false}
              className="pointer-events-none select-none"
            />
            {mode === "find" &&
              resolved.map(
                (r, i) =>
                  r.hotspot && (
                    <div
                      key={i}
                      className="absolute pointer-events-none"
                      style={{
                        left: r.hotspot.x,
                        top: r.hotspot.y,
                        width: r.hotspot.w,
                        height: r.hotspot.h,
                        transform: `translate(-50%, -50%)${
                          r.hotspot.rot ? ` rotate(${r.hotspot.rot}deg)` : ""
                        }`,
                      }}
                    >
                      <div
                        className={cn(
                          "h-full w-full rounded-md",
                          i === activeIdx
                            ? "border-[3px] border-gold bg-gold/40 shadow-[0_0_30px_10px_rgba(245,158,11,0.7)]"
                            : "border-2 border-slate-400 bg-slate-400/20",
                        )}
                      />
                      {i === activeIdx && (
                        <div className="absolute inset-0 rounded-md border-2 border-gold animate-ping" />
                      )}
                    </div>
                  ),
              )}
          </div>
        </div>

        {/* BOTTOM CONTROLS & LEGEND BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-obsidian-900/95 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-body">
            <Info className="h-3.5 w-3.5 text-gold shrink-0" />
            <span>Click & drag to pan · Scroll wheel or pinch to zoom into courts & rooms</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => zoomBy(1 / 1.4)}
              data-testid="zoom-out-btn"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => zoomBy(1.4)}
              data-testid="zoom-in-btn"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fitToViewport(true)}
              data-testid="reset-view-btn"
              className="text-xs gap-1.5"
              title="Reset view"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Fit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
