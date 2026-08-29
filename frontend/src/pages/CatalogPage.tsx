import { useState } from "react";
import { useApp } from "../store/app";
import { catalogResources } from "../features/management/contracts";
import { ResourcePanel } from "../features/management/ResourcePanel";
export function CatalogPage() {
  const { session, branchId, hasPermission, hasCapability } = useApp();
  const available = catalogResources.filter(
    (r) => hasPermission(r.permission) && hasCapability(r.capability),
  );
  const [selected, setSelected] = useState("");
  const resource = available.find((r) => r.key === selected) ?? available[0];
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administración del restaurante</p>
        <h1 className="page-title">Catálogo y clientes</h1>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Catálogos">
        {available.map((r) => (
          <button
            key={r.key}
            className={`secondary w-auto px-4 ${r.key === resource?.key ? "bg-marigold" : ""}`}
            onClick={() => setSelected(r.key)}
          >
            {r.title}
          </button>
        ))}
      </nav>
      {resource ? (
        <ResourcePanel
          key={`${resource.key}:${session?.user.id}:${branchId}`}
          resource={resource}
        />
      ) : (
        <p>No tienes permisos para consultar estos catálogos.</p>
      )}
    </div>
  );
}
