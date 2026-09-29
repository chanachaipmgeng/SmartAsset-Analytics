import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  OnInit,
  computed,
  contentChildren,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AggregateService,
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
  GroupService,
  PageService,
  PdfExportService,
  ResizeService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { ClickEventArgs } from '@syncfusion/ej2-angular-navigations';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { EmptyState } from '../empty-state';
import { ErrorState } from '../error-state';
import { SkeletonBlock } from '../skeleton-block';
import { GridCell } from './grid-cell';
import { thaiPdfFont } from './pdf-font';

export interface GridColumn {
  field: string;
  headerText: string;
  width?: number;
  type?: 'string' | 'number' | 'date' | 'datetime' | 'boolean';
  format?: string;
  textAlign?: 'Left' | 'Right' | 'Center';
  /** Hidden by default; users can still show it from the column chooser. */
  hidden?: boolean;
  /** Media query the column needs to be shown, e.g. `(min-width: 768px)` for secondary columns. */
  hideAtMedia?: string;
  isPrimaryKey?: boolean;
  /** Left out of Excel/PDF, e.g. image cells whose value is only a URL. */
  noExport?: boolean;
}

/** Page, sort and search requested by the grid in server paging mode. */
export interface GridQuery {
  skip: number;
  take: number;
  sort: { field: string; descending: boolean } | null;
  search: string;
}

export type GridRowActionId = 'view' | 'edit';

export interface GridRowAction<T> {
  action: GridRowActionId;
  row: T;
}

const ROW_ACTIONS: Record<GridRowActionId, { label: string; iconCss: string }> = {
  view: { label: 'ดูรายละเอียด', iconCss: 'e-icons e-eye' },
  edit: { label: 'แก้ไข', iconCss: 'e-icons e-edit' },
};

export interface GridAggregate {
  field: string;
  type: 'Sum' | 'Average' | 'Max' | 'Count';
  format?: string;
}

const AGGREGATE_LABELS: Record<GridAggregate['type'], string> = {
  Sum: 'รวม',
  Average: 'เฉลี่ย',
  Max: 'สูงสุด',
  Count: 'จำนวน',
};

interface Perspective {
  hidden: string[];
  pageSize: number;
}

const STORAGE_PREFIX = 'inventory.grid.';
const PAGE_SIZES = [15, 30, 50, 100];

