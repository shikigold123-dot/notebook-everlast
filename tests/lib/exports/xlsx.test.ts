import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildDataTableWorkbook } from "@/lib/exports/xlsx";

describe("buildDataTableWorkbook", () => {
  it("legt ein Arbeitsblatt mit Kopfzeile und Datenzeilen an", () => {
    const workbook = buildDataTableWorkbook(
      ["Name", "Wert"],
      [
        ["Alpha", "1"],
        ["Beta", "2"],
      ]
    );

    expect(workbook.SheetNames).toEqual(["Daten"]);
    const sheet = workbook.Sheets["Daten"];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    expect(rows).toEqual([
      { Name: "Alpha", Wert: "1" },
      { Name: "Beta", Wert: "2" },
    ]);
  });

  it("setzt Spaltenbreiten passend zum längsten Inhalt", () => {
    const workbook = buildDataTableWorkbook(
      ["Kurz", "Spalte"],
      [["A", "Ein deutlich längerer Zellinhalt zum Testen"]]
    );
    const cols = workbook.Sheets["Daten"]["!cols"];
    expect(cols).toBeDefined();
    expect(cols?.[1]?.wch).toBeGreaterThan(cols?.[0]?.wch ?? 0);
  });

  it("kommt mit leerer Tabelle zurecht", () => {
    const workbook = buildDataTableWorkbook([], []);
    expect(workbook.SheetNames).toEqual(["Daten"]);
  });
});
