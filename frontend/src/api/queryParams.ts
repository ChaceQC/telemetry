export function buildQueryPath(path: string, params: Record<string, string | number | boolean | undefined | null>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || `${value}`.trim().length === 0) {
      return;
    }
    searchParams.set(key, `${value}`.trim());
  });

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}
