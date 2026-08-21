import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { apiFailure } from "./api";
function failure(status?: number, message?: string, requestId?: string) {
  return new AxiosError("request failed", "ERR_BAD_RESPONSE", undefined, undefined, status ? { data: { message }, status, statusText: "error", headers: new AxiosHeaders(requestId ? { "x-request-id": requestId } : {}), config: { headers: new AxiosHeaders() } } : undefined);
}
describe("api failures", () => {
  it("classifies an expired session", () => { expect(apiFailure(failure(401)).kind).toBe("unauthorized"); });
  it("preserves request correlation", () => { expect(apiFailure(failure(500, undefined, "req-sigr-21"))).toMatchObject({ kind: "unavailable", requestId: "req-sigr-21" }); });
  it("uses safe validation messages", () => { expect(apiFailure(failure(400, "El campo es obligatorio")).message).toBe("El campo es obligatorio"); });
});
