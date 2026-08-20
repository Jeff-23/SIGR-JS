export function fechaLocalEnZona(
  fecha: string,
  finDelDia: boolean,
  zonaHoraria: string,
) {
  const hora = finDelDia
    ? { hora: 23, minuto: 59, segundo: 59, milisegundo: 999 }
    : { hora: 0, minuto: 0, segundo: 0, milisegundo: 0 };
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(
    anio,
    mes - 1,
    dia,
    hora.hora,
    hora.minuto,
    hora.segundo,
    hora.milisegundo,
  );
  let candidato = objetivo;
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let intento = 0; intento < 3; intento += 1) {
    const partes = Object.fromEntries(
      formato
        .formatToParts(new Date(candidato))
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, Number(p.value)]),
    );
    const observado = Date.UTC(
      partes.year,
      partes.month - 1,
      partes.day,
      partes.hour,
      partes.minute,
      partes.second,
      hora.milisegundo,
    );
    candidato += objetivo - observado;
  }
  return new Date(candidato);
}

export function claveFechaEnZona(fecha: Date, zonaHoraria: string) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const valores = Object.fromEntries(
    partes.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  return `${valores.year}-${valores.month}-${valores.day}`;
}
