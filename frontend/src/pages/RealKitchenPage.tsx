import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Eye,
  Flame,
  Martini,
  Play,
  Printer,
  RefreshCw,
  Siren,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PrintableDocumentModal } from "../components/PrintableDocumentModal";
import {
  commandDestination,
  elapsedMinutes,
  servicePromise,
  unseenCommandCount,
  urgency,
  type Command,
  type CommandLine,
  type KdsLineState,
  type KdsPriority,
  type KdsState,
  type ServiceRisk,
  type Station,
  type StationMode,
} from "../features/kds/contracts";
import { api, apiFailure, errorMessage } from "../lib/api";
import {
  listLocalPrinters,
  printAgentHealth,
  printWithLocalAgent,
  readStationPrinterMap,
  saveStationPrinterMap,
  type LocalPrinter,
} from "../lib/print-agent";
import { useApp } from "../store/app";

function beep(frequency: number, duration = 0.22, volume = 0.2) {
  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => void context.close();
}

function kitchenAlarm() {
  beep(980, 0.24, 0.22);
  window.setTimeout(() => beep(1180, 0.24, 0.22), 330);
  window.setTimeout(() => beep(980, 0.3, 0.22), 660);
}

const riskLabel: Record<ServiceRisk, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  late: "Fuera de objetivo",
};

const lineLabel: Record<KdsLineState, string> = {
  PENDIENTE: "Pendiente",
  EN_PREPARACION: "Preparando",
  LISTA: "Lista",
};

