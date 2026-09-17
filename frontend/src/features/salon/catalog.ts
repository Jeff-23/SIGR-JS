import type { ApiProduct } from "./contracts";

export type CatalogCategory = number | "all" | "favorites";

export function filterCatalogProducts(
  products: ApiProduct[],
  category: CatalogCategory,
  search: string,
) {
  const term = search.trim().toLocaleLowerCase("es-CO");
  return products.filter((product) => {
    const matchesCategory =
      category === "all" ||
      (category === "favorites"
        ? product.favorito
        : product.categoria.id === category);
    if (!matchesCategory) return false;
    if (!term) return true;
    return `${product.codigo ?? ""} ${product.nombre} ${product.descripcion ?? ""} ${product.categoria.nombre} ${product.estacion?.nombre ?? ""}`
      .toLocaleLowerCase("es-CO")
      .includes(term);
  });
}

export function paginateCatalogProducts(products: ApiProduct[], limit: number) {
  return products.slice(0, Math.max(0, limit));
}
