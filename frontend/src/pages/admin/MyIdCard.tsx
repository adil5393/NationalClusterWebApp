import { useEffect, useState } from "react";
import { AlertTriangle, Download, HeartHandshake } from "lucide-react";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/ui/feedback";

interface MyVolunteerProfile {
  id: number;
  full_name: string;
  student_class: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
}

export default function MyIdCard() {
  const [data, setData] = useState<MyVolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<"none-linked" | "ambiguous" | "other" | null>(null);

  useEffect(() => {
    api
      .get<MyVolunteerProfile>("/me/volunteer")
      .then((r) => {
        setData(r.data);
        setErrorState(null);
      })
      .catch((e) => {
        const status = e?.response?.status;
        if (status === 404) setErrorState("none-linked");
        else if (status === 409) setErrorState("ambiguous");
        else setErrorState("other");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading your profile…" />
      </div>
    );
  }

  if (errorState === "none-linked") {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState
          icon={HeartHandshake}
          title="No volunteer profile linked"
          hint="This login isn't linked to a volunteer profile yet. Ask an admin to link your account from Volunteers."
        />
      </div>
    );
  }

  if (errorState === "ambiguous") {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState
          icon={AlertTriangle}
          title="Multiple volunteer profiles linked"
          hint="This login is linked to more than one volunteer profile, so this page can't tell which one is you. Ask an admin to link a single volunteer profile to this account."
        />
      </div>
    );
  }

  if (errorState === "other" || !data) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState icon={AlertTriangle} title="Couldn't load your profile" hint="Please try again in a moment." />
      </div>
    );
  }

  return (
    <div data-testid="my-idcard-page" className="space-y-6 max-w-lg mx-auto">
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">MY PROFILE</span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          {data.full_name}
        </h1>
        {data.student_class && (
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">Class {data.student_class}</p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4">
        <div className="flex items-center gap-4">
          {data.photo_url ? (
            <img
              src={`${BASE_URL}${data.photo_url}`}
              alt={data.full_name}
              className="h-16 w-16 rounded-full object-cover border border-white/10"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/5 border border-white/10 grid place-items-center text-slate-500">
              <HeartHandshake className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="font-heading font-bold text-white text-sm truncate">{data.full_name}</p>
            {data.gender && <p className="text-xs text-slate-400 font-body">{data.gender}</p>}
            {data.phone && <p className="text-xs font-mono text-slate-400">{data.phone}</p>}
            {data.email && <p className="text-xs font-mono text-slate-400">{data.email}</p>}
          </div>
        </div>

        <a
          href={`${BASE_URL}/api/me/volunteer/idcard.pdf`}
          className="flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-heading font-extrabold uppercase tracking-wide text-gold hover:bg-gold/15 transition-colors"
          data-testid="download-my-idcard-btn"
        >
          <Download className="h-4 w-4" /> Download My ID Card
        </a>
      </div>
    </div>
  );
}
