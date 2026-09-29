import { Directive, WritableSignal, input } from '@angular/core';

/**
 * Syncfusion text inputs emit `valueChange` only on blur; this keeps the bound signal
 * current on every keystroke so computed form validity updates while typing.
 */
@Directive({
  selector: '[liveValue]',
  host: { '(input)': 'onInput($event)' },
})
export class LiveValue {
  readonly liveValue = input.required<WritableSignal<string>>();

  protected onInput(event: unknown): void {
    // Receives both Syncfusion's InputEventArgs and the bubbling native InputEvent.
    const e = event as { value?: unknown; target?: { value?: unknown } };
    const value = e.value ?? e.target?.value;
    if (typeof value === 'string') this.liveValue().set(value);
  }
}
