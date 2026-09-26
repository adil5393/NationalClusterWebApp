import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  MapPin,
  BedDouble,
  UtensilsCrossed,
  Bus,
  PhoneCall,
  HelpCircle,
  Shield,
  Trophy,
  ArrowRight,
  Clock,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Mail,
  Phone,
  FileText,
  Zap,
  Crown,
  Globe,
  MessageSquare,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { CallbackRequestDialog, type CallbackTarget } from "@/components/public/CallbackRequestDialog";
import { cn } from "@/lib/utils";
import Campus from "@/pages/public/Campus";

interface SectionProps {
  title: string;
  section: string;
}

export function PlaceholderPage({ title, section }: SectionProps) {
  const normSection = section.toLowerCase();

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 min-h-screen"
      data-testid={`placeholder-${normSection}`}
    >
      {/* SECTION BREADCRUMB */}
      <div className="flex items-center gap-2 mb-3">
        <Link to="/" className="text-xs font-bold text-slate-400 hover:text-gold transition-colors">
          Home
        </Link>
        <span className="text-slate-600 text-xs">/</span>
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          {section}
        </span>
      </div>

      {/* RENDER BESPOKE SECTION CONTENT */}
      {normSection === "venues" && <VenuesSection />}
      {normSection === "accommodation" && <AccommodationSection />}
      {normSection === "food" && <FoodSection />}
      {normSection === "transport" && <TransportSection />}
      {normSection === "contacts" && <ContactsSection />}
      {normSection === "faq" && <FaqSection />}
    </div>
  );
}

