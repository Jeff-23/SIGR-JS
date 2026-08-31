import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const steps = [
  {
    title: "Pulso del restaurante",
    text: "Revisa ventas, mesas y alertas antes de iniciar el recorrido operativo.",
    path: "/",
  },
  {
    title: "Salón y pedidos",
    text: "Abre mesas, toma pedidos y acompaña el servicio hasta entregarlo y cobrarlo.",
    path: "/salon",
  },
  {
    title: "Cocina y bar",
    text: "Las comandas permanecen visibles hasta que cada estación confirma su avance.",
    path: "/cocina",
  },
  {
    title: "Caja y comprobantes",
    text: "El pago, la factura operativa y el documento electrónico conservan identidades separadas.",
    path: "/caja",
  },
  {
    title: "Control gerencial",
    text: "Inventario, costos, cuentas por pagar, personal e inteligencia completan la gestión.",
    path: "/inteligencia",
  },
];
export function GuidedTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  if (!open) return null;
  const current = steps[step];
  const close = () => {
    setStep(0);
    onClose();
  };
  const go = (index: number) => {
    setStep(index);
    navigate(steps[index].path);
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-steel/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <section className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">
              Recorrido {step + 1} de {steps.length}
            </p>
            <h2 id="tour-title" className="mt-2 text-2xl font-black">
              {current.title}
            </h2>
          </div>
          <button aria-label="Cerrar recorrido" onClick={close}>
            <X />
          </button>
        </div>
        <p className="mt-4 leading-relaxed text-denim/65">{current.text}</p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-denim/10">
          <div
            className="h-full bg-marigold transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <div className="mt-6 flex justify-between gap-3">
          <button
            className="secondary w-auto px-4"
            disabled={step === 0}
            onClick={() => go(step - 1)}
          >
            <ChevronLeft size={17} />
            Anterior
          </button>
          {step < steps.length - 1 ? (
            <button
              className="primary w-auto px-5"
              onClick={() => go(step + 1)}
            >
              Siguiente
              <ChevronRight size={17} />
            </button>
          ) : (
            <button className="primary w-auto px-5" onClick={close}>
              Finalizar recorrido
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
