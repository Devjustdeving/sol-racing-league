export interface Vec2 {
  x: number;
  y: number;
}

export interface Track {
  name: string;
  // Center-line waypoints, closed loop (last connects back to first).
  waypoints: Vec2[];
  width: number; // track width in world units
  // Cumulative arc length at each waypoint (computed)
  cumLen: number[];
  totalLen: number;
  // World bounds for camera/minimap
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  // Start/finish line segment index (between waypoints[startIdx] and [startIdx+1])
  startIdx: number;
}

function buildTrack(name: string, waypoints: Vec2[], width: number): Track {
  const cumLen: number[] = [0];
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    total += d;
    cumLen.push(total);
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of waypoints) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    name,
    waypoints,
    width,
    cumLen,
    totalLen: total,
    minX: minX - width,
    minY: minY - width,
    maxX: maxX + width,
    maxY: maxY + width,
    startIdx: 0,
  };
}

// A custom circuit: long start straight, sweeping right, hairpin, chicane,
// fast left, back onto the straight. Coordinates in "world units" (~ meters).
export const TRACK = buildTrack(
  "City Park Circuit",
  [
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    { x: 1100, y: 80 },
    { x: 1200, y: 280 },
    { x: 1180, y: 520 },
    { x: 1050, y: 700 },
    { x: 820, y: 760 },
    { x: 600, y: 700 },
    { x: 500, y: 560 },
    { x: 560, y: 420 },
    // chicane
    { x: 700, y: 380 },
    { x: 680, y: 280 },
    { x: 540, y: 240 },
    { x: 360, y: 280 },
    { x: 220, y: 420 },
    { x: 180, y: 620 },
    { x: 80, y: 720 },
    // hairpin around the left
    { x: -120, y: 700 },
    { x: -240, y: 540 },
    { x: -260, y: 360 },
    { x: -200, y: 180 },
    { x: -80, y: 40 },
  ],
  90,
);

// A faster, flowing oval-ish circuit with two long straights and sweeping bends.
export const TRACK_COASTAL = buildTrack(
  "Coastal Speedway",
  [
    { x: 0, y: 0 },
    { x: 400, y: -40 },
    { x: 800, y: -20 },
    { x: 1200, y: 60 },
    { x: 1500, y: 220 },
    { x: 1640, y: 460 },
    { x: 1600, y: 720 },
    { x: 1420, y: 900 },
    { x: 1120, y: 980 },
    { x: 780, y: 960 },
    { x: 460, y: 880 },
    { x: 200, y: 740 },
    { x: 40, y: 540 },
    { x: -40, y: 320 },
    { x: -20, y: 140 },
  ],
  100,
);

// A tight, technical street-style circuit with hairpins and chicanes.
export const TRACK_CITY = buildTrack(
  "Neon City Streets",
  [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 620, y: 80 },
    { x: 620, y: 240 },
    { x: 760, y: 320 },
    { x: 900, y: 280 },
    { x: 980, y: 380 },
    { x: 900, y: 520 },
    { x: 720, y: 560 },
    { x: 600, y: 660 },
    { x: 620, y: 820 },
    { x: 480, y: 900 },
    { x: 280, y: 880 },
    { x: 140, y: 760 },
    { x: 180, y: 600 },
    { x: 320, y: 520 },
    { x: 300, y: 380 },
    { x: 160, y: 340 },
    { x: -20, y: 280 },
    { x: -120, y: 160 },
  ],
  80,
);

// A winding mountain pass with switchbacks and cliff-edge sections.
export const TRACK_MOUNTAIN = buildTrack(
  "Alpine Mountain Pass",
  [
    { x: 0, y: 0 },
    { x: 300, y: 20 },
    { x: 600, y: 100 },
    { x: 720, y: 260 },
    // first switchback
    { x: 680, y: 440 },
    { x: 500, y: 500 },
    { x: 340, y: 420 },
    { x: 220, y: 280 },
    { x: 100, y: 180 },
    { x: -80, y: 160 },
    { x: -260, y: 240 },
    { x: -340, y: 400 },
    { x: -280, y: 580 },
    { x: -120, y: 680 },
    { x: 80, y: 720 },
    { x: 280, y: 680 },
    { x: 420, y: 580 },
    { x: 460, y: 400 },
    { x: 380, y: 220 },
    { x: 200, y: 100 },
    { x: 60, y: 40 },
  ],
  75,
);

