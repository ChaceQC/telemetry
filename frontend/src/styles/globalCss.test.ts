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

  it('服务拓扑布局在窄屏切换为单列并允许标题换行', () => {
    const tabletBreakpoint = sliceMediaBlock('@media (max-width: 960px)', '@media (max-width: 720px)');
    const mobileBreakpoint = sliceMediaBlock('@media (max-width: 560px)');

    expect(tabletBreakpoint).toContain('.topology-grid');
    expect(tabletBreakpoint).toContain('grid-template-columns: 1fr');
    expect(mobileBreakpoint).toContain('.topology-panel-heading');
    expect(mobileBreakpoint).toContain('.topology-node-heading');
    expect(mobileBreakpoint).toContain('.topology-edge-route');
    expect(mobileBreakpoint).toContain('flex-direction: column');
  });

  it('告警规则工作台在窄屏切换为单列布局', () => {
    const tabletBreakpoint = sliceMediaBlock('@media (max-width: 960px)', '@media (max-width: 720px)');
    const mobileBreakpoint = sliceMediaBlock('@media (max-width: 560px)');

    expect(tabletBreakpoint).toContain('.alerts-summary');
    expect(tabletBreakpoint).toContain('.alerts-grid');
    expect(tabletBreakpoint).toContain('.alerts-filter-grid');
    expect(tabletBreakpoint).toContain('grid-template-columns: 1fr');
    expect(mobileBreakpoint).toContain('.alerts-rule-list li');
    expect(mobileBreakpoint).toContain('grid-template-columns: minmax(0, 1fr)');
  });
});

function sliceMediaBlock(startMarker: string, endMarker?: string) {
  const start = globalCss.indexOf(startMarker);
  const end = endMarker ? globalCss.indexOf(endMarker, start + startMarker.length) : globalCss.length;

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return globalCss.slice(start, end);
}
