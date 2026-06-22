import { describe, expect, it } from 'vitest';
import { formatJsonPreviewValue } from './jsonPreview';

describe('formatJsonPreviewValue', () => {
  it('保留空对象不展示的既有行为', () => {
    expect(formatJsonPreviewValue({})).toBeNull();
  });

  it('能格式化 null、数组和非对象 JSON 值', () => {
    expect(formatJsonPreviewValue(null)).toBe('null');
    expect(formatJsonPreviewValue(['db', 'cache'])).toBe(JSON.stringify(['db', 'cache'], null, 2));
    expect(formatJsonPreviewValue('ok')).toBe('"ok"');
  });

  it('长 JSON 仍返回完整可滚动内容', () => {
    const longValue = { message: 'x'.repeat(300), nested: { count: 2 } };

    expect(formatJsonPreviewValue(longValue)).toBe(JSON.stringify(longValue, null, 2));
  });
});
