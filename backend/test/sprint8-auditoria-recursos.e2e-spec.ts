import { resolverRecursoAuditoria } from '../src/modulos/auditoria/auditoria-recursos';

describe('SPRINT 8 | Clasificacion de recursos auditados', () => {
  it('mantiene separado el ciclo comercial completo', () => {
    const recursos = [
      resolverRecursoAuditoria('/pedidos/15/cancelar'),
      resolverRecursoAuditoria('/ventas/20/anular'),
      resolverRecursoAuditoria('/ventas/20/pagos'),
      resolverRecursoAuditoria('/facturas/venta'),
      resolverRecursoAuditoria('/documentos-electronicos/preparar'),
    ];
    expect(recursos).toEqual([
      'PEDIDO',
      'VENTA',
      'PAGO',
      'FACTURA',
      'DOCUMENTO_ELECTRONICO',
    ]);
    expect(new Set(recursos).size).toBe(5);
  });

  it('distingue movimientos operativos de sus agregados', () => {
    expect(resolverRecursoAuditoria('/cajas/3/movimientos')).toBe(
      'MOVIMIENTO_CAJA',
    );
    expect(resolverRecursoAuditoria('/inventario/ajustes')).toBe(
      'MOVIMIENTO_INVENTARIO',
    );
  });
});
