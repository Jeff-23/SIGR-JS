import { claveFechaEnZona, fechaLocalEnZona } from './zona-horaria';

describe('zona horaria operativa', () => {
  it('convierte el día de Bogotá a límites UTC', () => {
    expect(
      fechaLocalEnZona('2026-08-20', false, 'America/Bogota').toISOString(),
    ).toBe('2026-08-20T05:00:00.000Z');
    expect(
      fechaLocalEnZona('2026-08-20', true, 'America/Bogota').toISOString(),
    ).toBe('2026-08-21T04:59:59.999Z');
    expect(
      claveFechaEnZona(new Date('2026-08-21T03:00:00.000Z'), 'America/Bogota'),
    ).toBe('2026-08-20');
  });
});
