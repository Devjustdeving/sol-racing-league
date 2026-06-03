import {
  TRACK,
  type Track,
  type Vec2,
  nearestOnTrack,
  sampleTrack,
  headingDelta,
} from "./track";
import solanaCoinUrl from "@/assets/solana.png";

export type RaceState = "countdown" | "racing" | "finished";

export interface Car {
  id: number;
  isPlayer: boolean;
  name: string;
  color: string;
  accent: string;
  pos: Vec2;
  heading: number; // radians
  speed: number; // world units / sec
  // race tracking
  lap: number;
  progress: number; // arc length completed (lap * totalLen + progress along current lap)
  lastProgress: number;
  finished: boolean;
  finishTime: number | null;
  bestLap: number | null;
  currentLapStart: number;
  // AI
  ai: {
    aggression: number; // 0..1
    skill: number; // 0..1
    mistakeUntil: number;
    targetMaxSpeed: number;
  } | null;
  // boost
  boost: number; // 0..1
  boosting: boolean;
  // visual
  steerVisual: number;
}

export interface InputState {
  steer: number; // -1 (left) .. 1 (right)
  throttle: boolean;
  brake: boolean;
  boost: boolean;
}

export interface PublicState {
  raceState: RaceState;
  countdown: number; // 3,2,1,0
  totalLaps: number;
  raceTime: number;
  player: {
    lap: number;
    position: number;
    totalCars: number;
    speed: number; // km/h
    bestLap: number | null;
    currentLap: number; // seconds in current lap
    boost: number; // 0..1
    offTrack: boolean;
    coins: number;
  };
  standings: {
    id: number;
    name: string;
    color: string;
    isPlayer: boolean;
    lap: number;
    gap: string;
    finished: boolean;
    finishTime: number | null;
  }[];
  finished: boolean;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
  spin: number;
}

const TEAM_COLORS: { name: string; color: string; accent: string }[] = [
  { name: "RIVAL 5", color: "#e63946", accent: "#ffffff" },
  { name: "SPEED 3", color: "#2a6df4", accent: "#ffd84d" },
  { name: "DRIFT 7", color: "#2ecc71", accent: "#0d1f12" },
  { name: "BLAZE 12", color: "#ffcd1c", accent: "#1b1b1b" },
  { name: "STORM 9", color: "#9b59ff", accent: "#ffffff" },
  { name: "YOU 1", color: "#ff7a1a", accent: "#ffffff" },
];

// Car display numbers (parallel to TEAM_COLORS)
const TEAM_NUMBERS = ["5", "3", "7", "12", "9", "1"];

const TOTAL_LAPS = 3;
const MAX_SPEED = 360; // world units / s — player top speed
const ACCEL = 180;
const BRAKE = 320;
const ENGINE_BRAKE = 50;
const TURN_RATE = 2.4; // radians/sec at full steer (scaled by speed factor)
const OFFTRACK_FACTOR = 0.45; // multiplier applied to max speed when off-track
const BOOST_MULT = 1.35;

// Simple Web Audio engine
class AudioMgr {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;
  start() {
    if (this.ctx) return;
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 90;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
    } catch {
      // ignore
    }
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : this.engineGain.gain.value;
  }
  updateEngine(speed01: number, boosting: boolean, active: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || this.muted) return;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    const targetFreq = 70 + speed01 * 320 + (boosting ? 60 : 0);
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.08, this.ctx.currentTime, 0.05);
  }
  blip(freq: number, dur = 0.1, type: OscillatorType = "square", vol = 0.15) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    o.stop(this.ctx.currentTime + dur);
  }
  noiseBurst(dur = 0.15, vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const sampleRate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sampleRate * dur, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  }
}

export class GameEngine {
  track: Track = TRACK;
  cars: Car[] = [];
  state: RaceState = "countdown";
  countdownTimer = 4;
  raceTime = 0;
  totalLaps = TOTAL_LAPS;
  input: InputState = { steer: 0, throttle: false, brake: false, boost: false };
  audio = new AudioMgr();
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private lastT = 0;
  private cachedTrackBitmap: HTMLCanvasElement | null = null;
  private cachedTrackBitmapRes = 0;
  private worldBitmap: HTMLCanvasElement | null = null;
  private listeners = new Set<(s: PublicState) => void>();
  private skidMarks: { a: Vec2; b: Vec2; alpha: number }[] = [];
  private smokePuffs: { x: number; y: number; r: number; alpha: number; vx: number; vy: number }[] = [];
  // Throttle React HUD updates (game logic still runs at 60fps)
  private emitAccumulator = 0;
  private readonly EMIT_INTERVAL = 1 / 12; // ~12 Hz HUD refresh
  // Particle caps
  private readonly MAX_SMOKE = 80;
  private readonly MAX_SKIDS = 200;
  private decor: {
    trees: { x: number; y: number; r: number; kind: 0 | 1 }[];
    stands: { x: number; y: number; angle: number; w: number }[];
    grass: { x: number; y: number; shade: number }[];
  } | null = null;
  private lastCountdownTick = -1;
  private coins: Coin[] = [];
  private playerCoins = 0;
  private coinImg: HTMLImageElement | null = null;
  private coinImgReady = false;

