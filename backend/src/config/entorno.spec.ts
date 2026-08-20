import { validarEntorno } from './entorno';

const BASE: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/sigr_test',
  JWT_SECRET: 'clave-robusta-de-pruebas-2026',
};

describe('validarEntorno', () => {
  it('aplica valores seguros y configurables por ambiente', () => {
    expect(validarEntorno(BASE)).toMatchObject({
      ambiente: 'test',
      puerto: 3000,
      corsOrigenes: ['http://localhost:5173'],
      throttleTtlMs: 60000,
      throttleLimite: 1000,
      jwtExpiraEn: '12h',
    });
  });

  it('rechaza variables obligatorias ausentes', () => {
    expect(() => validarEntorno({ ...BASE, DATABASE_URL: '' })).toThrow(
      'DATABASE_URL es obligatoria',
    );
  });

  it('endurece secreto y CORS en produccion', () => {
    expect(() =>
      validarEntorno({
        ...BASE,
        NODE_ENV: 'production',
        JWT_SECRET: 'secreto-corto',
        CORS_ORIGINS: 'http://sigr.example.com',
      }),
    ).toThrow('JWT_SECRET debe tener al menos 32 caracteres');

    expect(() =>
      validarEntorno({
        ...BASE,
        NODE_ENV: 'production',
        JWT_SECRET: 'un-secreto-productivo-de-mas-de-32-caracteres',
        CORS_ORIGINS: 'http://sigr.example.com',
      }),
    ).toThrow('deben usar HTTPS');
  });

  it('rechaza comodines CORS y valores numericos invalidos', () => {
    expect(() => validarEntorno({ ...BASE, CORS_ORIGINS: '*' })).toThrow(
      'no permite el comodín',
    );
    expect(() => validarEntorno({ ...BASE, PORT: '70000' })).toThrow(
      'PORT debe estar entre 1 y 65535',
    );
  });
});
