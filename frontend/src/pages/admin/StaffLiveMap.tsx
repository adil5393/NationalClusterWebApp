import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Map as LeafletMap, Marker as LeafletMarker, MarkerClusterGroup as LeafletMarkerClusterGroup } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { MapPinned, PanelRightClose, PanelRightOpen, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { SearchInput, Select } from "@/components/ui/input";
import { Badge, type Tone } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { groupStaffByCategory } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/permissions";

interface Duty {
  duty_type: string;
  room_name: string | null;
  start_time: string | null;
  end_time: string | null;
}
interface StaffLocationRow {
  user_id: number;
  staff_id: number | null;
  staff_name: string;
  category: string | null;
  duty: Duty | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updated_at: string | null;
}

type Freshness = "recent" | "older" | "stale" | "very_stale" | "unavailable";

// Bands per spec: 0-10min Recent, 10-30 Older, 30-60 Stale, >60 Very Stale.
// A location that's never been reported (updated_at null) is "unavailable" —
// never given fake/placeholder coordinates.
function getFreshness(updatedAt: string | null): Freshness {
  if (!updatedAt) return "unavailable";
  const mins = (Date.now() - new Date(updatedAt).getTime()) / 60000;
  if (mins < 10) return "recent";
  if (mins < 30) return "older";
  if (mins < 60) return "stale";
  return "very_stale";
}

function timeAgoLabel(updatedAt: string | null): string {
  if (!updatedAt) return "Location unavailable";
  const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `Updated ${hrs} hr ago`;
}

const FRESHNESS_LABEL: Record<Freshness, string> = {
  recent: "Recent",
  older: "Older",
  stale: "Stale",
  very_stale: "Very Stale",
  unavailable: "Unavailable",
};
const FRESHNESS_TONE: Record<Freshness, Tone> = {
  recent: "green",
  older: "amber",
  stale: "coral",
  very_stale: "slate",
  unavailable: "neutral",
};
const FRESHNESS_DOT: Record<Freshness, string> = {
  recent: "#22c55e",
  older: "#eab308",
  stale: "#f97316",
  very_stale: "#6b7280",
  unavailable: "#6b7280",
};

// A colored dot instead of the default Leaflet pin image — sidesteps the
// well-known "default marker icon 404s under a bundler" issue entirely
// (no image assets to path-fix) and doubles as the freshness color-code.
function freshnessDivIcon(freshness: Freshness) {
  const color = FRESHNESS_DOT[freshness];
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

// The two campuses the map is scoped to. Only devices within CAMPUS_RADIUS_M
// of the selected campus's point are shown (and the map itself is locked to
// that area) — never the wider region/country.
const CAMPUSES = {
  new: { label: "New Campus", center: [25.895018, 81.959751] as [number, number] },
  old: { label: "Old Campus", center: [25.912844, 81.988178] as [number, number] },
};
type CampusKey = keyof typeof CAMPUSES;
const CAMPUS_RADIUS_M = 200;

function distanceMeters(a: [number, number], lat: number, lng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - a[0]);
  const dLng = toRad(lng - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// The admin's own position — a blue dot with a white ring, distinct from the
// freshness-coloured staff dots.
const MY_LOCATION_ICON = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -12],
});

// Frames the selected campus's 200 m circle and locks panning/zooming-out to
// just around it (react-leaflet's MapContainer props are initial-only, so
// changing campus has to go through the map instance).
function CampusView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    // LatLng.toBounds works without a map (a detached L.circle().getBounds()
    // throws, since Circle needs a map to project its radius).
    const bounds = L.latLng(center).toBounds(CAMPUS_RADIUS_M * 2);
    map.setMinZoom(1);
    map.setMaxBounds(undefined as any);
    map.fitBounds(bounds, { padding: [20, 20], animate: false });
    map.setMinZoom(map.getZoom() - 1);
    map.setMaxBounds(bounds.pad(0.75));
  }, [map, center]);
  return null;
}

const POLL_MS = 60_000;