// A wide, banked superspeedway oval for pure slipstream battles.
export const TRACK_OVAL = buildTrack(
  "Thunder Oval",
  [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 800, y: 0 },
    { x: 1200, y: 0 },
    { x: 1600, y: 0 },
    { x: 2000, y: 0 },
    { x: 2200, y: 60 },
    { x: 2300, y: 200 },
    { x: 2300, y: 400 },
    { x: 2300, y: 600 },
    { x: 2200, y: 740 },
    { x: 2000, y: 800 },
    { x: 1600, y: 800 },
    { x: 1200, y: 800 },
    { x: 800, y: 800 },
    { x: 400, y: 800 },
    { x: 200, y: 740 },
    { x: 100, y: 600 },
    { x: 100, y: 400 },
    { x: 100, y: 200 },
    { x: 200, y: 60 },
  ],
  130,
);

// A treacherous frozen lake circuit with tight esses and minimal runoff.
export const TRACK_ICE = buildTrack(
  "Frozen Lake Circuit",
  [
    { x: 0, y: 0 },
    { x: 280, y: 0 },
    { x: 420, y: 80 },
    { x: 380, y: 200 },
    // esses
    { x: 260, y: 260 },
    { x: 340, y: 340 },
    { x: 220, y: 420 },
    { x: 300, y: 500 },
    { x: 460, y: 520 },
    { x: 600, y: 440 },
    { x: 700, y: 300 },
    { x: 820, y: 240 },
    { x: 920, y: 320 },
    { x: 880, y: 480 },
    { x: 760, y: 600 },
    { x: 580, y: 680 },
    { x: 360, y: 720 },
    { x: 160, y: 680 },
    { x: 20, y: 560 },
    { x: -60, y: 400 },
    { x: -80, y: 240 },
    { x: -60, y: 80 },
  ],
  65,
);

// A scorching desert canyon run with sweeping banked bends and open straights.
export const TRACK_DESERT = buildTrack(
  "Desert Canyon Run",
  [
    { x: 0, y: 0 },
    { x: 500, y: 20 },
    { x: 900, y: 120 },
    { x: 1200, y: 300 },
    { x: 1350, y: 550 },
    { x: 1280, y: 800 },
    { x: 1050, y: 950 },
    { x: 700, y: 1000 },
    { x: 350, y: 900 },
    { x: 100, y: 700 },
    { x: -50, y: 450 },
    { x: -80, y: 200 },
    { x: -40, y: 50 },
  ],
  110,
);

// A narrow, twisting rainforest trail with elevation-style switchbacks.
export const TRACK_FOREST = buildTrack(
  "Rainforest Trail",
  [
    { x: 0, y: 0 },
    { x: 200, y: 40 },
    { x: 380, y: 140 },
    { x: 420, y: 300 },
    { x: 320, y: 440 },
    { x: 180, y: 480 },
    { x: 60, y: 400 },
    { x: -40, y: 280 },
    { x: -100, y: 160 },
    { x: -60, y: 60 },
  ],
  60,
);

// A tight industrial complex with 90-degree corners and narrow chicanes.
export const TRACK_INDUSTRIAL = buildTrack(
  "Industrial Zone",
  [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 200 },
    { x: 500, y: 200 },
    { x: 500, y: 400 },
    { x: 700, y: 400 },
    { x: 700, y: 200 },
    { x: 900, y: 200 },
    { x: 900, y: 0 },
    { x: 1100, y: 0 },
    { x: 1100, y: 300 },
    { x: 900, y: 500 },
    { x: 600, y: 600 },
    { x: 300, y: 500 },
    { x: 100, y: 300 },
    { x: 0, y: 100 },
  ],
  70,
);

