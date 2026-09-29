import { MAX_PHOTO_BYTES, checkPhotoFiles } from './photos';

function file(name: string, type: string, size = 1024): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('checkPhotoFiles', () => {
  it('accepts JPG, PNG and WebP within the size limit', () => {
    const files = [
      file('a.jpg', 'image/jpeg'),
      file('b.png', 'image/png'),
      file('c.webp', 'image/webp'),
    ];
    expect(checkPhotoFiles(files)).toEqual({ ok: files, problem: null });
  });

  it('rejects other types and oversized files with a Thai message per file', () => {
    const good = file('ok.png', 'image/png');
    const result = checkPhotoFiles([
      good,
      file('doc.pdf', 'application/pdf'),
      file('big.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1),
    ]);
    expect(result.ok).toEqual([good]);
    expect(result.problem?.split('\n')).toEqual([
      'doc.pdf: รองรับเฉพาะ JPG, PNG หรือ WebP',
      'big.jpg: ขนาดเกิน 8 MB',
    ]);
  });
});
