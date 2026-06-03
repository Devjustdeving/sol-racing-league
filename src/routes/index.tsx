import { createFileRoute, Link } from "@tanstack/react-router";
import { TRACKS } from "@/game/track";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SOL RACING LEAGUE — Mobile Arcade" },
      {
        name: "description",
        content:
          "A fast, mobile-first arcade racer. Tilt or tap to steer, slipstream past rivals, win the race.",
      },
      { property: "og:title", content: "SOL RACING LEAGUE — Mobile Arcade" },
      { property: "og:description", content: "Tilt or tap to steer, slipstream past rivals, win the race." },
    ],
  }),
  component: Index,
});

function Index() {
  const [selected, setSelected] = useState(TRACKS[0].id);
  return (
    <main className="relative min-h-dvh overflow-hidden bg-zinc-950 text-white">
      {/* Background gradient + checkered hint */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(225,6,0,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(30,108,255,0.18),transparent_55%)]" />
      <div
        className="absolute inset-x-0 bottom-0 h-32 opacity-30"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#fff 0 25%, #000 0 50%)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to top, black, transparent)",
        }}
      />

      <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-12">
        <div className="text-center max-w-md">
          <div className="inline-block bg-white/10 backdrop-blur rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em] mb-4">
            Lap 1 · Round 1
          </div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
            SOL
            <span className="block text-amber-400">RACING LEAGUE</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base opacity-70">
            Tilt or tap to steer. Slipstream past rivals.
            <br />
            Hit the apex. Win the race.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <div className="grid gap-2 text-left">
              <div className="text-[10px] uppercase tracking-[0.25em] opacity-60 text-center">Select circuit</div>
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    selected === t.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="font-bold">{t.track.name}</div>
                  <div className="text-[11px] opacity-60">{t.description}</div>
                </button>
              ))}
            </div>
            <Link
              to="/race"
              search={{ track: selected }}
              className="bg-amber-400 text-black rounded-xl py-4 px-6 font-bold text-lg shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-transform"
            >
              Start Race
            </Link>
            <div className="grid grid-cols-3 gap-2 text-[11px] uppercase tracking-widest opacity-60">
              <div className="bg-white/5 rounded-lg py-2">3 Laps</div>
              <div className="bg-white/5 rounded-lg py-2">6 Cars</div>
              <div className="bg-white/5 rounded-lg py-2">{TRACKS.length} Circuits</div>
            </div>
          </div>

          <div className="mt-10 text-xs opacity-50 leading-relaxed">
            Desktop: arrow keys / WASD to drive, space to boost.
            <br />
            Mobile: on-screen buttons or tap 📱 in-race for tilt steering.
          </div>
        </div>
      </div>
    </main>
  );
}
