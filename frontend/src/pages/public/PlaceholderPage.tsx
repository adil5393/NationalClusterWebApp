import { useState } from "react";
import { Link } from "react-router-dom";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SectionProps {
  title: string;
  section: string;
}

export function PlaceholderPage({ title, section }: SectionProps) {
  const normSection = section.toLowerCase();

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 bg-kabaddi-court min-h-screen"
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
          to="/campus"
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
function AccommodationSection() {
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

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold font-bold">
            <Building className="h-5 w-5" />
          </div>
          <h3 className="font-heading text-base font-bold text-white">Boys Hostel Blocks (A & B)</h3>
          <p className="text-xs text-slate-300 font-body leading-relaxed">
            Spacious shared dormitories with bedding, study tables, secure lockers, and 24/7 hot water supply.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-coral/15 text-coral font-bold">
            <Shield className="h-5 w-5" />
          </div>
          <h3 className="font-heading text-base font-bold text-white">Girls Hostel Block (C)</h3>
          <p className="text-xs text-slate-300 font-body leading-relaxed">
            Dedicated secure block with restricted biometric/key entry, female resident wardens, and on-site medical attendants.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 font-bold">
            <Trophy className="h-5 w-5" />
          </div>
          <h3 className="font-heading text-base font-bold text-white">Guest House for Officials</h3>
          <p className="text-xs text-slate-300 font-body leading-relaxed">
            Executive guest rooms reserved for CBSE Sports Observers, Technical Jury, Chief Referees, and VIP dignitaries.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-obsidian-900/80 p-6 space-y-3">
        <h3 className="font-heading text-sm font-bold text-white uppercase tracking-wider text-gold">
          Hostel Rules & Curfew Protocol
        </h3>
        <ul className="space-y-2 text-xs text-slate-300 font-body">
          <li className="flex items-start gap-2">
            <span className="text-gold font-bold">•</span>
            <span><strong>Curfew:</strong> All participants must report to their respective hostel rooms by 21:30 hrs.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gold font-bold">•</span>
            <span><strong>Athlete Accreditation:</strong> Wearing tournament ID tags is mandatory across hostel premises.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gold font-bold">•</span>
            <span><strong>Valuables:</strong> Teams should deposit team documents and high-value gear with the delegation manager or hostel warden.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* FOOD & DINING SECTION                                                     */
/* ========================================================================== */
function FoodSection() {
  const MEALS = [
    { meal: "Breakfast", time: "06:30 – 09:00", menu: "Porridge, Sprouts, Boiled Eggs, Idli/Dosa, Parathas, Fresh Fruits, Milk & Tea" },
    { meal: "Lunch", time: "12:30 – 14:30", menu: "Steamed Rice, Roti, Dal Makhani/Tadka, Paneer, Chicken Curry (Non-veg days), Curd, Green Salad" },
    { meal: "Evening High Tea", time: "17:00 – 18:00", menu: "Energy Drinks, Glucose, Banana, Light Sandwiches, Biscuits & Hot Beverages" },
    { meal: "Dinner", time: "19:30 – 21:30", menu: "Wholesome Athletic Dinner with Carbs & Proteins, Rice, Vegetable Pulao, Dal, Sabzi & Dessert" },
  ];

  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
          Food & Dining Schedule
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
          High-protein sports nutrition prepared in hygienic conditions for student athletes.
        </p>
      </div>

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
function ContactsSection() {
  const CONTACTS = [
    { role: "Organizing Secretary", name: "Principal / Sports Director", phone: "+91 98765 00001", email: "organizer@kabaddinationalscluster.info", priority: true },
    { role: "Chief Medical Officer", name: "Dr. A. Sharma (Campus Clinic)", phone: "+91 98765 00002", email: "medical@kabaddinationalscluster.info", priority: true },
    { role: "Chief Technical Official", name: "AKFI National Referee Panel", phone: "+91 98765 00003", email: "referees@kabaddinationalscluster.info" },
    { role: "Transport & Logistics Head", name: "Mr. R. Verma", phone: "+91 98765 00004", email: "transport@kabaddinationalscluster.info" },
    { role: "Accommodation Coordinator", name: "Hostel Warden Office", phone: "+91 98765 00005", email: "hostels@kabaddinationalscluster.info" },
    { role: "Security & Control Room", name: "Campus Security Desk", phone: "+91 98765 00006", email: "security@kabaddinationalscluster.info" },
  ];

  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-coral">
            24/7 HELPDESK
          </span>
        </div>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">
          Emergency & Important Contacts
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
          Direct helpline numbers for emergency medical support, security, and organizing officials.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONTACTS.map((c, i) => (
          <div
            key={i}
            className={`rounded-xl border p-5 space-y-3 ${
              c.priority
                ? "border-coral/40 bg-gradient-to-br from-coral/10 via-obsidian-900 to-obsidian"
                : "border-white/10 bg-obsidian-900"
            }`}
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
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[11px]"
              >
                <Mail className="h-3.5 w-3.5 text-slate-500" /> {c.email}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* FAQ SECTION                                                               */
/* ========================================================================== */
function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const FAQS = [
    {
      q: "What are the eligibility and weigh-in requirements?",
      a: "All student athletes must produce their original CBSE registration card, valid Aadhaar/Passport, and undergo mandatory weigh-in before Day 1 competition according to AKFI weight brackets (Under-19 and Under-17 specifications).",
    },
    {
      q: "What is the official match format and duration?",
      a: "Matches follow standard AKFI rules: Two halves of 20 minutes each with a 5-minute interval. Raid time limit is 30 seconds. Third empty raid triggers a 'Do-or-Die' raid.",
    },
    {
      q: "How are pool standings and points calculated?",
      a: "Win: 2 points, Tie: 1 point, Loss: 0 points. Ties in pool standings are resolved via Score Difference (points scored minus points conceded), followed by total points scored and head-to-head match result.",
    },
    {
      q: "What is the procedure for lodging a technical protest?",
      a: "Protests regarding match decisions must be submitted in writing to the Chief Technical Official within 30 minutes of the match conclusion, accompanied by the standard official fee.",
    },
    {
      q: "Are parents and external spectators permitted to watch matches?",
      a: "Yes, spectator entry into the main stadium gallery is free. However, spectator access is restricted to public spectator zones; the court apron, team bench, and athlete hostels require official delegation passes.",
    },
  ];

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

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden transition-colors"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left font-heading text-base font-bold text-white hover:text-gold transition-colors"
              >
                <span>{faq.q}</span>
                {isOpen ? <ChevronUp className="h-5 w-5 text-gold shrink-0 ml-4" /> : <ChevronDown className="h-5 w-5 text-slate-400 shrink-0 ml-4" />}
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-0 text-xs sm:text-sm text-slate-300 font-body leading-relaxed border-t border-white/5 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
