import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  NumericTextBoxModule,
  TextAreaModule,
  TextBoxModule,
} from '@syncfusion/ej2-angular-inputs';
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

export const DIALOG_ANIMATION = { effect: 'Zoom' as const, duration: 200 };
