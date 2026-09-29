import { PdfTrueTypeFont } from '@syncfusion/ej2-pdf-export';

const FONT_URL = '/fonts/Sarabun-Regular.ttf';

let cached: Promise<string> | null = null;

/** The built-in PDF fonts have no Thai glyphs; load Sarabun once, on the first PDF export. */
async function loadBase64(): Promise<string> {
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error('โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ');
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function thaiPdfFont(size: number): Promise<PdfTrueTypeFont> {
  cached ??= loadBase64().catch((err) => {
    cached = null;
    throw err;
  });
  return new PdfTrueTypeFont(await cached, size);
}
