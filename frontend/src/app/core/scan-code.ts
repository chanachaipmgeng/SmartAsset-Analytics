/** URL encoded in device QR labels; opening it (phone camera) lands on the scan station with the serial looked up. */
export function labelUrl(serial: string, origin: string = location.origin): string {
  return `${origin}/scan?serial=${encodeURIComponent(serial)}`;
}

/** Serial from a scanned code: either a raw serial or a label URL carrying `?serial=`. */
export function parseScanCode(raw: string): string {
  const text = raw.trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const serial = new URL(text).searchParams.get('serial');
      if (serial?.trim()) return serial.trim().toUpperCase();
    } catch {
      // Not a valid URL: treat it as a serial.
    }
  }
  return text.toUpperCase();
}
