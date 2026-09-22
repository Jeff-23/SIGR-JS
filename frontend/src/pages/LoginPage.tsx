import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import type { Session } from "../types";
import { Brand } from "../components/Brand";
import { frontendConfig } from "../lib/config";

export function LoginPage() {
  const setSession = useApp((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    if (!frontendConfig.apiConfigured) {
      setError("El servicio de acceso no está configurado en este entorno.");
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.post("/auth/login", { email, password });
      const context = data.sesion ?? data.usuario;
      const session: Session = {
        token: data.token,
        createdAt: new Date().toISOString(),
        user: {
          id: context.id,
          nombres: context.nombres ?? "Usuario",
          email: context.email,
          rol: context.rol ?? "USUARIO",
          restauranteId: context.restauranteId ?? null,
          sucursalId: context.sucursalId ?? null,
          permisos: context.permisos ?? [],
          capacidades: context.capacidades ?? [],
          restauranteNombre: context.restauranteNombre,
          sucursalNombre: context.sucursalNombre,
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
    <main className="grid min-h-screen bg-white text-black lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-black p-14 text-white lg:flex lg:flex-col">
        <Brand prominent />
        <div className="my-auto max-w-2xl">
          <h1 className="text-6xl font-black leading-[.98]">
            Trabaja inteligente.
            <br />
            Trabaja mejor.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">
            Salón, cocina, bar y caja comparten el mismo ritmo, incluso durante
            una caída de internet.
          </p>
        </div>
        <p className="text-sm text-white/45">
          © 2026 SIGR. Todos los derechos reservados.
        </p>
      </section>

      <section className="flex items-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-12 text-black lg:hidden">
            <Brand prominent />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-black/45">
            Bienvenido
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-black">
            Inicia tu turno
          </h2>
          <p className="mt-3 text-black/55">
            Usa las credenciales asignadas por tu restaurante.
          </p>

          <form className="mt-9 space-y-5" onSubmit={submit}>
            <label className="block text-sm font-bold text-black">
              Correo
              <div className="relative mt-2">
                <Mail
                  className="absolute left-4 top-4 text-black/35"
                  size={19}
                />
                <input
                  className="h-14 w-full rounded-2xl border border-black/15 bg-white px-4 pl-12 text-black outline-none transition placeholder:text-black/35 focus:border-black focus:ring-4 focus:ring-black/10"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@restaurante.com"
                  required
                />
              </div>
            </label>

            <label className="block text-sm font-bold text-black">
              Contraseña
              <div className="relative mt-2">
                <LockKeyhole
                  className="absolute left-4 top-4 text-black/35"
                  size={19}
                />
                <input
                  className="h-14 w-full rounded-2xl border border-black/15 bg-white px-12 text-black outline-none transition placeholder:text-black/35 focus:border-black focus:ring-4 focus:ring-black/10"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-4 top-3.5 text-black/40 transition hover:text-black"
                  aria-label="Mostrar contraseña"
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-xl border border-black/10 bg-black/[.035] p-3 text-sm text-black/70">
                {error}
              </p>
            )}

            <button
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 font-extrabold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={loading}
            >
              {loading ? (
                "Ingresando…"
              ) : (
                <>
                  Ingresar <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
