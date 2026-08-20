import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricasService {
  private solicitudes = 0;
  private errores = 0;
  private duracionTotalMs = 0;

  registrar(_metodo: string, estado: number, duracionMs: number) {
    this.solicitudes += 1;
    if (estado >= 500) this.errores += 1;
    this.duracionTotalMs += duracionMs;
  }

  exportar() {
    return [
      '# HELP sigr_http_requests_total Solicitudes HTTP procesadas.',
      '# TYPE sigr_http_requests_total counter',
      `sigr_http_requests_total ${this.solicitudes}`,
      '# HELP sigr_http_errors_total Respuestas HTTP con estado 5xx.',
      '# TYPE sigr_http_errors_total counter',
      `sigr_http_errors_total ${this.errores}`,
      '# HELP sigr_http_request_duration_milliseconds_total Duración HTTP acumulada.',
      '# TYPE sigr_http_request_duration_milliseconds_total counter',
      `sigr_http_request_duration_milliseconds_total ${this.duracionTotalMs}`,
      '',
    ].join('\n');
  }
}
