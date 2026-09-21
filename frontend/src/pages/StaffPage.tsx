import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type FunctionRole = { id: number; nombre: string };
type OperationalUnit = {
  id: number;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  orden: number;
};
type EmployeeOperationalUnit = {
  unidadOperativa: OperationalUnit;
  principal?: boolean;
};
type Schedule = {
  id: number;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
};
type LinkedUser = {
  id: number;
  email: string;
  activo: boolean;
  rol?: { nombre: string };
};
type Employee = {
  id: number;
  codigo: string;
  nombres: string;
  apellidos: string;
  documento?: string;
  cargo: string;
  activo: boolean;
  usuario?: LinkedUser;
  funciones: { funcion: FunctionRole }[];
  unidadesOperativas?: EmployeeOperationalUnit[];
  horarios: Schedule[];
  novedades: { id: number; tipo: string; descripcion: string; fecha: string }[];
};
type Shift = {
  id: number;
  inicioProgramado: string;
  finProgramado: string;
  entradaEn?: string;
  salidaEn?: string;
  estado: string;
  observaciones?: string;
  etiqueta?: string;
  minutosPausa?: number;
  unidadOperativa?: OperationalUnit | null;
  unidadOperativaId?: number | null;
  empleado: Employee;
};
type WeekRow = {
  start: string;
  end: string;
  rest: boolean;
  label: string;
  breakMinutes: number;
};
type Summary = {
  empleados: Employee[];
  funciones: FunctionRole[];
  unidadesOperativas: OperationalUnit[];
  turnos: Shift[];
};
type Productivity = {
  empleadoId: number;
  empleado: string;
  cargo: string;
  horas: number;
  pedidos: number;
  ventas: number;
  pedidosPorHora: number;
};
type SystemUser = {
  id: number;
  nombres: string;
  apellidos: string;
  email: string;
  activo: boolean;
  sucursalId: number | null;
  rol?: { nombre: string };
};

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(`1970-01-01T${value}:00Z`));
  return { value, label };
});

const isOvernightSchedule = (start: string, end: string) => end < start;
const inferShiftLabel = (start: string, end: string) => {
  const hour = Number(start.slice(0, 2));
  if (hour >= 20 || hour < 5) return "NOCHE";
  if (hour < 12) return "AM";
  if (hour < 18) return "PM";
  return isOvernightSchedule(start, end) ? "NOCHE" : "PM";
};
const breakOptions = [0, 15, 30, 45, 60, 90, 120];

const toDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const mondayFor = (date = new Date()) => {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  copy.setHours(0, 0, 0, 0);
  return toDateValue(copy);
};
const addDays = (dateValue: string, amount: number) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateValue(date);
};
const hhmm = (value: string) => {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char,
  );
const demoEmployees: Employee[] = [
  {
    id: 1,
    codigo: "EMP-001",
    nombres: "Laura",
    apellidos: "Martínez",
    cargo: "Cajera",
    activo: true,
    funciones: [{ funcion: { id: 1, nombre: "Caja" } }],
    horarios: [{ id: 1, diaSemana: 1, horaInicio: "14:00", horaFin: "22:00" }],
    novedades: [],
  },
  {
    id: 2,
    codigo: "EMP-002",
    nombres: "Andrés",
    apellidos: "Rojas",
    cargo: "Mesero",
    activo: true,
    funciones: [{ funcion: { id: 2, nombre: "Servicio de mesa" } }],
    horarios: [],
    novedades: [],
  },
];

