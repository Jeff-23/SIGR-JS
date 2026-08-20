import 'reflect-metadata';
import { respuestaPaginada } from './paginacion';

describe('respuestaPaginada', () => {
  it('construye metadatos uniformes', () => {
    expect(respuestaPaginada(['a', 'b'], 21, 2, 10)).toEqual({
      datos: ['a', 'b'],
      paginacion: { pagina: 2, limite: 10, total: 21, totalPaginas: 3 },
    });
  });

  it('informa cero paginas cuando no hay resultados', () => {
    expect(respuestaPaginada([], 0, 1, 20).paginacion.totalPaginas).toBe(0);
  });
});
