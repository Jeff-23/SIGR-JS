import { MetricasService } from './metricas.service';

describe('MetricasService', () => {
  it('exporta contadores e histograma sin etiquetas de tenant', () => {
    const servicio = new MetricasService();
    servicio.registrar('GET', '/ventas/123?interno=secreto', 200, 12);
    servicio.registrar('POST', '/ventas/456', 500, 80);
    const salida = servicio.exportar();
    expect(salida).toContain('method="GET",route="/ventas/:id",status="200"');
    expect(salida).toContain('sigr_http_request_duration_seconds_bucket');
    expect(salida).toContain('sigr_process_uptime_seconds');
    expect(salida).not.toContain('123');
    expect(salida).not.toContain('secreto');
  });
});
