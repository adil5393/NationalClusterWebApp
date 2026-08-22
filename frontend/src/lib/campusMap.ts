// Exact room footprints for every labeled room/facility on public/campus-map.svg
// (viewBox "0 0 2514 3170"). Unlike a hand-measured map, this SVG's room cells are
// real <rect>/<use> elements, so these coordinates were extracted directly from the
// SVG DOM (via a headless-browser pass reading each element's getBBox()/getCTM()) and
// then verified by redrawing every box back onto a render and confirming it hugs its
// labeled cell exactly.
export const MAP_VIEWBOX = { width: 2514, height: 3170 };

export interface RoomHotspot {
  building: string;
  room: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation of the drawn room, degrees (Building-2 is drawn at an angle). */
  rot?: number;
}

export const ROOM_HOTSPOTS: RoomHotspot[] = [
  // Building-1
  { building: "Building-1", room: "Room-18", x: 284, y: 598, w: 42, h: 125 },
  { building: "Building-1", room: "Room-11", x: 325, y: 598, w: 42, h: 125 },
  { building: "Building-1", room: "Room-4", x: 366, y: 598, w: 42, h: 125 },
  { building: "Building-1", room: "Room-19", x: 285, y: 726, w: 42, h: 125 },
  { building: "Building-1", room: "Room-12", x: 325, y: 726, w: 42, h: 125 },
  { building: "Building-1", room: "Room-5", x: 366, y: 726, w: 42, h: 125 },
  { building: "Building-1", room: "Room-28", x: 285, y: 855, w: 42, h: 125 },
  { building: "Building-1", room: "Room-27", x: 326, y: 855, w: 42, h: 125 },
  { building: "Building-1", room: "Room-26", x: 366, y: 855, w: 42, h: 125 },
  { building: "Building-1", room: "Room-17", x: 532, y: 550, w: 106, h: 42 },
  { building: "Building-1", room: "Room-16", x: 641, y: 550, w: 106, h: 42 },
  { building: "Building-1", room: "Room-15", x: 750, y: 550, w: 106, h: 42 },
  { building: "Building-1", room: "Room-10", x: 532, y: 591, w: 106, h: 42 },
  { building: "Building-1", room: "Room-9", x: 641, y: 591, w: 106, h: 42 },
  { building: "Building-1", room: "Room-8", x: 750, y: 591, w: 106, h: 42 },
  { building: "Building-1", room: "Comp Lab", x: 532, y: 632, w: 106, h: 42 },
  { building: "Building-1", room: "Room-3", x: 641, y: 632, w: 106, h: 42 },
  { building: "Building-1", room: "Room-2", x: 750, y: 632, w: 106, h: 42 },
  { building: "Building-1", room: "Room-14", x: 1065, y: 552, w: 125, h: 44 },
  { building: "Building-1", room: "Room-13", x: 1194, y: 552, w: 125, h: 44 },
  { building: "Building-1", room: "Room-7", x: 1065, y: 595, w: 125, h: 44 },
  { building: "Building-1", room: "Room-6", x: 1194, y: 595, w: 125, h: 44 },
  { building: "Building-1", room: "Staff Room", x: 1065, y: 638, w: 125, h: 44 },
  { building: "Building-1", room: "Room-1", x: 1194, y: 638, w: 125, h: 44 },

  // Building-2 (drawn at an angle — box is centered on the room and rotated to match)
  { building: "Building-2", room: "Room-21", x: 1556, y: 299, w: 131, h: 57, rot: 63.73 },
  { building: "Building-2", room: "Room-23", x: 1606, y: 274, w: 131, h: 57, rot: 63.73 },
  { building: "Building-2", room: "Room-25", x: 1656, y: 249, w: 131, h: 57, rot: 63.73 },
  { building: "Building-2", room: "Room-20", x: 1641, y: 478, w: 129, h: 57, rot: 63.73 },
  { building: "Building-2", room: "Room-22", x: 1692, y: 453, w: 129, h: 57, rot: 63.73 },
  { building: "Building-2", room: "Room-24", x: 1742, y: 428, w: 129, h: 57, rot: 63.73 },

  // Admin Building
  { building: "Admin Building", room: "Reception", x: 1525, y: 1780, w: 44, h: 179 },
  { building: "Admin Building", room: "Library", x: 1568, y: 1781, w: 44, h: 179 },
  { building: "Admin Building", room: "Meeting Hall", x: 1611, y: 1781, w: 44, h: 179 },
  { building: "Admin Building", room: "Office", x: 1669, y: 1781, w: 75, h: 178 },

  // Building-3
  { building: "Building-3", room: "Room-1", x: 2018, y: 2415, w: 76, h: 127 },
  { building: "Building-3", room: "Hall", x: 2018, y: 2543, w: 75, h: 127 },
  { building: "Building-3", room: "Room-2", x: 2017, y: 2670, w: 75, h: 127 },
];

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Resolve a DB room (optionally qualified by building) to its map position.
 *  Room numbers repeat across buildings, so a building-qualified match is tried
 *  first; falls back to an unqualified match only if the room name is unique
 *  across the whole map. Never guesses beyond exact (normalized) name matches. */
export function findHotspot(building?: string | null, room?: string | null): RoomHotspot | undefined {
  const r = norm(room);
  if (!r) return undefined;
  const b = norm(building);
  if (b) {
    const exact = ROOM_HOTSPOTS.find((h) => norm(h.room) === r && norm(h.building) === b);
    if (exact) return exact;
  }
  const matches = ROOM_HOTSPOTS.filter((h) => norm(h.room) === r);
  return matches.length === 1 ? matches[0] : undefined;
}
