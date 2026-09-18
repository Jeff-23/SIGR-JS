// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  documentPrinterSelectionStorageKey,
  readDocumentPrinterSelection,
  saveDocumentPrinterSelection,
} from "./print-agent";

describe("selección local de impresora por documento", () => {
  beforeEach(() => window.localStorage.clear());

  it("aísla la precuenta por sucursal", () => {
    saveDocumentPrinterSelection(10, "preaccount", "Caja 80mm");
    saveDocumentPrinterSelection(11, "preaccount", "Caja sede 2");

    expect(readDocumentPrinterSelection(10, "preaccount")).toBe("Caja 80mm");
    expect(readDocumentPrinterSelection(11, "preaccount")).toBe("Caja sede 2");
    expect(documentPrinterSelectionStorageKey(10, "preaccount")).toContain(
      "branch:10",
    );
  });

  it("elimina la preferencia cuando se vuelve a impresión del navegador", () => {
    saveDocumentPrinterSelection(10, "preaccount", "Caja 80mm");
    saveDocumentPrinterSelection(10, "preaccount", "   ");

    expect(readDocumentPrinterSelection(10, "preaccount")).toBe("");
  });
});
