export type UsuarioAutenticado = {
  id: number;
  email: string;

  rolId: number;
  rol: string;
  roles?: string[];

  restauranteId: number | null;
  sucursalId: number | null;

  permisos: string[];
  capacidades: string[];
  restauranteNombre?: string;
  sucursalNombre?: string;
};
