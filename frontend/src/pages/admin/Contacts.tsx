import { Phone, Mail, Shield, AlertTriangle, Bus, BedDouble, Radio, FileCheck, LifeBuoy, Users, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OperationalContactArea {
  title: string;
  category: string;
  icon: React.ElementType;
  description: string;
  recommendedRoles: string[];
}

const OPERATIONAL_AREAS: OperationalContactArea[] = [
  {
    title: "Emergency Medical & First Aid",
    category: "HEALTH & SAFETY",
    icon: Shield,
    description: "On-campus medical clinic, physiotherapists, emergency ambulances, and nearby hospital coordination.",
    recommendedRoles: ["Chief Medical Officer", "Campus Clinic Nurse", "Emergency Dispatch"],
  },
  {
    title: "Transport & Transit Logistics",
    category: "LOGISTICS",
    icon: Bus,
    description: "Airport/railway station team pickups, intra-campus shuttles, and driver fleet dispatchers.",
    recommendedRoles: ["Transport Manager", "Fleet Lead", "Station Reception Desk"],
  },
  {
    title: "Hostel & Accommodation Wardens",
    category: "FACILITY",
    icon: BedDouble,
    description: "Room allotments, keys, curfew compliance, bedding supplies, and hostel warden desks.",
    recommendedRoles: ["Chief Warden", "Hostel Block A Supervisor", "Hostel Block B Supervisor"],
  },
  {
    title: "Match Control & Technical Officials",
    category: "COMPETITION",
    icon: Radio,
    description: "AKFI certified referees, jury of appeal, mat supervisors, and official electronic scoring table.",
    recommendedRoles: ["Chief Technical Official", "Referee Coordinator", "Jury of Appeal Secretary"],
  },
  {
    title: "Registration & Team Accreditation",
    category: "GOVERNANCE",
    icon: FileCheck,
    description: "Eligibility verification, photo ID badge distribution, team entry confirmation, and weigh-ins.",
    recommendedRoles: ["Accreditation Desk Lead", "Registration Officer"],
  },
  {
    title: "Technical Support & Live Broadcast",
    category: "OPERATIONS",
    icon: LifeBuoy,
    description: "Walkie-talkie channel allocations, live streaming video feed, scoreboards, and PA audio systems.",
    recommendedRoles: ["Broadcast Engineer", "Walkie Talkie Coordinator", "IT Systems Lead"],
  },
];

export default function Contacts() {
  return (
    <div data-testid="admin-contacts" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            EVENT DIRECTORY
          </span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
            EVENT-FACING DIRECTORY
          </span>
        </div>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Important & Emergency Contacts
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Configure and publish public-facing emergency numbers, helpline desks, and department coordinators for
          visiting state delegations.
        </p>
      </div>

      {/* NOTICE BANNER */}
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-gold shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 font-body leading-relaxed space-y-1">
          <p className="font-heading font-bold text-white text-sm">Event Helpline Directory Management</p>
          <p>
            Contacts published here are surfaced on the public marketing portal and in team delegation packets.
            Standard tournament operational roles are outlined below.
          </p>
        </div>
      </div>

      {/* OPERATIONAL CONTACT AREAS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OPERATIONAL_AREAS.map((area, idx) => {
          const Icon = area.icon;
          return (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-obsidian-900 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-white/20 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge tone="neutral" size="sm">
                    {area.category}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-heading font-bold text-white text-base">{area.title}</h3>
                  <p className="mt-1.5 text-xs text-slate-400 font-body leading-relaxed">
                    {area.description}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-1.5">
                <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-500">
                  Recommended Key Roles
                </p>
                <div className="flex flex-wrap gap-1">
                  {area.recommendedRoles.map((role, rIdx) => (
                    <span
                      key={rIdx}
                      className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EMPTY / READY STATE NOTICE */}
      <div className="rounded-xl border border-dashed border-white/15 bg-obsidian-950 p-6 text-center space-y-2">
        <Users className="h-8 w-8 text-slate-500 mx-auto" />
        <h3 className="font-heading text-sm font-bold text-white">Dynamic Contact Registry Prepared</h3>
        <p className="text-xs text-slate-400 font-body max-w-md mx-auto">
          Public-facing contacts are currently served from verified tournament helplines. Dynamic admin editing
          will be enabled in the next deployment cycle without schema disruptions.
        </p>
      </div>
    </div>
  );
}
