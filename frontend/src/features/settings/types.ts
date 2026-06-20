export type PanelState = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
};

export type ResourceOption = {
  label: string;
  value: string | number;
};
