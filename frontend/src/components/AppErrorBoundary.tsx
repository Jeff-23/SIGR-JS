import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./AsyncState";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error("SIGR UI error", error, info); }
  render() { return this.state.failed ? <main className="grid min-h-screen place-items-center bg-[#f4f2ec] p-6"><ErrorState title="La interfaz encontró un problema" detail="Tus datos no fueron modificados. Recarga la aplicación para continuar." retry={() => window.location.reload()}/></main> : this.props.children; }
}
