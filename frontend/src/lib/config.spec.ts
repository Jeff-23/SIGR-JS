import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";
describe("frontend config", () => {
  it("allows localhost only outside production", () => { expect(resolveConfig({}).apiUrl).toBe("http://localhost:3000"); });
  it("does not silently point production to localhost", () => { expect(resolveConfig({ production: true })).toEqual({ apiUrl: "", apiConfigured: false, environment: "production" }); });
  it("normalizes the configured API URL", () => { expect(resolveConfig({ production: true, apiUrl: "https://api.sigr.test/" }).apiUrl).toBe("https://api.sigr.test"); });
});
