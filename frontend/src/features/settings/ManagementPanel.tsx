import { Building2, Loader2, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import type { PanelState } from './types';
import { readErrorMessage } from './utils';

type ManagementPanelProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  state: PanelState;
  count: number;
  emptyTitle: string;
  emptyDescription: string;
  renderList: () => ReactNode;
  form: ReactNode;
};

export function ManagementPanel({
  title,
  description,
  icon: Icon,
  state,
  count,
  emptyTitle,
  emptyDescription,
  renderList,
  form
}: ManagementPanelProps) {
  return (
    <article className="management-panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Icon size={20} aria-hidden="true" />
      </div>

      <div className="management-toolbar">
        <StatusBadge tone={state.isError ? 'danger' : state.isLoading ? 'warning' : count > 0 ? 'success' : 'neutral'}>
          {state.isError ? '读取失败' : state.isLoading ? '加载中' : `${count} 条`}
        </StatusBadge>
        <button
          className="text-button"
          type="button"
          onClick={() => state.refetch()}
          disabled={state.isFetching || !state.canRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>{state.isFetching ? '刷新中' : '刷新'}</span>
        </button>
      </div>

      <div className="resource-body">
        {state.isLoading ? <LoadingState /> : null}
        {state.isError ? <ErrorState error={state.error} /> : null}
        {!state.isLoading && !state.isError && count === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : null}
        {!state.isLoading && !state.isError && count > 0 ? renderList() : null}
      </div>

      <div className="form-divider" />
      {form}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="resource-state">
      <Loader2 size={18} aria-hidden="true" />
      <span>正在加载...</span>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="resource-state">
      <Building2 size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="resource-state resource-state--error">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>{readErrorMessage(error)}</span>
    </div>
  );
}
