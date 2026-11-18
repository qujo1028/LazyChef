import { describe, expect, it } from 'vitest';

import { createAfterClose } from './after-close';

describe('createAfterClose', () => {
  it('sends right away when the sheet is closed', () => {
    const sent: string[] = [];
    const gate = createAfterClose<string>((m) => sent.push(m));
    gate.send('a');
    expect(sent).toEqual(['a']);
  });

  it('holds messages while open and sends the latest once closed', () => {
    const sent: string[] = [];
    const gate = createAfterClose<string>((m) => sent.push(m));
    gate.opened();
    gate.send('a');
    gate.send('b');
    expect(sent).toEqual([]);
    gate.closed();
    expect(sent).toEqual(['b']);
    gate.send('c');
    expect(sent).toEqual(['b', 'c']);
  });

  it('waits again after reopening', () => {
    const sent: string[] = [];
    const gate = createAfterClose<string>((m) => sent.push(m));
    gate.opened();
    gate.closed();
    gate.opened();
    gate.send('x');
    expect(sent).toEqual([]);
  });
});
