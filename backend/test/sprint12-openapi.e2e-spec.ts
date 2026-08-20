import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  crearDocumentoOpenApi,
  validarDocumentoOpenApi,
} from '../src/plataforma/openapi';

describe('Sprint 12 - contrato OpenAPI', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it('certifica rutas y esquemas de seguridad mínimos', () => {
    const documento = crearDocumentoOpenApi(app);
    expect(() => validarDocumentoOpenApi(documento)).not.toThrow();
    expect(documento.info.version).toBe('1.0.0');
    expect(documento.components?.schemas?.LoginDto).toBeDefined();
    const pago = documento.paths['/ventas/{id}/pagos']?.post;
    expect(pago?.summary).toBeTruthy();
    expect(pago?.tags).toContain('Ventas');
    expect(pago?.security).toContainEqual({ bearer: [], idempotency: [] });
    expect(pago?.responses?.['409']).toBeDefined();
    const respuestaError = pago?.responses?.['500'];
    expect(
      respuestaError && 'headers' in respuestaError
        ? respuestaError.headers?.['X-Request-Id']
        : undefined,
    ).toBeDefined();
  });
});
