import { describe, expect, it } from "vitest";
import type { ApiProduct } from "./contracts";
import { filterCatalogProducts, paginateCatalogProducts } from "./catalog";

function buildCatalog(total = 300): ApiProduct[] {
  return Array.from({ length: total }, (_, index) => {
    const categoryId = (index % 10) + 1;
    const bar = index % 4 === 0;
    return {
      id: index + 1,
      codigo: `SKU${String(index + 1).padStart(4, "0")}`,
      nombre: `Producto ${index + 1}`,
      descripcion: index % 7 === 0 ? "Especial de la casa" : null,
      precio: 10000 + index,
      favorito: index % 20 === 0,
      disponible: index % 17 !== 0,
      categoria: { id: categoryId, nombre: `Categoría ${categoryId}` },
      estacion: bar
        ? { id: 2, codigo: "BAR", nombre: "Bar" }
        : { id: 1, codigo: "COCINA", nombre: "Cocina" },
    };
  });
}

describe("catálogo operativo de alto volumen", () => {
  const products = buildCatalog();

  it("filtra 300 productos por categoría sin mezclar resultados", () => {
    const result = filterCatalogProducts(products, 3, "");
    expect(result).toHaveLength(30);
    expect(result.every((product) => product.categoria.id === 3)).toBe(true);
  });

  it("busca por nombre, categoría, descripción y estación", () => {
    expect(filterCatalogProducts(products, "all", "Producto 299")).toHaveLength(1);
    expect(filterCatalogProducts(products, "all", "Categoría 6")).toHaveLength(30);
    expect(filterCatalogProducts(products, "all", "Especial de la casa").length).toBeGreaterThan(0);
    expect(filterCatalogProducts(products, "all", "Bar")).toHaveLength(75);
    expect(filterCatalogProducts(products, "all", "SKU0299")).toHaveLength(1);
  });

  it("mantiene favoritos independientes del tamaño del catálogo", () => {
    const favorites = filterCatalogProducts(products, "favorites", "");
    expect(favorites).toHaveLength(15);
    expect(favorites.every((product) => product.favorito)).toBe(true);
  });

  it("renderiza progresivamente bloques de 60 productos", () => {
    const all = filterCatalogProducts(products, "all", "");
    expect(paginateCatalogProducts(all, 60)).toHaveLength(60);
    expect(paginateCatalogProducts(all, 120)).toHaveLength(120);
    expect(paginateCatalogProducts(all, 999)).toHaveLength(300);
  });
});
