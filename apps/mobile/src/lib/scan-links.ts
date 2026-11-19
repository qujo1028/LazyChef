// Pure: the link from a scanned line in the add-food box to its barcode, so a renamed item is
// remembered under its new name. Ported from the web's bulk-add-form.tsx.
import { barcodeMemories, type ScanPackage } from '@lazychef/core/barcodes/memory';
import type { BarcodeMemory } from '@lazychef/core/barcodes/types';
import { parseLine } from '@lazychef/core/ingredients/parse-line';
import { draftToItem, type ReviewDraft } from '@lazychef/core/pantry/review';

import type { ScannedLine } from './scan-rows';

export type ScanLinks = {
  /** parseLine's `raw` for a scanned line -> its barcode. */
  byRaw: Map<string, string>;
  /** Each code's package size, as the scan found it. */
  packages: Map<string, ScanPackage>;
};

export function emptyScanLinks(): ScanLinks {
  return { byRaw: new Map(), packages: new Map() };
}

/** Records the scans in `links` (mutating) and returns the text to put in the box. */
export function addScansToText(text: string, lines: readonly ScannedLine[], links: ScanLinks): string {
  for (const scan of lines) {
    const raw = parseLine(scan.line)?.raw;
    if (raw) links.byRaw.set(raw, scan.code);
    links.packages.set(scan.code, { quantity: scan.quantity, unit: scan.unit });
  }
  return [text.trimEnd(), ...lines.map((scan) => scan.line)].filter(Boolean).join('\n');
}

/** Drafts from a preview (`raws[i]` is item i's raw line), with scanned lines keeping their barcode. */
export function linkDrafts(drafts: ReviewDraft[], raws: readonly string[], links: ScanLinks): ReviewDraft[] {
  return drafts.map((draft, i) => {
    const barcode = links.byRaw.get(raws[i]);
    return barcode ? { ...draft, barcode } : draft;
  });
}

/** What to remember for the scanned drafts that are being added. */
export function memoriesForAdd(drafts: readonly ReviewDraft[], links: ScanLinks): BarcodeMemory[] {
  const scanned = drafts.flatMap((draft) => {
    const item = draft.barcode ? draftToItem(draft) : null;
    return item && draft.barcode
      ? [{ code: draft.barcode, name: item.name, quantity: item.quantity, unit: item.unit }]
      : [];
  });
  return barcodeMemories(scanned, links.packages);
}
