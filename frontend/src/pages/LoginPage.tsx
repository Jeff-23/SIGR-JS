import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  WifiOff,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import type { Session } from "../types";
import { Brand } from "../components/Brand";

export function LoginPage() {
  const setSession = useApp((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demo = () =>
    setSession({
      token: "demo-local",
      demo: true,
      user: {
        id: 1,
        nombres: "Mariana",
        email: "admin@elmono.demo",
        rol: "ADMIN",
        restauranteId: 1,
        sucursalId: null,
        permisos: [
          "PEDIDOS_CREAR",
          "MESAS_VER",
          "COMANDAS_VER",
          "COMANDAS_ACTUALIZAR_ESTADO",
          "CAJA_VER",
          "REPORTES_VER",
          "CONFIGURACION_VER",
        ],
        capacidades: ["MESAS", "COMANDAS", "INVENTARIO", "FACTURACION"],
      },
    });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      const context = data.sesion ?? data.usuario;
      const session: Session = {
        token: data.token,
        user: {
          id: context.id,
          nombres: context.nombres ?? "Usuario",
          email: context.email,
          rol: context.rol ?? "USUARIO",
          restauranteId: context.restauranteId ?? null,
          sucursalId: context.sucursalId ?? null,
          permisos: context.permisos ?? [],
          capacidades: context.capacidades ?? [],
        },
      };
      setSession(session);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="grid min-h-screen bg-[#f7f5ef] lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-steel p-14 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border-[70px] border-marigold/10" />
        <Brand />
        <div className="my-auto max-w-2xl">
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60">
            Una operación que no se detiene
          </span>
          <h1 className="mt-8 text-6xl font-black leading-[.98]">
            Tu restaurante conectado.
            <br />
            <span className="text-marigold">Tu equipo enfocado.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            Salón, cocina, bar y caja comparten el mismo ritmo, incluso durante
            una caída de internet.
          </p>
        </div>
        <p className="text-sm text-white/35">
          SIGR · Sistema Inteligente de Gestión para Restaurantes
        </p>
      </section>
      <section className="flex items-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-denim/45">
            Bienvenido
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">
            Inicia tu turno
          </h2>
          <p className="mt-3 text-denim/55">
            Usa las credenciales asignadas por tu restaurante.
          </p>
          <form className="mt-9 space-y-5" onSubmit={submit}>
            <label className="block text-sm font-bold">
              Correo
              <div className="relative mt-2">
                <Mail
                  className="absolute left-4 top-4 text-denim/35"
                  size={19}
                />
                <input
                  className="input pl-12"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@restaurante.com"
                  required
                />
              </div>
            </label>
            <label className="block text-sm font-bold">
              Contraseña
              <div className="relative mt-2">
                <LockKeyhole
                  className="absolute left-4 top-4 text-denim/35"
                  size={19}
                />
                <input
                  className="input px-12"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-4 top-3.5 text-denim/40"
                  aria-label="Mostrar contraseña"
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button className="primary" disabled={loading}>
              {loading ? (
                "Ingresando…"
              ) : (
                <>
                  Ingresar <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="my-7 flex items-center gap-3 text-xs text-denim/35">
            <span className="h-px flex-1 bg-denim/10" />O EXPLORA EL PROTOTIPO
            <span className="h-px flex-1 bg-denim/10" />
          </div>
          <button onClick={demo} className="secondary">
            <WifiOff size={18} /> Entrar al Restaurante El Mono
          </button>
          <p className="mt-5 text-center text-xs text-denim/40">
            El modo demostración no modifica datos reales.
          </p>
        </div>
      </section>
    </main>
  );
}
