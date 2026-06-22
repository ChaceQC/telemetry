const maxPayloadSummaryLength = 140;
const maxPayloadFields = 4;

export function summarizeEventPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload);

  if (entries.length === 0) {
    return 'payload 为空';
  }

  const visibleFields = entries.slice(0, maxPayloadFields).map(([key, value]) => `${key}: ${formatPayloadValue(value)}`);
  const suffix = entries.length > maxPayloadFields ? ` / +${entries.length - maxPayloadFields} 项` : '';

  return truncateSummary(`${visibleFields.join(' / ')}${suffix}`);
}

function formatPayloadValue(value: unknown) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.length} 项]`;
  }

  if (typeof value === 'object') {
    return '{...}';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function truncateSummary(value: string) {
  if (value.length <= maxPayloadSummaryLength) {
    return value;
  }

  return `${value.slice(0, maxPayloadSummaryLength - 3)}...`;
}
