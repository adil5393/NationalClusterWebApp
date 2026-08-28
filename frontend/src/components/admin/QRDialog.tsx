import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QRDialog({
  open,
  onClose,
  url,
  title,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Team QR Code" className="max-w-sm" testId="qr-dialog">
      <div className="qr-print flex flex-col items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
        <QRCodeSVG value={url} size={220} level="M" includeMargin data-testid="qr-svg" />
        <div className="text-center">
          <p className="font-heading text-lg font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-coral">Cluster Nationals 2026–27</p>
          <p className="mt-2 max-w-[16rem] break-all text-[11px] text-slate-500">{url}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => window.print()} data-testid="print-qr-btn"><Printer className="h-4 w-4" /> Print</Button>
      </div>
    </Dialog>
  );
}