/* ========================================================================== */
/* VENUES SECTION                                                            */
/* ========================================================================== */
function VenuesSection() {
  const COURTS = [
    {
      name: "Court 1: Main Broadcast Arena",
      tag: "PRIMARY MATCH COURT",
      desc: "Pro-Kabaddi standard synthetic mat equipped with broadcast camera mounts, electronic scoreboard, VIP grandstand, and referee video review station.",
      specs: ["13m × 10m Mat Area", "Seating Capacity: 800", "Live Stream Ready", "Air-conditioned Arena"],
    },
    {
      name: "Court 2: Secondary Arena",
      tag: "REGULATION COURT",
      desc: "Official competition court for simultaneous pool stages and knockout rounds with dedicated electronic scoring tables.",
      specs: ["13m × 10m Mat Area", "Seating Capacity: 350", "Digital Score Display"],
    },
    {
      name: "Court 3: Warm-up & Practice Mat",
      tag: "ATHLETE PREPARATION",
      desc: "Dedicated full-size mat for team warm-ups, tactical drills, and physical conditioning 30 minutes prior to scheduled fixtures.",
      specs: ["Full Regulation Mat", "Physio Support Bay", "Warm-up Clock"],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            Tournament Venues & Courts
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
            Official sports infrastructure, competition mats, and spectator zones.
          </p>
        </div>
        <Link
          to="/accommodation#campus"
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-heading font-black text-obsidian hover:bg-gold-400 transition-colors shadow-sm shrink-0"
        >
          <MapPin className="h-4 w-4" /> Open Interactive Map →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {COURTS.map((c, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-obsidian-900/90 p-6 flex flex-col justify-between shadow-sm hover:border-gold/50 transition-colors"
          >
            <div>
              <span className="rounded bg-gold/15 px-2.5 py-1 text-[10px] font-heading font-black text-gold tracking-wider">
                {c.tag}
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold text-white">{c.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300 font-body">{c.desc}</p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 space-y-1.5">
              <p className="text-[11px] font-heading font-bold text-slate-400 uppercase tracking-wider">
                Specifications
              </p>
              <ul className="space-y-1">
                {c.specs.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-slate-300 font-body">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* ACCOMMODATION SECTION                                                     */
/* ========================================================================== */
interface AccommodationBuilding {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  floor_count: number;
  room_count: number;
  capacity: number;
  room_types: string[];
}

const BUILDING_ICONS = [Building, Shield, Trophy];
const BUILDING_TONES = [
  "bg-gold/15 text-gold",
  "bg-coral/15 text-coral",
  "bg-emerald-500/15 text-emerald-400",
];

interface AccommodationRule {
  id: number;
  title: string;
  description: string;
}

function AccommodationSection() {
  const [buildings, setBuildings] = useState<AccommodationBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AccommodationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  useEffect(() => {
    api
      .get<AccommodationBuilding[]>("/public/accommodation")
      .then((r) => setBuildings(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api
      .get<AccommodationRule[]>("/public/accommodation-rules")
      .then((r) => setRules(r.data))
      .catch(() => {})
      .finally(() => setRulesLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            Hostel & Accommodation
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
            Room allocations, floor plans, and hostel guidelines for visiting athletes and coaching staff.
          </p>
        </div>
        <Link
          to="/teams"
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-heading font-black text-obsidian hover:bg-gold-400 transition-colors shadow-sm shrink-0"
        >
          <BedDouble className="h-4 w-4" /> Check Your Team's Room →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 font-body">Loading…</p>
      ) : buildings.length === 0 ? (
        <p className="text-sm text-slate-400 font-body">Accommodation details will be published here soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {buildings.map((b, i) => {
            const Icon = BUILDING_ICONS[i % BUILDING_ICONS.length];
            const tone = BUILDING_TONES[i % BUILDING_TONES.length];
            return (
              <div key={b.id} className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
                <div className={`grid h-10 w-10 place-items-center rounded-lg font-bold ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-base font-bold text-white">
                  {b.name}
                  {b.code && <span className="ml-2 text-xs font-mono text-slate-500">· {b.code}</span>}
                </h3>
                {b.description ? (
                  <p className="text-xs text-slate-300 font-body leading-relaxed">{b.description}</p>
                ) : (
                  <p className="text-xs text-slate-500 font-body italic leading-relaxed">No description added yet.</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5 text-[11px] text-slate-400 font-mono">
                  <span>{b.floor_count} floor{b.floor_count === 1 ? "" : "s"}</span>
                  <span>· {b.room_count} room{b.room_count === 1 ? "" : "s"}</span>
                  <span>· {b.capacity} beds</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!rulesLoading && rules.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-obsidian-900/80 p-6 space-y-3">
          <h3 className="font-heading text-sm font-bold text-white uppercase tracking-wider text-gold">
            Hostel Rules & Curfew Protocol
          </h3>
          <ul className="space-y-2 text-xs text-slate-300 font-body">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                <span className="text-gold font-bold">•</span>
                <span>
                  <strong>{r.title}:</strong> {r.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CAMPUS MAP & FIND MY ROOM — the whole Campus page, embedded here
          (the old /campus URL forwards to this #campus anchor) */}
      <section id="campus" className="scroll-mt-24 border-t border-white/10 pt-8">
        <Campus embedded />
      </section>
    </div>
  );
}

/* ========================================================================== */
/* FOOD & DINING SECTION                                                     */
/* ========================================================================== */
/** Also shown as the Schedule page's "Fooding Schedule" tab (`embedded`,
 * which drops this section's own page heading). */
export function FoodSection({ embedded = false }: { embedded?: boolean } = {}) {
  const MEALS = [
    { meal: "Breakfast", time: "06:30 – 09:00", menu: "Porridge, Sprouts, Boiled Eggs, Idli/Dosa, Parathas, Fresh Fruits, Milk & Tea" },
    { meal: "Lunch", time: "12:30 – 14:30", menu: "Steamed Rice, Roti, Dal Makhani/Tadka, Paneer, Chicken Curry (Non-veg days), Curd, Green Salad" },
    { meal: "Evening High Tea", time: "17:00 – 18:00", menu: "Energy Drinks, Glucose, Banana, Light Sandwiches, Biscuits & Hot Beverages" },
    { meal: "Dinner", time: "19:30 – 21:30", menu: "Wholesome Athletic Dinner with Carbs & Proteins, Rice, Vegetable Pulao, Dal, Sabzi & Dessert" },
  ];

  return (
    <div className="space-y-8">
      {embedded ? (
        <p className="text-sm text-slate-400 font-body">
          High-protein sports nutrition prepared in hygienic conditions for student athletes.
        </p>
      ) : (
        <div className="border-b border-white/10 pb-6">
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            Food & Dining Schedule
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
            High-protein sports nutrition prepared in hygienic conditions for student athletes.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {MEALS.map((m, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="font-heading text-base font-bold text-gold">{m.meal}</h3>
              <span className="flex items-center gap-1 text-xs font-mono text-white font-bold bg-white/10 px-2 py-0.5 rounded">
                <Clock className="h-3 w-3 text-gold" /> {m.time}
              </span>
            </div>
            <p className="text-xs text-slate-300 font-body leading-relaxed pt-1">
              {m.menu}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gold/30 bg-gold/10 p-5 flex items-start gap-3.5">
        <UtensilsCrossed className="h-5 w-5 text-gold shrink-0 mt-0.5" />
        <div className="text-xs text-slate-200 font-body space-y-1">
          <p className="font-heading font-bold text-white text-sm">Dining Location & Access Protocol</p>
          <p>The Central Dining Hall is located adjacent to the Sports Pavilion. Meal coupons or participant QR badge scanning is mandatory at the entry counter.</p>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* TRANSPORT SECTION                                                         */
/* ========================================================================== */
function TransportSection() {
  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
          Transport & Transit Routes
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
          Shuttle schedules, station pickups, and transit coordination for outstation delegations.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
          <div className="flex items-center gap-2.5">
            <Bus className="h-5 w-5 text-gold" />
            <h3 className="font-heading text-base font-bold text-white">Station & Airport Pickups</h3>
          </div>
          <p className="text-xs text-slate-300 font-body leading-relaxed">
            Designated tournament buses operate between Central Railway Station, Airport Terminal, and the Host School Campus based on verified team arrival manifests.
          </p>
          <div className="pt-2 text-xs font-mono text-gold">
            24/7 Transport Helpline: +91 98765 43210
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-coral" />
            <h3 className="font-heading text-base font-bold text-white">Daily Campus Shuttle Loop</h3>
          </div>
          <p className="text-xs text-slate-300 font-body leading-relaxed">
            Intra-campus electric shuttles run continuously between the main gate, hostel complexes, dining halls, and match courts from 06:00 to 22:00 hrs.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* CONTACTS SECTION                                                          */
/* ========================================================================== */
interface ContactPersonDTO {
  id?: number | null;
  name: string;
  phone?: string;
  email?: string | null;
  role?: string | null;
  languages?: string[];
  is_staff?: boolean;
  is_on_duty?: boolean;
  is_external?: boolean;
}

interface PublicContactGroup {
  id: number;
  title: string;
  description?: string;
  category_name?: string;
  icon?: string;
  operational_category_name?: string;
  primary_contact?: ContactPersonDTO | null;
  secondary_contact?: ContactPersonDTO | null;
  current_incharge?: ContactPersonDTO | null;
  contacts?: Array<{
    name: string;
    phone?: string;
    email?: string | null;
    role_label?: string | null;
    is_on_shift?: boolean;
    is_external?: boolean;
  }>;
}

function ContactsSection() {
  const [groups, setGroups] = useState<PublicContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // "Call me back" — only for staff contacts (they have a staff id); external
  // contacts (hospital, police, ...) keep plain Call buttons.
  const [callbackTarget, setCallbackTarget] = useState<CallbackTarget | null>(null);
  const canCallBack = (c?: ContactPersonDTO | null) => !!c && !!c.id && !c.is_external;

  const FALLBACK_CONTACTS = [
    { role: "Organizing Secretary", name: "Principal / Sports Director", phone: "+91 98765 00001", email: "organizer@kabaddinationalscluster.info" },
    { role: "Chief Medical Officer", name: "Dr. A. Sharma (Campus Clinic)", phone: "+91 98765 00002", email: "medical@kabaddinationalscluster.info" },
    { role: "Chief Technical Official", name: "AKFI National Referee Panel", phone: "+91 98765 00003", email: "referees@kabaddinationalscluster.info" },
    { role: "Transport & Logistics Head", name: "Mr. R. Verma", phone: "+91 98765 00004", email: "transport@kabaddinationalscluster.info" },
    { role: "Accommodation Coordinator", name: "Hostel Warden Office", phone: "+91 98765 00005", email: "hostels@kabaddinationalscluster.info" },
    { role: "Security & Control Room", name: "Campus Security Desk", phone: "+91 98765 00006", email: "security@kabaddinationalscluster.info" },
  ];

  useEffect(() => {
    api
      .get<PublicContactGroup[]>("/public/contacts")
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setGroups(res.data);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch public contacts, falling back:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredGroups = groups.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const primaryName = g.primary_contact?.name || "";
    const inchargeName = g.current_incharge?.name || "";
    const secondaryName = g.secondary_contact?.name || "";
    const catName = g.category_name || g.operational_category_name || "";
    return (
      g.title.toLowerCase().includes(q) ||
      (g.description && g.description.toLowerCase().includes(q)) ||
      catName.toLowerCase().includes(q) ||
      primaryName.toLowerCase().includes(q) ||
      inchargeName.toLowerCase().includes(q) ||
      secondaryName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header & Question */}
      <div className="border-b border-white/10 pb-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-coral">
              24/7 HELPDESK & TOURNAMENT DIRECTORY
            </span>
            <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono">
              VERIFIED CONTACTS
            </span>
          </div>
          <h1 className="mt-2 font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            What do you need help with?
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
            Direct helpline numbers for accommodation, transport, medical response, food, and tournament administration.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accommodation, transport, doctor, admin..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/15 bg-obsidian-900 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs font-mono">
          Loading operational contacts...
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => {
            // Determine active/primary contact: current incharge takes precedence if available
            const activeContact = group.current_incharge || group.primary_contact;
            const hasInchargePreceded = Boolean(group.current_incharge && group.primary_contact && group.current_incharge.name !== group.primary_contact.name);
            const backupContact = hasInchargePreceded ? group.primary_contact : group.secondary_contact;
            const categoryBadge = group.category_name || group.operational_category_name;

            // Fallback to legacy contacts list if new primary_contact is missing
            const legacyList = !activeContact && group.contacts ? group.contacts : [];

            return (
              <div
                key={group.id}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 flex flex-col justify-between space-y-5 hover:border-gold/35 transition-all shadow-lg backdrop-blur-sm"
              >
                {/* Card Top: Category & Title */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-heading text-xl font-bold text-white tracking-tight">
                      {group.title}
                    </h2>
                    {categoryBadge && (
                      <span className="text-[10px] font-mono text-gold bg-gold/10 border border-gold/20 px-2 py-0.5 rounded-full shrink-0">
                        {categoryBadge}
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                </div>

                {/* Primary / Active Contact Section */}
                {activeContact ? (
                  <div className="rounded-xl bg-obsidian-900/90 border border-white/10 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-base font-bold text-white">
                            {activeContact.name}
                          </span>
                          {(group.current_incharge || activeContact.is_on_duty) && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              On Duty
                            </span>
                          )}
                        </div>
                        {activeContact.role && (
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">
                            {activeContact.role}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons: Call & WhatsApp */}
                    {activeContact.phone ? (
                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={`tel:${activeContact.phone}`}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold hover:bg-gold-400 text-obsidian font-bold text-xs transition-colors shadow-sm"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>Call</span>
                        </a>
                        <a
                          href={`https://wa.me/${activeContact.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold text-xs transition-colors"
                          title="Message on WhatsApp"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    ) : !canCallBack(activeContact) ? (
                      <span className="text-xs text-slate-500 italic">No direct phone configured</span>
                    ) : null}
                    {canCallBack(activeContact) && (
                      <button
                        type="button"
                        onClick={() =>
                          setCallbackTarget({
                            staffMemberId: activeContact.id!,
                            staffName: activeContact.name,
                            contactGroupId: group.id,
                            topic: group.title,
                          })
                        }
                        className={cn(
                          "w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-colors",
                          activeContact.phone
                            ? "border border-white/15 text-slate-200 hover:bg-white/10"
                            : "bg-gold hover:bg-gold-400 text-obsidian shadow-sm",
                        )}
                        data-testid={`callback-btn-${group.id}`}
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        <span>Call me back</span>
                      </button>
                    )}
                  </div>
                ) : legacyList.length > 0 ? (
                  <div className="space-y-2">
                    {legacyList.slice(0, 2).map((c, i) => (
                      <div key={i} className="rounded-xl bg-obsidian-900 border border-white/10 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{c.name}</span>
                          {c.role_label && (
                            <span className="text-[10px] text-gold">{c.role_label}</span>
                          )}
                        </div>
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1.5 text-xs text-gold font-mono hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-white/5 p-3 text-center text-xs text-slate-500 italic">
                    Contact details will be announced shortly.
                  </div>
                )}

                {/* Backup Contact Line */}
                {backupContact && backupContact.name && (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">
                      <strong className="text-slate-300">Backup:</strong> {backupContact.name}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {backupContact.phone && (
                        <a
                          href={`tel:${backupContact.phone}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-mono text-[11px] shrink-0 transition-colors"
                        >
                          <Phone className="h-3 w-3 text-gold" />
                          Call
                        </a>
                      )}
                      {canCallBack(backupContact) && (
                        <button
                          type="button"
                          onClick={() =>
                            setCallbackTarget({
                              staffMemberId: backupContact.id!,
                              staffName: backupContact.name,
                              contactGroupId: group.id,
                              topic: group.title,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] shrink-0 transition-colors"
                          data-testid={`callback-backup-btn-${group.id}`}
                        >
                          <PhoneCall className="h-3 w-3 text-gold" />
                          Call me back
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : groups.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FALLBACK_CONTACTS.map((c, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-3"
            >
              <div>
                <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-gold">
                  {c.role}
                </span>
                <h3 className="font-heading text-base font-bold text-white mt-1">{c.name}</h3>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2 text-xs font-mono">
                <a
                  href={`tel:${c.phone}`}
                  className="flex items-center gap-2 text-slate-200 hover:text-gold transition-colors font-bold"
                >
                  <Phone className="h-3.5 w-3.5 text-gold" /> {c.phone}
                </a>
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[11px]"
                  >
                    <Mail className="h-3.5 w-3.5" /> {c.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 text-sm">
          No contacts matched &quot;{search}&quot;. Try a different search term.
        </div>
      )}

      <CallbackRequestDialog target={callbackTarget} onClose={() => setCallbackTarget(null)} />
    </div>
  );
}

/* ========================================================================== */
/* FAQ SECTION                                                               */
/* ========================================================================== */
interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [askName, setAskName] = useState("");
  const [askEmail, setAskEmail] = useState("");
  const [askQuestion, setAskQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    api
      .get<FaqItem[]>("/public/faqs")
      .then((r) => {
        setFaqs(r.data);
        setOpenIdx(r.data[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const submitQuestion = async () => {
    if (!askQuestion.trim()) {
      toast.error("Enter your question first");
      return;
    }
    setAsking(true);
    try {
      await api.post("/public/faq-questions", {
        name: askName.trim() || undefined,
        email: askEmail.trim() || undefined,
        question: askQuestion.trim(),
      });
      setAsked(true);
      setAskName("");
      setAskEmail("");
      setAskQuestion("");
    } catch {
      toast.error("Could not submit your question — please try again");
    } finally {
      setAsking(false);
    }
  };

  // Group by category, preserving the organizer-defined display order within
  // each group (the backend already sorts by sequence).
  const groups: { category: string; items: FaqItem[] }[] = [];
  for (const f of faqs) {
    let group = groups.find((g) => g.category === f.category);
    if (!group) {
      group = { category: f.category, items: [] };
      groups.push(group);
    }
    group.items.push(f);
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
          Frequently Asked Questions
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
          Clarifications on match rules, protest guidelines, weigh-ins, and venue policies.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 font-body">Loading…</p>
      ) : faqs.length === 0 ? (
        <p className="text-sm text-slate-400 font-body">No FAQs published yet — check back soon.</p>
      ) : (
        groups.map((group) => (
          <div key={group.category} className="space-y-3">
            {groups.length > 1 && (
              <h2 className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
                {group.category}
              </h2>
            )}
            {group.items.map((faq) => {
              const isOpen = openIdx === faq.id;
              return (
                <div
                  key={faq.id}
                  className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : faq.id)}
                    className="w-full flex items-center justify-between p-5 text-left font-heading text-base font-bold text-white hover:text-gold transition-colors"
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-gold shrink-0 ml-4" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 shrink-0 ml-4" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-0 text-xs sm:text-sm text-slate-300 font-body leading-relaxed border-t border-white/5 pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      <div className="rounded-xl border border-gold/30 bg-gold/10 p-6 space-y-4" data-testid="ask-question-section">
        <div className="flex items-start gap-3.5">
          <HelpCircle className="h-5 w-5 text-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-heading font-bold text-white text-base">Didn't find your answer?</p>
            <p className="mt-1 text-xs text-slate-300 font-body">
              Ask your question below — the organizing committee will review it and may add it here for everyone.
            </p>
          </div>
        </div>

        {asked ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-body" data-testid="ask-question-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Thanks — your question has been submitted to the organizing committee.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Your Name (optional)</Label>
                <Input value={askName} onChange={(e) => setAskName(e.target.value)} placeholder="Jane Doe" data-testid="ask-question-name" />
              </div>
              <div>
                <Label>Email (optional, if you'd like a reply)</Label>
                <Input
                  type="email"
                  value={askEmail}
                  onChange={(e) => setAskEmail(e.target.value)}
                  placeholder="jane@example.com"
                  data-testid="ask-question-email"
                />
              </div>
            </div>
            <div>
              <Label>Your Question *</Label>
              <Textarea
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="Type your question here..."
                rows={3}
                data-testid="ask-question-text"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="gold" size="sm" onClick={submitQuestion} disabled={asking} data-testid="ask-question-submit">
                {asking ? "Submitting…" : "Submit Question"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
