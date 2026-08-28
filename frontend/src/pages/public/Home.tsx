import { Link } from "react-router-dom";
import { Users, CalendarDays, MapPin, ArrowRight, BedDouble, Bus, UtensilsCrossed } from "lucide-react";

const HERO =
  "https://images.unsplash.com/photo-1785190095920-302ea67de2e0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODF8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBzY2hvb2wlMjBjYW1wdXMlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg3MzE5ODIzfDA&ixlib=rb-4.1.0&q=85";
const CROWD =
  "https://images.unsplash.com/photo-1629217855633-79a6925d6c47?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwzfHxzdGFkaXVtJTIwY3Jvd2QlMjBsaWdodHMlMjBjb21wZXRpdGlvbnxlbnwwfHx8fDE3ODczMTk4MjN8MA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { to: "/teams", icon: Users, title: "Participating Teams", desc: "Teams from across India and international guests." },
  { to: "/schedule", icon: CalendarDays, title: "Schedule", desc: "Fixtures, ceremonies and daily programme." },
  { to: "/accommodation", icon: BedDouble, title: "Accommodation", desc: "Hostel blocks, floors and room information." },
  { to: "/food", icon: UtensilsCrossed, title: "Food & Dining", desc: "Meal timings and dining arrangements." },
  { to: "/transport", icon: Bus, title: "Transport", desc: "Bus routes, pickups and drop points." },
  { to: "/campus", icon: MapPin, title: "Campus Map", desc: "Find your way around the venue." },
];

export default function Home() {
  return (
    <div data-testid="public-home" className="bg-obsidian text-slate-100">
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-obsidian text-white">
        <img src={HERO} alt="Host school campus" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/75 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-5 md:px-8 pt-24 pb-28 md:pt-32 md:pb-36">
          <span className="inline-flex items-center rounded-md border border-coral/30 bg-coral/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-coral">
            National Cluster Event · Hosted by our School
          </span>
          <h1 className="mt-6 max-w-4xl font-heading text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl text-white">
            CLUSTER NATIONALS
            <span className="block text-coral">2026–27</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
            Welcome to the official event portal. Around <strong className="text-white">800 participants</strong> and
            guests — teams from across India and international teams from Saudi Arabia — all in one place.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/teams"
              data-testid="hero-teams-btn"
              className="inline-flex items-center gap-2 rounded-md bg-coral px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-coral-600 shadow-md"
            >
              Explore Teams <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/announcements"
              data-testid="hero-announcements-btn"
              className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              View Announcements
            </Link>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="border-b border-white/10 bg-slate-900/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
          {[
            { k: "~800", v: "Participants & Guests" },
            { k: "India + KSA", v: "Teams Represented" },
            { k: "1 Campus", v: "Single Host Venue" },
            { k: "Live", v: "Announcements & Info" },
          ].map((s) => (
            <div key={s.v} className="bg-obsidian px-6 py-8">
              <p className="font-heading text-2xl font-black text-white md:text-3xl">{s.k}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-5 md:px-8 py-20 md:py-24">
        <div className="max-w-2xl">
          <h2 className="font-heading text-3xl font-black tracking-tight text-white">Everything for the event, in one place</h2>
          <p className="mt-3 text-base text-slate-400">
            Find the information you need before and during Cluster Nationals. Sections fill in as the event approaches.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="group rounded-lg border border-slate-800 bg-slate-900 p-6 transition-transform hover:-translate-y-1 hover:border-coral"
            >
              <div className="grid h-11 w-11 place-items-center rounded-md bg-white/5 border border-white/10 text-coral transition-colors group-hover:bg-coral group-hover:text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-heading text-lg font-bold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-coral">
                Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="relative isolate overflow-hidden bg-slate-900 border-t border-white/10 text-white">
        <img src={CROWD} alt="Competition crowd" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        <div className="relative mx-auto max-w-7xl px-5 md:px-8 py-20 text-center md:py-24">
          <h2 className="mx-auto max-w-3xl font-heading text-3xl font-black tracking-tight md:text-4xl">
            Are you a coach or team manager?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Team-specific portals with accommodation, transport and schedule details are available. Browse
            the participating teams below.
          </p>
          <Link
            to="/teams"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-coral px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-coral-600 shadow-md"
          >
            View Participating Teams <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
