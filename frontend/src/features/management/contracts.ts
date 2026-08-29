export type Row = Record<string, unknown> & { id?: number };
export type Field = {
  key: string;
  label: string;
  type?: "number" | "email" | "password" | "date" | "checkbox";
  required?: boolean;
  min?: number;
  step?: string;
  maxLength?: number;
  options?: string[];
  lookup?: string;
  createOnly?: boolean;
};
export type Resource = {
  key: string;
  title: string;
  path: string;
  listPath?: string;
  updatePath?: string;
  method?: "PUT";
  permission: string;
  capability?: string;
  create?: string;
  edit?: string;
  branchBody?: boolean;
  branchFilter?: boolean;
  paginated?: boolean;
  columns: Field[];
  fields: Field[];
  notice?: string;
};
export const field = (
  key: string,
  label: string,
  extra: Partial<Field> = {},
): Field => ({ key, label, ...extra });
export const units = ["UNIDAD", "GR", "KG", "ML", "L", "PORCION"];
export function rowsOf(value: unknown): Row[] {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "datos" in value
      ? value.datos
      : null;
  if (
    !Array.isArray(values) ||
    values.some((row) => !row || typeof row !== "object")
  )
    throw new Error("Respuesta de listado no válida");
  return values as Row[];
}
export function formBody(
  fields: Field[],
  values: Record<string, string | boolean>,
  editing: boolean,
): Row {
  const body: Row = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    const value = values[f.key];
    if (value === undefined || value === "") {
      if (f.required && !(editing && f.type === "password"))
        throw new Error(`Completa ${f.label}`);
      continue;
    }
    if (f.type === "number" || f.lookup) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < (f.min ?? 0))
        throw new Error(`Revisa ${f.label}`);
      body[f.key] = n;
    } else body[f.key] = typeof value === "string" ? value.trim() : value;
  }
  return body;
}
export function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") {
    const row = value as Row;
    return String(row.nombre ?? row.nombres ?? row.codigo ?? "—");
  }
  return String(value);
}
const name = field("nombre", "Nombre", { required: true, maxLength: 100 });
export const catalogResources: Resource[] = [
  {
    key: "productos",
    title: "Productos",
    path: "/productos",
    listPath: "/productos?sucursalId=:sede",
    permission: "PRODUCTOS_VER",
    create: "PRODUCTOS_CREAR",
    edit: "PRODUCTOS_EDITAR",
    columns: [
      name,
      field("precio", "Precio"),
      field("categoria", "Categoría"),
      field("estacion", "Estación"),
      field("stock", "Existencias"),
    ],
    fields: [
      name,
      field("descripcion", "Descripción"),
      field("precio", "Precio", {
        type: "number",
        required: true,
        step: "0.01",
      }),
      field("categoriaId", "Categoría", {
        lookup: "/categorias/sucursal/:sede",
        required: true,
        createOnly: true,
      }),
      field("estacionId", "Estación", {
        lookup: "/estaciones-preparacion?sucursalId=:sede",
      }),
      field("estrategiaInventario", "Control de inventario", {
        options: ["NO_CONTROLAR", "STOCK_DIRECTO", "POR_RECETA"],
      }),
      field("unidadInventario", "Unidad", { options: units }),
    ],
  },
  {
    key: "categorias",
    title: "Categorías",
    path: "/categorias",
    listPath: "/categorias/sucursal/:sede",
    permission: "CATEGORIAS_VER",
    create: "CATEGORIAS_CREAR",
    branchBody: true,
    columns: [name],
    fields: [{ ...name, maxLength: 50 }],
  },
  {
    key: "zonas",
    title: "Zonas",
    path: "/zonas",
    listPath: "/zonas/sucursal/:sede",
    permission: "ZONAS_VER",
    create: "ZONAS_CREAR",
    branchBody: true,
    columns: [name],
    fields: [{ ...name, maxLength: 50 }],
  },
  {
    key: "mesas",
    title: "Mesas",
    path: "/mesas",
    listPath: "/mesas?sucursalId=:sede",
    permission: "MESAS_VER",
    capability: "MESAS",
    create: "MESAS_CREAR",
    columns: [
      field("numero", "Mesa"),
      field("capacidad", "Capacidad"),
      field("zona", "Zona"),
    ],
    fields: [
      field("numero", "Número", { required: true }),
      field("capacidad", "Capacidad", {
        required: true,
        type: "number",
        min: 1,
        step: "1",
      }),
      field("zonaId", "Zona", {
        lookup: "/zonas/sucursal/:sede",
        required: true,
      }),
    ],
  },
  {
    key: "articulos",
    title: "Insumos",
    path: "/articulos",
    permission: "INVENTARIO_VER",
    capability: "INVENTARIO",
    create: "INVENTARIO_AJUSTAR",
    edit: "INVENTARIO_AJUSTAR",
    branchBody: true,
    branchFilter: true,
    columns: [
      name,
      field("unidad", "Unidad"),
      field("stock", "Existencias"),
      field("costoUnidad", "Costo unitario"),
    ],
    fields: [
      name,
      field("unidad", "Unidad", { options: units, required: true }),
      field("costoUnidad", "Costo unitario", {
        type: "number",
        step: "0.01",
        required: true,
      }),
      field("stock", "Existencias iniciales", {
        type: "number",
        step: "0.0001",
        required: true,
        createOnly: true,
      }),
    ],
    notice:
      "Los cambios de existencias se registran en Inventario; editar un insumo no reemplaza su historial.",
  },
  {
    key: "clientes",
    title: "Clientes",
    path: "/clientes",
    permission: "CLIENTES_VER",
    capability: "CLIENTES",
    create: "CLIENTES_CREAR",
    edit: "CLIENTES_EDITAR",
    paginated: true,
    columns: [
      field("nombres", "Nombres"),
      field("apellidos", "Apellidos"),
      field("numeroDocumento", "Documento"),
      field("telefono", "Teléfono"),
      field("correo", "Correo"),
      field("estado", "Activo"),
    ],
    fields: [
      field("nombres", "Nombres o razón social", {
        required: true,
        maxLength: 120,
      }),
      field("apellidos", "Apellidos", { maxLength: 120 }),
      field("tipoDocumento", "Tipo de documento", {
        options: ["CC", "NIT", "CE", "PASAPORTE", "TI"],
      }),
      field("numeroDocumento", "Número de documento", { maxLength: 30 }),
      field("telefono", "Teléfono", { maxLength: 30 }),
      field("correo", "Correo", { type: "email", maxLength: 150 }),
      field("direccion", "Dirección", { maxLength: 200 }),
      field("fechaNacimiento", "Fecha de nacimiento", { type: "date" }),
    ],
  },
];