function readPerspective(key: string | undefined): Perspective | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as Perspective) : null;
  } catch {
    return null;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shared list grid: search, Excel/PDF export (Thai font), column chooser, reset, remembered
 * column visibility and page size per `perspectiveKey`, plus loading, empty and error states.
 */
@Component({
  selector: 'app-data-grid',
  imports: [GridModule, EmptyState, ErrorState, SkeletonBlock],
  providers: [
    PageService,
    SortService,
    FilterService,
    ToolbarService,
    ResizeService,
    ExcelExportService,
    PdfExportService,
    ColumnChooserService,
    GroupService,
    AggregateService,
  ],
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataGrid<T extends object = Record<string, unknown>> implements OnInit {
  private readonly notify = inject(NotifyService);

  readonly data = input.required<T[]>();
  readonly columns = input.required<GridColumn[]>();
  readonly perspectiveKey = input<string>();
  readonly exportName = input('export');
  readonly loading = input(false);
  readonly error = input<unknown>(null);
  readonly emptyTitle = input('ยังไม่มีข้อมูล');
  readonly emptyMessage = input<string | null>(null);
  /** Initial group columns; non-empty also shows the drop area so users can regroup. */
  readonly groupBy = input<string[]>([]);
  /** Footer and group-footer totals; exported with Excel/PDF. */
  readonly aggregates = input<GridAggregate[]>([]);
  /**
   * Server paging: `data` is one page, `total` the match count, and paging, sorting and
   * search are emitted through `query` for the parent to fetch. Column filters are off.
   */
  readonly serverPaging = input(false);
  readonly total = input(0);
  /** Server paging: loads every matching row so Excel/PDF export isn't limited to one page. */
  readonly exportAll = input<(() => Promise<T[]>) | null>(null);
  /** Icon buttons in a trailing column; clicks are emitted through `rowAction`. */
  readonly rowActions = input<GridRowActionId[]>([]);
  /**
   * Checkbox column for picking several rows (current page), emitted through `multiSelectionChange`.
   * A plain row click still emits `selectionChange` with that row.
   */
  readonly multiSelect = input(false);

  readonly query = output<GridQuery>();
  readonly rowAction = output<GridRowAction<T>>();
  readonly selectionChange = output<T | null>();
  readonly multiSelectionChange = output<T[]>();
  readonly rowDoubleClick = output<T>();
  readonly retry = output<void>();

  private readonly grid = viewChild(GridComponent);
  private readonly cellTemplates = contentChildren(GridCell);

  /** Bumped by "reset" to rebuild the grid with default columns, filters and search. */
  protected readonly version = signal(0);

  private readonly saved = computed(() => {
    this.version();
    return readPerspective(this.perspectiveKey());
  });

  protected readonly cells = computed(() => {
    const map = new Map<string, TemplateRef<unknown>>();
    for (const cell of this.cellTemplates()) map.set(cell.field(), cell.template);
    return map;
  });

  protected readonly effectiveColumns = computed(() => {
    const hidden = this.saved()?.hidden;
    return this.columns().map((c) => ({ ...c, visible: hidden ? !hidden.includes(c.field) : !c.hidden }));
  });

  protected readonly pageSettings = computed(() => ({
    pageSize: this.saved()?.pageSize ?? PAGE_SIZES[0],
    pageSizes: PAGE_SIZES,
  }));

  protected readonly groupSettings = computed(() => ({
    columns: this.groupBy(),
    showDropArea: this.groupBy().length > 0,
    showGroupedColumn: true,
  }));
  /** Passed as a property (not projected `e-aggregates`) so modules inject after the grid renders. */
  protected readonly aggregateRows = computed(() => {
    const columns = this.aggregates().map((a) => {
      const template = `${AGGREGATE_LABELS[a.type]} \${${a.type}}`;
      return {
        field: a.field,
        type: a.type,
        format: a.format ?? 'N0',
        footerTemplate: template,
        groupFooterTemplate: template,
      };
    });
    return columns.length ? [{ columns }] : [];
  });

  protected readonly actionButtons = computed(() =>
    this.rowActions().map((id) => ({ id, ...ROW_ACTIONS[id] })),
  );
  protected readonly actionsWidth = computed(() => 24 + this.rowActions().length * 36);

  protected readonly errorText = computed(() => (this.error() ? errorMessage(this.error()) : ''));

  protected readonly source = computed(() =>
    this.serverPaging() ? { result: this.data(), count: this.total() } : this.data(),
  );
  /** Once the first load settles, keep the grid mounted so page, sort and search survive refetches. */
  private readonly settled = linkedSignal<boolean, boolean>({
    source: () => !this.loading(),
    computation: (idle, previous) => idle || (previous?.value ?? false),
  });
  protected readonly showSkeleton = computed(
    () => this.loading() && !this.data().length && !(this.serverPaging() && this.settled()),
  );
  private lastQuery: GridQuery | null = null;

  ngOnInit(): void {
    if (this.serverPaging()) this.emitQuery({ skip: 0, take: this.pageSettings().pageSize, sort: null, search: '' });
  }

  /** Server paging: jump back to page 1, e.g. after the parent changes an external filter. */
  firstPage(): void {
    const q = this.lastQuery;
    if (!q || q.skip === 0) return;
    this.grid()?.goToPage(1);
  }

  protected readonly filterSettings = { type: 'Excel' as const };
  protected readonly selectionSettings = computed(() =>
    this.multiSelect() ? { type: 'Multiple' as const, checkboxOnly: true } : { type: 'Single' as const },
  );
  protected readonly toolbar = [
    { text: 'Excel', tooltipText: 'ส่งออกเป็น Excel', prefixIcon: 'e-icons e-export-excel', id: 'excel' },
    { text: 'PDF', tooltipText: 'ส่งออกเป็น PDF', prefixIcon: 'e-icons e-export-pdf', id: 'pdf' },
    'ColumnChooser',
    { text: 'รีเซ็ต', tooltipText: 'คืนค่าคอลัมน์ ตัวกรอง และการค้นหา', prefixIcon: 'e-icons e-refresh', id: 'reset' },
    'Search',
  ];

  clearSelection(): void {
    this.grid()?.clearSelection();
    if (this.multiSelect()) this.multiSelectionChange.emit([]);
  }

  protected async onToolbar(args: ClickEventArgs): Promise<void> {
    const grid = this.grid();
    if (!grid) return;
    const fileName = `${this.exportName()}-${today()}`;
    switch (args.item.id) {
      case 'excel':
        try {
          const dataSource = await this.exportRows();
          await grid.excelExport({
            fileName: `${fileName}.xlsx`,
            columns: this.exportColumns(),
            ...(dataSource ? { dataSource } : {}),
          });
        } catch (err) {
          this.notify.error(err);
        }
        break;
      case 'pdf':
        try {
          const [font, headerFont, dataSource] = await Promise.all([
            thaiPdfFont(9),
            thaiPdfFont(10),
            this.exportRows(),
          ]);
          await grid.pdfExport({
            ...(dataSource ? { dataSource } : {}),
            fileName: `${fileName}.pdf`,
            columns: this.exportColumns(),
            pageOrientation: 'Landscape',
            theme: { header: { font: headerFont }, record: { font }, caption: { font } },
          });
        } catch (err) {
          this.notify.error(err);
        }
        break;
      case 'reset':
        this.clearPerspective();
        this.version.update((v) => v + 1);
        this.selectionChange.emit(null);
        if (this.serverPaging()) this.emitQuery({ skip: 0, take: PAGE_SIZES[0], sort: null, search: '' });
        break;
    }
  }

  protected onDataStateChange(args: {
    skip?: number;
    take?: number;
    sorted?: { name?: string; direction?: string }[];
    search?: { key?: string }[];
  }): void {
    const sorted = args.sorted?.[0];
    const take = args.take ?? this.pageSettings().pageSize;
    const pageSizeChanged = take !== this.lastQuery?.take;
    this.emitQuery({
      skip: args.skip ?? 0,
      take,
      sort: sorted?.name ? { field: sorted.name, descending: sorted.direction === 'descending' } : null,
      search: args.search?.[0]?.key?.trim() ?? '',
    });
    if (pageSizeChanged) this.savePerspective();
  }

  private emitQuery(query: GridQuery): void {
    this.lastQuery = query;
    this.query.emit(query);
  }

  private async exportRows(): Promise<T[] | undefined> {
    const load = this.exportAll();
    if (!this.serverPaging() || !load) return undefined;
    this.notify.info('กำลังเตรียมข้อมูลทั้งหมดสำหรับส่งออก…');
    return load();
  }

  protected onActionComplete(args: { requestType?: string }): void {
    if (args.requestType === 'columnstate' || args.requestType === 'paging') this.savePerspective();
    // Selection covers the rows on screen; paging, sorting or searching replaces them.
    if (this.multiSelect() && ['paging', 'sorting', 'searching', 'filtering'].includes(args.requestType ?? '')) {
      this.multiSelectionChange.emit([]);
    }
  }

  protected onRowSelected(args: { data?: unknown }): void {
    if (this.multiSelect()) this.emitMultiSelection();
    else if (args.data && !Array.isArray(args.data)) this.selectionChange.emit(args.data as T);
  }

  protected onRowDeselected(): void {
    if (this.multiSelect()) this.emitMultiSelection();
    else this.selectionChange.emit(null);
  }

  protected onRecordClick(args: { rowData?: unknown; target?: Element }): void {
    if (!this.multiSelect() || !args.rowData) return;
    if (args.target?.closest('.e-checkbox-wrapper, .row-actions')) return;
    this.selectionChange.emit(args.rowData as T);
  }

  private emitMultiSelection(): void {
    this.multiSelectionChange.emit((this.grid()?.getSelectedRecords() ?? []) as T[]);
  }

  protected onDoubleClick(args: { rowData?: unknown }): void {
    if (args.rowData) this.rowDoubleClick.emit(args.rowData as T);
  }

  protected onRowAction(event: Event, action: GridRowActionId, row: T): void {
    event.stopPropagation();
    this.rowAction.emit({ action, row });
  }

  /** Visible data columns only, so the action column and `noExport` columns never land in Excel/PDF. */
  private exportColumns() {
    const skip = new Set(this.columns().filter((c) => c.noExport).map((c) => c.field));
    return this.grid()
      ?.getColumns()
      .filter((c) => c.field && c.visible !== false && !skip.has(c.field));
  }

  private savePerspective(): void {
    const key = this.perspectiveKey();
    const grid = this.grid();
    if (!key || !grid) return;
    const perspective: Perspective = {
      hidden: grid.getColumns().filter((c) => c.visible === false).map((c) => c.field),
      pageSize: grid.pageSettings.pageSize ?? PAGE_SIZES[0],
    };
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(perspective));
    } catch {
      // Storage full or disabled: the layout just isn't remembered.
    }
  }

  private clearPerspective(): void {
    const key = this.perspectiveKey();
    if (!key) return;
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      // Nothing to clear.
    }
  }
}
