import { BellRing, BellOff, Bike, CheckCircle2, CircleDollarSign, UtensilsCrossed} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import type { ApiOrder } from "../features/salon/contracts";
import { api } from "../lib/api";
import { useApp } from "../store/app";

type Delivery = {
  id: number;
  estado: string;
  destinatario: string;
  pedido: { id: number; sucursalId: number; estado: string };
};

type ReadyAlert = {
  key: string;
  orderId: number;
  label: string;
  destination: string;
  kind: "READY" | "ACCOUNT_REQUEST";
};

function playReadyAlarm(context: AudioContext) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.12);

  const tones = [880, 1120, 880];
  tones.forEach((frequency, index) => {
    const start = now + index * 0.34;
    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}

function orderLabel(order: ApiOrder) {
  if (order.tipo === "MESA") return order.mesa ? `Mesa ${order.mesa.numero}` : `Pedido #${order.id}`;
  if (order.tipo === "DOMICILIO") return `Domicilio #${order.id}`;
  if (order.tipo === "PARA_LLEVAR") return `Para llevar #${order.id}`;
  return `Mostrador #${order.id}`;
}

export function ServiceReadyNotice() {
  const { session, branchId, hasPermission } = useApp();
  const role = session?.user.rol?.toUpperCase();
  const supportedRole = role === "MESERO" || role === "CAJERO" || role === "DOMICILIARIO";
  const canReadOrders = hasPermission("PEDIDOS_VER");
  const canReadDeliveries = hasPermission("DOMICILIOS_VER");

  if (!branchId || session?.demo || !supportedRole || (!canReadOrders && !canReadDeliveries)) return null;

  return (
    <ReadyNotice
      key={`${session?.user.id}:${branchId}:${role}`}
      branchId={branchId}
      role={role as "MESERO" | "CAJERO" | "DOMICILIARIO"}
      userId={session!.user.id}
      canReadOrders={canReadOrders}
      canReadDeliveries={canReadDeliveries}
    />
  );
}

function ReadyNotice({ branchId, role, userId, canReadOrders, canReadDeliveries }: {
  branchId: number;
  role: "MESERO" | "CAJERO" | "DOMICILIARIO";
  userId: number;
  canReadOrders: boolean;
  canReadDeliveries: boolean;
}) {
  const [alerts, setAlerts] = useState<ReadyAlert[]>([]);
  const acknowledgedKey = `sigr-ready-ack:${userId}:${branchId}:${role}`;
  const [acknowledged, setAcknowledged] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(acknowledgedKey);
      const values = saved ? (JSON.parse(saved) as unknown) : [];
      return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []);
    } catch {
      return new Set();
    }
  });
  const [error, setError] = useState(false);
  const preferenceKey = `sigr-ready-sound:${userId}:${branchId}`;
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(preferenceKey) !== "0");
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<Set<string> | null>(null);
  const alive = useRef(true);

  const unlockAudio = useCallback(() => {
    if (!soundEnabled) return;
    audio.current ??= new AudioContext();
    void audio.current.resume();
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(acknowledgedKey, JSON.stringify([...acknowledged]));
    } catch {
      // El almacenamiento puede estar bloqueado en modo privado; el aviso sigue funcionando en memoria.
    }
  }, [acknowledged, acknowledgedKey]);

  useEffect(() => {
    if (!soundEnabled) return;
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [soundEnabled, unlockAudio]);

  const soundAlarm = useCallback(() => {
    if (!soundEnabled) return;
    audio.current ??= new AudioContext();
    void audio.current.resume().then(() => {
      if (audio.current) playReadyAlarm(audio.current);
    }).catch(() => undefined);
  }, [soundEnabled]);

  const load = useCallback(async () => {
    try {
      let next: ReadyAlert[] = [];
      if (role === "DOMICILIARIO" && canReadDeliveries) {
        const response = await api.get<Delivery[]>("/pedidos/domicilios/activos");
        next = response.data
          .filter((delivery) => delivery.pedido.sucursalId === branchId && delivery.estado === "ASIGNADO" && delivery.pedido.estado === "LISTO")
          .map((delivery) => ({ key: `delivery:${delivery.id}`, orderId: delivery.pedido.id, label: `Pedido #${delivery.pedido.id} listo`, destination: delivery.destinatario, kind: "READY" as const }));
      } else if (canReadOrders) {
        const response = await api.get<ApiOrder[]>("/pedidos", { params: { sucursalId: branchId } });
        const orders = response.data;
        if (role === "MESERO") {
          next = orders
            .filter((order) => order.estado === "LISTO" && order.mesero?.id === userId && order.tipo === "MESA")
            .map((order) => ({
              key: `order:${order.id}`,
              orderId: order.id,
              label: `${orderLabel(order)} listo`,
              destination: "Retirar de preparación y servir",
              kind: "READY" as const,
            }));
        } else if (role === "CAJERO") {
          const readyForCounter = orders
            .filter((order) => order.estado === "LISTO" && order.tipo !== "MESA")
            .map((order) => ({
              key: `order:${order.id}`,
              orderId: order.id,
              label: `${orderLabel(order)} listo`,
              destination: order.tipo === "DOMICILIO" ? "Listo para despacho" : "Listo para entregar al cliente",
              kind: "READY" as const,
            }));

          const accountRequests = orders
            .filter((order) =>
              order.tipo === "MESA" &&
              order.venta?.estado === "PENDIENTE_PAGO" &&
              (order.eventosOperacionales ?? []).some((event) => event.tipo === "CUENTA_SOLICITADA"),
            )
            .map((order) => ({
              key: `account:${order.id}`,
              orderId: order.id,
              label: `${orderLabel(order)} solicita la cuenta`,
              destination: `Cobrar cuenta${order.venta ? ` · $${Number(order.venta.total).toLocaleString("es-CO")}` : ""}`,
              kind: "ACCOUNT_REQUEST" as const,
            }));

          next = [...accountRequests, ...readyForCounter];
        }
      }

      if (!alive.current) return;
      const current = new Set(next.map((item) => item.key));
      setAcknowledged((currentAcknowledged) => new Set([...currentAcknowledged].filter((key) => current.has(key))));

      if (previous.current !== null) {
        const newcomers = next.filter((item) => !previous.current!.has(item.key));
        if (newcomers.length > 0) {
          setAcknowledged((currentAcknowledged) => {
            const updated = new Set(currentAcknowledged);
            newcomers.forEach((item) => updated.delete(item.key));
            return updated;
          });
          toast.success(newcomers.length === 1 ? `${newcomers[0].label} · ${newcomers[0].destination}` : `${newcomers.length} pedidos quedaron listos para tu atención`, { duration: 8000, icon: "🔔" });
          soundAlarm();
        }
      }
      previous.current = current;
      setAlerts(next);
      setError(false);
    } catch {
      if (alive.current) setError(true);
    }
  }, [branchId, canReadDeliveries, canReadOrders, role, soundAlarm, userId]);

  useEffect(() => {
    alive.current = true;
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      alive.current = false;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [load]);

  const ringingAlerts = useMemo(() => alerts.filter((item) => !acknowledged.has(item.key)), [acknowledged, alerts]);
  // Un aviso confirmado deja de ocupar pantalla. El pedido puede seguir LISTO
  // en backend, pero no debe bloquear la operación del usuario. Si sale de LISTO
  // y vuelve a entrar, previous/acknowledged lo habilitan nuevamente como aviso nuevo.
  const visibleAlerts = ringingAlerts;

  useEffect(() => {
    if (!soundEnabled || ringingAlerts.length === 0) return;
    const timer = window.setInterval(soundAlarm, 6000);
    return () => window.clearInterval(timer);
  }, [ringingAlerts.length, soundAlarm, soundEnabled]);

  useEffect(() => () => { void audio.current?.close(); }, []);

  const presentation = useMemo(() => {
    if (role === "MESERO") return { title: visibleAlerts.length === 1 ? "¡Pedido listo para servir!" : `¡${visibleAlerts.length} pedidos listos para servir!`, href: "/salon", action: "Ir al salón", Icon: UtensilsCrossed };
    if (role === "DOMICILIARIO") return { title: visibleAlerts.length === 1 ? "¡Domicilio listo para salir!" : `¡${visibleAlerts.length} domicilios listos para salir!`, href: "/domicilios", action: "Ver entregas", Icon: Bike };
    const accountCount = visibleAlerts.filter((item) => item.kind === "ACCOUNT_REQUEST").length;
    if (accountCount > 0) return { title: accountCount === 1 ? "¡Cuenta solicitada!" : `¡${accountCount} cuentas solicitadas!`, href: "/caja", action: "Ir a caja", Icon: CircleDollarSign };
    return { title: visibleAlerts.length === 1 ? "¡Pedido listo para entregar!" : `¡${visibleAlerts.length} pedidos listos para entregar!`, href: "/caja", action: "Ir a caja", Icon: CircleDollarSign };
  }, [role, visibleAlerts]);

  if (!visibleAlerts.length && !error) return null;
  const { Icon } = presentation;
  const ringing = visibleAlerts.length > 0;

  return (
    <aside
      className={`fixed right-3 top-24 z-[70] w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border-2 shadow-2xl transition ${error ? "border-red-400 bg-red-50" : ringing ? "border-amber-500 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}
      role="alertdialog"
      aria-live="assertive"
      aria-label={error ? "Error de avisos operativos" : presentation.title}
    >
      <div className={`h-2 ${error ? "bg-red-500" : ringing ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${error ? "bg-red-100 text-red-700" : ringing ? "animate-pulse bg-amber-500 text-white" : "bg-emerald-100 text-emerald-700"}`}>
            <Icon size={25} />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block text-lg font-black text-denim">{error ? "No se pudieron actualizar los avisos" : presentation.title}</strong>
            {!error && visibleAlerts.slice(0, 3).map((item) => (
              <div key={item.key} className="mt-2 rounded-xl bg-white/85 px-3 py-2 shadow-sm">
                <div className="font-black text-denim">{item.label}</div>
                <div className="text-sm font-semibold text-denim/65">{item.destination}</div>
              </div>
            ))}
            {!error && visibleAlerts.length > 3 && <div className="mt-2 text-sm font-bold text-denim/60">+{visibleAlerts.length - 3} aviso(s) más</div>}
          </div>
          {!ringing && !error && <CheckCircle2 className="mt-1 text-emerald-600" size={22} />}
        </div>

        {!error && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="rounded-xl bg-denim px-4 py-2.5 text-sm font-black text-white" to={presentation.href} onClick={() => setAcknowledged((current) => new Set([...current, ...visibleAlerts.map((item) => item.key)]))}>
              {presentation.action}
            </Link>
            {ringing && (
              <button type="button" className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-denim" onClick={() => setAcknowledged((current) => new Set([...current, ...visibleAlerts.map((item) => item.key)]))}>
                Confirmar aviso
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-denim/10 bg-white px-3 py-2.5 text-sm font-bold text-denim"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                localStorage.setItem(preferenceKey, next ? "1" : "0");
                if (next) soundAlarm();
              }}
            >
              {soundEnabled ? <BellRing size={16} /> : <BellOff size={16} />}
              {soundEnabled ? "Alarma activa" : "Activar alarma"}
            </button>
          </div>
        )}
        {!error && ringing && <p className="mt-3 text-xs font-bold text-amber-800">La alarma se repetirá cada 6 segundos hasta que confirmes el aviso o abras el módulo.</p>}
      </div>
    </aside>
  );
}