export default function StaffLiveMap() {
  const me = useMe();
  const isAdmin = !!me?.is_admin;
  const [rows, setRows] = useState<StaffLocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [freshnessFilter, setFreshnessFilter] = useState<"" | Freshness>("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [campus, setCampus] = useState<CampusKey>("new");
  // The viewing admin's own position (browser geolocation), so every device
  // can show how far it is from them. null until the browser reports one.
  const [myPos, setMyPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);
  const clusterRef = useRef<LeafletMarkerClusterGroup | null>(null);
  const markerRefs = useRef<Map<number, LeafletMarker>>(new Map());

  useEffect(() => {
    // GET /staff-locations is admin-only server-side (see backend
    // routers/staff_locations.py) — skip the doomed request entirely for a
    // non-admin rather than showing a spinner that resolves into a 403.
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      api
        .get<StaffLocationRow[]>("/staff-locations")
        .then((r) => {
          if (!cancelled) {
            setRows(r.data);
            setErrored(false);
          }
        })
        .catch(() => {
          if (!cancelled) setErrored(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!("geolocation" in navigator)) {
      setGeoError("This browser doesn't support location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoError(null);
      },
      (err) =>
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is blocked — allow it in the browser to see distances from you."
            : "Couldn't get your location — distances from you are unavailable.",
        ),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [isAdmin]);

  const distanceFromMe = (row: StaffLocationRow): number | null =>
    myPos && row.latitude != null && row.longitude != null
      ? distanceMeters([myPos.lat, myPos.lng], row.latitude, row.longitude)
      : null;

  // Only devices inside the selected campus's radius are shown anywhere on
  // this page (map, list and counts) — a device elsewhere, or one that has
  // never reported a location, isn't part of the campus view.
  const campusCenter = CAMPUSES[campus].center;
  const inRange = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.latitude != null &&
          r.longitude != null &&
          distanceMeters(campusCenter, r.latitude, r.longitude) <= CAMPUS_RADIUS_M,
      ),
    [rows, campusCenter],
  );

  const categories = useMemo(
    () => [...new Set(inRange.map((r) => r.category).filter((c): c is string => !!c))].sort(),
    [inRange],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inRange.filter((r) => {
      if (q && !r.staff_name.toLowerCase().includes(q)) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (freshnessFilter && getFreshness(r.updated_at) !== freshnessFilter) return false;
      return true;
    });
  }, [inRange, search, categoryFilter, freshnessFilter]);

  const withLocation = filtered.filter((r) => r.latitude != null && r.longitude != null);
  const grouped = useMemo(() => groupStaffByCategory(filtered), [filtered]);

  const counts = useMemo(() => {
    const c: Record<Freshness, number> = { recent: 0, older: 0, stale: 0, very_stale: 0, unavailable: 0 };
    for (const r of inRange) c[getFreshness(r.updated_at)]++;
    return c;
  }, [inRange]);

  const focusStaff = (row: StaffLocationRow) => {
    if (row.latitude == null || row.longitude == null) return;
    const marker = markerRefs.current.get(row.user_id);
    const map = mapRef.current;
    if (!map || !marker) return;
    if (clusterRef.current) {
      clusterRef.current.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      map.setView([row.latitude, row.longitude], 16);
      marker.openPopup();
    }
  };

  if (!isAdmin) {
    return (
      <div className="py-20" data-testid="admin-staff-live-map-restricted">
        <EmptyState
          title="Admins only"
          hint="Staff Live Map is restricted to admin accounts — it isn't part of the regular Staff & Duties permission."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading staff locations…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-staff-live-map" className="flex h-full flex-col space-y-4">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          OPERATIONAL MANPOWER
        </span>
        <h1 className="mt-1 flex items-center gap-2 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          <MapPinned className="h-6 w-6 text-gold" /> Staff Live Map
        </h1>
        <p className="mt-1 text-xs text-slate-400 font-body" data-testid="staff-map-range-summary">
          {CAMPUSES[campus].label}: showing {inRange.length} of {rows.length} staff devices within {CAMPUS_RADIUS_M} m of the campus.
        </p>
        <p className="mt-0.5 text-xs font-body" data-testid="staff-map-my-location">
          {myPos ? (
            <span className="text-blue-400">
              Your location: {formatDistance(distanceMeters(campusCenter, myPos.lat, myPos.lng))} from the {CAMPUSES[campus].label}{" "}
              centre — distances below are measured from you.
            </span>
          ) : (
            <span className="text-slate-500">{geoError ?? "Locating you…"}</span>
          )}
        </p>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs sm:text-sm text-slate-400 font-body">
          <ShieldAlert className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
          Approximate location of staff accounts only — this is operational tracking for coordinating duty
          coverage, not precise surveillance. Participant, player, and team records are never involved.
        </p>
      </div>

      {errored && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-4 py-2.5 text-xs font-semibold text-coral">
          Could not refresh staff locations — showing the last successful load.
        </div>
      )}

      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={campus}
          onChange={(e) => setCampus(e.target.value as CampusKey)}
          className="w-full sm:w-44"
          data-testid="staff-map-campus-select"
        >
          {(Object.keys(CAMPUSES) as CampusKey[]).map((k) => (
            <option key={k} value={k}>
              {CAMPUSES[k].label}
            </option>
          ))}
        </Select>
        <div className="w-full sm:w-64">
          <SearchInput
            placeholder="Search staff by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            data-testid="staff-map-search"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full sm:w-48"
          data-testid="staff-map-category-filter"
        >
          <option value="">All Staff Groups</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={freshnessFilter}
          onChange={(e) => setFreshnessFilter(e.target.value as "" | Freshness)}
          className="w-full sm:w-48"
          data-testid="staff-map-freshness-filter"
        >
          <option value="">All Freshness</option>
          <option value="recent">Recent (0–10 min)</option>
          <option value="older">Older (10–30 min)</option>
          <option value="stale">Stale (30–60 min)</option>
          <option value="very_stale">Very Stale (60 min+)</option>
          <option value="unavailable">Location Unavailable</option>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(Object.keys(FRESHNESS_LABEL) as Freshness[]).map((f) => (
            <Badge key={f} tone={FRESHNESS_TONE[f]} size="sm">
              {counts[f]} {FRESHNESS_LABEL[f]}
            </Badge>
          ))}
        </div>
      </div>

      {/* MAP + STAFF SIDE PANEL */}
      <div className="flex min-h-[65vh] flex-1 gap-3">
        {/* isolate + z-0: Leaflet's own panes/controls use z-index 400-1000, which
            would otherwise paint over the fixed sidebar (z-50) and sticky header (z-30). */}
        <div className="relative isolate z-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10">
          <MapContainer
            center={campusCenter}
            zoom={17}
            scrollWheelZoom
            style={{ height: "100%", width: "100%", minHeight: "65vh" }}
            ref={mapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <CampusView center={campusCenter} />
            <Circle
              center={campusCenter}
              radius={CAMPUS_RADIUS_M}
              pathOptions={{ color: "#d4a017", weight: 2, fillOpacity: 0.06, dashArray: "6 6" }}
            />
            {myPos && (
              <Marker position={[myPos.lat, myPos.lng]} icon={MY_LOCATION_ICON} zIndexOffset={1000}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold text-sm">You</p>
                    <p className="text-slate-500">~{Math.round(myPos.accuracy)}m accuracy</p>
                  </div>
                </Popup>
              </Marker>
            )}
            <MarkerClusterGroup ref={clusterRef} chunkedLoading>
              {withLocation.map((row) => {
                const freshness = getFreshness(row.updated_at);
                return (
                  <Marker
                    key={row.user_id}
                    position={[row.latitude as number, row.longitude as number]}
                    icon={freshnessDivIcon(freshness)}
                    ref={(m) => {
                      if (m) markerRefs.current.set(row.user_id, m);
                      else markerRefs.current.delete(row.user_id);
                    }}
                  >
                    <Popup>
                      <div className="min-w-[160px] space-y-1 text-xs">
                        <p className="font-bold text-sm">{row.staff_name}</p>
                        {row.category && <p className="text-slate-600">{row.category}</p>}
                        {row.duty && (
                          <p className="text-slate-600">
                            On duty: {row.duty.duty_type}
                            {row.duty.room_name ? ` — ${row.duty.room_name}` : ""}
                          </p>
                        )}
                        <p className="font-semibold" style={{ color: FRESHNESS_DOT[freshness] }}>
                          {timeAgoLabel(row.updated_at)}
                        </p>
                        {distanceFromMe(row) != null && (
                          <p className="font-semibold text-blue-600">{formatDistance(distanceFromMe(row)!)} from you</p>
                        )}
                        <p className="text-slate-500">Approximate location</p>
                        {row.accuracy != null && (
                          <p className="text-slate-500">~{Math.round(row.accuracy)}m accuracy</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MarkerClusterGroup>
          </MapContainer>
        </div>

        {/* COLLAPSIBLE STAFF LIST */}
        <div
          className={cn(
            "hidden shrink-0 flex-col rounded-xl border border-white/10 bg-obsidian-900 transition-all lg:flex",
            panelOpen ? "w-72" : "w-12",
          )}
          data-testid="staff-map-side-panel"
        >
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            {panelOpen && (
              <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-white">
                Staff Locations
              </h2>
            )}
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label={panelOpen ? "Collapse staff list" : "Expand staff list"}
              data-testid="staff-map-panel-toggle"
            >
              {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>

          {panelOpen && (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
              {filtered.length === 0 ? (
                <EmptyState
                  title={inRange.length === 0 ? "No devices in range" : "No staff match"}
                  hint={
                    inRange.length === 0
                      ? `No staff device is within ${CAMPUS_RADIUS_M} m of the ${CAMPUSES[campus].label}.`
                      : "Try clearing search or filters."
                  }
                />
              ) : (
                grouped.map(([category, members]) => (
                  <div key={category} className="space-y-1.5">
                    <p className="px-1.5 text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500">
                      {category} ({members.length})
                    </p>
                    <div className="space-y-1">
                      {members.map((row) => {
                        const freshness = getFreshness(row.updated_at);
                        const hasLoc = row.latitude != null && row.longitude != null;
                        return (
                          <button
                            key={row.user_id}
                            type="button"
                            onClick={() => hasLoc && focusStaff(row)}
                            disabled={!hasLoc}
                            data-testid={`staff-map-list-item-${row.user_id}`}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors",
                              hasLoc
                                ? "hover:border-gold/30 hover:bg-white/[0.04] cursor-pointer"
                                : "opacity-60 cursor-default",
                            )}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: FRESHNESS_DOT[freshness] }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-white">
                                {row.staff_name}
                              </span>
                              <span className="block truncate text-[10px] text-slate-400">
                                {timeAgoLabel(row.updated_at)}
                                {distanceFromMe(row) != null && (
                                  <span className="font-semibold text-blue-400"> · {formatDistance(distanceFromMe(row)!)} away</span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* MOBILE STAFF LIST (map takes priority on small screens, list below) */}
      <div className="lg:hidden rounded-xl border border-white/10 bg-obsidian-900 p-3 space-y-3">
        <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-white">Staff Locations</h2>
        {filtered.length === 0 ? (
          <EmptyState
            title={inRange.length === 0 ? "No devices in range" : "No staff match"}
            hint={
              inRange.length === 0
                ? `No staff device is within ${CAMPUS_RADIUS_M} m of the ${CAMPUSES[campus].label}.`
                : "Try clearing search or filters."
            }
          />
        ) : (
          grouped.map(([category, members]) => (
            <div key={category} className="space-y-1.5">
              <p className="px-1 text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500">
                {category} ({members.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {members.map((row) => {
                  const freshness = getFreshness(row.updated_at);
                  const hasLoc = row.latitude != null && row.longitude != null;
                  return (
                    <button
                      key={row.user_id}
                      type="button"
                      onClick={() => hasLoc && focusStaff(row)}
                      disabled={!hasLoc}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-left",
                        hasLoc ? "hover:border-gold/30" : "opacity-60",
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: FRESHNESS_DOT[freshness] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-white">{row.staff_name}</span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {timeAgoLabel(row.updated_at)}
                          {distanceFromMe(row) != null && (
                            <span className="font-semibold text-blue-400"> · {formatDistance(distanceFromMe(row)!)} away</span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
