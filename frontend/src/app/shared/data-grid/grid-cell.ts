import { Directive, TemplateRef, inject, input } from '@angular/core';

/** Custom cell for one column: `<ng-template gridCell="status" let-row>...</ng-template>`. */
@Directive({ selector: 'ng-template[gridCell]' })
export class GridCell {
  readonly field = input.required<string>({ alias: 'gridCell' });
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
