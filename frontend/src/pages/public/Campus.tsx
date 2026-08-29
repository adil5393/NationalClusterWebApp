import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, LocateFixed, ZoomIn, ZoomOut, Maximize2, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { MAP_VIEWBOX, findHotspot, type RoomHotspot } from "@/lib/campusMap";

type Mode = "view" | "find";

interface Team { id: number; name: string; school?: string; school_code?: string | null }
interface AccommodationRow { room?: string; floor?: string; building?: string; notes?: string }
interface TeamDetail { id: number; name: string; accommodation: AccommodationRow[] }

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
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; dragging: boolean }>({
    startX: 0, startY: 0, startPosX: 0, startPosY: 0, dragging: false,
  });

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [resolved, setResolved] = useState<ResolvedRoom[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Mirrored in refs so the native (non-passive) wheel listener always reads fresh
  // values without needing to re-attach itself on every pan/zoom.
  const posRef = useRef(pos);
  const scaleRef = useRef(scale);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { fitScaleRef.current = fitScale; }, [fitScale]);

  // Keeps the map filling the viewport rather than panning/zooming past its edges
  // into blank space — without this, centering tightly on a room near an edge (e.g.
  // Room-18, close to the map's left border) leaves half the viewport empty.
  const clampPan = (p: { x: number; y: number }, s: number, w: number, h: number) => {
    const contentW = MAP_VIEWBOX.width * s, contentH = MAP_VIEWBOX.height * s;
    const x = contentW <= w ? (w - contentW) / 2 : Math.min(0, Math.max(w - contentW, p.x));
    const y = contentH <= h ? (h - contentH) / 2 : Math.min(0, Math.max(h - contentH, p.y));
    return { x, y };
  };

  // Applying the "animate" class and changing the transform in the same React commit
  // often makes the browser skip the transition entirely (it never paints a frame with
  // the transition active but the old transform value, so it has nothing to animate
  // from — the map just jumps). Deferring the actual transform change by two frames
  // guarantees the transition is committed and painted first, so the move genuinely
  // animates instead of snapping straight to the destination.
  const applyTransform = useCallback((nextPos: { x: number; y: number }, nextScale: number, animate: boolean) => {
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
  }, []);

  const centerAt = useCallback((x: number, y: number, targetScale: number, animate = true) => {
    const { w, h } = viewportRef.current
      ? { w: viewportRef.current.clientWidth, h: viewportRef.current.clientHeight }
      : viewportSize;
    const next = clampPan({ x: w / 2 - x * targetScale, y: h / 2 - y * targetScale }, targetScale, w, h);
    applyTransform(next, targetScale, animate);
  }, [viewportSize, applyTransform]);

  // Fit the whole map into the viewport, centered.
  const fitToViewport = useCallback((animate = false) => {
    const el = viewportRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const s = Math.min(w / MAP_VIEWBOX.width, h / MAP_VIEWBOX.height) * 0.96;
    setViewportSize({ w, h });
    setFitScale(s);
    centerAt(MAP_VIEWBOX.width / 2, MAP_VIEWBOX.height / 2, s, animate);
  }, [centerAt]);

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
    const w = el.clientWidth, h = el.clientHeight;
    const cx = w / 2, cy = h / 2;
    const layerX = (cx - pos.x) / scale;
    const layerY = (cy - pos.y) / scale;
    const next = clamp(scale * factor, fitScale * MIN_ZOOM_MULT, fitScale * MAX_ZOOM_MULT);
    applyTransform(clampPan({ x: cx - layerX * next, y: cy - layerY * next }, next, w, h), next, true);
  };

  // Wheel-zoom is attached as a native, non-passive listener: React's onWheel is
  // passive by default, so calling preventDefault() there does NOT stop the page
  // from scrolling underneath the map — only a real { passive: false } listener does.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const curScale = scaleRef.current, curPos = posRef.current;
      const layerX = (cx - curPos.x) / curScale;
      const layerY = (cy - curPos.y) / curScale;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clamp(curScale * factor, fitScaleRef.current * MIN_ZOOM_MULT, fitScaleRef.current * MAX_ZOOM_MULT);
      const w = el.clientWidth, h = el.clientHeight;
      applyTransform(clampPan({ x: cx - layerX * next, y: cy - layerY * next }, next, w, h), next, false);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTransform]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      dragging: true,
    };
    setAnimated(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const el = viewportRef.current;
    const w = el ? el.clientWidth : viewportSize.w;
    const h = el ? el.clientHeight : viewportSize.h;
    setPos(clampPan({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy }, scale, w, h));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
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
    <div className="mx-auto max-w-7xl px-5 md:px-8 py-14 md:py-16 text-slate-100" data-testid="public-campus">
      <span className="text-xs font-bold uppercase tracking-widest text-coral">Campus</span>
      <h1 className="mt-3 font-heading text-4xl font-black tracking-tight text-white sm:text-5xl">Campus Map</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">
        Explore the venue, or find exactly where your team is staying.
      </p>

      <div className="mt-6 inline-flex rounded-md border border-white/10 bg-slate-900 p-0.5" data-testid="campus-mode-toggle">
        <button
          onClick={() => { setMode("view"); fitToViewport(true); }}
          data-testid="mode-view"
          className={cn("flex items-center gap-1.5 rounded px-4 py-2 text-sm font-bold transition-colors", mode === "view" ? "bg-coral text-white" : "text-slate-400 hover:text-white")}
        >
          <MapIcon className="h-4 w-4" /> View Campus
        </button>
        <button
          onClick={() => setMode("find")}
          data-testid="mode-find"
          className={cn("flex items-center gap-1.5 rounded px-4 py-2 text-sm font-bold transition-colors", mode === "find" ? "bg-coral text-white" : "text-slate-400 hover:text-white")}
        >
          <LocateFixed className="h-4 w-4" /> Find My Room
        </button>
      </div>

      {mode === "find" && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); lookupByCode(); }}
            >
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Enter your school code…"
                className="w-48"
                data-testid="campus-school-code-input"
              />
              <Button type="submit" variant="outline" size="sm" data-testid="campus-school-code-submit">Find</Button>
            </form>
            {loadingTeam && <Spinner label="Looking up your room…" />}
          </div>
          {codeError && <p className="mt-2 text-sm text-red-400">{codeError}</p>}

          {!loadingTeam && teamId && selectedTeamName && (
            <p className="mt-3 text-sm text-slate-400">
              School: <span className="font-semibold text-white">{selectedTeamName}</span>
            </p>
          )}

          {!loadingTeam && teamId && resolved.length === 0 && (
            <p className="mt-1 text-sm text-slate-400">This team hasn't been assigned a room yet.</p>
          )}

          {!loadingTeam && resolvedHits.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {resolved.map((r, i) => r.hotspot ? (
                <button
                  key={i}
                  onClick={() => jumpTo(i)}
                  data-testid={`room-chip-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors",
                    i === activeIdx ? "border-coral bg-coral/15 text-coral" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5" /> {r.building} · {r.room}
                </button>
              ) : null)}
            </div>
          )}

          {!loadingTeam && unresolved.length > 0 && (
            <div className="mt-3 space-y-1">
              {unresolved.map((r, i) => (
                <p key={i} className="text-sm text-slate-400">
                  <span className="font-semibold text-slate-200">Room {r.room ?? "—"}</span>
                  {r.building && <span> · {r.building}</span>}{r.floor && <span> · {r.floor}</span>}
                  <span className="ml-1 text-slate-500">(not pinned on the interactive map yet)</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-800 bg-obsidian overflow-hidden">
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative h-[70vh] min-h-[420px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          data-testid="campus-map-viewport"
        >
          <div
            className={cn("absolute left-0 top-0 origin-top-left will-change-transform", animated && "transition-transform duration-500 ease-out")}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, width: MAP_VIEWBOX.width, height: MAP_VIEWBOX.height }}
          >
            <img
              src="/campus-map.svg"
              alt="Campus map"
              width={MAP_VIEWBOX.width}
              height={MAP_VIEWBOX.height}
              draggable={false}
              className="pointer-events-none select-none"
            />
            {mode === "find" && resolved.map((r, i) => r.hotspot && (
              <div
                key={i}
                className="absolute pointer-events-none"
                style={{
                  left: r.hotspot.x,
                  top: r.hotspot.y,
                  width: r.hotspot.w,
                  height: r.hotspot.h,
                  transform: `translate(-50%, -50%)${r.hotspot.rot ? ` rotate(${r.hotspot.rot}deg)` : ""}`,
                }}
              >
                <div
                  className={cn(
                    "h-full w-full rounded-md",
                    i === activeIdx
                      ? "border-[3px] border-coral bg-coral/35 shadow-[0_0_24px_8px_rgba(255,69,0,0.55)]"
                      : "border-2 border-slate-400 bg-slate-400/10",
                  )}
                />
                {i === activeIdx && (
                  <div className="absolute inset-0 rounded-md border-2 border-coral animate-ping" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-slate-900 px-4 py-2.5">
          <p className="text-xs text-slate-400">Scroll to zoom · drag to pan</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" onClick={() => zoomBy(1 / 1.4)} data-testid="zoom-out-btn"><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => zoomBy(1.4)} data-testid="zoom-in-btn"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => fitToViewport(true)} data-testid="reset-view-btn"><Maximize2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
