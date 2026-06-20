import { formatApiErrorMessage, type ApiErrorDisplayContext } from '../../api/http';

export function findName(items: Array<{ id: number; name: string }>, id: number | null | undefined) {
  if (id === null || id === undefined) {
    return undefined;
  }

  return items.find((item) => item.id === id)?.name;
}

export function readErrorMessage(error: unknown, context: ApiErrorDisplayContext = 'page') {
  return formatApiErrorMessage(error, context);
}
