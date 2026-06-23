import { useQuery } from '@tanstack/react-query';
import { Activity, GitBranch, LoaderCircle, LogIn, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatApiErrorMessage } from '../api/http';
import { getTraceTopology, type TraceTopologyEdge, type TraceTopologyNode, type TraceTopologyParams } from '../api/query';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import { buildTraceTopologyParams, defaultFilters, type QueryFilters } from '../features/query/queryFilters';
import { buildSignalQueryKey, resolveVisibleQueryData } from '../features/query/querySession';

const emptyNodes: TraceTopologyNode[] = [];
const emptyEdges: TraceTopologyEdge[] = [];

export function TraceTopologyPage() {
  const location = useLocation();

  return (
    <TraceTopologyWorkspace
      key={location.search}
      locationPathname={location.pathname}
      locationSearch={location.search}
    />
  );
}

type TraceTopologyWorkspaceProps = {
  locationPathname: string;
  locationSearch: string;
};

function TraceTopologyWorkspace({ locationPathname, locationSearch }: TraceTopologyWorkspaceProps) {
  const auth = useAuth();
  const initialFilters = getInitialTopologyFilters(locationSearch);
  const [draftFilters, setDraftFilters] = useState<QueryFilters>(() => initialFilters);
  const [submittedFilters, setSubmittedFilters] = useState<QueryFilters>(() => initialFilters);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const topologyParams = useMemo(() => buildTraceTopologyParams(submittedFilters), [submittedFilters]);
  const canQuery = auth.canRequestAuthenticatedApi;
  const canRequestTopology = canQuery && topologyParams !== null;
  const topologyQuery = useQuery({
    queryKey: buildSignalQueryKey(auth.sessionRevision, 'traces-topology', topologyParams, refreshVersion),
    queryFn: () => requestTraceTopology(topologyParams),
    enabled: canRequestTopology,
    retry: false
  });
  const visibleData = resolveVisibleQueryData(canRequestTopology, topologyQuery.data);
  const nodes = visibleData?.nodes ?? emptyNodes;
  const edges = visibleData?.edges ?? emptyEdges;
  const hasTopology = nodes.length > 0 || edges.length > 0;
  const hasQueryError = canRequestTopology && topologyQuery.isError;
  const isInitialLoading = canRequestTopology && topologyQuery.isFetching && !visibleData && !hasQueryError;
  const badgeTone = !canQuery
    ? 'warning'
    : topologyParams === null
      ? 'warning'
      : hasQueryError
        ? 'danger'
        : topologyQuery.isFetching
          ? 'warning'
          : 'success';
  const badgeLabel = !canQuery
    ? auth.isRestoring
      ? '恢复中'
      : '需要登录'
    : topologyParams === null
      ? '需项目 ID'
      : topologyQuery.isFetching
        ? '查询中'
        : hasQueryError
          ? '查询异常'
          : '已就绪';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedFilters(draftFilters);
    setRefreshVersion((current) => current + 1);
  }

  function handleRefresh() {
    if (!canRequestTopology) {
      return;
    }

    setRefreshVersion((current) => current + 1);
  }

  function updateFilter<TName extends keyof QueryFilters>(name: TName, value: QueryFilters[TName]) {
    setDraftFilters({
      ...draftFilters,
      [name]: value
    });
  }

  return (
    <div className="query-page trace-topology-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Topology</p>
          <h1>服务拓扑</h1>
          <p className="workspace-summary">按项目、来源和时间范围查看 trace span 推导出的服务节点与调用边。</p>
        </div>

        <div className="header-actions">
          <Link className="text-button" to="/traces">
            <GitBranch size={16} aria-hidden="true" />
            <span>Span 列表</span>
          </Link>
          <button
            className="icon-button"
            type="button"
            onClick={handleRefresh}
            disabled={!canRequestTopology}
            title={canRequestTopology ? '刷新服务拓扑' : '填写项目 ID 并登录后刷新'}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
        </div>
      </header>

      {!canQuery ? (
        <section className="settings-auth-notice" aria-live="polite">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{auth.isRestoring ? '正在恢复登录状态' : '登录后查询服务拓扑'}</strong>
            <p>{auth.isRestoring ? '会话恢复完成后可发起查询。' : '服务拓扑接口需要使用当前账号的访问令牌。'}</p>
          </div>
          {!auth.isRestoring ? (
            <Link className="text-button" to="/login" state={{ from: { pathname: locationPathname, search: locationSearch } }}>
              <LogIn size={16} aria-hidden="true" />
              <span>登录</span>
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="query-toolbar" aria-label="服务拓扑筛选">
        <div className="section-heading">
          <div>
            <h2>筛选条件</h2>
            <p>{formatTopologyFilterDescription(topologyParams, submittedFilters)}</p>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>

        <form className="query-form topology-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>项目 ID</span>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              required
              value={draftFilters.projectId}
              onChange={(event) => updateFilter('projectId', event.target.value)}
              placeholder="必填项目 ID"
            />
          </label>
          <label className="field">
            <span>来源</span>
            <input
              value={draftFilters.source}
              onChange={(event) => updateFilter('source', event.target.value)}
              placeholder="api"
            />
          </label>
          <label className="field">
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={draftFilters.occurredFrom}
              onChange={(event) => updateFilter('occurredFrom', event.target.value)}
            />
          </label>
          <label className="field">
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={draftFilters.occurredTo}
              onChange={(event) => updateFilter('occurredTo', event.target.value)}
            />
          </label>
          <label className="field">
            <span>数量</span>
            <input
              type="number"
              min="1"
              max="500"
              inputMode="numeric"
              value={draftFilters.limit}
              onChange={(event) => updateFilter('limit', event.target.value)}
            />
          </label>
          <button className="primary-button query-submit" type="submit" disabled={!canQuery || topologyQuery.isFetching}>
            <Search size={16} aria-hidden="true" />
            <span>{topologyQuery.isFetching ? '查询中' : '查询'}</span>
          </button>
        </form>
      </section>

      <section className="query-results" aria-label="服务拓扑结果" aria-busy={topologyQuery.isFetching}>
        <div className="section-heading">
          <div>
            <h2>拓扑摘要</h2>
            <p>{visibleData ? formatTopologySummary(nodes.length, edges.length) : '等待服务拓扑查询结果'}</p>
          </div>
          <StatusBadge tone={hasTopology ? 'success' : 'neutral'}>{hasTopology ? '有拓扑' : '暂无拓扑'}</StatusBadge>
        </div>

        {canQuery && topologyParams === null ? (
          <div className="resource-state" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>项目 ID 必填</strong>
              <span>服务拓扑是单项目查询，请先输入一个可访问的项目 ID。</span>
            </div>
          </div>
        ) : null}

        {hasQueryError ? (
          <div className="resource-state resource-state--error" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>拓扑查询失败</strong>
              <span>{formatApiErrorMessage(topologyQuery.error)}</span>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <div className="resource-state query-loading-state" role="status">
            <LoaderCircle size={18} aria-hidden="true" />
            <div>
              <strong>正在加载服务拓扑</strong>
              <span>按当前项目、来源和时间范围读取节点与调用边。</span>
            </div>
          </div>
        ) : null}

        {!hasQueryError && visibleData && !hasTopology ? (
          <div className="resource-state">
            <Activity size={18} aria-hidden="true" />
            <div>
              <strong>暂无拓扑数据</strong>
              <span>调整项目 ID、来源、时间范围或数量后重试。</span>
            </div>
          </div>
        ) : null}

        {!hasQueryError && hasTopology ? (
          <div className="topology-grid">
            <TopologyNodeList nodes={nodes} />
            <TopologyEdgeList edges={edges} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TopologyNodeList({ nodes }: { nodes: TraceTopologyNode[] }) {
  return (
    <section className="topology-panel" aria-label="服务节点">
      <div className="topology-panel-heading">
        <div>
          <span>Nodes</span>
          <strong>{nodes.length} 个服务</strong>
        </div>
        <StatusBadge tone={nodes.length > 0 ? 'success' : 'neutral'}>{`${nodes.length}`}</StatusBadge>
      </div>

      {nodes.length > 0 ? (
        <ol className="topology-list topology-node-list">
          {nodes.map((node) => (
            <li key={`topology-node-${node.source}`}>
              <article className="topology-node">
                <div className="topology-node-heading">
                  <strong>{node.source}</strong>
                  <StatusBadge tone={node.error_span_count > 0 ? 'danger' : 'success'}>
                    {node.error_span_count > 0 ? `${node.error_span_count} 错误 span` : '正常'}
                  </StatusBadge>
                </div>
                <TopologyMetricGrid
                  metrics={[
                    ['Span', `${node.span_count}`],
                    ['Trace', `${node.trace_count}`],
                    ['Error span', `${node.error_span_count}`],
                    ['Avg duration', formatDuration(node.avg_duration_ms)],
                    ['Max duration', formatDuration(node.max_duration_ms)]
                  ]}
                />
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="topology-empty-text">当前筛选没有返回服务节点。</p>
      )}
    </section>
  );
}

function TopologyEdgeList({ edges }: { edges: TraceTopologyEdge[] }) {
  return (
    <section className="topology-panel" aria-label="调用边">
      <div className="topology-panel-heading">
        <div>
          <span>Edges</span>
          <strong>{edges.length} 条调用关系</strong>
        </div>
        <StatusBadge tone={edges.length > 0 ? 'success' : 'neutral'}>{`${edges.length}`}</StatusBadge>
      </div>

      {edges.length > 0 ? (
        <ol className="topology-list topology-edge-list">
          {edges.map((edge) => (
            <li key={getTopologyEdgeKey(edge)}>
              <article className="topology-edge">
                <div className="topology-edge-route">
                  <strong>{edge.from_source}</strong>
                  <GitBranch size={16} aria-hidden="true" />
                  <strong>{edge.to_source}</strong>
                </div>
                <TopologyMetricGrid
                  metrics={[
                    ['From', edge.from_source],
                    ['To', edge.to_source],
                    ['Call', `${edge.call_count}`],
                    ['Error', `${edge.error_count}`],
                    ['Avg duration', formatDuration(edge.avg_duration_ms)],
                    ['Max duration', formatDuration(edge.max_duration_ms)]
                  ]}
                />
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="topology-empty-text">当前筛选没有返回跨来源调用边。</p>
      )}
    </section>
  );
}

function getTopologyEdgeKey(edge: TraceTopologyEdge) {
  return `topology-edge-${JSON.stringify([edge.from_source, edge.to_source])}`;
}

function TopologyMetricGrid({ metrics }: { metrics: Array<[string, string]> }) {
  return (
    <dl className="topology-metrics">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function requestTraceTopology(params: TraceTopologyParams | null) {
  if (params === null) {
    return Promise.reject(new Error('project_id is required'));
  }

  return getTraceTopology(params);
}

function getInitialTopologyFilters(search: string): QueryFilters {
  const params = new URLSearchParams(search);

  return {
    ...defaultFilters,
    projectId: getSearchParam(params, 'project_id') ?? '',
    source: getSearchParam(params, 'source') ?? '',
    occurredFrom: getSearchParam(params, 'occurred_from') ?? '',
    occurredTo: getSearchParam(params, 'occurred_to') ?? '',
    limit: getSearchParam(params, 'limit') ?? defaultFilters.limit
  };
}

function getSearchParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim();
  return value ? value : undefined;
}

function formatTopologyFilterDescription(params: TraceTopologyParams | null, filters: QueryFilters) {
  if (params === null) {
    return '服务拓扑需要先指定项目 ID。';
  }

  const parts = [
    `项目 ${params.project_id}`,
    filters.source.trim() ? `来源 ${filters.source.trim()}` : null,
    filters.occurredFrom.trim() ? `从 ${filters.occurredFrom.trim()}` : null,
    filters.occurredTo.trim() ? `到 ${filters.occurredTo.trim()}` : null,
    params.limit ? `最多 ${params.limit} 个节点` : null
  ].filter((part): part is string => Boolean(part));

  return parts.join(' / ');
}

function formatTopologySummary(nodeCount: number, edgeCount: number) {
  return `${nodeCount} 个服务节点 / ${edgeCount} 条调用边`;
}

function formatDuration(value: number | null) {
  if (value === null) {
    return '无耗时';
  }

  return `${Number.isInteger(value) ? value : value.toFixed(3)} ms`;
}
