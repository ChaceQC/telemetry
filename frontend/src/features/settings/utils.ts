import { ApiClientError } from '../../api/http';

export function findName(items: Array<{ id: number; name: string }>, id: number | null | undefined) {
  if (id === null || id === undefined) {
    return undefined;
  }

  return items.find((item) => item.id === id)?.name;
}

export function readErrorMessage(error: unknown) {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试。';
}
