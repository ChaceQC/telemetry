import { describe, expect, it } from 'vitest';
import { summarizeEventPayload } from './eventTimeline';

describe('event timeline payload summary', () => {
  it('空 payload 返回明确摘要', () => {
    expect(summarizeEventPayload({})).toBe('payload 为空');
  });

  it('摘要展示前几个字段并压缩复杂值', () => {
    expect(
      summarizeEventPayload({
        deployment: 'checkout',
        duration_ms: 2300,
        ok: true,
        tags: ['web', 'prod'],
        actor: { id: 'u-1' }
      })
    ).toBe('deployment: checkout / duration_ms: 2300 / ok: true / tags: [2 项] / +1 项');
  });

  it('长摘要会截断到稳定长度', () => {
    const summary = summarizeEventPayload({
      message: 'x'.repeat(180)
    });

    expect(summary).toHaveLength(140);
    expect(summary.endsWith('...')).toBe(true);
  });
});
