import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

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
  return SwaggerModule.createDocument(app, configuracion);
}

export function validarDocumentoOpenApi(documento: OpenAPIObject) {
  const rutas = Object.keys(documento.paths);
  const requeridas = [
    '/pedidos',
    '/ventas',
    '/facturas',
    '/documentos-electronicos',
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
}
