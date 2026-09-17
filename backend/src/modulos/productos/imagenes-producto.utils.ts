export type RecorteCuadrado = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function firmaImagenValida(tipo: string, contenido: Buffer) {
  if (tipo === 'image/jpeg') {
    return (
      contenido.length >= 2 && contenido[0] === 0xff && contenido[1] === 0xd8
    );
  }
  if (tipo === 'image/png') {
    return (
      contenido.length >= 8 &&
      contenido
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (tipo === 'image/webp') {
    return (
      contenido.length >= 12 &&
      contenido.subarray(0, 4).toString() === 'RIFF' &&
      contenido.subarray(8, 12).toString() === 'WEBP'
    );
  }
  return false;
}

export function calcularRecorteCuadrado(
  ancho: number,
  alto: number,
  focoX: number,
  focoY: number,
  zoom: number,
): RecorteCuadrado {
  const lado = Math.max(1, Math.floor(Math.min(ancho, alto) / zoom));
  const centroX = (ancho * focoX) / 100;
  const centroY = (alto * focoY) / 100;
  const left = Math.max(
    0,
    Math.min(ancho - lado, Math.round(centroX - lado / 2)),
  );
  const top = Math.max(
    0,
    Math.min(alto - lado, Math.round(centroY - lado / 2)),
  );
  return { left, top, width: lado, height: lado };
}
