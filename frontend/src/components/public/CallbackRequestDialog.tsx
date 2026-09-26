import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, PhoneCall } from "lucide-react";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CallbackTarget {
  staffMemberId: number;
  staffName: string;
  contactGroupId: number;
  topic?: string;
}

type Kind = "participant" | "coach";

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** Asks the browser for the device location (the browser shows its own
 * permission prompt). Resolves null if denied, unavailable or slower than
 * `timeoutMs` — the request is sent either way. */
function getDeviceLocation(timeoutMs = 8000): Promise<DeviceLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const giveUp = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(giveUp);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

interface Person {
  kind: Kind;
  id: number;
  name: string;
  role?: string | null;
}

/** "Call me back" on the public Contacts page. Step 1 verifies who's asking
 * (school code + last 4 digits of a participant's registration number, or a
 * coach's registered phone) via POST /public/callbacks/lookup; step 2 picks
 * the matching name, the number to call back on and an optional note, then
 * POST /public/callbacks files it for that staff member, who sees it live in
 * the Organizer Portal and phones back from their own phone. */
export function CallbackRequestDialog({ target, onClose }: { target: CallbackTarget | null; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("participant");
  const [schoolCode, setSchoolCode] = useState("");
  const [code, setCode] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [teamName, setTeamName] = useState("");
  const [personId, setPersonId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [sent, setSent] = useState<{ staffName: string; phone: string; alreadyWaiting: boolean; withLocation: boolean } | null>(null);

  // Fresh form each time it's opened for a (possibly different) staff member.
  useEffect(() => {
    if (!target) return;
    setPeople(null);
    setPersonId(null);
    setNote("");
    setSent(null);
  }, [target]);

  const errorText = (e: any, fallback: string) => {
    const d = e?.response?.data?.detail;
    return typeof d === "string" ? d : fallback;
  };

  const findMe = async () => {
    if (!schoolCode.trim()) return toast.error("Enter your school code");
    const digits = code.replace(/\D/g, "");
    if (kind === "participant" && digits.length !== 4)
      return toast.error("Enter the last 4 digits of your registration number");
    if (kind === "coach" && digits.length < 7) return toast.error("Enter your phone number as registered for the team");
    setBusy(true);
    try {
      const r = await api.post<{ team_name: string; people: Person[] }>("/public/callbacks/lookup", {
        school_code: schoolCode.trim(),
        kind,
        code,
      });
      setPeople(r.data.people);
      setTeamName(r.data.team_name);
      setPersonId(r.data.people.length === 1 ? r.data.people[0].id : null);
      if (kind === "coach" && !phone) setPhone(code.trim());
    } catch (e: any) {
      toast.error(errorText(e, "Couldn't check that — please try again"));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!target) return;
    if (!personId) return toast.error("Tap your name");
    if (phone.replace(/\D/g, "").length < 7) return toast.error("Enter the number we should call you on");
    setBusy(true);
    setLocating(true);
    const loc = await getDeviceLocation();
    setLocating(false);
    if (!loc) {
      setBusy(false);
      toast.error("Location is needed to send a call-back request", {
        description:
          "Allow location for this site (tap the lock / site-settings icon next to the address, or in the app's settings), turn on your phone's location, then try again.",
        duration: 10000,
      });
      return;
    }
    try {
      const r = await api.post<{ staff_name: string; already_waiting: boolean }>("/public/callbacks", {
        school_code: schoolCode.trim(),
        kind,
        code,
        person_id: personId,
        staff_member_id: target.staffMemberId,
        contact_group_id: target.contactGroupId,
        callback_phone: phone.trim(),
        message: note.trim() || null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        location_accuracy_m: loc.accuracy,
      });
      setSent({
        staffName: r.data.staff_name,
        phone: phone.trim(),
        alreadyWaiting: r.data.already_waiting,
        withLocation: true,
      });
    } catch (e: any) {
      toast.error(errorText(e, "Couldn't send the request — please try again"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `Ask ${target.staffName} to call you back` : "Call me back"}
      testId="callback-dialog"
    >
      {sent ? (
        <div className="space-y-4 text-center py-2" data-testid="callback-sent">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
          <div className="space-y-1">
            <p className="font-heading text-base font-bold text-white">
              {sent.alreadyWaiting ? "Your request is already waiting" : "Request sent"}
            </p>
            <p className="text-sm text-slate-300 font-body">
              {sent.staffName} will call you on <span className="font-mono text-gold">{sent.phone}</span>.
            </p>
            {sent.withLocation && (
              <p className="text-xs text-slate-400 font-body">Your location was shared so they can find you.</p>
            )}
            <p className="text-xs text-slate-500 font-body">Keep your phone nearby.</p>
          </div>
          <Button variant="gold" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {target?.topic && <p className="text-xs text-slate-400 font-body">Helpline: {target.topic}</p>}

          {/* STEP 1 — who are you */}
          <div className="space-y-3">
            <div className="inline-flex rounded-lg border border-white/10 bg-obsidian-950 p-1">
              {(["participant", "coach"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setCode("");
                    setPeople(null);
                    setPersonId(null);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-heading font-bold transition-colors",
                    kind === k ? "bg-gold text-obsidian" : "text-slate-400 hover:text-white",
                  )}
                  data-testid={`callback-kind-${k}`}
                >
                  {k === "participant" ? "I'm a participant" : "I'm a coach / manager"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>School code</Label>
                <Input
                  value={schoolCode}
                  onChange={(e) => {
                    setSchoolCode(e.target.value);
                    setPeople(null);
                  }}
                  placeholder="e.g. 10761"
                  inputMode="numeric"
                  data-testid="callback-school-code"
                />
              </div>
              <div>
                <Label>{kind === "participant" ? "Reg. no. (last 4)" : "Registered phone"}</Label>
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setPeople(null);
                  }}
                  placeholder={kind === "participant" ? "e.g. 0036" : "e.g. 98765 43210"}
                  inputMode={kind === "participant" ? "numeric" : "tel"}
                  maxLength={kind === "participant" ? 4 : 20}
                  onKeyDown={(e) => e.key === "Enter" && findMe()}
                  data-testid="callback-code"
                />
              </div>
            </div>
            {!people && (
              <Button variant="gold" size="sm" onClick={findMe} disabled={busy} data-testid="callback-find">
                {busy ? "Checking…" : "Continue"}
              </Button>
            )}
          </div>

          {/* STEP 2 — pick yourself, number, note */}
          {people && (
            <div className="space-y-3 border-t border-white/10 pt-3" data-testid="callback-step2">
              <div>
                <Label>
                  {people.length > 1 ? "Tap your name" : "You are"}{" "}
                  <span className="text-slate-500 font-normal normal-case tracking-normal">· {teamName}</span>
                </Label>
                <div className="grid gap-1.5">
                  {people.map((p) => (
                    <button
                      key={`${p.kind}-${p.id}`}
                      type="button"
                      onClick={() => setPersonId(p.id)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        personId === p.id
                          ? "border-gold/60 bg-gold/10 text-white"
                          : "border-white/10 bg-obsidian-950 text-slate-300 hover:border-white/25",
                      )}
                      data-testid={`callback-person-${p.id}`}
                    >
                      <span className="font-heading font-bold">{p.name}</span>
                      {p.role && <span className="text-[11px] text-slate-400">{p.role}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Call me back on</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your phone number"
                  inputMode="tel"
                  data-testid="callback-phone"
                />
              </div>
              <div>
                <Label>
                  What do you need? <span className="text-slate-500 font-normal normal-case tracking-normal">(optional)</span>
                </Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder="e.g. Need first aid for a knee injury"
                  data-testid="callback-note"
                />
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-slate-400 font-body">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gold" />
                Your phone will ask to share your location — it&apos;s required to send a request, so staff can
                find you on campus. Only organizers see it, and it&apos;s deleted once they&apos;ve called you.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="gold" size="sm" onClick={send} disabled={busy || !personId} data-testid="callback-send">
                  <PhoneCall className="h-3.5 w-3.5" />{" "}
                  {locating ? "Getting location…" : busy ? "Sending…" : "Request call back"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
