import { dinero } from './dinero';

describe('dinero', () => {
  it('conserva precisión monetaria decimal', () => {
    expect(
      dinero('0.10', 'monto').plus(dinero('0.20', 'monto')).toString(),
    ).toBe('0.3');
  });

  it('rechaza exceso de decimales y de capacidad', () => {
    expect(() => dinero('1.001', 'monto')).toThrow('máximo dos decimales');
    expect(() => dinero('10000000000', 'monto')).toThrow('máximo permitido');
  });
});
