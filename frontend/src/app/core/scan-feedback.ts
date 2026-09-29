let audio: AudioContext | null = null;

function beep(frequency: number, durationMs: number, delayMs = 0): void {
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime + delayMs / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + durationMs / 1000 + 0.02);
  } catch {
    // Audio blocked or unsupported: vibration and the on-screen card still confirm the scan.
  }
}

/** Short high beep + single buzz: the serial was found. */
export function scanSuccess(): void {
  beep(1320, 90);
  navigator.vibrate?.(60);
}

/** Two low beeps + double buzz: not found or failed. */
export function scanMiss(): void {
  beep(330, 120);
  beep(330, 120, 170);
  navigator.vibrate?.([70, 60, 70]);
}
