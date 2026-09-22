export function Brand({
  compact = false,
  prominent = false,
}: {
  compact?: boolean;
  prominent?: boolean;
}) {
  return (
    <div className={`flex items-center ${prominent ? "gap-4" : "gap-3"}`}>
      <img
        src="/sigr-monkey-chef-white.png"
        alt="Logo SIGR"
        className={`block shrink-0 object-contain ${
          prominent ? "h-20 w-20" : "h-12 w-12"
        }`}
      />
      {!compact && (
        <div>
          <strong
            className={`block font-black tracking-[.12em] ${
              prominent ? "text-3xl" : "text-xl"
            }`}
          >
            SIGR
          </strong>
          <span
            className={`mt-1 block leading-snug text-current opacity-70 ${
              prominent ? "text-xs" : "text-[10px]"
            }`}
          >
            Sistema Inteligente de Gestión
            <br />
            para Restaurantes
          </span>
        </div>
      )}
    </div>
  );
}
