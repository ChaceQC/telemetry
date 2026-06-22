import type { TraceQueryItem } from '../../api/query';

export const DEFAULT_SLOW_TRACE_SPAN_MS = 1000;

export type TraceWaterfallSpan = {
  item: TraceQueryItem;
  depth: number;
  childrenCount: number;
  relativeStartMs: number | null;
  durationMs: number | null;
  offsetPercent: number;
  widthPercent: number;
  isError: boolean;
  isSlow: boolean;
  isOrphan: boolean;
  hasPartialTiming: boolean;
};

export type TraceWaterfallGroup = {
  traceId: string;
  spans: TraceWaterfallSpan[];
  spanCount: number;
  rootCount: number;
  orphanCount: number;
  errorCount: number;
  slowCount: number;
  totalDurationMs: number;
  hasTiming: boolean;
  maxDepth: number;
};

type BuildTraceWaterfallOptions = {
  slowThresholdMs?: number;
};

type IndexedTraceItem = {
  item: TraceQueryItem;
  originalIndex: number;
};

type SpanTiming = {
  startMs: number | null;
  endMs: number | null;
  explicitDurationMs: number | null;
  durationMs: number | null;
  layoutStartMs: number | null;
  layoutEndMs: number | null;
  hasPartialTiming: boolean;
};

type SpanEntry = IndexedTraceItem & {
  spanId: string;
  parentSpanId: string | null;
  timing: SpanTiming;
  children: SpanEntry[];
  isOrphanRoot: boolean;
};

const minimumBarWidthPercent = 2;

export function buildTraceWaterfallGroups(
  items: TraceQueryItem[],
  options: BuildTraceWaterfallOptions = {}
): TraceWaterfallGroup[] {
  const slowThresholdMs = options.slowThresholdMs ?? DEFAULT_SLOW_TRACE_SPAN_MS;
  const groups = new Map<string, IndexedTraceItem[]>();

  items.forEach((item, originalIndex) => {
    const traceId = normalizeTraceId(item.trace_id);
    const group = groups.get(traceId);

    if (group) {
      group.push({ item, originalIndex });
      return;
    }

    groups.set(traceId, [{ item, originalIndex }]);
  });

  return Array.from(groups, ([traceId, groupItems]) => buildTraceWaterfallGroup(traceId, groupItems, slowThresholdMs));
}

function buildTraceWaterfallGroup(
  traceId: string,
  indexedItems: IndexedTraceItem[],
  slowThresholdMs: number
): TraceWaterfallGroup {
  const entries = indexedItems.map<SpanEntry>(({ item, originalIndex }) => ({
    item,
    originalIndex,
    spanId: item.span_id,
    parentSpanId: normalizeParentSpanId(item.parent_span_id),
    timing: resolveSpanTiming(item),
    children: [],
    isOrphanRoot: false
  }));
  const entryBySpanId = new Map<string, SpanEntry>();

  entries.forEach((entry) => {
    if (!entryBySpanId.has(entry.spanId)) {
      entryBySpanId.set(entry.spanId, entry);
    }
  });

  const roots: SpanEntry[] = [];

  entries.forEach((entry) => {
    const parent = entry.parentSpanId ? entryBySpanId.get(entry.parentSpanId) : undefined;

    if (parent && parent !== entry && !wouldCreateCycle(parent, entry, entryBySpanId)) {
      parent.children.push(entry);
      return;
    }

    entry.isOrphanRoot = Boolean(entry.parentSpanId);
    roots.push(entry);
  });

  sortEntries(roots);
  entries.forEach((entry) => sortEntries(entry.children));

  const timeline = resolveTimeline(entries);
  const spans: TraceWaterfallSpan[] = [];
  const visited = new Set<SpanEntry>();

  roots.forEach((root) => {
    flattenEntry(root, 0, timeline, slowThresholdMs, visited, spans);
  });

  const maxDepth = spans.reduce((current, span) => Math.max(current, span.depth), 0);

  return {
    traceId,
    spans,
    spanCount: spans.length,
    rootCount: roots.length,
    orphanCount: spans.filter((span) => span.isOrphan).length,
    errorCount: spans.filter((span) => span.isError).length,
    slowCount: spans.filter((span) => span.isSlow).length,
    totalDurationMs: timeline.rangeMs,
    hasTiming: timeline.baselineMs !== null,
    maxDepth
  };
}

