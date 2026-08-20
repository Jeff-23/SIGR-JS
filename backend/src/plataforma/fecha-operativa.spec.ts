import { fechaOperativa } from './fecha-operativa';

describe('fechaOperativa', () => {
  const ahora = new Date('2026-08-20T03:00:00.000Z');

  it('normaliza instantes con zona explícita', () => {
    expect(
      fechaOperativa('2026-08-19T20:00:00-05:00', ahora).toISOString(),
    ).toBe('2026-08-20T01:00:00.000Z');
  });

  it('rechaza fechas sin zona y fechas futuras', () => {
    expect(() => fechaOperativa('2026-08-19T20:00:00', ahora)).toThrow(
      'zona horaria explícita',
    );
    expect(() => fechaOperativa('2026-08-20T04:00:00Z', ahora)).toThrow(
      'no puede estar en el futuro',
    );
  });
});
