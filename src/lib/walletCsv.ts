// src/lib/walletCsv.ts
//
// "Download" on the Transactions screen: the list as it is currently filtered, as a CSV that opens cleanly in Excel /
// Sheets, handed to the system share / save sheet. Text columns are guarded against spreadsheet formula injection
// (a reference or label starting with = + - @ would otherwise be evaluated as a formula when the file is opened).
import * as LegacyFs from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { statusMeta, txnMeta, type Txn } from "./walletTxn";

function textCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function buildTransactionsCsv(rows: Txn[]): string {
  const header = ["Date", "Time", "Category", "Amount (USD)", "Status", "Balance after (USD)", "Reference"];
  const lines = rows.map((t) => {
    const d = new Date(t.created_at);
    return [
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      textCell(txnMeta(t.type).label),
      Number(t.amount).toFixed(2),
      textCell(statusMeta(t.status).label),
      t.balance_after === null || t.balance_after === undefined ? "" : Number(t.balance_after).toFixed(2),
      textCell(t.reference ?? ""),
    ].join(",");
  });
  // BOM so Excel reads it as UTF-8.
  return "\uFEFF" + [header.join(","), ...lines].join("\r\n");
}

const EXPORT_DIR = "wallet-exports/";

/** Writes the CSV to the cache folder and opens the share / save sheet. Throws if the device can't share files. */
export async function shareCsv(filename: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("This device can't save files from Akọ.");
  const dir = `${LegacyFs.cacheDirectory}${EXPORT_DIR}`;
  await LegacyFs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined); // already exists
  const uri = `${dir}${filename}`;
  await LegacyFs.writeAsStringAsync(uri, csv, { encoding: LegacyFs.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: "text/csv",
    dialogTitle: filename,
    UTI: "public.comma-separated-values-text",
  });
}
