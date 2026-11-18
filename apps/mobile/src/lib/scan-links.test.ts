import type { ReviewDraft } from '@lazychef/core/pantry/review';
import { describe, expect, it } from 'vitest';

import { addScansToText, emptyScanLinks, linkDrafts, memoriesForAdd } from './scan-links';

const draft = (over: Partial<ReviewDraft>): ReviewDraft => ({
  key: 'k',
  name: 'eggs',
  quantity: '24',
  unit: 'count',
  category: 'dairy',
  suggestedCategory: 'dairy',
  categorySource: 'catalog',
  expiresOn: '',
  isStaple: false,
  ingredientId: null,
  resolvedName: 'eggs',
  ...over,
});

describe('scan links', () => {
  it('adds scanned lines to the text and links their codes', () => {
    const links = emptyScanLinks();
    const text = addScansToText('milk\n', [{ code: '111', line: '24 eggs', quantity: 12, unit: 'count' }], links);
    expect(text).toBe('milk\n24 eggs');
    expect([...links.byRaw.values()]).toEqual(['111']);
    expect(links.packages.get('111')).toEqual({ quantity: 12, unit: 'count' });
  });

  it('links drafts by raw line and remembers one package under the final name', () => {
    const links = emptyScanLinks();
    addScansToText('', [{ code: '111', line: '24 eggs', quantity: 12, unit: 'count' }], links);
    const [raw] = [...links.byRaw.keys()];
    const drafts = linkDrafts([draft({}), draft({ key: 'j', name: 'butter' })], [raw, 'butter'], links);
    expect(drafts[0].barcode).toBe('111');
    expect(drafts[1].barcode).toBeUndefined();
    const renamed = [{ ...drafts[0], name: 'Large Eggs' }];
    expect(memoriesForAdd(renamed, links)).toEqual([{ code: '111', name: 'large eggs', quantity: 12, unit: 'count' }]);
  });

  it('remembers nothing when no draft was scanned', () => {
    expect(memoriesForAdd([draft({})], emptyScanLinks())).toEqual([]);
  });
});
