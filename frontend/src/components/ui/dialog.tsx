import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function Dialog({ open, onClose, title, children, className, testId }: DialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid={testId ? `${testId}-overlay` : undefined}
    >
      <div
        className={cn("mt-16 w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl", className)}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-heading text-lg font-bold text-slate-950">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="dialog-close-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