// A dangerous volcanic rim circuit with cliff-edge sections and tight hairpins.
export const TRACK_VOLCANO = buildTrack(
  "Volcanic Rim",
  [
    { x: 0, y: 0 },
    { x: 250, y: 30 },
    { x: 500, y: 150 },
    { x: 650, y: 350 },
    { x: 600, y: 550 },
    { x: 420, y: 650 },
    { x: 200, y: 620 },
    { x: 50, y: 480 },
    { x: -30, y: 300 },
    { x: -60, y: 120 },
    { x: -40, y: 20 },
  ],
  80,
);

export interface TrackInfo {
  id: string;
  track: Track;
  laps: number;
  description: string;
}

export const TRACKS: TrackInfo[] = [
  { id: "park", track: TRACK, laps: 3, description: "Balanced circuit with a hairpin and chicane." },
  { id: "coastal", track: TRACK_COASTAL, laps: 3, description: "Long straights and sweeping high-speed bends." },
  { id: "city", track: TRACK_CITY, laps: 3, description: "Tight, twisty street layout — braking matters." },
  { id: "mountain", track: TRACK_MOUNTAIN, laps: 4, description: "Switchbacks and cliff edges — precision required." },
  { id: "oval", track: TRACK_OVAL, laps: 5, description: "Wide oval built for slipstream battles and speed." },
  { id: "ice", track: TRACK_ICE, laps: 3, description: "Frozen lake with tight esses and zero runoff." },
  { id: "desert", track: TRACK_DESERT, laps: 3, description: "Scorching canyon run with sweeping banked bends." },
  { id: "forest", track: TRACK_FOREST, laps: 4, description: "Narrow rainforest trail — every apex counts." },
  { id: "industrial", track: TRACK_INDUSTRIAL, laps: 3, description: "Tight 90° corners and narrow industrial chicanes." },
  { id: "volcano", track: TRACK_VOLCANO, laps: 4, description: "Cliff-edge sections and volcanic hairpins." },
];

export function getTrackById(id: string | undefined): TrackInfo {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

// Get nearest point on the track polyline, returns { dist, t, segIdx, point, progress }
export function nearestOnTrack(track: Track, p: Vec2) {
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  let bestPt: Vec2 = { x: 0, y: 0 };
  for (let i = 0; i < track.waypoints.length; i++) {
    const a = track.waypoints[i];
    const b = track.waypoints[(i + 1) % track.waypoints.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestT = t;
      bestPt = { x: px, y: py };
    }
  }
  const segLen = track.cumLen[bestSeg + 1] - track.cumLen[bestSeg];
  const progress = track.cumLen[bestSeg] + segLen * bestT;
  return { dist: bestDist, segIdx: bestSeg, t: bestT, point: bestPt, progress };
}

// Sample a point along the track at a given arc length (wraps).
export function sampleTrack(track: Track, s: number): { point: Vec2; heading: number } {
  let len = ((s % track.totalLen) + track.totalLen) % track.totalLen;
  for (let i = 0; i < track.waypoints.length; i++) {
    const segLen = track.cumLen[i + 1] - track.cumLen[i];
    if (len <= segLen) {
      const a = track.waypoints[i];
      const b = track.waypoints[(i + 1) % track.waypoints.length];
      const t = segLen === 0 ? 0 : len / segLen;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        heading: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    len -= segLen;
  }
  const a = track.waypoints[0];
  return { point: { x: a.x, y: a.y }, heading: 0 };
}

// Approximate curvature ahead by comparing heading at s and s+ahead.
export function headingDelta(track: Track, s: number, ahead: number) {
  const h1 = sampleTrack(track, s).heading;
  const h2 = sampleTrack(track, s + ahead).heading;
  let d = h2 - h1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}