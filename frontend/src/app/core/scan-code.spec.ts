import { safeReturnUrl } from './guards';
import { labelUrl, parseScanCode } from './scan-code';

describe('parseScanCode', () => {
  it('normalises a raw serial', () => {
    expect(parseScanCode('  zk-v5l-0001 \n')).toBe('ZK-V5L-0001');
  });

  it('extracts the serial from a label URL', () => {
    expect(parseScanCode('https://assets.example.com/scan?serial=zk-mb460-1002')).toBe(
      'ZK-MB460-1002',
    );
    expect(parseScanCode('http://localhost/scan?serial=A%2FB%201')).toBe('A/B 1');
  });

  it('round-trips labelUrl', () => {
    expect(parseScanCode(labelUrl('HIK-341-0007', 'https://x.test'))).toBe('HIK-341-0007');
    expect(labelUrl('A B', 'https://x.test')).toBe('https://x.test/scan?serial=A%20B');
  });

  it('treats URLs without a serial as text', () => {
    expect(parseScanCode('https://x.test/other')).toBe('HTTPS://X.TEST/OTHER');
  });
});

describe('safeReturnUrl', () => {
  it('only allows in-app paths', () => {
    expect(safeReturnUrl('/scan?serial=A1')).toBe('/scan?serial=A1');
    expect(safeReturnUrl('//evil.test/x')).toBe('/dashboard');
    expect(safeReturnUrl('https://evil.test')).toBe('/dashboard');
    expect(safeReturnUrl('/login')).toBe('/dashboard');
    expect(safeReturnUrl(undefined)).toBe('/dashboard');
  });
});
