// The scan list's state: one row per scan, each looked up once per code while the sheet is open.
// Ported from the web's use-barcode-lookups.ts. Pure row logic is in lib/scan-rows.ts.
import { normalizeBarcode } from '@lazychef/core/barcodes/codes';
import { useCallback, useRef, useState } from 'react';

import {
  addLooking,
  nameMissing,
  removeRow,
  replaceRow,
  rowFromAnswer,
  type LookupAnswer,
  type ScanRow,
} from '@/lib/scan-rows';

import { lookupBarcode } from './lookup';

export const BAD_CODE_MESSAGE = "That doesn't look like a product barcode. Check the numbers.";

export function useScanRows(householdId: string | null) {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const nextKey = useRef(0);
  const answers = useRef(new Map<string, Promise<LookupAnswer>>());

  const lookup = useCallback(
    async (key: number, code: string) => {
      if (!householdId) {
        setRows((current) => replaceRow(current, rowFromAnswer(key, code, { error: "We couldn't find your household." })));
        return;
      }
      let answer = answers.current.get(code);
      if (!answer) {
        answer = lookupBarcode(householdId, code).catch(
          (): LookupAnswer => ({ error: "Couldn't look that up right now. Type it in instead." }),
        );
        answers.current.set(code, answer);
      }
      const result = await answer;
      if ('error' in result) answers.current.delete(code); // try again next time
      setRows((current) => (current.some((r) => r.key === key) ? replaceRow(current, rowFromAnswer(key, code, result)) : current));
    },
    [householdId],
  );

  /** Adds a row for a raw scan or typed code and looks it up. Returns a message for a bad code. */
  const scan = useCallback(
    (raw: string): string | null => {
      const code = normalizeBarcode(raw);
      if (!code) return BAD_CODE_MESSAGE;
      const key = (nextKey.current += 1);
      setRows((current) => addLooking(current, key, code));
      void lookup(key, code);
      return null;
    },
    [lookup],
  );

  const retry = useCallback(
    (key: number, code: string) => {
      setRows((current) => replaceRow(current, { key, code, status: 'looking' }));
      void lookup(key, code);
    },
    [lookup],
  );

  /** A code the database didn't know, named by hand. */
  const name = useCallback((key: number, code: string, typed: string) => {
    const row = nameMissing(key, code, typed);
    if (row) setRows((current) => replaceRow(current, row));
  }, []);

  const remove = useCallback((key: number) => setRows((current) => removeRow(current, key)), []);
  const clear = useCallback(() => setRows([]), []);

  return { rows, scan, retry, name, remove, clear };
}
