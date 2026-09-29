import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CountUp } from '../../shared/count-up';

/**
 * Decorative dashboard mock-up for the login hero; the figures are not real data.
 * Cards follow the pointer through the `--mx`/`--my` variables set by `LoginPage`.
 */
@Component({
  selector: 'app-login-showcase',
  imports: [CountUp],
  templateUrl: './login-showcase.html',
  styleUrl: './login-showcase.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class LoginShowcase {
  protected readonly total = 1248;
  protected readonly bars = [
    { label: 'อยู่ในคลัง', value: 72, tone: 'primary' },
    { label: 'ติดตั้งแล้ว', value: 88, tone: 'success' },
    { label: 'ส่งซ่อม', value: 24, tone: 'warning' },
  ];
}
