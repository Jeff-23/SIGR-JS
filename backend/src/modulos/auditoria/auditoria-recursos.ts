const RECURSOS_POR_SEGMENTO: Record<string, string> = {
  usuarios: 'USUARIO',
  restaurantes: 'RESTAURANTE',
  sucursales: 'SUCURSAL',
  pedidos: 'PEDIDO',
  ventas: 'VENTA',
  pagos: 'PAGO',
  facturas: 'FACTURA',
  'registros-factura': 'REGISTRO_FACTURA',
  'documentos-electronicos': 'DOCUMENTO_ELECTRONICO',
  cajas: 'CAJA',
  inventario: 'INVENTARIO',
  comandas: 'COMANDA',
  clientes: 'CLIENTE',
  productos: 'PRODUCTO',
  categorias: 'CATEGORIA',
  articulos: 'ARTICULO',
  recetas: 'RECETA',
  mesas: 'MESA',
  zonas: 'ZONA',
  'metodos-pago': 'METODO_PAGO',
};

export function resolverRecursoAuditoria(ruta: string): string {
  const segmentos = ruta
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segmento) => segmento.toLowerCase());
  if (segmentos[0] === 'ventas' && segmentos.includes('pagos')) return 'PAGO';
  if (segmentos[0] === 'cajas' && segmentos.includes('movimientos')) {
    return 'MOVIMIENTO_CAJA';
  }
  if (segmentos[0] === 'inventario' && segmentos.includes('ajustes')) {
    return 'MOVIMIENTO_INVENTARIO';
  }
  const segmento = segmentos[0];
  return RECURSOS_POR_SEGMENTO[segmento] ?? 'RECURSO_HTTP';
}
