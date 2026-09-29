import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  FilterService,
  GridModule,
  PageService,
  ResizeService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { NumericTextBoxModule, TextAreaModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { LiveValue } from './live-value';

export const FORM_IMPORTS = [
  LiveValue,
  ButtonModule,
  CheckBoxModule,
  TextBoxModule,
  TextAreaModule,
  NumericTextBoxModule,
  DropDownListModule,
  DatePickerModule,
  DialogModule,
] as const;

export const GRID_IMPORTS = [GridModule] as const;

export const GRID_PROVIDERS = [PageService, SortService, FilterService, ToolbarService, ResizeService];

export const GRID_DEFAULTS = {
  pageSettings: { pageSize: 15, pageSizes: [15, 30, 50, 100] },
  filterSettings: { type: 'Excel' as const },
  toolbar: ['Search'],
};

export const DIALOG_ANIMATION = { effect: 'Zoom' as const, duration: 200 };
