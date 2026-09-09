import { Printer, X } from "lucide-react";
import { useRef } from "react";

export function PrintableDocumentModal({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 p-3 print:bg-white">
      <section className="card mx-auto max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <strong>{title}</strong>
          <div className="flex gap-2">
            <button
              className="primary w-auto"
              onClick={() => frame.current?.contentWindow?.print()}
            >
              <Printer size={18} /> Imprimir
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
