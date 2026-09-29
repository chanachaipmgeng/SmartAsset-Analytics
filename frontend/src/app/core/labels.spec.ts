import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONES,
  AUDIT_ENTITY_LABELS,
  ROLE_LABELS,
  SERVICE_LEVEL_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TX_ICONS,
  TX_LABELS,
  TX_TONES,
} from './labels';

const THAI = /[\u0E00-\u0E7F]/;
const keys = (record: object) => Object.keys(record).sort();

describe('labels', () => {
  it('gives every status a Thai label and a tone', () => {
    expect(keys(STATUS_TONES)).toEqual(keys(STATUS_LABELS));
    expect(keys(STATUS_LABELS)).toHaveLength(7);
  });

  it('gives every transaction type a label, icon and tone', () => {
    expect(keys(TX_ICONS)).toEqual(keys(TX_LABELS));
    expect(keys(TX_TONES)).toEqual(keys(TX_LABELS));
    expect(keys(TX_LABELS)).toHaveLength(12);
  });

  it('gives every audit action a tone', () => {
    expect(keys(AUDIT_ACTION_TONES)).toEqual(keys(AUDIT_ACTION_LABELS));
  });

  it('uses non-empty Thai text for user-facing labels', () => {
    const records = [
      STATUS_LABELS,
      TX_LABELS,
      ROLE_LABELS,
      SERVICE_LEVEL_LABELS,
      AUDIT_ENTITY_LABELS,
      AUDIT_ACTION_LABELS,
    ];
    for (const record of records) {
      for (const [key, text] of Object.entries(record)) {
        expect(text.trim(), key).not.toBe('');
        expect(THAI.test(text) || /^[A-Z]{2,}/.test(text), `${key}: ${text}`).toBe(true);
      }
    }
  });
});
