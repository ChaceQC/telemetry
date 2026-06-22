import type { MetricQueryItem } from '../../api/query';

export type MetricTrendPoint = {
  id: number;
  name: string;
  value: number;
  unit: string | null;
  receivedAt: string;
  timestamp: number;
  x: number;
  y: number;
};

export type MetricTrendUnavailableReason = 'mixed-series' | 'no-plottable-points';

export type MetricTrendUnavailableModel = {
  status: 'unavailable';
  reason: MetricTrendUnavailableReason;
};

export type MetricTrendReadyModel = {
  status: 'ready';
  seriesName: string;
  seriesUnit: string | null;
  points: MetricTrendPoint[];
  linePath: string;
  areaPath: string;
  minValue: number;
  maxValue: number;
  firstPoint: MetricTrendPoint;
  lastPoint: MetricTrendPoint;
};

export type MetricTrendModel = MetricTrendReadyModel | MetricTrendUnavailableModel;

const chartWidth = 640;
const chartHeight = 168;
const padding = {
  top: 16,
  right: 18,
  bottom: 22,
  left: 18
};

export const metricTrendViewBox = `0 0 ${chartWidth} ${chartHeight}`;

export function buildMetricTrendModel(items: MetricQueryItem[]): MetricTrendModel {
  const sharedSeries = getSharedMetricSeries(items);

  if (items.length > 0 && !sharedSeries) {
    return {
      status: 'unavailable',
      reason: 'mixed-series'
    };
  }

  const validItems = items
    .map((item) => ({
      item,
      timestamp: Date.parse(item.received_at)
    }))
    .filter(({ item, timestamp }) => Number.isFinite(item.value) && Number.isFinite(timestamp))
    .sort((left, right) => left.timestamp - right.timestamp || left.item.id - right.item.id);

  if (validItems.length === 0) {
    return {
      status: 'unavailable',
      reason: 'no-plottable-points'
    };
  }

  const values = validItems.map(({ item }) => item.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minTimestamp = validItems[0].timestamp;
  const maxTimestamp = validItems[validItems.length - 1].timestamp;
  const valueSpan = maxValue - minValue;
  const timeSpan = maxTimestamp - minTimestamp;
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const points = validItems.map(({ item, timestamp }) => {
    const x = padding.left + (timeSpan === 0 ? plotWidth / 2 : ((timestamp - minTimestamp) / timeSpan) * plotWidth);
    const y =
      padding.top +
      (valueSpan === 0 ? plotHeight / 2 : plotHeight - ((item.value - minValue) / valueSpan) * plotHeight);

    return {
      id: item.id,
      name: item.name,
      value: item.value,
      unit: item.unit,
      receivedAt: item.received_at,
      timestamp,
      x: roundCoordinate(x),
      y: roundCoordinate(y)
    };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const baseline = chartHeight - padding.bottom;
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : '';

  return {
    status: 'ready',
    seriesName: sharedSeries?.name ?? points[0].name,
    seriesUnit: sharedSeries?.unit ?? points[0].unit,
    points,
    linePath,
    areaPath,
    minValue,
    maxValue,
    firstPoint: points[0],
    lastPoint: points[points.length - 1]
  };
}

function getSharedMetricSeries(items: MetricQueryItem[]) {
  const [firstItem] = items;

  if (!firstItem) {
    return null;
  }

  return items.every((item) => item.name === firstItem.name && item.unit === firstItem.unit)
    ? {
        name: firstItem.name,
        unit: firstItem.unit
      }
    : null;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(2));
}
