export type KdsState = "PENDIENTE" | "EN_PREPARACION" | "LISTA";
export type KdsPriority = "NORMAL" | "ALTA" | "URGENTE";
export type Station = { id: number; codigo: string; nombre: string; color: string; orden: number };
export type Command = {
  id: number; estado: KdsState; prioridad: KdsPriority; fechaEnvio: string;
  fechaInicio?: string | null; fechaLista?: string | null; estacion: Station;
  pedido: { id: number; tipo: "MESA" | "MOSTRADOR" | "PARA_LLEVAR" | "DOMICILIO"; mesa: { numero: number; zona: { nombre: string } } | null };
  detalles: Array<{ id: number; cantidad: number; detallePedido: { observaciones?: string | null; producto: { id: number; nombre: string } } }>;
};
export function elapsedMinutes(date: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
}
export function urgency(minutes: number, warning = 10, critical = 20) {
  if (minutes >= critical) return "critical" as const;
  if (minutes >= warning) return "warning" as const;
  return "normal" as const;
}
export function commandDestination(command: Command) {
  if (command.pedido.mesa) return "Mesa " + command.pedido.mesa.numero;
  return command.pedido.tipo === "PARA_LLEVAR" ? "Para llevar" : command.pedido.tipo === "DOMICILIO" ? "Domicilio" : "Mostrador";
}
