import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

describe('global trace waterfall styles', () => {
  it('在窄平板宽度提前切换 trace span 为单列布局', () => {
    const traceBreakpoint = sliceMediaBlock('@media (max-width: 720px)', '@media (max-width: 560px)');
    const mobileBreakpoint = sliceMediaBlock('@media (max-width: 560px)');

    expect(traceBreakpoint).toContain('.trace-span-content');
    expect(traceBreakpoint).toContain('grid-template-columns: 1fr');
    expect(traceBreakpoint).toContain('.trace-waterfall-heading');
    expect(mobileBreakpoint).not.toContain('.trace-span-content');
  });
});

function sliceMediaBlock(startMarker: string, endMarker?: string) {
  const start = globalCss.indexOf(startMarker);
  const end = endMarker ? globalCss.indexOf(endMarker, start + startMarker.length) : globalCss.length;

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return globalCss.slice(start, end);
}
