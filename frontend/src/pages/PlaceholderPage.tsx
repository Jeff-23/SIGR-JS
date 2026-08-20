import { Construction } from "lucide-react";
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="empty">
      <Construction size={42} />
      <h1>{title}</h1>
      <p>
        La arquitectura y navegación están listas. Este módulo se implementará
        en el siguiente bloque funcional.
      </p>
    </div>
  );
}
