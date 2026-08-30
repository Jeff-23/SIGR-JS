// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ResourceEditor, ResourcePanel } from "./ResourcePanel";
import { catalogResources } from "./contracts";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  demo: false,
}));
vi.mock("../../lib/api", () => ({
  api: mocks,
  errorMessage: () => "Servicio no disponible",
}));
vi.mock("../../store/app", () => ({
  useApp: () => ({
    branchId: 3,
    online: true,
    session: { demo: mocks.demo, user: { id: 7 } },
    hasPermission: () => true,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo = false;
  mocks.get.mockResolvedValue({ data: [] });
  mocks.post.mockResolvedValue({ data: { id: 5 } });
  mocks.patch.mockResolvedValue({ data: { id: 5 } });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
describe("formularios conectados", () => {
  it("crea una categoría en la sede actual con el contrato del backend", async () => {
    const saved = vi.fn();
    render(
      <ResourceEditor
        resource={catalogResources.find((r) => r.key === "categorias")!}
        initial={null}
        onClose={() => {}}
        onSaved={saved}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Nombre/), {
      target: { value: "Almuerzos" },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith("/categorias", {
        nombre: "Almuerzos",
        sucursalId: 3,
      }),
    );
    expect(saved).toHaveBeenCalledOnce();
  });
  it("no envía stock inicial al editar insumos", async () => {
    render(
      <ResourceEditor
        resource={catalogResources.find((r) => r.key === "articulos")!}
        initial={{
          id: 5,
          nombre: "Arroz",
          unidad: "KG",
          costoUnidad: 4000,
          stock: 20,
        }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/Existencias iniciales/)).toBeNull();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/articulos/5", {
        nombre: "Arroz",
        unidad: "KG",
        costoUnidad: 4000,
      }),
    );
  });
  it("muestra error y conserva el formulario si el servidor rechaza el guardado", async () => {
    mocks.post.mockRejectedValue(new Error("rechazo"));
    const saved = vi.fn();
    render(
      <ResourceEditor
        resource={catalogResources.find((r) => r.key === "categorias")!}
        initial={null}
        onClose={() => {}}
        onSaved={saved}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Nombre/), {
      target: { value: "Almuerzos" },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("rechazo"),
    );
    expect(saved).not.toHaveBeenCalled();
  });
  it("una sesión demo nunca consulta ni crea registros reales", async () => {
    mocks.demo = true;
    render(<ResourcePanel resource={catalogResources[0]} />);
    await waitFor(() =>
      expect(screen.getByText(/no se simulan guardados/)).toBeTruthy(),
    );
    expect(mocks.get).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Crear" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