  constructor(track?: Track) {
    if (track) this.track = track;
    if (typeof Image !== "undefined") {
      const img = new Image();
      img.onload = () => {
        this.coinImgReady = true;
      };
      img.src = solanaCoinUrl;
      this.coinImg = img;
    }
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", this.resize);
    this.start();
  }
  detach() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    window.removeEventListener("resize", this.resize);
    this.canvas = null;
    this.ctx2d = null;
  }
  subscribe(fn: (s: PublicState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  resize = () => {
    if (!this.canvas) return;
    // Cap DPR to 1.5 — mobile devices with DPR 3 are massively over-rendered for an arcade pixel-art look.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    if (this.ctx2d) {
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx2d.imageSmoothingEnabled = false;
    }
    this.cachedTrackBitmap = null;
    // World bitmap is in world-space and resolution-independent — no need to invalidate on resize.
  };

  reset() {
    this.cars = [];
    this.state = "countdown";
    this.countdownTimer = 4;
    this.raceTime = 0;
    this.skidMarks = [];
    this.smokePuffs = [];
    this.lastCountdownTick = -1;
    this.playerCoins = 0;
    this.buildCoins();
    this.buildDecor();
    this.worldBitmap = null; // will be rebuilt on next render
    // Build grid: start at first waypoint, behind start/finish line, 2 wide.
    const start = sampleTrack(this.track, 0);
    const back = sampleTrack(this.track, this.track.totalLen - 40);
    const fwd = { x: start.point.x - back.point.x, y: start.point.y - back.point.y };
    const flen = Math.hypot(fwd.x, fwd.y) || 1;
    const ux = fwd.x / flen,
      uy = fwd.y / flen;
    const px = -uy,
      py = ux; // perpendicular
    const NUM_CARS = 6;
    for (let i = 0; i < NUM_CARS; i++) {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const ox = -ux * (40 + row * 70) + px * side * 22;
      const oy = -uy * (40 + row * 70) + py * side * 22;
      const isPlayer = i === NUM_CARS - 1; // start last for fun
      const team = TEAM_COLORS[i % TEAM_COLORS.length];
      this.cars.push({
        id: i,
        isPlayer,
        name: team.name,
        color: team.color,
        accent: team.accent,
        pos: { x: start.point.x + ox, y: start.point.y + oy },
        heading: start.heading,
        speed: 0,
        lap: 0,
        progress: 0,
        lastProgress: 0,
        finished: false,
        finishTime: null,
        bestLap: null,
        currentLapStart: 0,
        boost: 1,
        boosting: false,
        steerVisual: 0,
        ai: isPlayer
          ? null
          : {
              aggression: 0.3 + Math.random() * 0.6,
              skill: 0.7 + Math.random() * 0.25,
              mistakeUntil: 0,
              targetMaxSpeed: MAX_SPEED * (0.88 + Math.random() * 0.1),
            },
      });
    }
    this.emit();
  }

  private buildCoins() {
    this.coins = [];
    const t = this.track;
    const spacing = 70;
    for (let s = 100; s < t.totalLen - 40; s += spacing) {
      const samp = sampleTrack(t, s);
      const lane = Math.floor((s / spacing) % 3) - 1;
      const offset = lane * (t.width * 0.28);
      const px = -Math.sin(samp.heading) * offset;
      const py = Math.cos(samp.heading) * offset;
      this.coins.push({
        x: samp.point.x + px,
        y: samp.point.y + py,
        collected: false,
        spin: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateCoins(dt: number) {
    const player = this.cars.find((c) => c.isPlayer);
    if (!player) return;
    const R2 = 22 * 22;
    for (const coin of this.coins) {
      coin.spin += dt * 4;
      if (coin.collected) continue;
      const dx = coin.x - player.pos.x;
      const dy = coin.y - player.pos.y;
      if (dx * dx + dy * dy < R2) {
        coin.collected = true;
        this.playerCoins += 1;
        this.audio.blip(1320, 0.08, "square", 0.18);
        setTimeout(() => this.audio.blip(1760, 0.08, "square", 0.14), 50);
      }
    }
  }

  start() {
    if (this.cars.length === 0) this.reset();
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  setInput(i: Partial<InputState>) {
    this.input = { ...this.input, ...i };
  }

  // ----- Update -----
  update(dt: number) {
    if (this.state === "countdown") {
      this.countdownTimer -= dt;
      const tick = Math.ceil(this.countdownTimer);
      if (tick !== this.lastCountdownTick && tick >= 0 && tick <= 3) {
        this.lastCountdownTick = tick;
        if (tick === 0) this.audio.blip(880, 0.35, "square", 0.2);
        else if (tick > 0) this.audio.blip(440, 0.15, "square", 0.15);
      }
      if (this.countdownTimer <= 0) {
        this.state = "racing";
        this.raceTime = 0;
        for (const c of this.cars) c.currentLapStart = 0;
      } else {
        // hold cars
        for (const c of this.cars) c.speed = 0;
        this.emit();
        return;
      }
    }

    if (this.state === "racing") this.raceTime += dt;

    for (const car of this.cars) {
      if (car.finished) {
        // coast
        car.speed = Math.max(0, car.speed - ENGINE_BRAKE * dt);
      } else if (car.isPlayer) {
        this.updatePlayer(car, dt);
      } else {
        this.updateAI(car, dt);
      }
      this.integrate(car, dt);
      this.trackProgress(car);
    }

    this.resolveCollisions();
    this.updateCoins(dt);

    // Audio
    const player = this.cars.find((c) => c.isPlayer)!;
    this.audio.updateEngine(Math.min(1, player.speed / MAX_SPEED), player.boosting, this.state === "racing");

    // Check race over (player finished AND all cars either finished or 3 sec elapsed past player)
    if (this.state === "racing") {
      const allDone = this.cars.every((c) => c.finished);
      const playerDone = player.finished;
      if (allDone || (playerDone && this.raceTime - (player.finishTime ?? 0) > 5)) {
        this.state = "finished";
        this.audio.blip(660, 0.4, "square", 0.18);
        setTimeout(() => this.audio.blip(880, 0.5, "square", 0.18), 200);
      }
    }

    // Fade skid marks
    for (const s of this.skidMarks) s.alpha -= dt * 0.15;
    this.skidMarks = this.skidMarks.filter((s) => s.alpha > 0);

    // Update smoke puffs
    for (const p of this.smokePuffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 18;
      p.alpha -= dt * 0.9;
    }
    this.smokePuffs = this.smokePuffs.filter((p) => p.alpha > 0);

    // Emit smoke from boosting / hard-cornering cars (rate-limited + capped)
    if (this.smokePuffs.length < this.MAX_SMOKE) {
      for (const car of this.cars) {
        const hardCorner = Math.abs(car.steerVisual) > 0.5 && car.speed > 140;
        if (!car.boosting && !hardCorner) continue;
        // Lower spawn rates than before — visually identical, half the particles.
        if (Math.random() > (car.boosting ? 0.35 : 0.15)) continue;
        const cosH = Math.cos(car.heading);
        const sinH = Math.sin(car.heading);
        this.smokePuffs.push({
          x: car.pos.x - cosH * 16,
          y: car.pos.y - sinH * 16,
          r: 4 + Math.random() * 3,
          alpha: 0.7,
          vx: -cosH * 8 + (Math.random() - 0.5) * 10,
          vy: -sinH * 8 + (Math.random() - 0.5) * 10,
        });
        if (this.smokePuffs.length >= this.MAX_SMOKE) break;
      }
    }

    // Throttle HUD state emissions — game logic stays at 60 FPS, but React
    // only re-renders the HUD ~12x/sec which dramatically reduces main-thread cost.
    this.emitAccumulator += dt;
    if (this.emitAccumulator >= this.EMIT_INTERVAL || this.state !== "racing") {
      this.emitAccumulator = 0;
      this.emit();
    }
  }

  private updatePlayer(car: Car, dt: number) {
    const i = this.input;
    const near = nearestOnTrack(this.track, car.pos);
    const offTrack = near.dist > this.track.width / 2;
    const speedCap = (offTrack ? OFFTRACK_FACTOR : 1) * MAX_SPEED * (car.boosting ? BOOST_MULT : 1);
    if (i.throttle) car.speed += ACCEL * (car.boosting ? 1.5 : 1) * dt;
    else car.speed -= ENGINE_BRAKE * dt;
    if (i.brake) car.speed -= BRAKE * dt;
    if (car.speed < 0) car.speed = 0;
    if (car.speed > speedCap) car.speed = Math.max(speedCap, car.speed - 200 * dt);
    // steering
    const steerEff = i.steer * TURN_RATE * Math.min(1, car.speed / 80);
    car.heading += steerEff * dt;
    car.steerVisual = i.steer;
    // Boost
    car.boosting = i.boost && car.boost > 0.01;
    if (car.boosting) car.boost = Math.max(0, car.boost - dt * 0.35);
    else car.boost = Math.min(1, car.boost + dt * 0.08);
    // Skid marks when hard cornering
    if (Math.abs(i.steer) > 0.6 && car.speed > 120) {
      this.skidMarks.push({
        a: { x: car.pos.x, y: car.pos.y },
        b: {
          x: car.pos.x - Math.cos(car.heading) * 8,
          y: car.pos.y - Math.sin(car.heading) * 8,
        },
        alpha: 0.6,
      });
      if (this.skidMarks.length > this.MAX_SKIDS) this.skidMarks.shift();
    }
  }

  private updateAI(car: Car, dt: number) {
    if (!car.ai) return;
    // Look ahead along racing line
    const here = nearestOnTrack(this.track, car.pos);
    const lookahead = 60 + car.speed * 0.3;
    const target = sampleTrack(this.track, here.progress + lookahead).point;
    const desired = Math.atan2(target.y - car.pos.y, target.x - car.pos.x);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2));
    car.heading += steer * TURN_RATE * Math.min(1, car.speed / 80) * dt;
    car.steerVisual = steer;

    // Throttle based on upcoming curvature
    const curve = Math.abs(headingDelta(this.track, here.progress, 120));
    const curveSpeedCap = Math.max(140, car.ai.targetMaxSpeed * (1 - curve * 0.7));
    const offTrack = here.dist > this.track.width / 2;
    const speedCap =
      (offTrack ? OFFTRACK_FACTOR : 1) * Math.min(car.ai.targetMaxSpeed, curveSpeedCap);

    // Random small mistakes
    if (this.raceTime > car.ai.mistakeUntil && Math.random() < 0.0015) {
      car.ai.mistakeUntil = this.raceTime + 0.4;
    }
    const mistaking = this.raceTime < car.ai.mistakeUntil;

    if (car.speed < speedCap && !mistaking) car.speed += ACCEL * 0.95 * dt;
    else if (car.speed > speedCap) car.speed -= BRAKE * 0.7 * dt;
    else car.speed -= ENGINE_BRAKE * dt;
    if (car.speed < 0) car.speed = 0;

    car.boosting = false;
  }

  private integrate(car: Car, dt: number) {
    car.pos.x += Math.cos(car.heading) * car.speed * dt;
    car.pos.y += Math.sin(car.heading) * car.speed * dt;
  }

  private trackProgress(car: Car) {
    if (car.finished) return;
    const np = nearestOnTrack(this.track, car.pos);
    const total = this.track.totalLen;
    const last = car.lastProgress;
    // Detect crossing start/finish: progress wraps from near total to near 0
    if (last > total * 0.8 && np.progress < total * 0.2) {
      // completed a lap
      car.lap += 1;
      const lapTime = this.raceTime - car.currentLapStart;
      if (lapTime > 1 && (car.bestLap === null || lapTime < car.bestLap)) car.bestLap = lapTime;
      car.currentLapStart = this.raceTime;
      if (car.lap >= this.totalLaps) {
        car.finished = true;
        car.finishTime = this.raceTime;
      }
    }
    car.lastProgress = np.progress;
    car.progress = car.lap * total + np.progress;
  }

  private resolveCollisions() {
    const R = 14; // car radius
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        const min = R * 2;
        if (d < min && d > 0.001) {
          const overlap = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.pos.x -= nx * overlap;
          a.pos.y -= ny * overlap;
          b.pos.x += nx * overlap;
          b.pos.y += ny * overlap;
          a.speed *= 0.92;
          b.speed *= 0.92;
        }
      }
    }
  }

  // ----- Render -----
  render() {
    const ctx = this.ctx2d;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.imageSmoothingEnabled = false;
    // Grass base (covers anything outside the cached world bitmap)
    ctx.fillStyle = "#3aa14a";
    ctx.fillRect(0, 0, w, h);

    const player = this.cars.find((c) => c.isPlayer)!;
    // Camera: center on player. Tighter zoom for that arcade pixel-art feel.
    const zoom = Math.min(w, h) / 420;
    const cx = w / 2 - player.pos.x * zoom;
    const cy = h / 2 - player.pos.y * zoom;

    // Build the static world bitmap on first render (or after reset).
    if (!this.worldBitmap) this.buildWorldBitmap();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    // Single blit of the entire static world: track + curbs + grass speckle + trees + stands.
    if (this.worldBitmap) {
      const t = this.track;
      ctx.drawImage(this.worldBitmap, t.minX, t.minY);
    }
    this.drawSkids(ctx);
    this.drawSmoke(ctx);
    this.drawCoins(ctx);
    for (const car of this.cars) this.drawCar(ctx, car);

    ctx.restore();

    this.drawMinimap(ctx, w, h);
    this.drawCountdown(ctx, w, h);
  }

  // Bake the entire static world (track surface, curbs, decor) into an
  // offscreen canvas. Drawn once on first render and reused as a single
  // drawImage every frame — eliminates thousands of fillRect / sampleTrack
  // calls per frame.
  private buildWorldBitmap() {
    const t = this.track;
    const W = Math.ceil(t.maxX - t.minX);
    const H = Math.ceil(t.maxY - t.minY);
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.imageSmoothingEnabled = false;
    // Translate so we can draw in world coordinates.
    octx.translate(-t.minX, -t.minY);
    // Grass base
    octx.fillStyle = "#3aa14a";
    octx.fillRect(t.minX, t.minY, W, H);
    // Static decor that sits on grass behind track is drawn first; track and
    // curbs sit on top so trees never poke into the racing surface.
    this.drawGrassSpeckle(octx);
    this.drawTrack(octx);
    this.drawDecor(octx);
    this.worldBitmap = off;
  }

  private drawGrassSpeckle(ctx: CanvasRenderingContext2D) {
    if (!this.decor) return;
    // Batch by color to minimize fillStyle changes.
    ctx.fillStyle = "#2f8a3e";
    for (const g of this.decor.grass) {
      if (g.shade > 0.5) ctx.fillRect(g.x | 0, g.y | 0, 3, 3);
    }
    ctx.fillStyle = "#48b85a";
    for (const g of this.decor.grass) {
      if (g.shade <= 0.5) ctx.fillRect(g.x | 0, g.y | 0, 3, 3);
    }
  }

  // ----- Decor (trees, crowd stands, grass speckle) -----
  private buildDecor() {
    const t = this.track;
    const trees: { x: number; y: number; r: number; kind: 0 | 1 }[] = [];
    const stands: { x: number; y: number; angle: number; w: number }[] = [];
    const grass: { x: number; y: number; shade: number }[] = [];
    // deterministic-ish random
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >>> 8) / 0xffffff;
    };

    // Grass speckle dots over the whole bounds
    const W = t.maxX - t.minX;
    const H = t.maxY - t.minY;
    const speckleCount = Math.floor((W * H) / 900);
    for (let i = 0; i < speckleCount; i++) {
      const x = t.minX + rnd() * W;
      const y = t.minY + rnd() * H;
      // skip if too close to track
      const np = nearestOnTrack(t, { x, y });
      if (np.dist < t.width / 2 + 18) continue;
      grass.push({ x, y, shade: rnd() });
    }

    // Trees just outside the track
    for (let s = 0; s < t.totalLen; s += 18) {
      if (rnd() > 0.35) continue;
      const samp = sampleTrack(t, s);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = t.width / 2 + 30 + rnd() * 90;
      const px = -Math.sin(samp.heading) * side;
      const py = Math.cos(samp.heading) * side;
      const x = samp.point.x + px * off;
      const y = samp.point.y + py * off;
      // Avoid overlapping track
      if (nearestOnTrack(t, { x, y }).dist < t.width / 2 + 14) continue;
      trees.push({ x, y, r: 7 + rnd() * 5, kind: rnd() < 0.5 ? 0 : 1 });
    }

    // Crowd grandstands along longer straights
    for (let s = 0; s < t.totalLen; s += 140) {
      const samp = sampleTrack(t, s);
      const samp2 = sampleTrack(t, s + 60);
      const dx = samp2.point.x - samp.point.x;
      const dy = samp2.point.y - samp.point.y;
      const len = Math.hypot(dx, dy);
      if (len < 50) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const off = t.width / 2 + 22;
      const px = -Math.sin(samp.heading) * side;
      const py = Math.cos(samp.heading) * side;
      const mid = { x: (samp.point.x + samp2.point.x) / 2, y: (samp.point.y + samp2.point.y) / 2 };
      stands.push({
        x: mid.x + px * off,
        y: mid.y + py * off,
        angle: samp.heading,
        w: 70 + rnd() * 50,
      });
    }

    this.decor = { trees, stands, grass };
  }

  private drawDecor(ctx: CanvasRenderingContext2D) {
    if (!this.decor) return;
    // Grandstands and trees — baked into the world bitmap. (Grass speckles
    // are drawn separately via drawGrassSpeckle so we can batch by color.)
    for (const st of this.decor.stands) {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.angle);
      const w = st.w;
      const h = 22;
      // base
      ctx.fillStyle = "#1f2a36";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // crowd dots
      for (let i = 0; i < Math.floor(w / 5); i++) {
        for (let j = 0; j < 3; j++) {
          const col = ["#ffcd1c", "#e63946", "#2a6df4", "#ffffff", "#2ecc71"][(i + j) % 5];
          ctx.fillStyle = col;
          ctx.fillRect(-w / 2 + 2 + i * 5, -h / 2 + 4 + j * 5, 3, 3);
        }
      }
      // striped roof
      const stripes = Math.floor(w / 8);
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#e63946" : "#ffffff";
        ctx.fillRect(-w / 2 + i * 8, -h / 2 - 4, 8, 4);
      }
      ctx.restore();
    }
    // Trees: layered pixel circles
    for (const tr of this.decor.trees) {
      // trunk shadow
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(Math.round(tr.x - 1), Math.round(tr.y + tr.r - 1), 3, 3);
      // foliage
      ctx.fillStyle = tr.kind === 0 ? "#1f6a2a" : "#175424";
      this.pixelCircle(ctx, tr.x, tr.y, tr.r);
      ctx.fillStyle = tr.kind === 0 ? "#2ea53e" : "#23823a";
      this.pixelCircle(ctx, tr.x - 1, tr.y - 1, tr.r - 2);
      ctx.fillStyle = "#67d97a";
      this.pixelCircle(ctx, tr.x - 2, tr.y - 2, Math.max(1, tr.r - 5));
    }
  }

  private pixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const R = Math.max(1, Math.round(r));
    for (let y = -R; y <= R; y++) {
      const span = Math.round(Math.sqrt(R * R - y * y));
      ctx.fillRect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1);
    }
  }

  private drawSmoke(ctx: CanvasRenderingContext2D) {
    for (const p of this.smokePuffs) {
      ctx.fillStyle = `rgba(220,220,220,${Math.max(0, p.alpha) * 0.7})`;
      this.pixelCircle(ctx, p.x, p.y, p.r);
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D) {
    const size = 22;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const sx = Math.max(0.18, Math.abs(Math.cos(coin.spin)));
      // Shadow ellipse
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(coin.x, coin.y + size * 0.55, size * 0.5, size * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(coin.x, coin.y);
      ctx.scale(sx, 1);
      if (this.coinImgReady && this.coinImg) {
        ctx.drawImage(this.coinImg, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = "#9b59ff";
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawTrack(ctx: CanvasRenderingContext2D) {
    const t = this.track;
    // Asphalt
    ctx.lineWidth = t.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3d3f48";
    this.tracePath(ctx);
    ctx.stroke();

    // Slightly darker asphalt center band for depth
    ctx.lineWidth = t.width - 10;
    ctx.strokeStyle = "#34363e";
    this.tracePath(ctx);
    ctx.stroke();

    // Red/white pixel curbs along both edges, in segments
    const t2 = this.track;
    const half = t2.width / 2;
    const step = 12;
    let idx = 0;
    for (let s = 0; s < t2.totalLen; s += step) {
      const a = sampleTrack(t2, s);
      const b = sampleTrack(t2, s + step);
      const px = -Math.sin(a.heading);
      const py = Math.cos(a.heading);
      const color = idx % 2 === 0 ? "#e63946" : "#ffffff";
      // outer curb
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.point.x + px * half, a.point.y + py * half);
      ctx.lineTo(b.point.x + px * half, b.point.y + py * half);
      ctx.lineTo(b.point.x + px * (half + 6), b.point.y + py * (half + 6));
      ctx.lineTo(a.point.x + px * (half + 6), a.point.y + py * (half + 6));
      ctx.closePath();
      ctx.fill();
      // inner curb
      ctx.beginPath();
      ctx.moveTo(a.point.x - px * half, a.point.y - py * half);
      ctx.lineTo(b.point.x - px * half, b.point.y - py * half);
      ctx.lineTo(b.point.x - px * (half + 6), b.point.y - py * (half + 6));
      ctx.lineTo(a.point.x - px * (half + 6), a.point.y - py * (half + 6));
      ctx.closePath();
      ctx.fill();
      idx++;
    }

    // Center dashed line
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.setLineDash([16, 22]);
    this.tracePath(ctx);
    ctx.stroke();
    ctx.setLineDash([]);

    // Start/finish line
    const s = sampleTrack(t, 0);
    const perpX = -Math.sin(s.heading);
    const perpY = Math.cos(s.heading);
    const halfSF = t.width / 2;
    ctx.save();
    ctx.translate(s.point.x, s.point.y);
    ctx.rotate(s.heading);
    // Full-width checker stripe across the track
    const cellW = 10;
    const rows = 2;
    const fullW = t.width - 4;
    const cols = Math.floor(fullW / cellW);
    for (let i = 0; i < cols; i++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = (i + r) % 2 === 0 ? "#ffffff" : "#101010";
        ctx.fillRect(-6, -halfSF + 2 + (i * cellW) * 0 + i * cellW - fullW / 2 * 0, cellW, 6);
      }
    }
    // simpler: draw 2 rows of checker across the track width
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#101010";
      ctx.fillRect(-6, -fullW / 2 + i * cellW, 6, cellW);
      ctx.fillStyle = i % 2 === 0 ? "#101010" : "#ffffff";
      ctx.fillRect(0, -fullW / 2 + i * cellW, 6, cellW);
    }
    ctx.restore();
    void perpX;
    void perpY;
  }

  private tracePath(ctx: CanvasRenderingContext2D) {
    const wp = this.track.waypoints;
    ctx.beginPath();
    ctx.moveTo(wp[0].x, wp[0].y);
    for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x, wp[i].y);
    ctx.closePath();
  }

  private drawSkids(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 3;
    for (const s of this.skidMarks) {
      ctx.strokeStyle = `rgba(10,10,10,${s.alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    }
  }

  private drawCar(ctx: CanvasRenderingContext2D, car: Car) {
    const num = TEAM_NUMBERS[car.id % TEAM_NUMBERS.length];
    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);
    ctx.rotate(car.heading);
    // Shadow under the car
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-15, -9, 30, 18);
    // Tires (front & rear pairs) — chunky pixel rectangles
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(-13, -11, 7, 5);
    ctx.fillRect(-13, 6, 7, 5);
    ctx.fillRect(7, -11, 7, 5);
    ctx.fillRect(7, 6, 7, 5);
    // Body main
    ctx.fillStyle = car.color;
    ctx.fillRect(-14, -7, 28, 14);
    // Body lighter top stripe (pixel highlight)
    ctx.fillStyle = this.lighten(car.color, 0.2);
    ctx.fillRect(-14, -7, 28, 3);
    // Body darker bottom shadow
    ctx.fillStyle = this.darken(car.color, 0.25);
    ctx.fillRect(-14, 4, 28, 3);
    // Nose
    ctx.fillStyle = car.color;
    ctx.fillRect(14, -5, 5, 10);
    ctx.fillStyle = this.darken(car.color, 0.3);
    ctx.fillRect(14, 3, 5, 2);
    // Windshield / cockpit (cyan-tinted black)
    ctx.fillStyle = "#0b1820";
    ctx.fillRect(-4, -5, 10, 10);
    ctx.fillStyle = "#3da3c9";
    ctx.fillRect(-4, -5, 10, 2);
    // Roof number plate (white square) + number
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-12, -4, 7, 8);
    ctx.fillStyle = "#111111";
    ctx.font = "bold 8px ui-monospace, 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Counter-rotate the number so it's readable
    ctx.save();
    ctx.translate(-8.5, 0);
    ctx.rotate(-car.heading);
    ctx.fillText(num, 0, 0.5);
    ctx.restore();
    // Boost flame
    if (car.boosting) {
      const len = 8 + Math.random() * 6;
      ctx.fillStyle = "#ffd84d";
      ctx.fillRect(-16 - len, -3, len, 6);
      ctx.fillStyle = "#ff7a1a";
      ctx.fillRect(-16 - len + 2, -2, len - 4, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-16, -1, 3, 2);
    }
    ctx.restore();

    // Player marker
    if (car.isPlayer) {
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.moveTo(car.pos.x, car.pos.y - 22);
      ctx.lineTo(car.pos.x - 6, car.pos.y - 32);
      ctx.lineTo(car.pos.x + 6, car.pos.y - 32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private lighten(hex: string, amt: number) {
    const { r, g, b } = this.hex2rgb(hex);
    return `rgb(${Math.min(255, r + 255 * amt)|0}, ${Math.min(255, g + 255 * amt)|0}, ${Math.min(255, b + 255 * amt)|0})`;
  }
  private darken(hex: string, amt: number) {
    const { r, g, b } = this.hex2rgb(hex);
    return `rgb(${Math.max(0, r - 255 * amt)|0}, ${Math.max(0, g - 255 * amt)|0}, ${Math.max(0, b - 255 * amt)|0})`;
  }
  private hex2rgb(hex: string) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.track;
    const pad = 12;
    const size = Math.min(160, w * 0.32);
    const x0 = w - size - pad;
    const y0 = pad;
    const tw = t.maxX - t.minX;
    const th = t.maxY - t.minY;
    const scale = Math.min(size / tw, size / th) * 0.9;
    const ox = x0 + size / 2 - ((t.minX + t.maxX) / 2) * scale;
    const oy = y0 + size / 2 - ((t.minY + t.maxY) / 2) * scale;

    ctx.save();
    // Chunky black panel with yellow border (like reference)
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 + 1.5, y0 + 1.5, size - 3, size - 3);

    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#3d3f48";
    ctx.beginPath();
    const wp = t.waypoints;
    ctx.moveTo(wp[0].x * scale + ox, wp[0].y * scale + oy);
    for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x * scale + ox, wp[i].y * scale + oy);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const car of this.cars) {
      const px = Math.round(car.pos.x * scale + ox);
      const py = Math.round(car.pos.y * scale + oy);
      ctx.fillStyle = car.color;
      ctx.fillRect(px - 2, py - 2, 4, 4);
      if (car.isPlayer) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px - 3, py - 3, 6, 6);
        ctx.fillStyle = car.color;
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }
    ctx.restore();
  }

  private drawCountdown(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.state !== "countdown") return;
    const n = Math.ceil(this.countdownTimer);
    const label = n > 0 ? String(n) : "GO!";
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    const size = Math.min(w, h) * 0.22;
    ctx.font = `bold ${size}px 'Press Start 2P', ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // black drop shadow
    ctx.fillStyle = "#000";
    ctx.fillText(label, w / 2 + 4, h / 2 + 4);
    ctx.fillStyle = n > 0 ? "#ffd84d" : "#2ee36b";
    ctx.fillText(label, w / 2, h / 2);
    ctx.restore();
  }

  // ----- Public state -----
  private emit() {
    if (this.listeners.size === 0) return;
    const player = this.cars.find((c) => c.isPlayer)!;
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    const position = sorted.indexOf(player) + 1;
    const leader = sorted[0];
    const standings = sorted.map((c, idx) => {
      let gap = "";
      if (c.finished && c.finishTime != null) {
        gap = idx === 0 ? formatTime(c.finishTime) : `+${(c.finishTime - (leader.finishTime ?? 0)).toFixed(2)}s`;
      } else if (idx === 0) {
        gap = `L${c.lap + 1}`;
      } else {
        const diff = leader.progress - c.progress;
        if (diff > this.track.totalLen) gap = `+${Math.floor(diff / this.track.totalLen)} lap`;
        else gap = `+${(diff / Math.max(60, c.speed)).toFixed(1)}s`;
      }
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        isPlayer: c.isPlayer,
        lap: Math.min(c.lap + (c.finished ? 0 : 1), this.totalLaps),
        gap,
        finished: c.finished,
        finishTime: c.finishTime,
      };
    });
    const near = nearestOnTrack(this.track, player.pos);
    const state: PublicState = {
      raceState: this.state,
      countdown: Math.max(0, Math.ceil(this.countdownTimer)),
      totalLaps: this.totalLaps,
      raceTime: this.raceTime,
      player: {
        lap: Math.min(player.lap + 1, this.totalLaps),
        position,
        totalCars: this.cars.length,
        speed: Math.round(player.speed * 0.9), // arbitrary "km/h" scaling
        bestLap: player.bestLap,
        currentLap: this.raceTime - player.currentLapStart,
        boost: player.boost,
        offTrack: near.dist > this.track.width / 2,
        coins: this.playerCoins,
      },
      standings,
      finished: this.state === "finished",
    };
    for (const fn of this.listeners) fn(state);
  }
}

export function formatTime(s: number) {
  if (!isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, "0")}`;
}