export function StaffPage() {
  const { branchId, session } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<FunctionRole[]>([]);
  const [operationalUnits, setOperationalUnits] = useState<OperationalUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | "all">("all");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitDescription, setNewUnitDescription] = useState("");
  const [showUnitManager, setShowUnitManager] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [selected, setSelected] = useState(0);
  const [code, setCode] = useState("");
  const [names, setNames] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [document, setDocument] = useState("");
  const [position, setPosition] = useState("");
  const [userId, setUserId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState("1");
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [weekStart, setWeekStart] = useState(mondayFor());
  const [weekDrafts, setWeekDrafts] = useState<Record<string, Record<number, WeekRow>>>({});
  const [editingTeamCell, setEditingTeamCell] = useState<{ employeeId: number; index: number } | null>(null);
  const [cancelShiftId, setCancelShiftId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [deactivateLinkedUser, setDeactivateLinkedUser] = useState(true);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const employee = useMemo(
    () => employees.find((item) => item.id === selected),
    [employees, selected],
  );
  const linkedUserIds = useMemo(
    () => new Set(employees.flatMap((item) => (item.usuario ? [item.usuario.id] : []))),
    [employees],
  );
  const availableUsers = useMemo(
    () =>
      users.filter(
        (item) =>
          item.activo &&
          !linkedUserIds.has(item.id) &&
          (item.sucursalId === null || item.sucursalId === branchId),
      ),
    [users, linkedUserIds, branchId],
  );
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const buildWeekDraft = (target: Employee, unitId: number | "all" = selectedUnitId): Record<number, WeekRow> => {
    const next: Record<number, WeekRow> = {};
    weekDates.forEach((dateValue, index) => {
      const dayStart = new Date(`${dateValue}T00:00:00`);
      const dayEnd = new Date(`${addDays(dateValue, 1)}T00:00:00`);
      const shift = shifts.find((item) => {
        const start = new Date(item.inicioProgramado);
        return (
          item.empleado.id === target.id &&
          item.estado !== "CANCELADO" &&
          (unitId === "all" ? true : (item.unidadOperativa?.id ?? item.unidadOperativaId) === unitId) &&
          start >= dayStart &&
          start < dayEnd
        );
      });
      if (shift) {
        const startValue = hhmm(shift.inicioProgramado);
        const endValue = hhmm(shift.finProgramado);
        next[index] = {
          start: startValue,
          end: endValue,
          rest: false,
          label: shift.etiqueta || inferShiftLabel(startValue, endValue),
          breakMinutes: shift.minutosPausa ?? 0,
        };
        return;
      }
      const jsDay = new Date(`${dateValue}T12:00:00`).getDay();
      const habitual = target.horarios.find((item) => item.diaSemana === jsDay);
      next[index] = habitual
        ? {
            start: habitual.horaInicio,
            end: habitual.horaFin,
            rest: false,
            label: inferShiftLabel(habitual.horaInicio, habitual.horaFin),
            breakMinutes: 0,
          }
        : { start: "08:00", end: "17:00", rest: true, label: "AM", breakMinutes: 0 };
    });
    return next;
  };
  const unitKey = selectedUnitId === "all" ? "all" : String(selectedUnitId);
  const weekKey = `${employee?.id ?? 0}:${weekStart}:${unitKey}`;
  const weekDraft = employee ? (weekDrafts[weekKey] ?? buildWeekDraft(employee, selectedUnitId)) : {};
  const teamWeek = (target: Employee) =>
    weekDrafts[`${target.id}:${weekStart}:${unitKey}`] ?? buildWeekDraft(target, selectedUnitId);
  const employeeBelongsToSelectedUnit = (target: Employee) =>
    selectedUnitId === "all" ||
    (target.unidadesOperativas ?? []).some((item) => item.unidadOperativa.id === selectedUnitId);
  const visibleEmployees = employees.filter((item) => item.activo && employeeBelongsToSelectedUnit(item));
  const listedEmployees = employees.filter(
    (item) => (showInactiveEmployees || item.activo) && employeeBelongsToSelectedUnit(item),
  );
  const updateWeekRow = (index: number, row: WeekRow) =>
    setWeekDrafts((current) => ({
      ...current,
      [weekKey]: { ...weekDraft, [index]: row },
    }));
  const updateTeamRow = (target: Employee, index: number, row: WeekRow) => {
    const key = `${target.id}:${weekStart}:${unitKey}`;
    const currentWeek = weekDrafts[key] ?? buildWeekDraft(target);
    setWeekDrafts((current) => ({
      ...current,
      [key]: { ...currentWeek, [index]: row },
    }));
  };



  const load = useCallback(async () => {
    if (!branchId) return;
    if (session?.demo) {
      setEmployees((current) => (current.length ? current : demoEmployees));
      setOperationalUnits([]);
      setRoles((current) =>
        current.length
          ? current
          : [
              { id: 1, nombre: "Caja" },
              { id: 2, nombre: "Servicio de mesa" },
              { id: 3, nombre: "Cocina" },
            ],
      );
      setUsers([]);
      setSelected((value) => value || 1);
      setShifts((current) =>
        current.length
          ? current
          : [
              {
                id: 1,
                inicioProgramado: `${today}T14:00:00`,
                finProgramado: `${today}T22:00:00`,
                estado: "PROGRAMADO",
                empleado: demoEmployees[0],
              },
            ],
      );
      return;
    }
    try {
      const [staffResponse, usersResponse] = await Promise.all([
        api.get<Summary>("/personal", { params: { sucursalId: branchId } }),
        api.get<SystemUser[]>("/usuarios"),
      ]);
      setEmployees(staffResponse.data.empleados);
      setRoles(staffResponse.data.funciones);
      setOperationalUnits(staffResponse.data.unidadesOperativas ?? []);
      setShifts(staffResponse.data.turnos);
      setUsers(usersResponse.data);
      setSelected(
        (value) => value || staffResponse.data.empleados[0]?.id || 0,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [branchId, session?.demo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectUser = (value: string) => {
    setUserId(value);
    const account = users.find((item) => item.id === Number(value));
    if (!account) return;
    if (!names.trim()) setNames(account.nombres);
    if (!lastNames.trim()) setLastNames(account.apellidos);
    if (!position.trim() && account.rol?.nombre) setPosition(account.rol.nombre);
  };

  const addEmployee = async () => {
    if (
      !branchId ||
      !code.trim() ||
      !names.trim() ||
      !lastNames.trim() ||
      !position.trim()
    )
      return toast.error("Completa los datos del empleado");
    if (session?.demo) {
      const item: Employee = {
        id: Date.now(),
        codigo: code,
        nombres: names,
        apellidos: lastNames,
        documento: document || undefined,
        cargo: position,
        activo: true,
        funciones: [],
        horarios: [],
        novedades: [],
      };
      setEmployees((current) => [...current, item]);
      setSelected(item.id);
      setCode("");
      setNames("");
      setLastNames("");
      setDocument("");
      setPosition("");
      setUserId("");
      return toast.success("Empleado creado");
    }
    try {
      await api.post("/personal/empleados", {
        sucursalId: branchId,
        codigo: code,
        nombres: names,
        apellidos: lastNames,
        documento: document.trim() || undefined,
        cargo: position,
        usuarioId: userId ? Number(userId) : undefined,
      });
      setCode("");
      setNames("");
      setLastNames("");
      setDocument("");
      setPosition("");
      setUserId("");
      await load();
      toast.success("Empleado creado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addOperationalUnit = async () => {
    if (!branchId || !newUnitName.trim()) return toast.error("Indica el nombre de la unidad operativa");
    if (session?.demo) {
      const item: OperationalUnit = {
        id: Date.now(),
        nombre: newUnitName.trim(),
        descripcion: newUnitDescription.trim() || undefined,
        activo: true,
        orden: operationalUnits.length,
      };
      setOperationalUnits((current) => [...current, item]);
      setSelectedUnitId(item.id);
      setNewUnitName("");
      setNewUnitDescription("");
      return toast.success("Unidad operativa creada");
    }
    try {
      const response = await api.post<OperationalUnit>("/personal/unidades-operativas", {
        sucursalId: branchId,
        nombre: newUnitName.trim(),
        descripcion: newUnitDescription.trim() || undefined,
        orden: operationalUnits.length,
      });
      setNewUnitName("");
      setNewUnitDescription("");
      setSelectedUnitId(response.data.id);
      await load();
      toast.success("Unidad operativa creada");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deactivateOperationalUnit = async (unit: OperationalUnit) => {
    if (!branchId) return;
    if (session?.demo) {
      setOperationalUnits((current) => current.filter((item) => item.id !== unit.id));
      if (selectedUnitId === unit.id) setSelectedUnitId("all");
      return toast.success("Unidad operativa desactivada");
    }
    try {
      await api.post(`/personal/unidades-operativas/${unit.id}/desactivar`, { sucursalId: branchId });
      if (selectedUnitId === unit.id) setSelectedUnitId("all");
      await load();
      toast.success("Unidad operativa desactivada");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleEmployeeUnit = async (target: Employee, unitId: number) => {
    const currentIds = (target.unidadesOperativas ?? []).map((item) => item.unidadOperativa.id);
    const unitIds = currentIds.includes(unitId)
      ? currentIds.filter((id) => id !== unitId)
      : [...currentIds, unitId];
    if (session?.demo) {
      setEmployees((items) =>
        items.map((item) =>
          item.id === target.id
            ? {
                ...item,
                unidadesOperativas: operationalUnits
                  .filter((unit) => unitIds.includes(unit.id))
                  .map((unidadOperativa, index) => ({ unidadOperativa, principal: index === 0 })),
              }
            : item,
        ),
      );
      return;
    }
    try {
      await api.post(`/personal/empleados/${target.id}/unidades-operativas`, {
        unidadOperativaIds: unitIds,
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addRole = async () => {
    if (!roleName.trim()) return;
    if (session?.demo) {
      setRoles((current) => [
        ...current,
        { id: Date.now(), nombre: roleName.trim() },
      ]);
      setRoleName("");
      return;
    }
    try {
      await api.post("/personal/funciones", { nombre: roleName });
      setRoleName("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const assignRole = async (roleId: number) => {
    if (!employee) return;
    const current = employee.funciones.map((item) => item.funcion.id);
    const ids = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    if (session?.demo) {
      setEmployees((items) =>
        items.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                funciones: roles
                  .filter((role) => ids.includes(role.id))
                  .map((funcion) => ({ funcion })),
              }
            : item,
        ),
      );
      return;
    }
    try {
      await api.post(`/personal/empleados/${employee.id}/funciones`, {
        funcionIds: ids,
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addSchedule = async () => {
    if (!employee) return;
    const day = Number(scheduleDay);
    if (day < 0 || day > 6 || !scheduleStart || !scheduleEnd)
      return toast.error("Completa el horario");
    if (scheduleStart === scheduleEnd)
      return toast.error("La hora de inicio y la hora final no pueden ser iguales");
    if (session?.demo) {
      setEmployees((items) =>
        items.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                horarios: [
                  ...item.horarios.filter((schedule) => schedule.diaSemana !== day),
                  {
                    id: Date.now(),
                    diaSemana: day,
                    horaInicio: scheduleStart,
                    horaFin: scheduleEnd,
                  },
                ],
              }
            : item,
        ),
      );
      setScheduleOpen(false);
      return toast.success("Horario agregado");
    }
    try {
      await api.post(`/personal/empleados/${employee.id}/horarios`, {
        diaSemana: day,
        horaInicio: scheduleStart,
        horaFin: scheduleEnd,
      });
      await load();
      setScheduleOpen(false);
      toast.success("Horario actualizado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const editSchedule = (item: Schedule) => {
    setScheduleDay(String(item.diaSemana));
    setScheduleStart(item.horaInicio);
    setScheduleEnd(item.horaFin);
    setScheduleOpen(true);
  };

  const removeSchedule = async (item: Schedule) => {
    if (!employee) return;
    if (session?.demo) {
      setEmployees((items) =>
        items.map((current) =>
          current.id === employee.id
            ? { ...current, horarios: current.horarios.filter((schedule) => schedule.id !== item.id) }
            : current,
        ),
      );
      return toast.success("Horario habitual retirado");
    }
    try {
      await api.post(`/personal/empleados/${employee.id}/horarios/${item.id}/desactivar`, {});
      await load();
      toast.success("Horario habitual retirado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const saveWeek = async () => {
    if (!branchId || !employee) return;
    if (operationalUnits.length && selectedUnitId === "all")
      return toast.error("Selecciona una unidad operativa para guardar esta programación");
    const planned = weekDates.flatMap((dateValue, index) => {
      const row = weekDraft[index];
      if (!row || row.rest) return [];
      const start = new Date(`${dateValue}T${row.start}:00`);
      const endDate = row.end <= row.start ? addDays(dateValue, 1) : dateValue;
      const end = new Date(`${endDate}T${row.end}:00`);
      return [{
        inicioProgramado: start.toISOString(),
        finProgramado: end.toISOString(),
        etiqueta: row.label.trim() || inferShiftLabel(row.start, row.end),
        minutosPausa: row.breakMinutes,
      }];
    });
    if (session?.demo) {
      const startBoundary = new Date(`${weekStart}T00:00:00`);
      const endBoundary = new Date(`${addDays(weekStart, 7)}T00:00:00`);
      setShifts((items) => [
        ...planned.map((item, index) => ({
          id: Date.now() + index,
          ...item,
          estado: "PROGRAMADO",
          empleado: employee,
        })),
        ...items.filter((item) => {
          const start = new Date(item.inicioProgramado);
          return !(item.empleado.id === employee.id && item.estado === "PROGRAMADO" && start >= startBoundary && start < endBoundary);
        }),
      ]);
      return toast.success("Semana actualizada");
    }
    try {
      await api.post("/personal/programacion-semanal", {
        sucursalId: branchId,
        empleadoId: employee.id,
        semanaInicio: new Date(`${weekStart}T00:00:00`).toISOString(),
        unidadOperativaId: selectedUnitId === "all" ? undefined : selectedUnitId,
        turnos: planned,
      });
      await load();
      setWeekDrafts((current) => {
        const next = { ...current };
        delete next[weekKey];
        return next;
      });
      toast.success("Programación semanal guardada");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const cancelShift = async (shift: Shift) => {
    const reason = cancelReason.trim();
    if (!reason) return toast.error("Indica el motivo de cancelación");
    if (session?.demo) {
      setShifts((items) => items.map((item) => item.id === shift.id ? { ...item, estado: "CANCELADO", observaciones: reason } : item));
      setCancelShiftId(null);
      setCancelReason("");
      return toast.success("Turno cancelado");
    }
    try {
      await api.post(`/personal/turnos/${shift.id}/cancelar`, { motivo: reason });
      setCancelShiftId(null);
      setCancelReason("");
      await load();
      toast.success("Turno cancelado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const retireEmployee = async () => {
    if (!employee) return;
    const motivo = retireReason.trim();
    if (!motivo) return toast.error("Indica el motivo del retiro");
    if (session?.demo) {
      setEmployees((items) => items.map((item) => item.id === employee.id ? { ...item, activo: false } : item));
      setRetireOpen(false);
      setRetireReason("");
      setSelected(0);
      return toast.success("Empleado retirado del personal");
    }
    try {
      await api.post(`/personal/empleados/${employee.id}/retirar`, {
        motivo,
        desactivarUsuario: Boolean(employee.usuario && deactivateLinkedUser),
      });
      setRetireOpen(false);
      setRetireReason("");
      setSelected(0);
      await load();
      toast.success("Empleado retirado. Su historial se conserva");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const saveTeamWeek = async () => {
    if (!branchId) return;
    if (operationalUnits.length && selectedUnitId === "all")
      return toast.error("Selecciona Almuerzos, Comidas rápidas u otra unidad antes de guardar");
    const activeEmployees = visibleEmployees;
    if (!activeEmployees.length) return toast.error("No hay empleados activos para programar");
    try {
      if (session?.demo) {
        toast.success("Programación completa actualizada");
        return;
      }
      for (const target of activeEmployees) {
        const draft = teamWeek(target);
        const planned = weekDates.flatMap((dateValue, index) => {
          const row = draft[index];
          if (!row || row.rest) return [];
          const startDate = new Date(`${dateValue}T${row.start}:00`);
          const endDateValue = row.end <= row.start ? addDays(dateValue, 1) : dateValue;
          const endDate = new Date(`${endDateValue}T${row.end}:00`);
          return [{
            inicioProgramado: startDate.toISOString(),
            finProgramado: endDate.toISOString(),
            etiqueta: row.label.trim() || inferShiftLabel(row.start, row.end),
            minutosPausa: row.breakMinutes,
          }];
        });
        await api.post("/personal/programacion-semanal", {
          sucursalId: branchId,
          empleadoId: target.id,
          semanaInicio: new Date(`${weekStart}T00:00:00`).toISOString(),
          unidadOperativaId: selectedUnitId === "all" ? undefined : selectedUnitId,
          turnos: planned,
        });
      }
      await load();
      setWeekDrafts((current) => {
        const next = { ...current };
        activeEmployees.forEach((item) => delete next[`${item.id}:${weekStart}:${unitKey}`]);
        return next;
      });
      toast.success("Programación semanal del equipo guardada");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const printWeek = () => {
    const activeEmployees = visibleEmployees;
    if (!activeEmployees.length) return toast.error("No hay empleados activos para exportar");
    const headers = weekDates
      .map((dateValue) => `<th>${new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "2-digit" })}</th>`)
      .join("");
    const rows = activeEmployees
      .map((item) => {
        const draft = teamWeek(item);
        const cells = weekDates.map((_dateValue, index) => {
          const row = draft[index];
          if (!row || row.rest) return `<td class="rest"><b>LIBRE</b></td>`;
          const overnight = row.end <= row.start;
          return `<td><b>${escapeHtml(row.label || inferShiftLabel(row.start, row.end))}</b><span>${escapeHtml(row.start)}–${escapeHtml(row.end)}${overnight ? " +1" : ""}</span><small>Pausa: ${row.breakMinutes} min</small></td>`;
        }).join("");
        return `<tr><th>${escapeHtml(`${item.nombres} ${item.apellidos}`)}<small>${escapeHtml(item.cargo)}</small></th>${cells}</tr>`;
      })
      .join("");
    const selectedUnitName =
      selectedUnitId === "all"
        ? "Toda la sede"
        : operationalUnits.find((unit) => unit.id === selectedUnitId)?.nombre ?? "Unidad operativa";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Programación semanal SIGR</title><style>@page{size:landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#14252d;margin:0}h1{margin:0 0 4px;font-size:22px}.muted{color:#667;font-size:12px;margin-bottom:14px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px}th,td{border:1px solid #cbd2d6;padding:7px;text-align:center;vertical-align:middle}thead th{background:#d9f0f6;font-size:11px}tbody th{width:160px;text-align:left;background:#f7f6f1}td b{display:block;font-size:11px}td span,td small{display:block;margin-top:3px}.rest{background:#f4f4f4;color:#68747a}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>Programación semanal · ${escapeHtml(selectedUnitName)}</h1><div class="muted">Semana del ${escapeHtml(weekStart)} · ${activeEmployees.length} empleados · SIGR</div><table><thead><tr><th>Empleado</th>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const frame = globalThis.document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    globalThis.document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      return toast.error("No se pudo preparar la impresión");
    }
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1500);
    }, 250);
  };


  const scheduleShift = async () => {
    if (!branchId || !employee) return;
    if (operationalUnits.length && selectedUnitId === "all")
      return toast.error("Selecciona una unidad operativa para programar el turno");
    const start = window.prompt(
      "Inicio del turno (AAAA-MM-DDTHH:mm)",
      `${today}T08:00`,
    );
    const end = window.prompt(
      "Fin del turno (AAAA-MM-DDTHH:mm)",
      `${today}T17:00`,
    );
    if (!start || !end) return;
    if (session?.demo) {
      setShifts((items) => [
        {
          id: Date.now(),
          inicioProgramado: start,
          finProgramado: end,
          estado: "PROGRAMADO",
          empleado: employee,
        },
        ...items,
      ]);
      return toast.success("Turno programado");
    }
    try {
      await api.post("/personal/turnos", {
        sucursalId: branchId,
        empleadoId: employee.id,
        unidadOperativaId: selectedUnitId === "all" ? undefined : selectedUnitId,
        inicioProgramado: start,
        finProgramado: end,
      });
      await load();
      toast.success("Turno programado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const mark = async (shift: Shift, action: "entrada" | "salida") => {
    if (session?.demo) {
      setShifts((items) =>
        items.map((item) =>
          item.id === shift.id
            ? {
                ...item,
                estado: action === "entrada" ? "ABIERTO" : "CERRADO",
                ...(action === "entrada"
                  ? { entradaEn: new Date().toISOString() }
                  : { salidaEn: new Date().toISOString() }),
              }
            : item,
        ),
      );
      return;
    }
    try {
      await api.post(`/personal/turnos/${shift.id}/${action}`, {});
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const incident = async () => {
    if (!employee) return;
    const type = window.prompt("Tipo de novedad", "AUSENCIA");
    const description = window.prompt("Descripción");
    if (!type || !description) return;
    if (session?.demo) {
      setEmployees((items) =>
        items.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                novedades: [
                  {
                    id: Date.now(),
                    tipo: type,
                    descripcion: description,
                    fecha: new Date().toISOString(),
                  },
                  ...item.novedades,
                ],
              }
            : item,
        ),
      );
      return;
    }
    try {
      await api.post("/personal/novedades", {
        empleadoId: employee.id,
        tipo: type,
        descripcion: description,
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const report = async () => {
    if (!branchId) return;
    if (session?.demo)
      return setProductivity(
        employees.map((item, index) => ({
          empleadoId: item.id,
          empleado: `${item.nombres} ${item.apellidos}`,
          cargo: item.cargo,
          horas: 40 - index * 3,
          pedidos: 58 - index * 12,
          ventas: 1850000 - index * 420000,
          pedidosPorHora: 1.45 - index * 0.18,
        })),
      );
    try {
      const response = await api.get<Productivity[]>("/personal/productividad", {
        params: { sucursalId: branchId, desde: from, hasta: to },
      });
      setProductivity(response.data);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <datalist id="shift-labels">
        <option value="AM" />
        <option value="PM" />
        <option value="NOCHE" />
        <option value="ADMINISTRATIVO" />
        <option value="APERTURA" />
        <option value="CIERRE" />
      </datalist>
      <header>
        <p className="eyebrow">Operación del equipo</p>
        <h1 className="page-title">Personal y turnos</h1>
        <p>
          Programación, asistencia y productividad operativa. No incluye nómina
          ni liquidación laboral.
        </p>
      </header>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Operación por perfil</p>
            <h2 className="text-xl font-black">Unidades operativas de la sede</h2>
            <p className="text-sm opacity-70">
              Una sola sucursal puede trabajar como varias operaciones internas, por ejemplo Almuerzos y Comidas rápidas, sin duplicar empleados ni inventario.
            </p>
          </div>
          <button className="secondary h-10 w-auto px-4" onClick={() => setShowUnitManager((value) => !value)}>
            {showUnitManager ? "Cerrar gestión" : "Gestionar unidades"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-full border px-4 py-2 text-sm font-bold ${selectedUnitId === "all" ? "bg-steel text-white" : "bg-white"}`}
            onClick={() => setSelectedUnitId("all")}
          >
            Toda la sede
          </button>
          {operationalUnits.map((unit) => (
            <button
              key={unit.id}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${selectedUnitId === unit.id ? "bg-steel text-white" : "bg-white"}`}
              onClick={() => setSelectedUnitId(unit.id)}
            >
              {unit.nombre}
            </button>
          ))}
        </div>
        {showUnitManager && (
          <div className="rounded-2xl border border-denim/10 bg-screen/20 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
              <input className="input" placeholder="Nombre, ej. Almuerzos" value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} />
              <input className="input" placeholder="Descripción opcional" value={newUnitDescription} onChange={(event) => setNewUnitDescription(event.target.value)} />
              <button className="primary w-auto px-5" onClick={() => void addOperationalUnit()}>Crear unidad</button>
            </div>
            {!!operationalUnits.length && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {operationalUnits.map((unit) => (
                  <div className="flex items-center justify-between rounded-xl border bg-white p-3" key={unit.id}>
                    <div><b>{unit.nombre}</b>{unit.descripcion && <small className="block opacity-60">{unit.descripcion}</small>}</div>
                    <button className="secondary h-9 w-auto px-3" onClick={() => void deactivateOperationalUnit(unit)}>Desactivar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-xl font-black">Nuevo empleado</h2>
          <p className="text-sm opacity-70">
            El usuario del sistema es opcional. Créalo primero en Administración
            si esta persona necesita iniciar sesión en SIGR.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="input"
            placeholder="Código *"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <input
            className="input"
            placeholder="Nombres *"
            value={names}
            onChange={(event) => setNames(event.target.value)}
          />
          <input
            className="input"
            placeholder="Apellidos *"
            value={lastNames}
            onChange={(event) => setLastNames(event.target.value)}
          />
          <input
            className="input"
            placeholder="Documento"
            value={document}
            onChange={(event) => setDocument(event.target.value)}
          />
          <input
            className="input"
            placeholder="Cargo *"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
          <select
            className="input"
            value={userId}
            onChange={(event) => selectUser(event.target.value)}
          >
            <option value="">Sin usuario del sistema</option>
            {availableUsers.map((account) => (
              <option key={account.id} value={account.id}>
                {account.nombres} {account.apellidos} · {account.rol?.nombre ?? "Sin rol"} · {account.email}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={() => void addEmployee()}>
          Crear empleado
        </button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Equipo</h2>
            <button
              className="secondary h-9 w-auto px-3 text-sm"
              onClick={() => setShowInactiveEmployees((value) => !value)}
            >
              {showInactiveEmployees ? "Ocultar retirados" : "Mostrar retirados"}
            </button>
          </div>
          {listedEmployees.map((item) => (
            <button
              key={item.id}
              className={`block w-full rounded-xl border p-3 text-left ${
                selected === item.id
                  ? "border-marigold bg-marigold/10"
                  : "border-denim/10"
              } ${item.activo ? "" : "opacity-60"}`}
              onClick={() => setSelected(item.id)}
            >
              <b>
                {item.nombres} {item.apellidos}
              </b>
              <small className="block">
                {item.codigo} · {item.cargo}{item.activo ? "" : " · RETIRADO"}
              </small>
              <small className="block opacity-70">
                {item.usuario
                  ? `Acceso SIGR: ${item.usuario.email} · ${item.usuario.rol?.nombre ?? "sin rol"}`
                  : "Sin acceso SIGR vinculado"}
              </small>
              {!!item.unidadesOperativas?.length && (
                <small className="mt-1 block font-bold opacity-70">
                  {item.unidadesOperativas.map((entry) => entry.unidadOperativa.nombre).join(" · ")}
                </small>
              )}
            </button>
          ))}
        </section>

        {employee && (
          <section className="card space-y-4">
            <div>
              <p className="eyebrow">Ficha operativa</p>
              <h2 className="text-2xl font-black">
                {employee.nombres} {employee.apellidos}
              </h2>
              <p className="text-sm opacity-70">
                {employee.documento ? `Documento: ${employee.documento} · ` : ""}
                {employee.usuario
                  ? `Usuario: ${employee.usuario.email}`
                  : "Sin usuario del sistema"}
              </p>
            </div>
            {employee.activo ? (
              <div className="rounded-2xl border border-denim/10 bg-screen/20 p-3">
                {!retireOpen ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <b>Estado laboral: Activo</b>
                      <p className="text-sm opacity-60">El retiro conserva turnos, marcaciones, novedades e historial.</p>
                    </div>
                    <button
                      className="secondary h-10 w-auto px-4"
                      onClick={() => {
                        setRetireReason("");
                        setDeactivateLinkedUser(Boolean(employee.usuario?.activo));
                        setRetireOpen(true);
                      }}
                    >
                      Retirar del personal
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <b>Confirmar retiro del personal</b>
                    <textarea
                      className="input min-h-24"
                      placeholder="Motivo: renuncia, terminación de contrato, retiro..."
                      value={retireReason}
                      onChange={(event) => setRetireReason(event.target.value)}
                    />
                    {employee.usuario && (
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={deactivateLinkedUser}
                          onChange={(event) => setDeactivateLinkedUser(event.target.checked)}
                        />
                        Desactivar también el acceso SIGR ({employee.usuario.email})
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button className="primary w-auto px-5" onClick={() => void retireEmployee()}>Confirmar retiro</button>
                      <button className="secondary w-auto px-5" onClick={() => setRetireOpen(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-denim/10 bg-screen/30 p-4">
                <b>Empleado retirado</b>
                <p className="text-sm opacity-70">No entra en nuevos cuadrantes ni turnos. La ficha se conserva para consulta histórica.</p>
                {employee.novedades.find((item) => item.tipo === "RETIRO_PERSONAL") && (
                  <p className="mt-2 text-sm">Motivo: {employee.novedades.find((item) => item.tipo === "RETIRO_PERSONAL")?.descripcion}</p>
                )}
              </div>
            )}
            {!!operationalUnits.length && (
              <div>
                <b>Unidades operativas</b>
                <p className="text-sm opacity-60">La misma persona puede participar en una o varias operaciones de esta sede.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {operationalUnits.map((unit) => {
                    const assigned = (employee.unidadesOperativas ?? []).some((entry) => entry.unidadOperativa.id === unit.id);
                    return (
                      <button
                        key={unit.id}
                        className={`rounded-full border px-3 py-2 text-sm ${assigned ? "bg-marigold/20 border-marigold" : "bg-white"}`}
                        onClick={() => void toggleEmployeeUnit(employee, unit.id)}
                      >
                        {assigned ? "✓ " : ""}{unit.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <b>Funciones</b>
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    className={`rounded-full border px-3 py-2 text-sm ${
                      employee.funciones.some(
                        (item) => item.funcion.id === role.id,
                      )
                        ? "bg-steel text-white"
                        : "bg-white"
                    }`}
                    onClick={() => void assignRole(role.id)}
                  >
                    {role.nombre}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  placeholder="Nueva función"
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
                <button
                  className="secondary w-auto px-4"
                  onClick={() => void addRole()}
                >
                  Agregar
                </button>
              </div>
            </div>
            <div>
              <div className="flex justify-between">
                <b>Horario habitual</b>
                <button
                  className="secondary h-9 w-auto px-3"
                  onClick={() => setScheduleOpen((value) => !value)}
                >
                  {scheduleOpen ? "Cancelar" : "Agregar horario"}
                </button>
              </div>
              {scheduleOpen && (
                <div className="mt-3 rounded-2xl border border-denim/10 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-[.8fr_1fr_1fr_auto] md:items-end">
                    <label className="grid gap-1 text-sm font-bold">
                      Día
                      <select
                        className="input"
                        value={scheduleDay}
                        onChange={(event) => setScheduleDay(event.target.value)}
                      >
                        {days.map((label, index) => (
                          <option key={label} value={index}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-bold">
                      Entrada
                      <select
                        className="input"
                        value={scheduleStart}
                        onChange={(event) => setScheduleStart(event.target.value)}
                      >
                        {timeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-bold">
                      Salida
                      <select
                        className="input"
                        value={scheduleEnd}
                        onChange={(event) => setScheduleEnd(event.target.value)}
                      >
                        {timeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary min-w-40 px-5"
                      onClick={() => void addSchedule()}
                    >
                      Guardar horario
                    </button>
                  </div>
                  <p className="mt-3 text-xs opacity-70">
                    {isOvernightSchedule(scheduleStart, scheduleEnd)
                      ? "Turno nocturno: la salida corresponde al día siguiente."
                      : "La salida corresponde al mismo día."}
                    {employee.horarios.some((item) => item.diaSemana === Number(scheduleDay))
                      ? " Al guardar se reemplazará el horario habitual de ese día."
                      : ""}
                  </p>
                </div>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {employee.horarios.map((item) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-denim/10 bg-white px-3 py-2 text-sm"
                    key={item.id}
                  >
                    <span>
                      <b>{days[item.diaSemana]}</b> · {item.horaInicio}–{item.horaFin}
                      {isOvernightSchedule(item.horaInicio, item.horaFin) && (
                        <span className="ml-2 rounded-full bg-denim/10 px-2 py-1 text-xs font-bold">+1 día</span>
                      )}
                    </span>
                    <span className="flex gap-2">
                      <button className="secondary h-8 w-auto px-3 text-xs" onClick={() => editSchedule(item)}>Editar</button>
                      <button className="secondary h-8 w-auto px-3 text-xs" onClick={() => void removeSchedule(item)}>Quitar</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-denim/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <b>Planificación semanal</b>
                  <p className="text-xs opacity-70">Turnos y descansos rotativos. Guardar reemplaza sólo los turnos programados de esta semana y conserva el historial cancelado.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="secondary h-9 w-auto px-3" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semana anterior</button>
                  <button className="secondary h-9 w-auto px-3" onClick={() => setWeekStart(mondayFor())}>Esta semana</button>
                  <button className="secondary h-9 w-auto px-3" onClick={() => setWeekStart(addDays(weekStart, 7))}>Semana siguiente →</button>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {weekDates.map((dateValue, index) => {
                  const row = weekDraft[index] ?? { start: "08:00", end: "17:00", rest: true, label: "AM", breakMinutes: 0 };
                  return (
                    <div className="grid gap-2 rounded-xl bg-screen/30 p-3 md:grid-cols-[1.1fr_.7fr_1fr_1fr_1fr_.7fr] md:items-center" key={dateValue}>
                      <div><b>{new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long" })}</b><small className="block opacity-60">{dateValue}</small></div>
                      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={row.rest} onChange={(event) => updateWeekRow(index, { ...row, rest: event.target.checked })} /> Descanso</label>
                      <input className="input" list="shift-labels" disabled={row.rest} value={row.label} onChange={(event) => updateWeekRow(index, { ...row, label: event.target.value })} placeholder="Jornada" />
                      <select className="input" disabled={row.rest} value={row.start} onChange={(event) => updateWeekRow(index, { ...row, start: event.target.value })}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                      <select className="input" disabled={row.rest} value={row.end} onChange={(event) => updateWeekRow(index, { ...row, end: event.target.value })}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                      <select className="input" disabled={row.rest} value={row.breakMinutes} onChange={(event) => updateWeekRow(index, { ...row, breakMinutes: Number(event.target.value) })}>{breakOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} min pausa` : "Sin pausa"}</option>)}</select>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="primary w-auto px-5" onClick={() => void saveWeek()}>Guardar semana</button>
                <button className="secondary w-auto px-5" onClick={printWeek}>Exportar / imprimir semana</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="primary" onClick={() => void scheduleShift()}>
                Programar turno
              </button>
              <button className="secondary" onClick={() => void incident()}>
                Registrar novedad
              </button>
            </div>
            {employee.novedades.map((item) => (
              <p className="rounded-xl bg-orange-50 p-3 text-sm" key={item.id}>
                <b>{item.tipo}</b> · {item.descripcion}
              </p>
            ))}
          </section>
        )}
      </div>

      <section className="card space-y-4 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Cuadrante de personal</p>
            <h2 className="text-xl font-black">Programación semanal del equipo</h2>
            <p className="text-sm opacity-70">
              {selectedUnitId === "all"
                ? "Vista consolidada de toda la sede. Selecciona una unidad operativa para editar y guardar su cuadrante."
                : `Cuadrante de ${operationalUnits.find((unit) => unit.id === selectedUnitId)?.nombre ?? "la unidad seleccionada"}. Un empleado puede pertenecer a más de una unidad.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="secondary h-10 w-auto px-3" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Anterior</button>
            <button className="secondary h-10 w-auto px-3" onClick={() => setWeekStart(mondayFor())}>Esta semana</button>
            <button className="secondary h-10 w-auto px-3" onClick={() => setWeekStart(addDays(weekStart, 7))}>Siguiente →</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-denim/10">
          <table className="min-w-[1100px] w-full border-collapse text-sm">
            <thead className="bg-screen/40">
              <tr>
                <th className="sticky left-0 z-10 bg-screen p-3 text-left">Empleado</th>
                {weekDates.map((dateValue) => <th className="p-3 text-center" key={dateValue}>{new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit" })}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((item) => {
                const draft = teamWeek(item);
                return (
                  <tr className="border-t border-denim/10" key={item.id}>
                    <th className="sticky left-0 z-10 bg-white p-3 text-left"><b>{item.nombres} {item.apellidos}</b><small className="block opacity-60">{item.cargo}</small></th>
                    {weekDates.map((dateValue, index) => {
                      const row = draft[index];
                      return (
                        <td className="p-2 align-top" key={dateValue}>
                          <button className={`min-h-20 w-full rounded-xl border px-2 py-2 text-left ${row.rest ? "border-denim/10 bg-screen/30" : "border-marigold/50 bg-marigold/10"}`} onClick={() => {
                              if (operationalUnits.length && selectedUnitId === "all")
                                return toast.error("Selecciona una unidad operativa para editar el cuadrante");
                              setEditingTeamCell({ employeeId: item.id, index });
                            }}>
                            <b className="block">{row.rest ? "LIBRE" : (row.label || inferShiftLabel(row.start, row.end))}</b>
                            {!row.rest && <><small className="block">{row.start}–{row.end}{row.end <= row.start ? " +1" : ""}</small><small className="block opacity-60">Pausa {row.breakMinutes} min</small></>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editingTeamCell && (() => {
          const target = employees.find((item) => item.id === editingTeamCell.employeeId);
          if (!target) return null;
          const row = teamWeek(target)[editingTeamCell.index];
          const dateValue = weekDates[editingTeamCell.index];
          return (
            <div className="rounded-2xl border border-marigold/40 bg-marigold/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><b>{target.nombres} {target.apellidos}</b><small className="block opacity-60">{new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long" })}</small></div><button className="secondary h-9 w-auto px-3" onClick={() => setEditingTeamCell(null)}>Cerrar</button></div>
              <div className="grid gap-3 md:grid-cols-[.7fr_1fr_1fr_1fr_.8fr] md:items-end">
                <label className="flex h-12 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-bold"><input type="checkbox" checked={row.rest} onChange={(event) => updateTeamRow(target, editingTeamCell.index, { ...row, rest: event.target.checked })} /> Descanso</label>
                <label className="text-sm font-bold">Jornada<input className="input mt-1" list="shift-labels" disabled={row.rest} value={row.label} onChange={(event) => updateTeamRow(target, editingTeamCell.index, { ...row, label: event.target.value })} /></label>
                <label className="text-sm font-bold">Inicio<select className="input mt-1" disabled={row.rest} value={row.start} onChange={(event) => updateTeamRow(target, editingTeamCell.index, { ...row, start: event.target.value })}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="text-sm font-bold">Salida<select className="input mt-1" disabled={row.rest} value={row.end} onChange={(event) => updateTeamRow(target, editingTeamCell.index, { ...row, end: event.target.value })}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="text-sm font-bold">Pausa<select className="input mt-1" disabled={row.rest} value={row.breakMinutes} onChange={(event) => updateTeamRow(target, editingTeamCell.index, { ...row, breakMinutes: Number(event.target.value) })}>{breakOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} min` : "Sin pausa"}</option>)}</select></label>
              </div>
            </div>
          );
        })()}
        <div className="flex flex-wrap gap-2">
          <button className="primary w-auto px-5" onClick={() => void saveTeamWeek()}>{selectedUnitId === "all" && operationalUnits.length ? "Selecciona una unidad para guardar" : "Guardar programación de la unidad"}</button>
          <button className="secondary w-auto px-5" onClick={printWeek}>Exportar / imprimir semana</button>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-xl font-black">Turnos y marcaciones</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Empleado</th>
              <th>Programado</th>
              <th>Marcación</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shifts
            .filter((shift) => selectedUnitId === "all" || (shift.unidadOperativa?.id ?? shift.unidadOperativaId) === selectedUnitId)
            .map((shift) => (
              <tr className="border-t" key={shift.id}>
                <td className="p-3 font-bold">
                  {shift.empleado.nombres} {shift.empleado.apellidos}
                </td>
                <td>
                  {shift.unidadOperativa && <small className="mb-1 block font-bold text-marigold">{shift.unidadOperativa.nombre}</small>}
                  {shift.etiqueta && <b className="block">{shift.etiqueta}</b>}
                  {new Date(shift.inicioProgramado).toLocaleString("es-CO")}
                  <small className="block">a {new Date(shift.finProgramado).toLocaleString("es-CO")}</small>
                  {!!shift.minutosPausa && <small className="block opacity-60">Pausa: {shift.minutosPausa} min</small>}
                </td>
                <td>
                  {shift.entradaEn
                    ? `Entrada ${new Date(shift.entradaEn).toLocaleTimeString("es-CO")}`
                    : "Sin entrada"}
                  {shift.salidaEn && (
                    <small className="block">
                      Salida {new Date(shift.salidaEn).toLocaleTimeString("es-CO")}
                    </small>
                  )}
                </td>
                <td>{shift.estado}</td>
                <td className="min-w-56">
                  {shift.estado === "PROGRAMADO" ? (
                    cancelShiftId === shift.id ? (
                      <div className="my-2 grid gap-2">
                        <input className="input h-10" placeholder="Motivo de cancelación" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
                        <div className="flex gap-2">
                          <button className="secondary h-9 w-auto px-3" onClick={() => void cancelShift(shift)}>Confirmar</button>
                          <button className="secondary h-9 w-auto px-3" onClick={() => { setCancelShiftId(null); setCancelReason(""); }}>Volver</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button className="secondary my-2 h-10 w-auto px-3" onClick={() => void mark(shift, "entrada")}>Marcar entrada</button>
                        <button className="secondary my-2 h-10 w-auto px-3" onClick={() => setCancelShiftId(shift.id)}>Cancelar turno</button>
                      </div>
                    )
                  ) : shift.estado === "ABIERTO" ? (
                    <button className="secondary my-2 h-10 w-auto px-3" onClick={() => void mark(shift, "salida")}>Cerrar turno</button>
                  ) : shift.observaciones ? (
                    <small className="block opacity-70">{shift.observaciones}</small>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-black">Productividad operativa</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-auto"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <input
            className="input w-auto"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <button className="primary w-auto px-5" onClick={() => void report()}>
            Consultar
          </button>
        </div>
        {productivity.map((row) => (
          <div
            className="grid gap-2 border-t pt-3 sm:grid-cols-6"
            key={row.empleadoId}
          >
            <b>{row.empleado}</b>
            <span>{row.cargo}</span>
            <span>{row.horas.toFixed(1)} h</span>
            <span>{row.pedidos} pedidos</span>
            <span>{money.format(Number(row.ventas))}</span>
            <span>{row.pedidosPorHora.toFixed(2)} ped/h</span>
          </div>
        ))}
      </section>
    </div>
  );
}
