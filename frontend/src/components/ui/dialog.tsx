import { useEffect } from "react";
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md transition-opacity"
      onClick={onClose}
      data-testid={testId ? `${testId}-overlay` : undefined}
    >
      <div
        className={cn(
          "mt-14 w-full max-w-lg rounded-xl border border-white/15 bg-obsidian-900 text-slate-100 shadow-2xl transition-transform",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="font-heading text-lg font-bold tracking-tight text-white">{title}</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            data-testid="dialog-close-btn"
            aria-label="Close"
            className="text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  position?: "left" | "right" | "bottom";
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  position = "right",
  className,
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const positionClasses = {
    right: "inset-y-0 right-0 max-w-md w-full border-l border-white/15",
    left: "inset-y-0 left-0 max-w-md w-full border-r border-white/15",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-white/15",
  }[position];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose}>
      <div
        className={cn(
          "fixed flex flex-col bg-obsidian-900 shadow-2xl text-slate-100",
          positionClasses,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h3 className="font-heading text-lg font-bold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
