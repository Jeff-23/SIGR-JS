import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

type Operacion = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  responses?: Record<string, Record<string, unknown>>;
};

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const RUTAS_PUBLICAS = new Set([
  'GET /',
  'POST /auth/login',
  'GET /health/live',
  'GET /health/ready',
  'GET /health/metrics',
]);
const RUTAS_IDEMPOTENTES = [
  'POST /ventas/pedido',
  'POST /ventas/directa',
  'POST /ventas/manual',
  'POST /ventas/{id}/pagos',
  'POST /registros-factura',
];

const nombresRecursos: Record<string, string> = {
  auth: 'Autenticación',
  health: 'Operación',
  'documentos-electronicos': 'Documentos electrónicos',
};

function titulo(segmento: string) {
  return (
    nombresRecursos[segmento] ??
    segmento.charAt(0).toUpperCase() + segmento.slice(1).replaceAll('-', ' ')
  );
}

function enriquecerDocumento(documento: OpenAPIObject) {
  documento.components ??= {};
  documento.components.schemas ??= {};
  documento.components.schemas.ErrorApi = {
    type: 'object',
    required: ['statusCode', 'mensaje', 'correlacionId'],
    properties: {
      statusCode: { type: 'integer', example: 400 },
      mensaje: { type: 'string', example: 'Solicitud inválida' },
      correlacionId: { type: 'string', example: 'req_01J...' },
      detalles: { type: 'array', items: { type: 'string' } },
    },
  };

  for (const [ruta, item] of Object.entries(documento.paths)) {
    const recurso = ruta.split('/').filter(Boolean)[0] ?? 'sistema';
    for (const metodo of METODOS) {
      const operacion = item?.[metodo] as unknown as Operacion | undefined;
      if (!operacion) continue;
      const clave = `${metodo.toUpperCase()} ${ruta}`;
      operacion.tags = operacion.tags?.length
        ? operacion.tags
        : [titulo(recurso)];
      operacion.summary ??= `${titulo(metodo)} ${titulo(recurso)}`;
      operacion.description ??=
        'Operación sujeta al aislamiento multiempresa y multisucursal del usuario autenticado.';
      if (!RUTAS_PUBLICAS.has(clave)) operacion.security = [{ bearer: [] }];
      if (RUTAS_IDEMPOTENTES.includes(clave)) {
        operacion.security = [{ bearer: [], idempotency: [] }];
        operacion.parameters ??= [];
        if (!operacion.parameters.some((p) => p.name === 'Idempotency-Key')) {
          operacion.parameters.push({
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 8, maxLength: 100 },
            description:
              'Clave estable para impedir efectos comerciales duplicados.',
          });
        }
      }
      operacion.responses ??= {};
      const exito = metodo === 'post' ? '201' : '200';
      operacion.responses[exito] ??= { description: 'Operación completada.' };
      for (const [codigo, descripcion] of [
        ['400', 'Solicitud inválida.'],
        ['401', 'Autenticación requerida.'],
        ['403', 'Permiso, capacidad o alcance insuficiente.'],
        ['404', 'Recurso no encontrado en el alcance autorizado.'],
        ['409', 'Conflicto de estado o idempotencia.'],
        ['429', 'Límite de solicitudes excedido.'],
        ['500', 'Error interno sanitizado.'],
      ]) {
        if (RUTAS_PUBLICAS.has(clave) && ['401', '403'].includes(codigo))
          continue;
        operacion.responses[codigo] ??= {
          description: descripcion,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorApi' },
            },
          },
        };
      }
      for (const respuesta of Object.values(operacion.responses)) {
        respuesta.headers ??= {};
        (respuesta.headers as Record<string, unknown>)['X-Request-Id'] = {
          description: 'Identificador de correlación de la solicitud.',
          schema: { type: 'string' },
        };
      }
    }
  }
  return documento;
}

export function crearDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const configuracion = new DocumentBuilder()
    .setTitle('SIGR V2 Backend API')
    .setDescription(
      'API multiempresa y multisucursal. Pedido, Venta, Pago, Factura y Documento Electrónico son recursos independientes.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'Idempotency-Key' },
      'idempotency',
    )
    .build();
  return enriquecerDocumento(SwaggerModule.createDocument(app, configuracion));
}

export function validarDocumentoOpenApi(documento: OpenAPIObject) {
  const rutas = Object.keys(documento.paths);
  const requeridas = [
    '/pedidos',
    '/ventas',
    '/facturas',
    '/documentos-electronicos',
    '/registros-factura',
  ];
  for (const ruta of requeridas) {
    if (
      !rutas.some((actual) => actual === ruta || actual.startsWith(`${ruta}/`))
    ) {
      throw new Error(`OpenAPI no documenta el recurso obligatorio ${ruta}`);
    }
  }
  const esquemas = documento.components?.securitySchemes ?? {};
  if (!('bearer' in esquemas) || !('idempotency' in esquemas)) {
    throw new Error('OpenAPI debe declarar seguridad bearer e idempotency');
  }
  if (rutas.length < 25) throw new Error('OpenAPI contiene menos de 25 rutas');
  for (const [ruta, item] of Object.entries(documento.paths)) {
    for (const metodo of METODOS) {
      const operacion = item?.[metodo] as unknown as Operacion | undefined;
      if (!operacion) continue;
      if (!operacion.summary || !operacion.tags?.length) {
        throw new Error(
          `${metodo.toUpperCase()} ${ruta} no tiene resumen o etiqueta`,
        );
      }
      if (!operacion.responses?.['400'] || !operacion.responses?.['500']) {
        throw new Error(
          `${metodo.toUpperCase()} ${ruta} no documenta errores estándar`,
        );
      }
      for (const respuesta of Object.values(operacion.responses)) {
        if (
          !(respuesta.headers as Record<string, unknown> | undefined)?.[
            'X-Request-Id'
          ]
        ) {
          throw new Error(
            `${metodo.toUpperCase()} ${ruta} no documenta X-Request-Id`,
          );
        }
      }
    }
  }
}