export function RealKitchenPage() {
  const { branchId, hasPermission, session } = useApp();
  const [commands, setCommands] = useState<Command[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<number | "all">("all");
  const [state, setState] = useState<KdsState | "all">("all");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReturnType<typeof apiFailure> | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const soundPreferenceKey = `sigr-kitchen-sound:${session?.user.id ?? 0}`;
  const [sound, setSound] = useState(
    () => localStorage.getItem(soundPreferenceKey) === "1",
  );
  const soundEnabled = useRef(sound);
  const [compact, setCompact] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stationForm, setStationForm] = useState(false);
  const [printDocument, setPrintDocument] = useState<{
    title: string;
    html: string;
    text: string;
    widthMm: 58 | 80;
    stationId: number;
    commandId: number;
    reprint: boolean;
  } | null>(null);
  const [printAgentOnline, setPrintAgentOnline] = useState(false);
  const [localPrinters, setLocalPrinters] = useState<LocalPrinter[]>([]);
  const [stationPrinters, setStationPrinters] = useState<Record<number, string>>({});
  const [newStation, setNewStation] = useState({
    codigo: "",
    nombre: "",
    color: "#8B5CF6",
    objetivoPreparacionMin: 15,
    modoOperacion: "KDS_E_IMPRESION" as StationMode,
  });
  const known = useRef(new Set<number>());
  const ready = useRef(new Set<number>());

  const canEdit = hasPermission("COMANDAS_ACTUALIZAR_ESTADO");
  const stationScope =
    session?.user.rol === "COCINA"
      ? "COCINA"
      : session?.user.rol === "BAR"
        ? "BAR"
        : null;
  const stationOperator = stationScope !== null;

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setStationPrinters(readStationPrinterMap(branchId));
      }
    });
    void Promise.all([
      printAgentHealth(controller.signal),
      listLocalPrinters(controller.signal),
    ])
      .then(([, printers]) => {
        setPrintAgentOnline(true);
        setLocalPrinters(printers);
      })
      .catch(() => {
        setPrintAgentOnline(false);
        setLocalPrinters([]);
      });
    return () => controller.abort();
  }, [branchId]);

  const setStationPrinter = (stationId: number, printerName: string) => {
    if (!branchId) return;
    const next = { ...stationPrinters };
    if (printerName) next[stationId] = printerName;
    else delete next[stationId];
    setStationPrinters(next);
    saveStationPrinterMap(branchId, next);
  };

  const load = useCallback(
    async (quiet = false) => {
      if (!branchId) return;
      if (!quiet) setLoading(true);
      try {
        const params = { sucursalId: branchId };
        const [stationResponse, commandResponse] = await Promise.all([
          api.get<Station[]>("/estaciones-preparacion", { params }),
          api.get<Command[]>("/comandas", { params }),
        ]);
        const incoming = commandResponse.data;
        const newcomers = incoming.filter(
          (command) => !known.current.has(command.id),
        );
        const newlyReady = incoming.filter(
          (command) =>
            command.estado === "LISTA" && !ready.current.has(command.id),
        );

        if (newcomers.length && known.current.size > 0) {
          toast.success(`${newcomers.length} nueva(s) comanda(s)`, {
            icon: "🔔",
            duration: 6000,
          });
          if (soundEnabled.current) kitchenAlarm();
        }
        if (newlyReady.length && ready.current.size > 0) {
          toast.success(
            `${newlyReady.length} comanda(s) lista(s) para servicio`,
            { icon: "✅" },
          );
          if (soundEnabled.current) beep(760, 0.28, 0.18);
        }

        incoming.forEach((command) => {
          known.current.add(command.id);
          if (command.estado === "LISTA") ready.current.add(command.id);
        });
        setStations(stationResponse.data);
        setCommands(incoming);
        setFailure(null);
      } catch (error) {
        setFailure(apiFailure(error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    known.current.clear();
    ready.current.clear();
    const initial = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(true), 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  const scopedStations = useMemo(
    () =>
      stations.filter(
        (station) => !stationScope || station.codigo === stationScope,
      ),
    [stationScope, stations],
  );
  const scopedCommands = useMemo(
    () =>
      commands.filter(
        (command) => !stationScope || command.estacion.codigo === stationScope,
      ),
    [commands, stationScope],
  );
  const visible = useMemo(
    () =>
      scopedCommands.filter(
        (command) =>
          (stationId === "all" || command.estacion.id === stationId) &&
          (state === "all" || command.estado === state),
      ),
    [scopedCommands, state, stationId],
  );

  const counters = useMemo(
    () => ({
      pending: scopedCommands.filter((item) => item.estado === "PENDIENTE")
        .length,
      preparing: scopedCommands.filter(
        (item) => item.estado === "EN_PREPARACION",
      ).length,
      ready: scopedCommands.filter((item) => item.estado === "LISTA").length,
      delayed: scopedCommands.filter(
        (item) =>
          servicePromise(
            elapsedMinutes(item.fechaEnvio, now),
            item.metaPreparacionMin,
          ).risk === "late",
      ).length,
    }),
    [scopedCommands, now],
  );

  const unseen = useMemo(
    () => unseenCommandCount(scopedCommands),
    [scopedCommands],
  );

  useEffect(() => {
    if (!sound || counters.pending <= 0) return;
    kitchenAlarm();
    const timer = window.setInterval(kitchenAlarm, 5500);
    return () => window.clearInterval(timer);
  }, [counters.pending, sound]);

  const printCommand = async (command: Command) => {
    try {
      const { data } = await api.get<{
        contenido: string;
        contenidoTexto: string;
        anchoPapel: 58 | 80;
      }>(`/comandas/${command.id}/representacion-impresa`);
      setPrintDocument({
        title: `Comanda #${command.id} · ${command.estacion.nombre}`,
        html: data.contenido,
        text: data.contenidoTexto,
        widthMm: data.anchoPapel,
        stationId: command.estacion.id,
        commandId: command.id,
        reprint: command.solicitudesImpresion > 0,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const act = async (
    key: string,
    action: () => Promise<unknown>,
    success?: string,
  ) => {
    if (!canEdit || busy) return;
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const markSeen = (command: Command) =>
    act(
      `seen-${command.id}`,
      () => api.patch(`/comandas/${command.id}/visto`),
      `${command.estacion.nombre}: comanda vista`,
    );

  const startAll = (command: Command) =>
    act(
      `start-${command.id}`,
      () => api.patch(`/comandas/${command.id}/iniciar-todos`),
      `${command.estacion.nombre}: preparación iniciada`,
    );

  const updateCommandState = (
    command: Command,
    estado: "LISTA" | "ENTREGADA",
  ) =>
    act(
      `command-${command.id}`,
      () => api.patch(`/comandas/${command.id}/estado`, { estado }),
      estado === "LISTA"
        ? "Comanda completa lista"
        : "Comanda retirada de estación",
    );

  const updateLineState = (
    command: Command,
    line: CommandLine,
    estado: "EN_PREPARACION" | "LISTA",
  ) =>
    act(`line-${line.id}`, () =>
      api.patch(`/comandas/${command.id}/detalles/${line.id}/estado`, {
        estado,
      }),
    );

  const prioritize = (command: Command, prioridad: KdsPriority) =>
    act(`priority-${command.id}`, () =>
      api.patch(`/comandas/${command.id}/prioridad`, { prioridad }),
    );

  const canManageStationMode =
    hasPermission("CONFIGURACION_GESTIONAR") || session?.user.rol === "ADMIN_SEDE";

  const updateStationMode = async (station: Station, modoOperacion: StationMode) => {
    try {
      const path = hasPermission("CONFIGURACION_GESTIONAR")
        ? `/estaciones-preparacion/${station.id}`
        : `/estaciones-preparacion/${station.id}/modo-operacion`;
      await api.patch(path, { modoOperacion });
      toast.success(`${station.nombre}: política actualizada`);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleSound = () => {
    const next = !sound;
    soundEnabled.current = next;
    localStorage.setItem(soundPreferenceKey, next ? "1" : "0");
    setSound(next);
    if (next) {
      kitchenAlarm();
      toast.success("Alarma sonora activada. Se repetirá mientras haya comandas pendientes.");
    }
  };

  const createStation = async () => {
    if (!branchId || !newStation.codigo.trim() || !newStation.nombre.trim())
      return;
    try {
      await api.post("/estaciones-preparacion", {
        ...newStation,
        codigo: newStation.codigo.trim().toUpperCase().replaceAll(" ", "_"),
        nombre: newStation.nombre.trim(),
        sucursalId: branchId,
      });
      toast.success("Estación creada");
      setStationForm(false);
      setNewStation({
        codigo: "",
        nombre: "",
        color: "#8B5CF6",
        objetivoPreparacionMin: 15,
        modoOperacion: "KDS_E_IMPRESION",
      });
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading)
    return <LoadingState label="Conectando estaciones de preparación…" />;
  if (failure)
    return (
      <ErrorState
        detail={`No se puede confirmar el estado actual de cocina. ${failure.message}`}
        requestId={failure.requestId}
        retry={() => void load()}
      />
    );

  return (
    <div>
      <div className="section-title kds-toolbar">
        <div>
          <p className="eyebrow">
            {stationOperator
              ? `${stationScope} · operación en vivo`
              : canEdit
                ? "KDS · operación de cocina y bar"
                : "Seguimiento de preparación"}
          </p>
          <h1 className={stationOperator ? "text-2xl font-black tracking-tight" : "page-title"}>
            {stationOperator
              ? stationScope === "COCINA"
                ? "Cocina"
                : "Bar"
              : canEdit
                ? "Producción y despacho"
                : "Estado de cocina y bar"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCompact(!compact)}
            className="secondary h-11 w-auto px-4"
          >
            {compact ? "Vista amplia" : "Vista compacta"}
          </button>
          <button
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              void action.catch(() =>
                toast.error("El navegador no permite pantalla completa"),
              );
            }}
            className="secondary h-11 w-auto px-4"
          >
            Pantalla completa
          </button>
          {hasPermission("CONFIGURACION_GESTIONAR") && (
            <button
              onClick={() => setStationForm(!stationForm)}
              className="secondary h-11 w-auto px-4"
            >
              + Estación
            </button>
          )}
          <button onClick={toggleSound} className="secondary h-11 w-auto px-4">
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}{" "}
            {sound ? "Alarma activa" : "Activar alarma"}
          </button>
          <button
            onClick={() => void load()}
            aria-label="Actualizar comandas"
            className="secondary h-11 w-11 px-0"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      {unseen > 0 && (
        <div className="kds-new-alert mt-4" aria-live="assertive">
          <div className="flex items-center gap-3">
            <BellRing size={24} />
            <div>
              <strong>{unseen} pedido(s) nuevo(s) sin confirmar</strong>
              <p>
                {canEdit
                  ? "La alerta permanece hasta que la estación marque cada comanda como vista."
                  : "Puedes seguir el estado aquí; las acciones de preparación están reservadas a cocina y bar."}
              </p>
            </div>
          </div>
        </div>
      )}

      {stationForm && (
        <div className="card mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_150px_110px_130px_auto]">
          <input
            className="input h-11"
            maxLength={40}
            placeholder="Código: POSTRES"
            value={newStation.codigo}
            onChange={(event) =>
              setNewStation({ ...newStation, codigo: event.target.value })
            }
          />
          <input
            className="input h-11"
            maxLength={80}
            placeholder="Nombre de estación"
            value={newStation.nombre}
            onChange={(event) =>
              setNewStation({ ...newStation, nombre: event.target.value })
            }
          />
          <select
            aria-label="Modo operativo"
            className="input h-11"
            value={newStation.modoOperacion}
            onChange={(event) =>
              setNewStation({
                ...newStation,
                modoOperacion: event.target.value as StationMode,
              })
            }
          >
            <option value="KDS">Sólo KDS</option>
            <option value="IMPRESION">Papel (impresión manual)</option>
            <option value="KDS_E_IMPRESION">KDS + impresión</option>
          </select>
          <input
            aria-label="Color de estación"
            className="h-11 w-full rounded-xl bg-white p-1"
            type="color"
            value={newStation.color}
            onChange={(event) =>
              setNewStation({ ...newStation, color: event.target.value })
            }
          />
          <label className="text-xs font-black text-denim/55">
            Meta (min)
            <input
              className="input mt-1 h-8 px-2"
              min={1}
              max={240}
              type="number"
              value={newStation.objetivoPreparacionMin}
              onChange={(event) =>
                setNewStation({
                  ...newStation,
                  objetivoPreparacionMin: Number(event.target.value) || 15,
                })
              }
            />
          </label>
          <button
            className="primary h-11 px-5"
            onClick={() => void createStation()}
          >
            Crear
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Por iniciar" value={counters.pending} tone="bg-denim" />
        <Kpi
          label="Preparando"
          value={counters.preparing}
          tone="bg-orange-500"
        />
        <Kpi label="Listas" value={counters.ready} tone="bg-emerald-600" />
        <Kpi
          label="Fuera de objetivo"
          value={counters.delayed}
          tone="bg-red-600"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {!stationScope && (
          <button
            className={[
              "salon-filter",
              stationId === "all" ? "active" : "",
            ].join(" ")}
            onClick={() => setStationId("all")}
          >
            Todas las estaciones
          </button>
        )}
        {scopedStations.map((station) => (
          <button
            key={station.id}
            onClick={() => setStationId(station.id)}
            className={[
              "salon-filter",
              stationId === station.id || Boolean(stationScope) ? "active" : "",
            ].join(" ")}
          >
            <i
              className="mr-2 inline-block h-2 w-2 rounded-full"
              style={{ background: station.color }}
            />
            {station.nombre} · {station.objetivoPreparacionMin} min · {station.modoOperacion.replaceAll("_", " + ")}
          </button>
        ))}
      </div>

      {canManageStationMode && scopedStations.length > 0 && (
        <div className="card mt-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong>Política híbrida por estación</strong>
              <p className="text-xs text-denim/55">
                Define si la estación opera con pantalla, papel o ambos. El estado digital de la comanda se conserva en todos los modos.
              </p>
            </div>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-black uppercase",
                printAgentOnline
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900",
              ].join(" ")}
            >
              Agente de impresión: {printAgentOnline ? "conectado" : "no detectado"}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {scopedStations.map((station) => (
              <label key={`mode-${station.id}`} className="rounded-xl border border-denim/10 p-3 text-xs font-black">
                {station.nombre}
                <select
                  className="input mt-2 h-10"
                  value={station.modoOperacion}
                  onChange={(event) =>
                    void updateStationMode(station, event.target.value as StationMode)
                  }
                >
                  <option value="KDS">Sólo KDS</option>
                  <option value="IMPRESION">Papel (impresión manual)</option>
                  <option value="KDS_E_IMPRESION">KDS + impresión</option>
                </select>
                {station.modoOperacion !== "KDS" && (
                  <>
                    <span className="mt-3 block text-[10px] uppercase text-denim/45">
                      Impresora local de esta estación
                    </span>
                    <select
                      className="input mt-1 h-10"
                      disabled={!printAgentOnline}
                      value={stationPrinters[station.id] ?? ""}
                      onChange={(event) =>
                        setStationPrinter(station.id, event.target.value)
                      }
                    >
                      <option value="">
                        {printAgentOnline
                          ? "Usar impresión del navegador"
                          : "Inicia el agente de impresión de SIGR"}
                      </option>
                      {localPrinters.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}{printer.default ? " · predeterminada" : ""}
                          {printer.available ? "" : " · no disponible"}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", "PENDIENTE", "EN_PREPARACION", "LISTA"] as const).map(
          (value) => (
            <button
              key={value}
              onClick={() => setState(value)}
              className={[
                "rounded-lg px-3 py-2 text-[11px] font-black uppercase",
                state === value
                  ? "bg-marigold text-steel"
                  : "bg-white text-denim/55",
              ].join(" ")}
            >
              {value === "all"
                ? "Todos los estados"
                : value.replaceAll("_", " ")}
            </button>
          ),
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <ChefHat size={44} />
          <h2>Estación al día</h2>
          <p>No hay comandas activas para los filtros seleccionados.</p>
        </div>
      ) : (
        <div
          className={[
            "kds-board mt-5",
            compact ? "kds-compact" : "",
          ].join(" ")}
        >
          {visible.map((command) => (
            <CommandCard
              key={command.id}
              command={command}
              now={now}
              busy={busy}
              canEdit={canEdit}
              markSeen={markSeen}
              startAll={startAll}
              updateCommandState={updateCommandState}
              updateLineState={updateLineState}
              prioritize={prioritize}
              printCommand={printCommand}
            />
          ))}
        </div>
      )}
      {printDocument && (
        <PrintableDocumentModal
          html={printDocument.html}
          title={printDocument.title}
          printLabel={
            stationPrinters[printDocument.stationId] && printAgentOnline
              ? printDocument.reprint
                ? "Reimprimir directo"
                : "Imprimir directo"
              : printDocument.reprint
                ? "Reimprimir"
                : "Imprimir"
          }
          onPrint={async () => {
            const printerName = stationPrinters[printDocument.stationId];
            if (!printerName || !printAgentOnline) return "browser";
            try {
              const result = await printWithLocalAgent({
                printerName,
                jobName: `SIGR Comanda ${printDocument.commandId}`,
                content: printDocument.text,
                widthMm: printDocument.widthMm,
              });
              if (!result.ok || result.status !== "completed") {
                throw new Error(result.error || "No se confirmó la impresión física");
              }
              await api.post(`/comandas/${printDocument.commandId}/impresiones`, {
                reimpresion: printDocument.reprint,
              });
              toast.success(
                printDocument.reprint
                  ? "Reimpresión física confirmada y auditada"
                  : "Impresión física confirmada y auditada",
              );
              await load(true);
              return "handled";
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "No se pudo imprimir con el agente local de SIGR",
              );
              return "handled";
            }
          }}
          onBrowserPrintConfirmed={async () => {
            await api.post(`/comandas/${printDocument.commandId}/impresiones`, {
              reimpresion: printDocument.reprint,
            });
            toast.success(
              printDocument.reprint
                ? "Reimpresión manual confirmada y auditada"
                : "Impresión manual confirmada y auditada",
            );
            await load(true);
          }}
          onClose={() => setPrintDocument(null)}
        />
      )}
    </div>
  );
}

function CommandCard({
  command,
  now,
  busy,
  canEdit,
  markSeen,
  startAll,
  updateCommandState,
  updateLineState,
  prioritize,
  printCommand,
}: {
  command: Command;
  now: number;
  busy: string | null;
  canEdit: boolean;
  markSeen: (command: Command) => Promise<void>;
  startAll: (command: Command) => Promise<void>;
  updateCommandState: (
    command: Command,
    estado: "LISTA" | "ENTREGADA",
  ) => Promise<void>;
  updateLineState: (
    command: Command,
    line: CommandLine,
    estado: "EN_PREPARACION" | "LISTA",
  ) => Promise<void>;
  prioritize: (command: Command, priority: KdsPriority) => Promise<void>;
  printCommand: (command: Command) => Promise<void>;
}) {
  const minutes = elapsedMinutes(command.fechaEnvio, now);
  const promise = servicePromise(minutes, command.metaPreparacionMin);
  const level = urgency(minutes, command.metaPreparacionMin);
  const pendingLines = command.detalles.some(
    (line) => line.estado === "PENDIENTE",
  );
  const paperOnly = command.estacion.modoOperacion === "IMPRESION";
  const canOperateKds = canEdit && !paperOnly;

  return (
    <article
      className={["kds-card", level, !command.fechaVista ? "unseen" : ""].join(
        " ",
      )}
    >
      {!command.fechaVista && (
        <div className="kds-unseen-ribbon">
          <BellRing size={14} /> NUEVO · REQUIERE VISTO
        </div>
      )}
      <header
        className="kds-header"
        style={{ borderTopColor: command.estacion.color }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-denim/45">
            {command.estacion.codigo === "BAR" ? (
              <Martini size={16} />
            ) : (
              <ChefHat size={16} />
            )}{" "}
            {command.estacion.nombre}
          </div>
          <h2 className="mt-1 truncate text-3xl font-black">
            {commandDestination(command)}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-denim/45">
            <span>Pedido #{command.pedido.id}</span>
            <span>Comanda #{command.id}</span>
            {command.pedido.mesero && (
              <span>Mesero: {command.pedido.mesero.nombres}</span>
            )}
          </div>
        </div>
        <div className={["kds-timer", level].join(" ")}>
          <Clock3 size={18} />
          <span>{minutes}</span>
          <small>min</small>
        </div>
      </header>

      <PromisePanel promise={promise} />

      <div className="kds-lines flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="space-y-3">
          {command.detalles.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              command={command}
              busy={busy === `line-${line.id}`}
              canEdit={canOperateKds}
              updateLineState={updateLineState}
            />
          ))}
        </div>
      </div>

      <footer className="border-t border-denim/8 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "status-pill",
                command.estado === "LISTA"
                  ? "bg-emerald-100 text-emerald-800"
                  : "",
              ].join(" ")}
            >
              {command.estado.replaceAll("_", " ")}
            </span>
            {command.estacion.modoOperacion !== "KDS" &&
              command.solicitudesImpresion === 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-900">
                  Pendiente de impresión
                </span>
              )}
            {command.solicitudesImpresion > 0 && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1.5 text-[10px] font-black uppercase text-emerald-800">
                Impreso · {command.solicitudesImpresion}{" "}
                {command.solicitudesImpresion === 1 ? "vez" : "veces"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <select
                aria-label="Prioridad"
                className="rounded-lg border border-denim/10 bg-white px-2 py-2 text-xs font-black"
                value={command.prioridad}
                onChange={(event) =>
                  void prioritize(command, event.target.value as KdsPriority)
                }
              >
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            )}
            <button
              aria-label={
                command.solicitudesImpresion > 0
                  ? "Reimprimir comanda"
                  : "Imprimir comanda"
              }
              className="flex items-center gap-1.5 rounded-lg border border-denim/10 bg-white px-3 py-2 text-[11px] font-black text-denim"
              onClick={() => void printCommand(command)}
            >
              <Printer size={16} />
              {command.solicitudesImpresion > 0 ? "Reimprimir" : "Imprimir"}
            </button>
          </div>
        </div>

        {canEdit && !command.fechaVista && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void markSeen(command)}
            className="kds-action bg-marigold text-steel"
          >
            <Eye size={20} /> Visto por {command.estacion.nombre}
          </button>
        )}

        {canOperateKds && command.estado !== "LISTA" && pendingLines && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void startAll(command)}
            className="kds-action bg-steel text-white"
          >
            <Play size={20} /> Iniciar todos
          </button>
        )}

        {canOperateKds && command.estado === "EN_PREPARACION" && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void updateCommandState(command, "LISTA")}
            className="kds-action bg-emerald-700 text-white"
          >
            <CheckCircle2 size={20} /> Marcar todo listo
          </button>
        )}

        {canOperateKds && command.estado === "LISTA" && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void updateCommandState(command, "ENTREGADA")}
            className="kds-action bg-emerald-700 text-white"
          >
            <Check size={20} /> Retirar para servicio
          </button>
        )}

        {paperOnly && canEdit && (
          <div className="space-y-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-900">
              Operación en papel · actualiza aquí el estado general de la comanda
            </div>

            {command.estado === "PENDIENTE" && (
              <button
                disabled={Boolean(busy)}
                onClick={() => void startAll(command)}
                className="kds-action bg-steel text-white"
              >
                <Play size={20} /> Iniciar preparación
              </button>
            )}

            {command.estado === "EN_PREPARACION" && (
              <button
                disabled={Boolean(busy)}
                onClick={() => void updateCommandState(command, "LISTA")}
                className="kds-action bg-emerald-700 text-white"
              >
                <CheckCircle2 size={20} /> Marcar comanda lista
              </button>
            )}

            {command.estado === "LISTA" && (
              <>
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-800">
                  Comanda lista · pendiente de retiro por servicio
                </div>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => void updateCommandState(command, "ENTREGADA")}
                  className="kds-action bg-emerald-700 text-white"
                >
                  <Check size={20} /> Retirado por servicio
                </button>
              </>
            )}
          </div>
        )}

        {!canEdit && (
          <div className="rounded-xl bg-denim/[.04] px-3 py-2 text-center text-xs font-bold text-denim/55">
            Seguimiento solamente · sin acciones de preparación
          </div>
        )}
      </footer>

      {command.prioridad !== "NORMAL" && (
        <span
          className={[
            "absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-black",
            command.prioridad === "URGENTE"
              ? "bg-red-600 text-white"
              : "bg-amber-200 text-amber-900",
          ].join(" ")}
        >
          {command.prioridad === "URGENTE" ? (
            <Siren size={12} />
          ) : (
            <AlertTriangle size={12} />
          )}{" "}
          {command.prioridad}
        </span>
      )}
    </article>
  );
}

