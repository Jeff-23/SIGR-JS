import { Printer, X } from "lucide-react";
import { useRef, useState } from "react";

export function PrintableDocumentModal({
  html,
  title,
  onClose,
  onPrint,
  onBrowserPrintConfirmed,
  printLabel = "Imprimir",
}: {
  html: string;
  title: string;
  onClose: () => void;
  onPrint?: () => Promise<"handled" | "browser" | void>;
  onBrowserPrintConfirmed?: () => Promise<void>;
  printLabel?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const result = onPrint ? await onPrint() : "browser";
      if (result !== "handled") {
        frame.current?.contentWindow?.print();
        if (onBrowserPrintConfirmed) {
          const confirmed = window.confirm(
            "¿El ticket salió físicamente de la impresora? Confirma sólo después de verificar el papel.",
          );
          if (confirmed) await onBrowserPrintConfirmed();
        }
      }
    } finally {
      setPrinting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 p-3 print:bg-white">
      <section className="card mx-auto max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <strong>{title}</strong>
          <div className="flex gap-2">
            <button
              className="primary w-auto"
              disabled={printing}
              onClick={() => void print()}
            >
              <Printer size={18} /> {printing ? "Registrando…" : printLabel}
            </button>
            <button className="secondary w-auto" onClick={onClose}>
              <X size={18} /> Cerrar
            </button>
          </div>
        </div>
        <iframe
          ref={frame}
          title={title}
          sandbox="allow-same-origin allow-modals"
          srcDoc={html}
          className="h-[78vh] w-full border-0 bg-white"
        />
      </section>
    </div>
  );
}
