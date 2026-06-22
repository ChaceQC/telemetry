export function formatJsonPreviewValue(value: unknown) {
  if (isEmptyPlainObject(value)) {
    return null;
  }

  try {
    const formatted = JSON.stringify(value, null, 2);
    return formatted ?? String(value);
  } catch {
    return String(value);
  }
}

function isEmptyPlainObject(value: unknown): value is Record<string, never> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    Object.keys(value).length === 0
  );
}
