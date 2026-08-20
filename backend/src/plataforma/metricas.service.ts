import { Injectable } from '@nestjs/common';

type SerieMetrica = {
  cantidad: number;
  sumaSegundos: number;
  buckets: number[];
};

@Injectable()
export class MetricasService {
  private readonly series = new Map<string, SerieMetrica>();
  private readonly inicio = Date.now();
  private static readonly limitesSegundos = [
    0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
  ];

  registrar(metodo: string, ruta: string, estado: number, duracionMs: number) {
    const etiquetas = `${this.valor(metodo)}|${this.rutaSegura(ruta)}|${estado}`;
    const segundos = Math.max(0, duracionMs) / 1000;
    const serie = this.series.get(etiquetas) ?? {
      cantidad: 0,
      sumaSegundos: 0,
      buckets: MetricasService.limitesSegundos.map(() => 0),
    };
    serie.cantidad += 1;
    serie.sumaSegundos += segundos;
    MetricasService.limitesSegundos.forEach((limite, indice) => {
      if (segundos <= limite) serie.buckets[indice] += 1;
    });
    this.series.set(etiquetas, serie);
  }

  exportar() {
    const lineas = [
      '# HELP sigr_http_requests_total Solicitudes HTTP procesadas.',
      '# TYPE sigr_http_requests_total counter',
    ];
    for (const [clave, serie] of this.series) {
      lineas.push(
        `sigr_http_requests_total${this.etiquetas(clave)} ${serie.cantidad}`,
      );
    }
    lineas.push(
      '# HELP sigr_http_request_duration_seconds Duración de solicitudes HTTP.',
      '# TYPE sigr_http_request_duration_seconds histogram',
    );
    for (const [clave, serie] of this.series) {
      const base = this.etiquetas(clave, false);
      MetricasService.limitesSegundos.forEach((limite, indice) => {
        lineas.push(
          `sigr_http_request_duration_seconds_bucket${base},le="${limite}"} ${serie.buckets[indice]}`,
        );
      });
      lineas.push(
        `sigr_http_request_duration_seconds_bucket${base},le="+Inf"} ${serie.cantidad}`,
      );
      lineas.push(
        `sigr_http_request_duration_seconds_sum${this.etiquetas(clave)} ${serie.sumaSegundos}`,
      );
      lineas.push(
        `sigr_http_request_duration_seconds_count${this.etiquetas(clave)} ${serie.cantidad}`,
      );
    }
    lineas.push(
      '# HELP sigr_process_uptime_seconds Tiempo activo del proceso.',
      '# TYPE sigr_process_uptime_seconds gauge',
      `sigr_process_uptime_seconds ${Math.floor((Date.now() - this.inicio) / 1000)}`,
      '',
    );
    return lineas.join('\n');
  }

  private rutaSegura(ruta: string) {
    return (
      ruta
        .split('?')[0]
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        .slice(0, 120) || '/desconocida'
    );
  }

  private valor(valor: string) {
    return valor.replace(/["\\\n\r]/g, '_').slice(0, 120);
  }

  private etiquetas(clave: string, cerrar = true) {
    const [metodo, ruta, estado] = clave.split('|').map((v) => this.valor(v));
    const contenido = `{method="${metodo}",route="${ruta}",status="${estado}"`;
    return cerrar ? `${contenido}}` : contenido;
  }
}