function flattenEntry(
  entry: SpanEntry,
  depth: number,
  timeline: { baselineMs: number | null; rangeMs: number },
  slowThresholdMs: number,
  visited: Set<SpanEntry>,
  output: TraceWaterfallSpan[]
) {
  if (visited.has(entry)) {
    return;
  }

  visited.add(entry);

  const relativeStartMs =
    timeline.baselineMs !== null && entry.timing.layoutStartMs !== null
      ? Math.max(0, entry.timing.layoutStartMs - timeline.baselineMs)
      : null;
  const durationMs = entry.timing.durationMs;
  const offsetPercent =
    relativeStartMs === null ? 0 : clamp(roundPercent((relativeStartMs / timeline.rangeMs) * 100), 0, 98);
  const rawWidthPercent = durationMs === null ? minimumBarWidthPercent : (durationMs / timeline.rangeMs) * 100;
  const widthPercent = clamp(
    roundPercent(Math.max(minimumBarWidthPercent, rawWidthPercent)),
    1,
    Math.max(1, roundPercent(100 - offsetPercent))
  );

  output.push({
    item: entry.item,
    depth,
    childrenCount: entry.children.length,
    relativeStartMs,
    durationMs,
    offsetPercent,
    widthPercent,
    isError: isErrorTraceStatus(entry.item.status_code),
    isSlow: durationMs !== null && durationMs >= slowThresholdMs,
    isOrphan: entry.isOrphanRoot,
    hasPartialTiming: entry.timing.hasPartialTiming
  });

  entry.children.forEach((child) => flattenEntry(child, depth + 1, timeline, slowThresholdMs, visited, output));
}

function resolveTimeline(entries: SpanEntry[]) {
  const starts = entries
    .map((entry) => entry.timing.layoutStartMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const baselineMs = starts.length > 0 ? Math.min(...starts) : null;
  const rangeMs = entries.reduce((currentRange, entry) => {
    const relativeStartMs =
      baselineMs !== null && entry.timing.layoutStartMs !== null
        ? Math.max(0, entry.timing.layoutStartMs - baselineMs)
        : 0;
    const durationMs = entry.timing.durationMs ?? 0;

    return Math.max(currentRange, relativeStartMs + durationMs);
  }, 0);

  return {
    baselineMs,
    rangeMs: Math.max(1, rangeMs)
  };
}

function resolveSpanTiming(item: TraceQueryItem): SpanTiming {
  const startMs = parseTimeMs(item.start_time);
  const endMs = parseTimeMs(item.end_time);
  const explicitDurationMs = normalizeDurationMs(item.duration_ms);
  const derivedDurationMs =
    startMs !== null && endMs !== null && endMs >= startMs ? normalizeDurationMs(endMs - startMs) : null;
  const durationMs = explicitDurationMs ?? derivedDurationMs;
  let layoutStartMs = startMs;
  let layoutEndMs = endMs;

  if (layoutStartMs === null && layoutEndMs !== null && durationMs !== null) {
    layoutStartMs = layoutEndMs - durationMs;
  }

  if (layoutEndMs === null && layoutStartMs !== null && durationMs !== null) {
    layoutEndMs = layoutStartMs + durationMs;
  }

  if (layoutStartMs === null && layoutEndMs !== null) {
    layoutStartMs = layoutEndMs;
  }

  if (layoutEndMs === null && layoutStartMs !== null) {
    layoutEndMs = layoutStartMs;
  }

  if (layoutStartMs !== null && layoutEndMs !== null && layoutEndMs < layoutStartMs) {
    layoutEndMs = durationMs !== null ? layoutStartMs + durationMs : layoutStartMs;
  }

  return {
    startMs,
    endMs,
    explicitDurationMs,
    durationMs,
    layoutStartMs,
    layoutEndMs,
    hasPartialTiming: startMs === null || endMs === null || explicitDurationMs === null
  };
}

function sortEntries(entries: SpanEntry[]) {
  entries.sort((left, right) => {
    const leftStart = left.timing.layoutStartMs ?? Number.POSITIVE_INFINITY;
    const rightStart = right.timing.layoutStartMs ?? Number.POSITIVE_INFINITY;

    return leftStart - rightStart || left.originalIndex - right.originalIndex || left.item.id - right.item.id;
  });
}

function wouldCreateCycle(parent: SpanEntry, child: SpanEntry, entryBySpanId: Map<string, SpanEntry>) {
  let current: SpanEntry | undefined = parent;
  const visited = new Set<SpanEntry>();

  while (current) {
    if (current === child || visited.has(current)) {
      return true;
    }

    visited.add(current);
    current = current.parentSpanId ? entryBySpanId.get(current.parentSpanId) : undefined;
  }

  return false;
}

function normalizeTraceId(value: string) {
  return value || 'unknown-trace';
}

function normalizeParentSpanId(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseTimeMs(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeDurationMs(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function isErrorTraceStatus(status: string | null) {
  const normalized = (status ?? '').toLowerCase();
  return normalized.includes('error') || normalized.includes('fail');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}