function PromisePanel({
  promise,
}: {
  promise: ReturnType<typeof servicePromise>;
}) {
  if (promise.risk === "late") {
    return (
      <div className="kds-promise late">
        <div>
          <strong>
            <AlertTriangle size={18} /> Fuera de objetivo
          </strong>
          <span>Meta {promise.target} min</span>
        </div>
        <b>+{Math.abs(promise.remaining)} min</b>
      </div>
    );
  }
  return (
    <div className={`kds-promise ${promise.risk}`}>
      <div>
        <span>Meta</span>
        <strong>{promise.target} min</strong>
      </div>
      <div>
        <span>Lleva</span>
        <strong>{promise.elapsed} min</strong>
      </div>
      <div>
        <span>Quedan</span>
        <strong>{promise.remaining} min</strong>
      </div>
      <div>
        <span>Riesgo</span>
        <strong>{riskLabel[promise.risk]}</strong>
      </div>
    </div>
  );
}

function LineCard({
  line,
  command,
  busy,
  canEdit,
  updateLineState,
}: {
  line: CommandLine;
  command: Command;
  busy: boolean;
  canEdit: boolean;
  updateLineState: (
    command: Command,
    line: CommandLine,
    estado: "EN_PREPARACION" | "LISTA",
  ) => Promise<void>;
}) {
  const modifiers = line.detallePedido.modificadores ?? [];
  return (
    <div className={["kds-line", line.estado.toLowerCase()].join(" ")}>
      <div className="flex items-start gap-3">
        <b className="kds-qty">{line.cantidad}×</b>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <strong className="text-lg leading-tight">
              {line.detallePedido.producto.nombre}
            </strong>
            <span className="rounded-full bg-denim/5 px-2 py-1 text-[10px] font-black uppercase text-denim/55">
              {lineLabel[line.estado]}
            </span>
          </div>
          {modifiers.length > 0 && (
            <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700">
              {modifiers.map((modifier) => (
                <div key={modifier.id}>
                  + {modifier.cantidad > 1 ? `${modifier.cantidad}× ` : ""}
                  {modifier.nombre}
                </div>
              ))}
            </div>
          )}
          {line.detallePedido.observaciones && (
            <div className="kds-note mt-2">
              <AlertTriangle size={15} />
              <span>
                <b>Observación:</b> {line.detallePedido.observaciones}
              </span>
            </div>
          )}
        </div>
      </div>

      {canEdit && line.estado !== "LISTA" && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {line.estado === "PENDIENTE" && (
            <button
              disabled={busy}
              className="kds-line-action"
              onClick={() =>
                void updateLineState(command, line, "EN_PREPARACION")
              }
            >
              <Flame size={17} /> Iniciar línea
            </button>
          )}
          <button
            disabled={busy}
            className="kds-line-action ready"
            onClick={() => void updateLineState(command, line, "LISTA")}
          >
            <CheckCircle2 size={17} /> Línea lista
          </button>
        </div>
      )}
      {line.estado === "LISTA" && (
        <div className="mt-3 flex items-center gap-2 text-xs font-black text-emerald-700">
          <CheckCircle2 size={16} /> Preparación terminada
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span
        className={[
          "grid h-12 w-12 place-items-center rounded-xl text-lg font-black text-white",
          tone,
        ].join(" ")}
      >
        {value}
      </span>
      <span className="text-sm font-bold text-denim/55">{label}</span>
    </div>
  );
}
