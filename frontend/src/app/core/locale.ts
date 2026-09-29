import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { L10n, loadCldr, setCulture, setCurrencyCode } from '@syncfusion/ej2-base';
import numberingSystems from 'cldr-core/supplemental/numberingSystems.json';
import weekData from 'cldr-core/supplemental/weekData.json';
import gregorian from 'cldr-dates-full/main/th/ca-gregorian.json';
import timeZoneNames from 'cldr-dates-full/main/th/timeZoneNames.json';
import currencies from 'cldr-numbers-full/main/th/currencies.json';
import numbers from 'cldr-numbers-full/main/th/numbers.json';

export function setupThaiLocale(): void {
  registerLocaleData(localeTh);
  loadCldr(numberingSystems, weekData, gregorian, timeZoneNames, currencies, numbers);

  L10n.load({
    th: {
      grid: {
        EmptyRecord: 'ไม่มีข้อมูล',
        Search: 'ค้นหา',
        Add: 'เพิ่ม',
        Edit: 'แก้ไข',
        Delete: 'ลบ',
        Update: 'บันทึก',
        Cancel: 'ยกเลิก',
        Print: 'พิมพ์',
        ExcelExport: 'ส่งออก Excel',
        CsvExport: 'ส่งออก CSV',
        Item: 'รายการ',
        Items: 'รายการ',
        FilterButton: 'กรอง',
        ClearButton: 'ล้าง',
        SelectAll: 'เลือกทั้งหมด',
        Blanks: 'ค่าว่าง',
        True: 'ใช่',
        False: 'ไม่ใช่',
        NoResult: 'ไม่พบข้อมูลที่ตรงกัน',
        ClearFilter: 'ล้างตัวกรอง',
        SortAscending: 'เรียงจากน้อยไปมาก',
        SortDescending: 'เรียงจากมากไปน้อย',
        TextFilter: 'ตัวกรองข้อความ',
        NumberFilter: 'ตัวกรองตัวเลข',
        DateFilter: 'ตัวกรองวันที่',
        Equal: 'เท่ากับ',
        NotEqual: 'ไม่เท่ากับ',
        StartsWith: 'ขึ้นต้นด้วย',
        EndsWith: 'ลงท้ายด้วย',
        Contains: 'มีคำว่า',
        GreaterThan: 'มากกว่า',
        LessThan: 'น้อยกว่า',
        CustomFilter: 'ตัวกรองกำหนดเอง',
        OKButton: 'ตกลง',
        CancelButton: 'ยกเลิก',
      },
      pager: {
        currentPageInfo: 'หน้า {0} จาก {1}',
        totalItemsInfo: '({0} รายการ)',
        firstPageTooltip: 'หน้าแรก',
        lastPageTooltip: 'หน้าสุดท้าย',
        nextPageTooltip: 'หน้าถัดไป',
        previousPageTooltip: 'หน้าก่อนหน้า',
        nextPagerTooltip: 'กลุ่มหน้าถัดไป',
        previousPagerTooltip: 'กลุ่มหน้าก่อนหน้า',
        pagerDropDown: 'รายการต่อหน้า',
        All: 'ทั้งหมด',
      },
      datepicker: { placeholder: 'เลือกวันที่', today: 'วันนี้' },
      dropdowns: { noRecordsTemplate: 'ไม่มีข้อมูล', actionFailureTemplate: 'โหลดข้อมูลไม่สำเร็จ' },
      dialog: { close: 'ปิด' },
    },
  });

  setCulture('th');
  setCurrencyCode('THB');
}
