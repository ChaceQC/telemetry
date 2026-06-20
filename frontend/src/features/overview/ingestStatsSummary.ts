import type { IngestKind, IngestStatItem } from '../../api/ingestStats';

export type IngestSignalSummary = {
  kind: IngestKind;
  label: string;
  acceptedCount: number;
  rejectedCount: number;
  bytesCount: number;
  sourceCount: number;
  latestBucketStart: string | null;
};

const SIGNAL_LABELS: Record<IngestKind, string> = {
  metric: 'Metrics',
  log: 'Logs',
  event: 'Events'
};

const SIGNAL_ORDER: IngestKind[] = ['metric', 'log', 'event'];

export function summarizeIngestStats(items: IngestStatItem[]): IngestSignalSummary[] {
  const summaries = new Map<IngestKind, IngestSignalSummary>();
  const sources = new Map<IngestKind, Set<string>>();

  SIGNAL_ORDER.forEach((kind) => {
    summaries.set(kind, {
      kind,
      label: SIGNAL_LABELS[kind],
      acceptedCount: 0,
      rejectedCount: 0,
      bytesCount: 0,
      sourceCount: 0,
      latestBucketStart: null
    });
    sources.set(kind, new Set<string>());
  });

  items.forEach((item) => {
    const summary = summaries.get(item.kind);
    const sourceSet = sources.get(item.kind);

    if (!summary || !sourceSet) {
      return;
    }

    summary.acceptedCount += item.accepted_count;
    summary.rejectedCount += item.rejected_count;
    summary.bytesCount += item.bytes_count;

    if (item.source) {
      sourceSet.add(item.source);
      summary.sourceCount = sourceSet.size;
    }

    if (!summary.latestBucketStart || new Date(item.bucket_start) > new Date(summary.latestBucketStart)) {
      summary.latestBucketStart = item.bucket_start;
    }
  });

  return SIGNAL_ORDER.map((kind) => summaries.get(kind)).filter(
    (summary): summary is IngestSignalSummary => Boolean(summary)
  );
}

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}
