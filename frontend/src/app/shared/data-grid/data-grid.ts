import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
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
  isPrimaryKey?: boolean;
}

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
  ],
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataGrid<T extends object = Record<string, unknown>> {
  private readonly notify = inject(NotifyService);

  readonly data = input.required<T[]>();
  readonly columns = input.required<GridColumn[]>();
  readonly perspectiveKey = input<string>();
  readonly exportName = input('export');
  readonly loading = input(false);
  readonly error = input<unknown>(null);
  readonly emptyTitle = input('ยังไม่มีข้อมูล');
  readonly emptyMessage = input<string | null>(null);

  readonly selectionChange = output<T | null>();
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

  protected readonly errorText = computed(() => (this.error() ? errorMessage(this.error()) : ''));

  protected readonly filterSettings = { type: 'Excel' as const };
  protected readonly selectionSettings = { type: 'Single' as const };
  protected readonly toolbar = [
    { text: 'Excel', tooltipText: 'ส่งออกเป็น Excel', prefixIcon: 'e-icons e-export-excel', id: 'excel' },
    { text: 'PDF', tooltipText: 'ส่งออกเป็น PDF', prefixIcon: 'e-icons e-export-pdf', id: 'pdf' },
    'ColumnChooser',
    { text: 'รีเซ็ต', tooltipText: 'คืนค่าคอลัมน์ ตัวกรอง และการค้นหา', prefixIcon: 'e-icons e-refresh', id: 'reset' },
    'Search',
  ];

  protected async onToolbar(args: ClickEventArgs): Promise<void> {
    const grid = this.grid();
    if (!grid) return;
    const fileName = `${this.exportName()}-${today()}`;
    switch (args.item.id) {
      case 'excel':
        await grid.excelExport({ fileName: `${fileName}.xlsx` });
        break;
      case 'pdf':
        try {
          const [font, headerFont] = await Promise.all([thaiPdfFont(9), thaiPdfFont(10)]);
          await grid.pdfExport({
            fileName: `${fileName}.pdf`,
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
        break;
    }
  }

  protected onActionComplete(args: { requestType?: string }): void {
    if (args.requestType === 'columnstate' || args.requestType === 'paging') this.savePerspective();
  }

  protected onRowSelected(args: { data?: unknown }): void {
    if (args.data && !Array.isArray(args.data)) this.selectionChange.emit(args.data as T);
  }

  protected onDoubleClick(args: { rowData?: unknown }): void {
    if (args.rowData) this.rowDoubleClick.emit(args.rowData as T);
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
