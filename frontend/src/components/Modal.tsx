import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(95vw,52rem)] overflow-y-auto rounded-3xl bg-[#f7f5ef] p-6 text-denim shadow-2xl backdrop:bg-black/50"
    >
      <header className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button
          type="button"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
          className="secondary h-11 w-11"
        >
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
