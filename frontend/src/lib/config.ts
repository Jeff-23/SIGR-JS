export type FrontendConfig = { apiUrl: string; apiConfigured: boolean; environment: "development" | "production" | "test" };
export function resolveConfig(values: { apiUrl?: string; production?: boolean; test?: boolean }): FrontendConfig {
  const configured = values.apiUrl?.trim().replace(/\/$/, "") ?? "";
  const environment = values.test ? "test" : values.production ? "production" : "development";
  return { apiUrl: configured || (environment === "development" || environment === "test" ? "http://localhost:3000" : ""), apiConfigured: Boolean(configured) || environment !== "production", environment };
}
export const frontendConfig = resolveConfig({ apiUrl: import.meta.env.VITE_API_URL, production: import.meta.env.PROD, test: import.meta.env.MODE === "test" });
