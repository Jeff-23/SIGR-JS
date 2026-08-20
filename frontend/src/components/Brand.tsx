import { ChefHat } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-marigold text-steel">
        <ChefHat size={23} />
      </span>
      {!compact && (
        <div>
          <strong className="block text-xl font-black tracking-[.12em]">
            SIGR
          </strong>
          <span className="text-[11px] text-current opacity-50">
            Gestión para restaurantes
          </span>
        </div>
      )}
    </div>
  );
}
