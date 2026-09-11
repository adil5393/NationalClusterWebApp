import { useEffect, useMemo, useState } from "react";
import { FileText, Wallet, Download, Undo2, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

interface BillableMember {
  kind: "participant" | "coach";
  id: number;
  name: string;
  role: string;
}

interface PaymentRow {
  id: number;
  kind: "BILL" | "PAYMENT" | "REFUND";
  amount: number;
  payment_mode?: "Cash" | "UPI" | null;
  transaction_id?: string | null;
  payment_date: string;
  reason?: string | null;
  member_count?: number | null;
  subtotal?: number | null;
  discount?: number | null;
}

interface BillingSummary {
  unbilled_present_members: BillableMember[];
  default_per_member_amount: number;
  total_billed: number;
  total_paid: number;
  total_refunded: number;
  balance_due: number;
  net_collected: number;
  payments: PaymentRow[];
}

function todayLocal(): string {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

async function downloadBlob(promise: Promise<{ data: Blob; headers: any }>, fallbackName: string) {
  const r = await promise;
  const disposition: string = r.headers?.["content-disposition"] ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function blobErrorMessage(e: any, fallback: string): Promise<string> {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.detail ?? fallback;
    } catch {
      return fallback;
    }
  }
  return e?.response?.data?.detail ?? fallback;
}

export function ReceiptDialog({
  open,
  onClose,
  team,
}: {
  open: boolean;
  onClose: () => void;
  team: { id: number; name: string } | null;
}) {
  const [tab, setTab] = useState<"bill" | "invoice" | "refund">("bill");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [busy, setBusy] = useState(false);

  const [perMemberAmount, setPerMemberAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [billDate, setBillDate] = useState(todayLocal);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"Cash" | "UPI">("Cash");
  const [paymentTxnId, setPaymentTxnId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayLocal);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMode, setRefundMode] = useState<"Cash" | "UPI">("Cash");
  const [refundTxnId, setRefundTxnId] = useState("");
  const [refundDate, setRefundDate] = useState(todayLocal);

  const loadSummary = async () => {
    if (!team) return;
    setLoadingSummary(true);
    try {
      const r = await api.get<BillingSummary>(`/teams/${team.id}/billing-summary`);
      setSummary(r.data);
      setPerMemberAmount(String(r.data.default_per_member_amount));
    } catch {
      toast.error("Could not load billing summary");
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (open && team) {
      setTab("bill");
      setDiscount("0");
      setBillDate(todayLocal());
      setPaymentAmount("");
      setPaymentMode("Cash");
      setPaymentTxnId("");
      setPaymentDate(todayLocal());
      setRefundAmount("");
      setRefundReason("");
      setRefundMode("Cash");
      setRefundTxnId("");
      setRefundDate(todayLocal());
      loadSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id]);

  const billPreview = useMemo(() => {
    const count = summary?.unbilled_present_members.length ?? 0;
    const rate = Number(perMemberAmount) || 0;
    const subtotal = rate * count;
    const disc = Number(discount) || 0;
    return { count, subtotal, discount: disc, total: Math.max(0, subtotal - disc) };
  }, [summary, perMemberAmount, discount]);

  const submitBill = async () => {
    if (!team) return;
    if (!summary || summary.unbilled_present_members.length === 0) {
      return toast.error("Every present member on this team has already been billed");
    }
    const rate = Number(perMemberAmount);
    if (!Number.isFinite(rate) || rate < 0) return toast.error("Enter a valid per-member amount");
    const disc = Number(discount) || 0;
    if (disc < 0) return toast.error("Discount can't be negative");
    if (disc > billPreview.subtotal) return toast.error("Discount can't exceed the bill subtotal");
    setBusy(true);
    try {
      await api.post(`/teams/${team.id}/bills`, { per_member_amount: rate, discount: disc, payment_date: billDate });
      toast.success("Bill created — download the invoice from the Invoice tab");
      setTab("invoice");
      loadSummary();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create bill");
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async () => {
    if (!team) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid payment amount");
    if (paymentMode === "UPI" && !paymentTxnId.trim()) return toast.error("Enter the UPI transaction ID");
    setBusy(true);
    try {
      await api.post(`/teams/${team.id}/payments`, {
        amount,
        payment_mode: paymentMode,
        transaction_id: paymentMode === "UPI" ? paymentTxnId.trim() : undefined,
        payment_date: paymentDate,
      });
      toast.success("Payment recorded — download the updated invoice below");
      setPaymentAmount("");
      setPaymentTxnId("");
      loadSummary();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not record payment");
    } finally {
      setBusy(false);
    }
  };

  const downloadInvoice = async () => {
    if (!team) return;
    setBusy(true);
    try {
      await downloadBlob(api.get(`/teams/${team.id}/invoice.pdf`, { responseType: "blob" }), `invoice-${team.id}.pdf`);
    } catch (e: any) {
      toast.error(await blobErrorMessage(e, "Could not download invoice"));
    } finally {
      setBusy(false);
    }
  };

  const [reprintingId, setReprintingId] = useState<number | null>(null);
  const reprintRefund = async (paymentId: number) => {
    if (!team) return;
    setReprintingId(paymentId);
    try {
      await downloadBlob(
        api.get(`/teams/${team.id}/refunds/${paymentId}.pdf`, { responseType: "blob" }),
        `refund-${team.id}-${paymentId}.pdf`,
      );
    } catch (e: any) {
      toast.error(await blobErrorMessage(e, "Could not download refund voucher"));
    } finally {
      setReprintingId(null);
    }
  };

  const submitRefund = async () => {
    if (!team) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid refund amount");
    if (!refundReason.trim()) return toast.error("Enter a reason for the refund");
    if (refundMode === "UPI" && !refundTxnId.trim()) return toast.error("Enter the UPI transaction ID");
    setBusy(true);
    try {
      await downloadBlob(
        api.post(
          `/teams/${team.id}/refunds`,
          {
            amount,
            reason: refundReason.trim(),
            payment_mode: refundMode,
            transaction_id: refundMode === "UPI" ? refundTxnId.trim() : undefined,
            payment_date: refundDate,
          },
          { responseType: "blob" },
        ),
        `refund-${team.id}.pdf`,
      );
      toast.success("Refund recorded and voucher downloaded");
      setRefundAmount("");
      setRefundReason("");
      setRefundTxnId("");
      loadSummary();
    } catch (e: any) {
      toast.error(await blobErrorMessage(e, "Could not record refund"));
    } finally {
      setBusy(false);
    }
  };

  const canPay = (summary?.balance_due ?? 0) > 0;
  const canRefund = (summary?.net_collected ?? 0) > 0;
  const hasBills = (summary?.total_billed ?? 0) > 0;

  return (
    <Dialog
      open={open && !!team}
      onClose={onClose}
      title={team ? `Billing for ${team.name}` : "Billing"}
      testId="receipt-dialog"
    >
      <div className="space-y-4">
        <div className="flex gap-1.5 rounded-lg border border-white/10 bg-obsidian-950 p-1" data-testid="receipt-tabs">
          <button
            type="button"
            onClick={() => setTab("bill")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              tab === "bill" ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
            }`}
            data-testid="receipt-tab-bill"
          >
            <FileText className="h-3 w-3" /> Bill
          </button>
          <button
            type="button"
            onClick={() => setTab("invoice")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              tab === "invoice" ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
            }`}
            data-testid="receipt-tab-invoice"
          >
            <Wallet className="h-3 w-3" /> Invoice
          </button>
          <button
            type="button"
            onClick={() => setTab("refund")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              tab === "refund" ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
            }`}
            data-testid="receipt-tab-refund"
          >
            <Undo2 className="h-3 w-3" /> Refund
          </button>
        </div>

        {loadingSummary ? (
          <p className="text-xs text-slate-400 font-body py-4 text-center">Loading billing summary…</p>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
              <p>
                Total Billed: <strong className="text-white">Rs. {(summary?.total_billed ?? 0).toLocaleString()}</strong>
              </p>
              <p>
                Total Paid: <strong className="text-white">Rs. {(summary?.total_paid ?? 0).toLocaleString()}</strong>
              </p>
              <p>
                Balance Due: <strong className="text-amber-400">Rs. {(summary?.balance_due ?? 0).toLocaleString()}</strong>
              </p>
              <p>
                Total Refunded: <strong className="text-white">Rs. {(summary?.total_refunded ?? 0).toLocaleString()}</strong>
              </p>
              <p className="col-span-2">
                Net Collected: <strong className="text-gold">Rs. {(summary?.net_collected ?? 0).toLocaleString()}</strong>
              </p>
            </div>

            {tab === "bill" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 font-body">
                  Billing only records what's owed — it doesn't download anything. Download the invoice from the
                  Invoice tab once ready.
                </p>
                {summary && summary.unbilled_present_members.length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 space-y-1.5">
                    <p className="text-xs font-heading font-bold text-white">
                      {summary.unbilled_present_members.length} present member
                      {summary.unbilled_present_members.length === 1 ? "" : "s"} not yet billed
                    </p>
                    <ul className="max-h-24 overflow-y-auto text-[11px] text-slate-400 space-y-0.5">
                      {summary.unbilled_present_members.map((m) => (
                        <li key={`${m.kind}-${m.id}`}>
                          {m.name} <span className="text-slate-500">· {m.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 font-body">
                    Every currently-present member has already been billed. Mark more members present to bill them.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Per-Member Amount (Rs.)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={perMemberAmount}
                      onChange={(e) => setPerMemberAmount(e.target.value)}
                      data-testid="bill-per-member-amount-input"
                    />
                  </div>
                  <div>
                    <Label>Discount (Rs.)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      data-testid="bill-discount-input"
                    />
                  </div>
                </div>

                {billPreview.count > 0 && (
                  <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs font-mono space-y-1">
                    <p className="text-slate-400">
                      Subtotal: {billPreview.count} × Rs. {(Number(perMemberAmount) || 0).toLocaleString()} = Rs.{" "}
                      {billPreview.subtotal.toLocaleString()}
                    </p>
                    {billPreview.discount > 0 && (
                      <p className="text-red-400">Discount: − Rs. {billPreview.discount.toLocaleString()}</p>
                    )}
                    <p className="text-gold font-bold">This bill's total due: Rs. {billPreview.total.toLocaleString()}</p>
                  </div>
                )}

                <div>
                  <Label>Invoice Date</Label>
                  <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} data-testid="bill-date-input" />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={submitBill}
                    disabled={busy || !summary || summary.unbilled_present_members.length === 0}
                    data-testid="submit-bill-btn"
                  >
                    <FileText className="h-3.5 w-3.5" /> {busy ? "Creating…" : "Create Bill"}
                  </Button>
                </div>
              </div>
            )}

            {tab === "invoice" && (
              <div className="space-y-4">
                {!hasBills ? (
                  <p className="text-xs text-slate-400 font-body">
                    This team has no bills yet — create one from the Bill tab first.
                  </p>
                ) : (
                  <>
                    {canPay && (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-obsidian-950 p-3.5">
                        <p className="text-xs font-heading font-bold text-white">
                          Record Payment (up to Rs. {summary?.balance_due.toLocaleString()})
                        </p>
                        <Input
                          type="number"
                          min={1}
                          max={summary?.balance_due}
                          placeholder="Amount received, e.g. 3000"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          data-testid="payment-amount-input"
                        />
                        <div className="flex gap-1.5 rounded-lg border border-white/10 bg-obsidian p-1">
                          {(["Cash", "UPI"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPaymentMode(mode)}
                              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                                paymentMode === mode ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
                              }`}
                              data-testid={`payment-mode-${mode.toLowerCase()}`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                        {paymentMode === "UPI" && (
                          <Input
                            placeholder="UPI Transaction ID"
                            value={paymentTxnId}
                            onChange={(e) => setPaymentTxnId(e.target.value)}
                            data-testid="payment-transaction-id-input"
                          />
                        )}
                        <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} data-testid="payment-date-input" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={submitPayment}
                          disabled={busy}
                          data-testid="submit-payment-btn"
                        >
                          <Wallet className="h-3.5 w-3.5" /> {busy ? "Recording…" : "Record Payment"}
                        </Button>
                      </div>
                    )}
                    {!canPay && (
                      <p className="text-xs text-emerald-400 font-body">This team is paid in full — no balance due.</p>
                    )}

                    <Button
                      variant="gold"
                      size="sm"
                      className="w-full"
                      onClick={downloadInvoice}
                      disabled={busy}
                      data-testid="download-invoice-btn"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Invoice (members, amounts &amp; paid status)
                    </Button>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            )}

            {tab === "refund" && (
              <div className="space-y-4">
                {!canRefund ? (
                  <p className="text-xs text-amber-400 font-body">
                    This team has no net received amount — a refund can only be issued against money already paid.
                  </p>
                ) : (
                  <>
                    <div>
                      <Label>Refund Amount (Rs., up to {summary?.net_collected.toLocaleString()})</Label>
                      <Input
                        type="number"
                        min={1}
                        max={summary?.net_collected}
                        placeholder="e.g. 500"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        data-testid="refund-amount-input"
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea
                        placeholder="e.g. Two players withdrew before the tournament started"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        data-testid="refund-reason-input"
                      />
                    </div>
                    <div>
                      <Label>Payment Mode</Label>
                      <div className="mt-1.5 flex gap-1.5 rounded-lg border border-white/10 bg-obsidian-950 p-1">
                        {(["Cash", "UPI"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setRefundMode(mode)}
                            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                              refundMode === mode ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
                            }`}
                            data-testid={`refund-payment-mode-${mode.toLowerCase()}`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    {refundMode === "UPI" && (
                      <div>
                        <Label>UPI Transaction ID</Label>
                        <Input
                          placeholder="e.g. 402912345678"
                          value={refundTxnId}
                          onChange={(e) => setRefundTxnId(e.target.value)}
                          data-testid="refund-transaction-id-input"
                        />
                      </div>
                    )}
                    <div>
                      <Label>Refund Date</Label>
                      <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} data-testid="refund-date-input" />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={submitRefund}
                    disabled={busy || !canRefund}
                    data-testid="submit-refund-btn"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> {busy ? "Recording…" : "Refund & Download Voucher"}
                  </Button>
                </div>
              </div>
            )}

            {summary && summary.payments.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 space-y-1.5">
                <p className="text-xs font-heading font-bold text-white">Transaction History</p>
                <ul className="max-h-32 overflow-y-auto text-[11px] font-mono space-y-1">
                  {summary.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                      <span
                        className={
                          p.kind === "BILL" ? "text-amber-400" : p.kind === "PAYMENT" ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {p.kind === "BILL" ? "Bill" : p.kind === "PAYMENT" ? "Payment" : "Refund"}
                      </span>
                      <span className="text-slate-400 truncate flex-1 px-2">
                        {p.payment_date}
                        {p.payment_mode ? ` · ${p.payment_mode}` : ""}
                        {p.reason ? ` · ${p.reason}` : ""}
                      </span>
                      <span className="text-white">Rs. {p.amount.toLocaleString()}</span>
                      {p.kind === "REFUND" && (
                        <button
                          type="button"
                          onClick={() => reprintRefund(p.id)}
                          disabled={reprintingId === p.id}
                          title="Re-download this refund voucher"
                          data-testid={`reprint-refund-${p.id}`}
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          <Printer className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
