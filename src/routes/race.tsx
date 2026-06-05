import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, formatTime, type PublicState } from "@/game/engine";
import { getTrackById } from "@/game/track";
import solanaCoinUrl from "@/assets/solana.png";
import { useWallet } from "@/lib/wallet-context";
import { saveGameSession } from "@/lib/supabase";

export const Route = createFileRoute("/race")({
  validateSearch: (search: Record<string, unknown>) => ({
    track: typeof search.track === "string" ? search.track : "park",
  }),
  head: () => ({
    meta: [
      { title: "Race — SOL RACING LEAGUE" },
      { name: "description", content: "Race a pixel car across an arcade circuit." },
    ],
  }),
  component: RacePage,
});

type ControlMode = "touch" | "tilt";

function RacePage() {
  const navigate = useNavigate();
  const { track: trackId } = Route.useSearch();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [controlMode, setControlMode] = useState<ControlMode>("touch");
  const [muted, setMuted] = useState(false);
  const tiltZeroRef = useRef<number | null>(null);
  const { address } = useWallet();
  const savedRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "no-wallet">("idle");

  // Save game session when race finishes
  useEffect(() => {
    if (!state?.finished || savedRef.current) return;
    savedRef.current = true;

    if (!address) {
      setSaveStatus("no-wallet");
      return;
    }

    setSaveStatus("saving");
    saveGameSession(
      address,
      trackId,
      state.player.coins,
      state.player.position,
      state.player.totalCars,
      state.player.bestLap ?? null,
    ).then((result) => {
      setSaveStatus(result ? "saved" : "error");
    }).catch(() => {
      setSaveStatus("error");
    });
  }, [state?.finished]);

  // Init engine
  useEffect(() => {
    if (!canvasRef.current) return;
    savedRef.current = false;
    const info = getTrackById(trackId);
    const eng = new GameEngine(info.track);
    engineRef.current = eng;
    const unsub = eng.subscribe(setState);
    eng.attach(canvasRef.current);
    eng.audio.start();
    return () => {
      unsub();
      eng.detach();
    };
  }, [trackId]);

  // Mute toggle
  useEffect(() => {
    engineRef.current?.audio.setMuted(muted);
  }, [muted]);

  // Keyboard
  useEffect(() => {
    const keys = { left: false, right: false, up: false, down: false, boost: false };
    const apply = () => {
      engineRef.current?.setInput({
        steer: keys.left ? -1 : keys.right ? 1 : 0,
        throttle: keys.up,
        brake: keys.down,
        boost: keys.boost,
      });
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = true;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = true;
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keys.up = true;
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keys.down = true;
      else if (e.key === " ") keys.boost = true;
      else return;
      e.preventDefault();
      apply();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keys.up = false;
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keys.down = false;
      else if (e.key === " ") keys.boost = false;
      else return;
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Tilt
  useEffect(() => {
    if (controlMode !== "tilt") return;
    const handler = (e: DeviceOrientationEvent) => {
      const g = e.gamma ?? 0; // -90..90, left/right tilt
      if (tiltZeroRef.current == null) tiltZeroRef.current = g;
      const delta = g - (tiltZeroRef.current ?? 0);
      const steer = Math.max(-1, Math.min(1, delta / 25));
      engineRef.current?.setInput({ steer });
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [controlMode]);

  const requestTilt = async () => {
    type DOEWithPerm = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const DOE = (window as unknown as { DeviceOrientationEvent?: DOEWithPerm }).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") return;
      } catch {
        return;
      }
    }
    tiltZeroRef.current = null;
    setControlMode("tilt");
  };

  const restart = () => {
    savedRef.current = false;
    setSaveStatus("idle");
    engineRef.current?.reset();
  };

  // Touch button helpers
  const press = (k: "throttle" | "brake" | "boost" | "left" | "right", v: boolean) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (k === "throttle") eng.setInput({ throttle: v });
    else if (k === "brake") eng.setInput({ brake: v });
    else if (k === "boost") eng.setInput({ boost: v });
    else if (k === "left") eng.setInput({ steer: v ? -1 : 0 });
    else if (k === "right") eng.setInput({ steer: v ? 1 : 0 });
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top HUD */}
      {state && (
        <div className="pointer-events-none absolute top-0 left-0 right-0 p-3 flex items-start justify-between gap-3">
          <div className="bg-black border-2 border-[#ffd84d] rounded-md px-3 py-2 text-sm leading-tight font-pixel">
            <div className="text-[10px] text-white">
              LAP: <span className="text-[#ffd84d]">{state.player.lap}/{state.totalLaps}</span>
            </div>
            <div className="text-[10px] text-white mt-1">
              POS: <span className="text-[#ffd84d]">{state.player.position}/{state.player.totalCars}</span>
            </div>
            <div className="text-[10px] text-white mt-1">
              TIME: <span className="text-[#ffd84d]">{formatTime(state.player.currentLap)}</span>
            </div>
          </div>

          <div className="hidden" />
        </div>
      )}

      {/* Best lap pill */}
      {state?.player.bestLap != null && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-3 bg-black border-2 border-[#ffd84d] rounded-md px-3 py-1.5 text-[10px] font-pixel">
          BEST <span className="text-[#ffd84d]">{formatTime(state.player.bestLap)}</span>
        </div>
      )}

      {/* Coin counter */}
      {state && (
        <div className="pointer-events-none absolute top-3 right-3 bg-black border-2 border-[#9b59ff] rounded-md px-3 py-2 text-[10px] font-pixel flex items-center gap-2">
          <img src={solanaCoinUrl} alt="" className="w-5 h-5" style={{ imageRendering: "pixelated" }} />
          <span className="text-white">COINS</span>
          <span className="text-[#9b59ff] tabular-nums">{state.player.coins}</span>
        </div>
      )}

      {/* Off-track warning */}
      {state?.player.offTrack && state.raceState === "racing" && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-20 bg-[#e63946] border-2 border-black rounded-md px-3 py-1 text-[10px] font-pixel animate-pulse">
          OFF TRACK
        </div>
      )}

      {/* Speed + Nitro panel (bottom-left) */}
      {state && (
        <div className="pointer-events-none absolute bottom-28 left-3 bg-black border-2 border-[#ffd84d] rounded-md px-3 py-2 font-pixel">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl text-[#ffd84d] tabular-nums leading-none">{state.player.speed}</div>
            <div className="text-[8px] text-white">KM/H</div>
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[8px] text-white">NITRO</span>
            <div className="h-2 w-24 bg-zinc-900 border border-[#ffd84d]/60 overflow-hidden">
              <div
                className="h-full transition-[width] duration-100"
                style={{
                  width: `${state.player.boost * 100}%`,
                  background: "linear-gradient(90deg, #2ecc71, #ffd84d, #e63946)",
                }}
              />
            </div>
            <span className="text-[8px] text-[#ffd84d] tabular-nums">{Math.round(state.player.boost * 100)}%</span>
          </div>
        </div>
      )}

      {/* Standings panel (bottom-right above touch buttons) */}
      {state && state.raceState === "racing" && (
        <div className="pointer-events-none absolute bottom-28 right-3 bg-black border-2 border-[#ffd84d] rounded-md px-3 py-2 font-pixel text-[9px] leading-tight max-w-[180px]">
          {state.standings.slice(0, 4).map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 py-0.5">
              <span className="text-[#ffd84d] tabular-nums">{i + 1}:</span>
              <span
                className="w-2 h-2 inline-block"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className={`flex-1 truncate ${s.isPlayer ? "text-[#ffd84d]" : "text-white"}`}>
                {s.name}
              </span>
              {!s.isPlayer && i > 0 && <span className="text-[#e63946]">{s.gap}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Touch controls */}
      <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
        <div className="flex items-end justify-between gap-4">
          {/* Steering */}
          <div className="pointer-events-auto flex gap-3">
            {controlMode === "touch" ? (
              <>
                <TouchBtn label="◀" onPress={(v) => press("left", v)} className="bg-white/10" />
                <TouchBtn label="▶" onPress={(v) => press("right", v)} className="bg-white/10" />
              </>
            ) : (
              <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-xs uppercase tracking-widest">
                Tilt to steer
              </div>
            )}
          </div>
          {/* Throttle / brake / boost */}
          <div className="pointer-events-auto flex gap-3">
            <TouchBtn label="Brake" onPress={(v) => press("brake", v)} className="bg-red-600/80" small />
            <TouchBtn
              label="Boost"
              onPress={(v) => press("boost", v)}
              className="bg-amber-500/90 text-black"
              small
            />
            <TouchBtn
              label="Gas"
              onPress={(v) => press("throttle", v)}
              className="bg-emerald-500/90 text-black"
            />
          </div>
        </div>
      </div>

      {/* Wallet status indicator */}
      {state && state.raceState === "racing" && (
        <div className={`pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[9px] font-pixel ${address ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-red-500/20 border border-red-500/40"}`}>
          {address ? `Wallet: ${address.slice(0, 4)}...${address.slice(-4)} - Earning SRL` : "Wallet not connected - coins won't save"}
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 hidden">{/* spacer */}</div>
      <div className="absolute top-1/2 -translate-y-1/2 right-3 pointer-events-auto flex flex-col gap-2">
        <button
          onClick={() => setMuted((m) => !m)}
          className="bg-black/60 backdrop-blur rounded-full w-10 h-10 text-sm"
          aria-label="Toggle sound"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        {controlMode === "touch" ? (
          <button
            onClick={requestTilt}
            className="bg-black/60 backdrop-blur rounded-full w-10 h-10 text-xs"
            aria-label="Use tilt steering"
            title="Use tilt steering"
          >
            📱
          </button>
        ) : (
          <button
            onClick={() => setControlMode("touch")}
            className="bg-black/60 backdrop-blur rounded-full w-10 h-10 text-xs"
          >
            🅣
          </button>
        )}
        <Link
          to="/"
          className="bg-black/60 backdrop-blur rounded-full w-10 h-10 text-sm flex items-center justify-center"
          aria-label="Back to menu"
        >
          ✕
        </Link>
      </div>

      {/* Results modal */}
      {state?.finished && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-10">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="text-xs uppercase tracking-widest opacity-60">Race finished</div>
            <div className="text-3xl font-black mt-1 mb-4">
              {state.player.position === 1
                ? "🏆 Winner!"
                : `P${state.player.position} / ${state.player.totalCars}`}
            </div>
            <ol className="space-y-1.5 mb-4">
              {state.standings.map((s, i) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 text-sm rounded-md px-2 py-1.5 ${
                    s.isPlayer ? "bg-white/10 font-bold" : ""
                  }`}
                >
                  <span className="w-6 tabular-nums opacity-70">{i + 1}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums text-xs opacity-80">{s.gap}</span>
                </li>
              ))}
            </ol>
            {state.player.bestLap != null && (
              <div className="text-sm mb-2 opacity-80">
                Fastest lap: <span className="font-mono">{formatTime(state.player.bestLap)}</span>
              </div>
            )}
            <div className={`text-xs mb-4 px-2 py-1.5 rounded ${
              saveStatus === "saved" ? "bg-emerald-500/20 text-emerald-300" :
              saveStatus === "saving" ? "bg-amber-500/20 text-amber-300" :
              saveStatus === "error" ? "bg-red-500/20 text-red-300" :
              saveStatus === "no-wallet" ? "bg-red-500/20 text-red-300" :
              "bg-white/5 text-white/50"
            }`}>
              {saveStatus === "saved" && `SRL points saved! (+${state.player.coins} coins)`}
              {saveStatus === "saving" && "Saving to leaderboard..."}
              {saveStatus === "error" && "Failed to save - check console for details"}
              {saveStatus === "no-wallet" && "Wallet not connected - coins not saved"}
              {saveStatus === "idle" && "Waiting..."}
            </div>
            <div className="flex gap-2">
              <button
                onClick={restart}
                className="flex-1 bg-amber-500 text-black rounded-lg py-3 font-semibold"
              >
                Race again
              </button>
              <button
                onClick={() => navigate({ to: "/" })}
                className="flex-1 bg-white/10 rounded-lg py-3 font-semibold"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TouchBtn({
  label,
  onPress,
  className = "",
  small = false,
}: {
  label: string;
  onPress: (down: boolean) => void;
  className?: string;
  small?: boolean;
}) {
  const size = small ? "w-16 h-16 text-sm" : "w-20 h-20 text-base";
  return (
    <button
      className={`${size} ${className} rounded-full font-bold backdrop-blur active:scale-95 transition-transform select-none`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onPress(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onPress(false);
      }}
      onPointerCancel={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
    >
      {label}
    </button>
  );
}