export type KdsState = "PENDIENTE" | "EN_PREPARACION" | "LISTA";
export type KdsLineState = "PENDIENTE" | "EN_PREPARACION" | "LISTA";
export type KdsPriority = "NORMAL" | "ALTA" | "URGENTE";
export type ServiceRisk = "low" | "medium" | "high" | "late";

export type Station = {
  id: number;
  codigo: string;
  nombre: string;
  color: string;
  orden: number;
  objetivoPreparacionMin: number;
};

export type CommandModifier = {
  id: number;
  nombre: string;
  cantidad: number;
};

export type CommandLine = {
  id: number;
  cantidad: number;
  estado: KdsLineState;
  fechaInicio?: string | null;
  fechaLista?: string | null;
  detallePedido: {
    observaciones?: string | null;
    modificadores?: CommandModifier[];
    producto: { id: number; nombre: string };
  };
};

export type Command = {
  id: number;
  estado: KdsState;
  prioridad: KdsPriority;
  fechaEnvio: string;
  fechaVista?: string | null;
  fechaInicio?: string | null;
  fechaLista?: string | null;
  metaPreparacionMin: number;
  estacion: Station;
  pedido: {
    id: number;
    tipo: "MESA" | "MOSTRADOR" | "PARA_LLEVAR" | "DOMICILIO";
    mesa: { numero: number; zona: { nombre: string } } | null;
    mesero?: { id: number; nombres: string; apellidos: string } | null;
  };
  detalles: CommandLine[];
};

export function elapsedMinutes(date: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
}

export function servicePromise(elapsed: number, target: number) {
  const safeTarget = Math.max(1, target || 1);
  const remaining = safeTarget - elapsed;
  const ratio = remaining / safeTarget;
  let risk: ServiceRisk = "low";
  if (remaining < 0) risk = "late";
  else if (ratio <= 0.15) risk = "high";
  else if (ratio <= 0.4) risk = "medium";
  return { target: safeTarget, elapsed, remaining, risk };
}

export function urgency(minutes: number, target = 15) {
  const risk = servicePromise(minutes, target).risk;
  if (risk === "late" || risk === "high") return "critical" as const;
  if (risk === "medium") return "warning" as const;
  return "normal" as const;
}

export function commandDestination(command: Command) {
  if (command.pedido.mesa) return "Mesa " + command.pedido.mesa.numero;
  return command.pedido.tipo === "PARA_LLEVAR"
    ? "Para llevar"
    : command.pedido.tipo === "DOMICILIO"
      ? "Domicilio"
      : "Mostrador";
}

export function pendingCommandCount(commands: Command[]) {
  return commands.filter((command) => command.estado === "PENDIENTE").length;
}

export function unseenCommandCount(commands: Command[]) {
  return commands.filter((command) => !command.fechaVista).length;
}
