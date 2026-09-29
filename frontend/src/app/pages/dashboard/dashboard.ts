import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, viewChild } from '@angular/core';
import {
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  DataLabelService,
  PieSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DashboardLayoutComponent, DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { statusColor, toDate } from '../../core/labels';
import { DashboardSummary, DeviceStatus } from '../../core/models';
import { ThemeService, cssColor } from '../../core/theme.service';
import { EmptyState } from '../../shared/empty-state';
import { InstallationMap } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { SkeletonBlock } from '../../shared/skeleton-block';
import { GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

@Component({
  selector: 'app-dashboard',
  imports: [
    ChartModule,
    AccumulationChartModule,
    DashboardLayoutModule,
    ButtonModule,
    InstallationMap,
    PageHeader,
    EmptyState,
    SkeletonBlock,
    ...GRID_IMPORTS,
  ],
  providers: [
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    ColumnSeriesService,
    CategoryService,
    DataLabelService,
    TooltipService,
    ...GRID_PROVIDERS,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly theme = inject(ThemeService);
  protected readonly summary = httpResource<DashboardSummary>(() => '/api/v1/dashboard/summary');

  protected readonly data = computed(() => this.summary.value());

  protected readonly statusCards = computed(() => {
    this.theme.isDark();
    const total = this.data()?.total_devices || 0;
    return (this.data()?.by_status ?? []).map((s) => ({
      ...s,
      color: statusColor(s.key as DeviceStatus),
      share: total ? Math.round((s.count / total) * 100) : 0,
    }));
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

  protected readonly warranty = computed(() =>
    (this.data()?.warranty_expiring ?? []).map((d) => ({ ...d, warranty_end: toDate(d.warranty_end) })),
  );

  protected readonly installations = computed(() => this.data()?.installations ?? []);

  protected readonly primaryXAxis = { valueType: 'Category', labelIntersectAction: 'Rotate45', majorGridLines: { width: 0 } };
  protected readonly primaryYAxis = { minimum: 0, interval: 1, labelFormat: '{value}', lineStyle: { width: 0 } };
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
