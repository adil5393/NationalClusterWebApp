import { QRCodeSVG } from "qrcode.react";
import { Printer, QrCode } from "lucide-react";
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
    <Dialog open={open} onClose={onClose} title="Delegation QR Credential" className="max-w-sm" testId="qr-dialog">
      <div className="qr-print flex flex-col items-center gap-4 rounded-xl bg-white p-5 shadow-2xl">
        <QRCodeSVG value={url} size={220} level="M" includeMargin data-testid="qr-svg" />
        <div className="text-center">
          <p className="font-heading text-lg font-black text-slate-950 tracking-tight">{title}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-coral">
            CBSE National Kabaddi 2026–27
          </p>
          <p className="mt-2 max-w-[16rem] break-all text-[10px] font-mono text-slate-500 bg-slate-100 p-1.5 rounded">
            {url}
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button variant="gold" size="sm" onClick={() => window.print()} data-testid="print-qr-btn">
          <Printer className="h-4 w-4" /> Print Credential
        </Button>
      </div>
    </Dialog>
  );
}
