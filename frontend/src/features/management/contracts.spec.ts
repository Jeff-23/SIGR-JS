import { describe, it, expect } from "vitest";
import { catalogResources, formBody, rowsOf } from "./contracts";
describe("formularios administrativos", () => {
  it("no permite sustituir existencias al editar un insumo", () => {
    const fields = catalogResources.find((r) => r.key === "articulos")!.fields;
    expect(
      formBody(
        fields,
        { nombre: "Arroz", unidad: "KG", costoUnidad: "5000", stock: "900" },
        true,
      ),
    ).toEqual({ nombre: "Arroz", unidad: "KG", costoUnidad: 5000 });
  });
  it("convierte IDs y decimales sin aceptar NaN", () => {
    expect(
      formBody(
        [{ key: "categoriaId", label: "Categoría", lookup: "/categorias" }],
        { categoriaId: "3" },
        false,
      ),
    ).toEqual({ categoriaId: 3 });
    expect(() =>
      formBody(
        [{ key: "precio", label: "Precio", type: "number" }],
        { precio: "NaN" },
        false,
      ),
    ).toThrow();
  });
  it("normaliza sólo listados y páginas válidas", () => {
    expect(rowsOf({ datos: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(() => rowsOf({ error: "fallo" })).toThrow();
  });
});
