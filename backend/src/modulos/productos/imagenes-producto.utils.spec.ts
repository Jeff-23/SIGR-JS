import {
  calcularRecorteCuadrado,
  firmaImagenValida,
} from './imagenes-producto.utils';

describe('imagenes de producto', () => {
  it('limita el recorte al lienzo incluso con foco extremo', () => {
    expect(calcularRecorteCuadrado(4000, 3000, 100, 100, 1)).toEqual({
      left: 1000,
      top: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('aplica zoom reduciendo el recorte alrededor del foco', () => {
    expect(calcularRecorteCuadrado(4000, 3000, 50, 50, 2)).toEqual({
      left: 1250,
      top: 750,
      width: 1500,
      height: 1500,
    });
  });

  it('valida firmas y no confía sólo en el MIME declarado', () => {
    expect(
      firmaImagenValida('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])),
    ).toBe(true);
    expect(firmaImagenValida('image/jpeg', Buffer.from('no-es-jpeg'))).toBe(
      false,
    );
    expect(
      firmaImagenValida(
        'image/webp',
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBP'),
        ]),
      ),
    ).toBe(true);
  });
});
