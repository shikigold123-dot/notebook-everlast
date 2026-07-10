import * as XLSX from "xlsx";
import { slugifyFilename } from "./pdf";

/**
 * Baut eine Excel-Arbeitsmappe aus einer Datentabelle (Spaltenköpfe + Zeilen).
 * Getrennt von der Download-Funktion, damit die Struktur testbar bleibt.
 */
export function buildDataTableWorkbook(
  columns: string[],
  rows: string[][]
): XLSX.WorkBook {
  const aoa = [columns, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // Spaltenbreiten grob am längsten Zellinhalt ausrichten (min 10, max 60 Zeichen).
  sheet["!cols"] = columns.map((_, columnIndex) => {
    const longest = aoa.reduce((max, row) => {
      const cell = row[columnIndex] ?? "";
      return Math.max(max, String(cell).length);
    }, 0);
    return { wch: Math.min(60, Math.max(10, longest + 2)) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Daten");
  return workbook;
}

export function downloadDataTableXlsx(
  title: string,
  columns: string[],
  rows: string[][]
) {
  const workbook = buildDataTableWorkbook(columns, rows);
  const filename = `${slugifyFilename(title, "datentabelle")}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
