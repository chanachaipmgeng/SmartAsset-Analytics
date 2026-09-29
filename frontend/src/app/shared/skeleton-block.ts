import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SkeletonModule } from '@syncfusion/ej2-angular-notifications';

@Component({
  selector: 'app-skeleton-block',
  imports: [SkeletonModule],
  template: `
    <ejs-skeleton [shape]="shape()" [width]="width()" [height]="height()" shimmerEffect="Wave"></ejs-skeleton>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonBlock {
  readonly shape = input<'Rectangle' | 'Circle' | 'Square' | 'Text'>('Rectangle');
  readonly width = input('100%');
  readonly height = input('16px');
}
