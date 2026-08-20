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
  });
});
