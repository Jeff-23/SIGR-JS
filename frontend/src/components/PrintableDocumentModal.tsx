import { Printer, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

function printDetached(html: string, title: string) {
  return new Promise<void>((resolve, reject) => {
    const popup = window.open("", "_blank", "popup,width=720,height=900");
    if (!popup) {
      reject(new Error("El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes para SIGR."));
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => popup.close(), 50);
      resolve();
    };

    popup.addEventListener("afterprint", finish, { once: true });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.document.title = title;

    window.setTimeout(() => {
      try {
        popup.focus();
        popup.print();
        // Algunos WebViews/Electron no disparan afterprint al cancelar.
        window.setTimeout(finish, 1000);
      } catch (error) {
        popup.close();
        reject(error instanceof Error ? error : new Error("No fue posible abrir la impresión"));
      }
    }, 120);
  });
}

export function PrintableDocumentModal({
  html,
  title,
  onClose,
  onPrint,
  onBrowserPrintConfirmed,
  printLabel = "Imprimir",
  toolbar,
}: {
  html: string;
  title: string;
  onClose: () => void;
  onPrint?: () => Promise<"handled" | "browser" | void>;
  onBrowserPrintConfirmed?: () => Promise<void>;
  printLabel?: string;
  toolbar?: ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const result = onPrint ? await onPrint() : "browser";
      if (result !== "handled") {
        await printDetached(html, title);
        if (onBrowserPrintConfirmed) {
          const confirmed = window.confirm(
            "La impresión del navegador no puede confirmar por sí sola que salió papel. ¿Verificaste físicamente que el ticket se imprimió?",
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
              <Printer size={18} /> {printing ? "Imprimiendo…" : printLabel}
            </button>
            <button className="secondary w-auto" disabled={printing} onClick={onClose}>
              <X size={18} /> Cerrar
            </button>
          </div>
        </div>
        {toolbar && <div className="print:hidden">{toolbar}</div>}
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
