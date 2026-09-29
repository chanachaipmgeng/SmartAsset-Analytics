import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  DataLabelService,
  DateTimeService,
  LegendService,
  PieSeriesService,
  SplineAreaSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule, SortService } from '@syncfusion/ej2-angular-grids';
import { DashboardLayoutComponent, DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { AuthStore } from '../../core/auth.store';
import { statusColor, toDate } from '../../core/labels';
import { DashboardSummary, DeviceStatus, TransactionType } from '../../core/models';
import { ThemeService, cssColor } from '../../core/theme.service';
import { AssetTimeline } from '../../shared/asset-timeline';
import { EmptyState } from '../../shared/empty-state';
import { InstallationMap } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { SkeletonBlock } from '../../shared/skeleton-block';
import { StatCard, StatVariant } from '../../shared/stat-card';

const TREND_DAYS = 7;

/** Movements that feed each status card's "+n in 7 days". */
const STATUS_INFLOW: Record<DeviceStatus, TransactionType[]> = {
  IN_STOCK: ['CHECK_IN', 'RETURN'],
  CHECKED_OUT: ['CHECK_OUT'],
  INSTALLED: ['INSTALL'],
  RETIRED: ['RETIRE'],
};

const STATUS_CARD: Record<DeviceStatus, { icon: string; variant: StatVariant }> = {
  IN_STOCK: { icon: 'e-icons e-box', variant: 'success' },
  CHECKED_OUT: { icon: 'e-icons e-export', variant: 'warning' },
  INSTALLED: { icon: 'e-icons e-location', variant: 'info' },
  RETIRED: { icon: 'e-icons e-close', variant: 'neutral' },
};

/** Activity chart series; each groups transaction types that read as one flow. */
const ACTIVITY_SERIES: { name: string; types: TransactionType[]; token: string }[] = [
  { name: 'รับเข้า / รับคืน', types: ['CHECK_IN', 'RETURN'], token: '--color-sf-success' },
  { name: 'เบิกออก / โอน', types: ['CHECK_OUT', 'TRANSFER'], token: '--color-sf-warning' },
  { name: 'ติดตั้ง', types: ['INSTALL'], token: '--color-sf-info' },
  { name: 'ปลดระวาง', types: ['RETIRE'], token: '--color-sf-outline' },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    ChartModule,
    AccumulationChartModule,
    DashboardLayoutModule,
    ButtonModule,
    GridModule,
    RouterLink,
    InstallationMap,
    PageHeader,
    EmptyState,
    SkeletonBlock,
    StatCard,
    AssetTimeline,
  ],
  providers: [
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    ColumnSeriesService,
    SplineAreaSeriesService,
    CategoryService,
    DateTimeService,
    DataLabelService,
    LegendService,
    TooltipService,
    SortService,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthStore);
  protected readonly summary = httpResource<DashboardSummary>(() => '/api/v1/dashboard/summary');

  protected readonly data = computed(() => this.summary.value());

  /** Transaction counts per type over the last TREND_DAYS days. */
  private readonly recentCounts = computed(() => {
    const totals = new Map<TransactionType, number>();
    for (const day of (this.data()?.activity_30d ?? []).slice(-TREND_DAYS)) {
      for (const [type, n] of Object.entries(day.counts) as [TransactionType, number][]) {
        totals.set(type, (totals.get(type) ?? 0) + n);
      }
    }
    return totals;
  });

  private sumRecent(types: TransactionType[]): number {
    const counts = this.recentCounts();
    return types.reduce((sum, t) => sum + (counts.get(t) ?? 0), 0);
  }

  protected readonly totalTrend = computed(() => this.sumRecent(['CHECK_IN']) - this.sumRecent(['RETIRE']));

  protected readonly statusCards = computed(() => {
    this.theme.isDark();
    const total = this.data()?.total_devices || 0;
    return (this.data()?.by_status ?? []).map((s) => {
      const status = s.key as DeviceStatus;
      return {
        ...s,
        ...STATUS_CARD[status],
        color: statusColor(status),
        share: total ? Math.round((s.count / total) * 100) : 0,
        trend: this.sumRecent(STATUS_INFLOW[status]),
      };
    });
  });

  protected readonly primaryColor = computed(() => {
    this.theme.isDark();
    return cssColor('--color-sf-primary');
  });

  protected readonly statusChart = computed(() =>
    this.statusCards()
      .filter((s) => s.count > 0)
      .map((s) => ({ x: s.label, y: s.count, fill: s.color })),
  );

  protected readonly modelChart = computed(() => (this.data()?.by_model ?? []).map((m) => ({ x: m.label, y: m.count })));

  protected readonly activitySeries = computed(() => {
    this.theme.isDark();
    const days = this.data()?.activity_30d ?? [];
    return ACTIVITY_SERIES.map((s) => ({
      name: s.name,
      fill: cssColor(s.token),
      points: days.map((d) => ({ x: toDate(d.day), y: s.types.reduce((sum, t) => sum + (d.counts[t] ?? 0), 0) })),
    }));
  });
  protected readonly activityTotal = computed(() =>
    (this.data()?.activity_30d ?? []).reduce((sum, d) => sum + d.total, 0),
  );

  protected readonly recent = computed(() => this.data()?.recent_transactions ?? []);

  protected readonly warranty = computed(() =>
    (this.data()?.warranty_expiring ?? []).map((d) => ({ ...d, warranty_end: toDate(d.warranty_end) })),
  );

  protected readonly installations = computed(() => this.data()?.installations ?? []);

  protected readonly primaryXAxis = { valueType: 'Category', labelIntersectAction: 'Rotate45', majorGridLines: { width: 0 } };
  protected readonly primaryYAxis = { minimum: 0, interval: 1, labelFormat: '{value}', lineStyle: { width: 0 } };
  protected readonly activityXAxis = {
    valueType: 'DateTime',
    labelFormat: 'd MMM',
    intervalType: 'Days',
    interval: 5,
    edgeLabelPlacement: 'Shift',
    majorGridLines: { width: 0 },
  };
  protected readonly activityYAxis = { minimum: 0, labelFormat: '{value}', lineStyle: { width: 0 }, majorTickLines: { width: 0 } };
  protected readonly activityTooltip = { enable: true, shared: true, format: '${series.name}: <b>${point.y}</b>' };
  protected readonly tooltip = { enable: true };
  protected readonly legend = { visible: true, position: 'Bottom' };
  protected readonly pieLabels = { visible: true, name: 'y', position: 'Inside', font: { color: '#fff', fontWeight: '600' } };
  protected readonly columnLabels = { visible: true, position: 'Top' };
  protected readonly cellSpacing = [16, 16];

  private readonly layout = viewChild(DashboardLayoutComponent);

  constructor() {
    // DashboardLayout keeps panel sizes from its first measurement; re-lay out when its width changes.
    effect((onCleanup) => {
      const layout = this.layout();
      if (!layout) return;
      const host: HTMLElement = layout.element;
      let width = -1;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const observer = new ResizeObserver(() => {
        if (host.clientWidth === width) return;
        width = host.clientWidth;
        clearTimeout(timer);
        timer = setTimeout(() => {
          layout.refresh();
          window.dispatchEvent(new Event('resize'));
        }, 120);
      });
      observer.observe(host);
      onCleanup(() => {
        clearTimeout(timer);
        observer.disconnect();
      });
    });
  }
}
