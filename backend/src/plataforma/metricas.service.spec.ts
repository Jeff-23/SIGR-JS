import { MetricasService } from './metricas.service';

describe('MetricasService', () => {
  it('exporta contadores sin etiquetas de tenant ni datos sensibles', () => {
    const servicio = new MetricasService();
    servicio.registrar('GET', 200, 12);
    servicio.registrar('POST', 500, 8);
    const salida = servicio.exportar();
    expect(salida).toContain('sigr_http_requests_total 2');
    expect(salida).toContain('sigr_http_errors_total 1');
    expect(salida).toContain(
      'sigr_http_request_duration_milliseconds_total 20',
    );
  });
});
