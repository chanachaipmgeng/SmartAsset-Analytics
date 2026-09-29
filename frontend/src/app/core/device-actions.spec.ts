import { BULK_ACTIONS, availableActions, commonBulkActions, isBulkAction } from './device-actions';
import { Device, DeviceStatus } from './models';

const WRITER = { canWrite: true, isSuperadmin: false };
const SUPERADMIN = { canWrite: true, isSuperadmin: true };
const VIEWER = { canWrite: false, isSuperadmin: false };

function device(status: DeviceStatus, tenantId: string | null = 't1'): Device {
  return { id: `${status}-${tenantId}`, serial_number: 'SN', status, tenant_id: tenantId } as Device;
}

const ids = (list: { id: string }[]) => list.map((a) => a.id).sort();

describe('availableActions', () => {
  it('follows the state machine for tenant devices', () => {
    expect(ids(availableActions(device('IN_STOCK'), WRITER))).toEqual(['checkout', 'loan', 'retire', 'send_repair']);
    expect(ids(availableActions(device('CHECKED_OUT'), WRITER))).toEqual(['install', 'return', 'send_repair']);
    expect(ids(availableActions(device('INSTALLED'), WRITER))).toEqual(['return', 'send_repair']);
    expect(ids(availableActions(device('ON_LOAN'), WRITER))).toEqual(['return']);
    expect(ids(availableActions(device('UNDER_QC'), WRITER))).toEqual(['qc_fail', 'qc_pass', 'retire']);
    expect(ids(availableActions(device('IN_REPAIR'), WRITER))).toEqual(['repair_done', 'retire']);
    expect(availableActions(device('RETIRED'), WRITER)).toEqual([]);
  });

  it('keeps central stock in the warehouse until transferred', () => {
    const central = device('IN_STOCK', null);
    expect(ids(availableActions(central, SUPERADMIN))).toEqual(['retire', 'send_repair', 'transfer']);
  });

  it('only lets superadmin transfer and viewers do nothing', () => {
    expect(ids(availableActions(device('IN_STOCK'), WRITER))).not.toContain('transfer');
    expect(ids(availableActions(device('IN_STOCK'), SUPERADMIN))).toContain('transfer');
    expect(availableActions(device('IN_STOCK'), VIEWER)).toEqual([]);
    expect(availableActions(null, SUPERADMIN)).toEqual([]);
  });
});

describe('commonBulkActions', () => {
  it('returns the intersection of each device’s bulk actions', () => {
    const stock = device('IN_STOCK');
    const checkedOut = device('CHECKED_OUT');
    expect(ids(commonBulkActions([stock, stock], WRITER))).toEqual(['checkout', 'loan', 'retire', 'send_repair']);
    expect(ids(commonBulkActions([stock, checkedOut], WRITER))).toEqual(['send_repair']);
    expect(commonBulkActions([device('RETIRED'), stock], WRITER)).toEqual([]);
    expect(commonBulkActions([], SUPERADMIN)).toEqual([]);
  });

  it('never offers actions that need per-device input', () => {
    const actions = commonBulkActions([device('CHECKED_OUT'), device('CHECKED_OUT')], WRITER);
    expect(ids(actions)).not.toContain('install');
    expect(ids(commonBulkActions([device('IN_REPAIR')], WRITER))).not.toContain('repair_done');
    expect(ids(commonBulkActions([device('UNDER_QC')], WRITER))).not.toContain('qc_fail');
  });

  it('maps UI ids to the API action names', () => {
    expect(BULK_ACTIONS.checkout).toBe('check_out');
    expect(isBulkAction('transfer')).toBe(true);
    expect(isBulkAction('install')).toBe(false);
  });
});
