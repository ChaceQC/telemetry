export type LoginLocationState = {
  from?: {
    pathname?: string;
    search?: string;
  };
};

export function resolveLoginReturnPath(locationState: LoginLocationState | null) {
  return `${locationState?.from?.pathname || '/'}${locationState?.from?.search || ''}`;
}
