import * as XLSX from 'xlsx';
import { Student, ParticipationRecord, Class, Quarter, GradingSettings, ScoreRecord, QuarterSheetInfo } from '../types';
import { 
  getStudentQuarterTotal, 
  getStudentSemesterTotal, 
  getStudentYearTotal, 
  getClassRoster, 
  calculateStudentGrades,
  getClassScoreRanks 
} from './calculations';
import { StudentQuarterAnalysis } from './quarterFeedbackGenerator';

// ==========================================
// PURE TYPESCRIPT OPENXML (.XLSX) GENERATOR
// ==========================================

// Standard IEEE 802.3 CRC-32 Lookup Table
const makeCrcTable = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
};

const crcTable = makeCrcTable();

const calculateCrc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Creates RFC 1951 raw DEFLATE uncompressed blocks (PKZIP Method 8 compliant).
 * Microsoft Excel msopc.dll requires XML parts in an .xlsx package to be Method 8 (DEFLATED).
 * Uncompressed blocks (BTYPE=00) are fully compliant with RFC 1951 and are decompressed
 * instantly by all DEFLATE engines without any asynchronous stream overhead or deadlocks.
 */
function deflateData(data: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const numBlocks = Math.ceil(data.length / maxBlock) || 1;
  const outSize = data.length + numBlocks * 5;
  const out = new Uint8Array(outSize);
  let inPos = 0;
  let outPos = 0;

  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1;
    const len = Math.min(data.length - inPos, maxBlock);
    out[outPos++] = isLast ? 0x01 : 0x00;
    out[outPos++] = len & 0xff;
    out[outPos++] = (len >> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    out[outPos++] = nlen & 0xff;
    out[outPos++] = (nlen >> 8) & 0xff;
    out.set(data.subarray(inPos, inPos + len), outPos);
    outPos += len;
    inPos += len;
  }
  return out.subarray(0, outPos);
}

interface ZipFileItem {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a standard PKZIP archive with Method 8 (DEFLATE).
 * Compatible with OpenXML (.xlsx) specification across all versions of Microsoft Excel.
 */
function buildZipArchive(files: ZipFileItem[]): Uint8Array {
  const encoder = new TextEncoder();
  const fileItems = files.map(f => {
    const nameBytes = encoder.encode(f.name);
    const crc = calculateCrc32(f.data);
    const compressedData = deflateData(f.data);
    return {
      name: f.name,
      nameBytes,
      uncompressedSize: f.data.length,
      compressedData,
      crc,
      localOffset: 0
    };
  });

  let totalLocalSize = 0;
  let totalCentralDirSize = 0;
  for (const f of fileItems) {
    totalLocalSize += 30 + f.nameBytes.length + f.compressedData.length;
    totalCentralDirSize += 46 + f.nameBytes.length;
  }
  const totalSize = totalLocalSize + totalCentralDirSize + 22;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let currentOffset = 0;

  // 1. Write Local File Headers and Data
  for (const f of fileItems) {
    f.localOffset = currentOffset;

    view.setUint32(currentOffset, 0x04034b50, true);     // Local file header signature (PK\x03\x04)
    view.setUint16(currentOffset + 4, 20, true);         // Version needed (2.0)
    view.setUint16(currentOffset + 6, 0x0800, true);     // UTF-8 flag
    view.setUint16(currentOffset + 8, 8, true);          // Method 8 = Deflated
    view.setUint16(currentOffset + 10, 0x6000, true);    // Time (12:00:00)
    view.setUint16(currentOffset + 12, 0x5821, true);    // Date (2024-01-01)
    view.setUint32(currentOffset + 14, f.crc, true);     // CRC-32 of uncompressed data
    view.setUint32(currentOffset + 18, f.compressedData.length, true); // Compressed size
    view.setUint32(currentOffset + 22, f.uncompressedSize, true);      // Uncompressed size
    view.setUint16(currentOffset + 26, f.nameBytes.length, true);
    view.setUint16(currentOffset + 28, 0, true);         // Extra field length

    buffer.set(f.nameBytes, currentOffset + 30);
    buffer.set(f.compressedData, currentOffset + 30 + f.nameBytes.length);

    currentOffset += 30 + f.nameBytes.length + f.compressedData.length;
  }

  const centralDirStartOffset = currentOffset;

  // 2. Write Central Directory Headers
  for (const f of fileItems) {
    view.setUint32(currentOffset, 0x02014b50, true);     // Central dir signature (PK\x01\x02)
    view.setUint16(currentOffset + 4, 20, true);         // Version made by
    view.setUint16(currentOffset + 6, 20, true);         // Version needed
    view.setUint16(currentOffset + 8, 0x0800, true);     // UTF-8 flag
    view.setUint16(currentOffset + 10, 8, true);         // Method 8 = Deflated
    view.setUint16(currentOffset + 12, 0x6000, true);    // Time
    view.setUint16(currentOffset + 14, 0x5821, true);    // Date
    view.setUint32(currentOffset + 16, f.crc, true);     // CRC-32
    view.setUint32(currentOffset + 20, f.compressedData.length, true); // Compressed size
    view.setUint32(currentOffset + 24, f.uncompressedSize, true);      // Uncompressed size
    view.setUint16(currentOffset + 28, f.nameBytes.length, true);
    view.setUint16(currentOffset + 30, 0, true);         // Extra field length
    view.setUint16(currentOffset + 32, 0, true);         // File comment length
    view.setUint16(currentOffset + 34, 0, true);         // Disk start
    view.setUint16(currentOffset + 36, 0, true);         // Internal attributes
    view.setUint32(currentOffset + 38, 0, true);         // External attributes
    view.setUint32(currentOffset + 42, f.localOffset, true); // Local header offset

    buffer.set(f.nameBytes, currentOffset + 46);

    currentOffset += 46 + f.nameBytes.length;
  }

  const centralDirSize = currentOffset - centralDirStartOffset;

  // 3. Write End of Central Directory Record (EOCD)
  view.setUint32(currentOffset, 0x06054b50, true);      // EOCD signature (PK\x05\x06)
  view.setUint16(currentOffset + 4, 0, true);           // Disk number
  view.setUint16(currentOffset + 6, 0, true);           // Central dir start disk
  view.setUint16(currentOffset + 8, fileItems.length, true);  // Records on disk
  view.setUint16(currentOffset + 10, fileItems.length, true); // Total records
  view.setUint32(currentOffset + 12, centralDirSize, true);   // Size of central dir
  view.setUint32(currentOffset + 16, centralDirStartOffset, true); // Offset of central dir
  view.setUint16(currentOffset + 20, 0, true);          // Comment length

  return buffer;
}

function escapeXml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index: number): string {
  let col = '';
  let n = index;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

function downloadExcelBlob(data: any, filename: string) {
  const blob = new Blob([data as any], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderCell(cellRef: string, value: string | number | undefined | null, styleId: number): string {
  if (value === undefined || value === null || value === '' || value === '-') {
    return `<c r="${cellRef}" s="${styleId}"/>`;
  }
  if (typeof value === 'number' && !isNaN(value)) {
    return `<c r="${cellRef}" s="${styleId}" t="n"><v>${value}</v></c>`;
  }
  return `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

// OpenXML Static XML Parts
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const getWorkbookXml = (sheetName: string) => {
  const safeName = sheetName.replace(/[\\/?*[\]:]/g, '_').substring(0, 31);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>
  </bookViews>
  <sheets>
    <sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcId="124511"/>
</workbook>`;
};

/**
 * OpenXML Stylesheet defining:
 * - Fills:
 *     Fill 2 = #E5E7EB (Header light gray)
 *     Fill 3 = #FFFFFF (Odd Row White)
 *     Fill 4 = #F2F2F2 (Even Row Light Gray)
 *     Fill 5 = #EFF6FF (Header C.P light blue)
 *     Fill 6 = #EEF2FF (Header Overall/Grade light indigo)
 *     Fill 7 = #F3F4F6 (Header Totals light gray)
 * - Borders:
 *     Border 1 = Thin grid border (#D1D5DB) on all sides
 *     Border 2 = Header border with medium bottom (#9CA3AF)
 * - Fonts:
 *     Font 0 = Regular 11pt Calibri
 *     Font 1 = Bold 11pt Calibri (Headers)
 *     Font 2 = Bold 11pt Calibri Indigo #3730A3 (Grade / Overall)
 *     Font 3 = Bold 11pt Calibri Dark #111827 (Totals)
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font>
      <sz val="11"/>
      <color rgb="FF1F2937"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FF111827"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FF3730A3"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FF111827"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="medium"><color rgb="FF9CA3AF"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="14">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>

    <!-- 1: Header Center (#E5E7EB) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 2: Header Left (#E5E7EB) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 3: Header Center CP (#EFF6FF) -->
    <xf numFmtId="0" fontId="1" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 4: Header Center Totals (#F3F4F6) -->
    <xf numFmtId="0" fontId="1" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 5: Header Center Overall & Grade (#EEF2FF) -->
    <xf numFmtId="0" fontId="2" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>

    <!-- DATA ROWS: WHITE (#FFFFFF) -->
    <!-- 6: White Row - Center -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 7: White Row - Left -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 8: White Row - Bold Total -->
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 9: White Row - Bold Indigo (Overall & Grade) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>

    <!-- DATA ROWS: LIGHT GRAY (#F2F2F2) -->
    <!-- 10: Gray Row - Center -->
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 11: Gray Row - Left -->
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 12: Gray Row - Bold Total -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 13: Gray Row - Bold Indigo (Overall & Grade) -->
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

/**
 * Extracts data directly from the rendered table in the DOM if available.
 * Cleans trailing "/10" notation so headers match standard format.
 */
function extractDataFromDomTable(): { headers: string[]; rows: (string | number)[][] } | null {
  if (typeof document === 'undefined') return null;
  const table = document.getElementById('score-table-view') as HTMLTableElement | null;
  if (!table) return null;

  const thElements = Array.from(table.querySelectorAll('thead th'));
  if (thElements.length === 0) return null;

  const headers = thElements.map(th => {
    const clone = th.cloneNode(true) as HTMLElement;
    const raw = clone.innerText.replace(/\s+/g, ' ').trim();
    // Normalize trailing /10 max score tags if present in header
    return raw.replace(/\s*\/\s*\d+$/, '').trim();
  });

  const trElements = Array.from(table.querySelectorAll('tbody tr'));
  const rows: (string | number)[][] = trElements.map(tr => {
    const tdElements = Array.from(tr.querySelectorAll('td'));
    return tdElements.map(td => {
      // 1. If contains input
      const input = td.querySelector('input') as HTMLInputElement | null;
      if (input) {
        const val = input.value.trim();
        if (input.type === 'number' && val !== '' && !isNaN(Number(val))) {
          return Number(val);
        }
        return val;
      }

      // 2. If contains select (e.g. Sex)
      const select = td.querySelector('select') as HTMLSelectElement | null;
      if (select) {
        const selectedText = select.options[select.selectedIndex]?.text || select.value || '';
        return selectedText.trim();
      }

      // 3. If contains badge span (e.g. Grade)
      const badge = td.querySelector('span') as HTMLElement | null;
      if (badge && badge.innerText) {
        const txt = badge.innerText.trim();
        if (txt !== '' && !isNaN(Number(txt))) {
          return Number(txt);
        }
        return txt;
      }

      // 4. Fallback to td inner text
      const raw = td.innerText.trim();
      if (raw !== '' && !isNaN(Number(raw))) {
        return Number(raw);
      }
      return raw;
    });
  });

  return { headers, rows };
}

/**
 * Exports the selected class Score List to a styled Excel (.xlsx) workbook.
 * Matches website table appearance:
 * - Exact column headers, widths, and row heights
 * - Alternating row colors: Row 1 = White (#FFFFFF), Row 2 = Light gray (#F2F2F2)
 * - Thin grid borders on all cells
 * - Left-aligned text (Name, Comments), Centered scores and grades
 * - Frozen header row
 * - Clean filename: Class_{className}_Q{quarter}_EGradeBook.xlsx
 */
export const exportScoreList = async (
  students: Student[], 
  scores: any[], 
  records: ParticipationRecord[], 
  classObj: Class, 
  quarter: Quarter,
  settings: any
) => {
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  const filename = `Class_${cleanClassName}_Q${quarter}_EGradeBook.xlsx`;

  try {
    const sortedStudents = getClassRoster(students, classObj.id);
    const classScores = scores.filter(
      s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
    );

    // Column definitions matching ScoreList.tsx exactly
    const baseColumns = [
      { key: 'no', title: 'No.', width: 6, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'name', title: 'Name', width: 26, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
      { key: 'nameKhmer', title: 'Name in Khmer', width: 24, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
      { key: 'sex', title: 'Sex', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'studentId', title: 'ID', width: 13, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'conduct', title: 'Conduct', width: 11, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'cp', title: 'C.P', width: 10, headerStyle: 3, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'hw1', title: 'HW1', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'hw2', title: 'HW2', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'hw3', title: 'HW3', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'hwTotal', title: 'HW Total', width: 12, headerStyle: 4, isLeft: false, isTotal: true, isIndigo: false },
      { key: 'qz1', title: 'Qz1', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'qz2', title: 'Qz2', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'qz3', title: 'Qz3', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'qzTotal', title: 'Qz Total', width: 12, headerStyle: 4, isLeft: false, isTotal: true, isIndigo: false },
      { key: 'test1', title: 'Test1', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'test2', title: 'Test2', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
      { key: 'testTotal', title: 'Test Total', width: 12, headerStyle: 4, isLeft: false, isTotal: true, isIndigo: false },
      { key: 'overall', title: 'Overall', width: 12, headerStyle: 5, isLeft: false, isTotal: false, isIndigo: true },
      { key: 'grade', title: 'Grade', width: 10, headerStyle: 5, isLeft: false, isTotal: false, isIndigo: true },
      { key: 'rank', title: 'Rank', width: 9, headerStyle: 5, isLeft: false, isTotal: false, isIndigo: true },
      { key: 'achievement', title: 'Achievement', width: 52, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
      { key: 'attitude', title: 'Attitude', width: 48, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
      { key: 'areasToImprove', title: 'Areas to Improve', width: 48, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
    ];

    const domExtraction = extractDataFromDomTable();
    let headersToRender: string[] = [];
    let rowsToRender: (string | number | undefined)[][] = [];

    if (domExtraction && domExtraction.headers.length >= 10 && domExtraction.rows.length === sortedStudents.length) {
      headersToRender = domExtraction.headers;
      rowsToRender = domExtraction.rows;
    } else {
      const rankMap = getClassScoreRanks(students, scores, records, classObj.id, classObj.name, quarter, settings);
      headersToRender = baseColumns.map(c => c.title);
      rowsToRender = sortedStudents.map(student => {
        const score = scores.find(
          s => s.studentId === student.id &&
               (!s.classId || s.classId === classObj.id) &&
               Number(s.quarter) === Number(quarter)
        );
        const rawCp = getStudentQuarterTotal(records, student.id, quarter);
        const cappedRawCp = Math.min(rawCp, settings.maxScores?.cp || 10);
        const calculated = calculateStudentGrades(score, rawCp, settings, student.id, quarter, classObj.name, classScores);

        const sexDisplay = student.sex === 'Male' ? 'M' : student.sex === 'Female' ? 'F' : (student.sex || '');

        return [
          student.displayNum,
          student.name,
          student.nameKhmer || '',
          sexDisplay,
          student.studentId || '',
          score?.conduct ?? '',
          score?.cpScore !== undefined ? score.cpScore : cappedRawCp,
          score?.hw1 ?? '',
          score?.hw2 ?? '',
          score?.hw3 ?? '',
          calculated.hwTotal,
          score?.quiz1 ?? '',
          score?.quiz2 ?? '',
          score?.quiz3 ?? '',
          calculated.quizTotal,
          score?.test1 ?? '',
          score?.test2 ?? '',
          calculated.testTotal,
          calculated.overallScore,
          calculated.letterGrade,
          rankMap[student.id],
          score?.achievement || calculated.autoAchievement,
          score?.attitude || calculated.autoAttitude,
          score?.areasToImprove || calculated.autoImprovement
        ];
      });
    }

    const totalRows = rowsToRender.length + 1; // 1 header row + N student rows

    // Build column configuration dynamically (prefer exact title match before prefix match)
    const colConfigs = headersToRender.map((hdr, idx) => {
      const match =
        baseColumns.find(bc => bc.title.toLowerCase() === hdr.toLowerCase()) ||
        baseColumns.find(bc => hdr.toLowerCase().startsWith(bc.title.toLowerCase()));
      if (match) return match;

      const isLeft = /name|achievement|attitude|areas|improve/i.test(hdr);
      const isIndigo = /overall|grade|rank/i.test(hdr);
      const isTotal = /total/i.test(hdr);
      const isCp = /c\.?p/i.test(hdr);
      let headerStyle = isLeft ? 2 : 1;
      if (isCp) headerStyle = 3;
      else if (isTotal) headerStyle = 4;
      else if (isIndigo) headerStyle = 5;

      return {
        key: `col_${idx}`,
        title: hdr,
        width: isLeft ? 35 : 12,
        headerStyle,
        isLeft,
        isTotal,
        isIndigo
      };
    });

    // Build cols XML
    let colsXml = '<cols>';
    colConfigs.forEach((col, idx) => {
      colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${col.width}" customWidth="1"/>`;
    });
    colsXml += '</cols>';

    // Build sheetData XML
    let sheetDataXml = '<sheetData>';

    // Header Row (Row 1) - height 28pt
    sheetDataXml += '<row r="1" ht="28" customHeight="1">';
    headersToRender.forEach((title, idx) => {
      const cellRef = `${colName(idx)}1`;
      const colCfg = colConfigs[idx];
      sheetDataXml += `<c r="${cellRef}" s="${colCfg.headerStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(title)}</t></is></c>`;
    });
    sheetDataXml += '</row>';

    // Data Rows (Row 2 .. totalRows) - height 22pt
    rowsToRender.forEach((rowValues, index) => {
      const rowNum = index + 2;
      // Alternating Row Color:
      // First data row (index 0) = White (#FFFFFF)
      // Second data row (index 1) = Light gray (#F2F2F2)
      // Third data row (index 2) = White (#FFFFFF)
      // Fourth data row (index 3) = Light gray (#F2F2F2)
      const isWhiteRow = index % 2 === 0;

      const sCenter = isWhiteRow ? 6 : 10;
      const sLeft = isWhiteRow ? 7 : 11;
      const sTotal = isWhiteRow ? 8 : 12;
      const sIndigo = isWhiteRow ? 9 : 13;

      sheetDataXml += `<row r="${rowNum}" ht="22" customHeight="1">`;
      colConfigs.forEach((col, colIdx) => {
        const cellRef = `${colName(colIdx)}${rowNum}`;
        const val = rowValues[colIdx];
        let styleId = sCenter;
        if (col.isLeft) styleId = sLeft;
        else if (col.isIndigo) styleId = sIndigo;
        else if (col.isTotal) styleId = sTotal;

        sheetDataXml += renderCell(cellRef, val, styleId);
      });
      sheetDataXml += '</row>';
    });

    sheetDataXml += '</sheetData>';

    const lastColLetter = colName(colConfigs.length - 1);
    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColLetter}${totalRows}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  ${sheetDataXml}
  <autoFilter ref="A1:${lastColLetter}${totalRows}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

    const encoder = new TextEncoder();
    const zipFiles: ZipFileItem[] = [
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
      { name: 'xl/workbook.xml', data: encoder.encode(getWorkbookXml(`Class ${classObj.name}`)) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS_XML) },
      { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
      { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheetXml) },
    ];

    const zipBuffer = buildZipArchive(zipFiles);
    downloadExcelBlob(zipBuffer, filename);
  } catch (error) {
    console.error('Styled Excel generation error, falling back to standard export:', error);
    // Automatic fallback to SheetJS so a file is ALWAYS downloaded
    const fallbackSorted = getClassRoster(students, classObj.id);
    const classScores = scores.filter(
      s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
    );
    const rankMap = getClassScoreRanks(students, scores, records, classObj.id, classObj.name, quarter, settings);
    const fallbackRows = fallbackSorted.map(student => {
      const score = scores.find(
        s => s.studentId === student.id &&
             (!s.classId || s.classId === classObj.id) &&
             Number(s.quarter) === Number(quarter)
      );
      const rawCp = getStudentQuarterTotal(records, student.id, quarter);
      const cappedRawCp = Math.min(rawCp, settings.maxScores?.cp || 10);
      const calculated = calculateStudentGrades(score, rawCp, settings, student.id, quarter, classObj.name, classScores);

      return {
        'No.': student.displayNum,
        'Name': student.name,
        'Name in Khmer': student.nameKhmer || '',
        'Sex': student.sex === 'Male' ? 'M' : student.sex === 'Female' ? 'F' : (student.sex || ''),
        'ID': student.studentId || '',
        'Conduct': score?.conduct ?? '',
        'C.P': score?.cpScore !== undefined ? score.cpScore : cappedRawCp,
        'HW1': score?.hw1 ?? '',
        'HW2': score?.hw2 ?? '',
        'HW3': score?.hw3 ?? '',
        'HW Total': calculated.hwTotal,
        'Qz1': score?.quiz1 ?? '',
        'Qz2': score?.quiz2 ?? '',
        'Qz3': score?.quiz3 ?? '',
        'Qz Total': calculated.quizTotal,
        'Test1': score?.test1 ?? '',
        'Test2': score?.test2 ?? '',
        'Test Total': calculated.testTotal,
        'Overall': calculated.overallScore,
        'Grade': calculated.letterGrade,
        'Rank': rankMap[student.id],
        'Achievement': score?.achievement || calculated.autoAchievement,
        'Attitude': score?.attitude || calculated.autoAttitude,
        'Areas to Improve': score?.areasToImprove || calculated.autoImprovement
      };
    });
    const ws = XLSX.utils.json_to_sheet(fallbackRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Class ${classObj.name}`.substring(0, 31));
    XLSX.writeFile(wb, filename);
  }
};

/**
 * Formatted generic table export to Excel with alternating row colors.
 */
export const exportToExcel = async (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    const ws = XLSX.utils.json_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return;
  }

  try {
    const keys = Object.keys(data[0]);
    const totalRows = data.length + 1;

    // Auto calculate reasonable column widths
    const colWidths = keys.map(k => {
      let maxLen = k.length;
      for (let i = 0; i < Math.min(data.length, 50); i++) {
        const valStr = String(data[i][k] ?? '');
        if (valStr.length > maxLen) maxLen = valStr.length;
      }
      const maxCap = /feedback|comment/i.test(k) ? 74 : 55;
      return Math.min(Math.max(maxLen + 4, 10), maxCap);
    });

    let colsXml = '<cols>';
    colWidths.forEach((w, idx) => {
      colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`;
    });
    colsXml += '</cols>';

    let sheetDataXml = '<sheetData>';
    // Header row
    sheetDataXml += '<row r="1" ht="26" customHeight="1">';
    keys.forEach((key, colIdx) => {
      const cellRef = `${colName(colIdx)}1`;
      sheetDataXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(key)}</t></is></c>`;
    });
    sheetDataXml += '</row>';

    // Data rows
    data.forEach((row, rowIdx) => {
      const rowNum = rowIdx + 2;
      const isWhiteRow = rowIdx % 2 === 0;
      const sCenter = isWhiteRow ? 6 : 10;
      const sLeft = isWhiteRow ? 7 : 11;

      let maxLines = 1;
      keys.forEach((key, colIdx) => {
        const val = row[key];
        if (typeof val === 'string' && val.length > 0) {
          const approxCols = Math.max(colWidths[colIdx] - 3, 12);
          const lines = val
            .split(/\r?\n/)
            .reduce((acc, part) => acc + Math.max(1, Math.ceil(part.length / approxCols)), 0);
          if (lines > maxLines) maxLines = lines;
        }
      });
      const rowHeight = maxLines > 1 ? Math.min(Math.max(maxLines * 15 + 12, 26), 210) : 22;

      sheetDataXml += `<row r="${rowNum}" ht="${rowHeight}" customHeight="1">`;
      keys.forEach((key, colIdx) => {
        const cellRef = `${colName(colIdx)}${rowNum}`;
        const val = row[key];
        const isNum = typeof val === 'number' && !isNaN(val);
        const styleId = isNum ? sCenter : sLeft;
        sheetDataXml += renderCell(cellRef, val, styleId);
      });
      sheetDataXml += '</row>';
    });
    sheetDataXml += '</sheetData>';

    const lastColLetter = colName(keys.length - 1);
    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColLetter}${totalRows}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  ${sheetDataXml}
  <autoFilter ref="A1:${lastColLetter}${totalRows}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

    const encoder = new TextEncoder();
    const zipFiles: ZipFileItem[] = [
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
      { name: 'xl/workbook.xml', data: encoder.encode(getWorkbookXml("Sheet1")) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS_XML) },
      { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
      { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheetXml) },
    ];

    const zipBuffer = buildZipArchive(zipFiles);
    downloadExcelBlob(zipBuffer, filename);
  } catch (error) {
    console.error('Styled Excel generic export error, falling back to standard export:', error);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }
};

/**
 * Formatted Quarter Summary export to Excel with alternating row colors.
 */
export const exportQuarterSummary = async (
  students: Student[], 
  records: ParticipationRecord[], 
  classObj: Class, 
  quarter: Quarter,
  analyses?: StudentQuarterAnalysis[],
  gradingSettings?: GradingSettings
) => {
  const sortedStudents = getClassRoster(students, classObj.id);
  const analysisMap = new Map((analyses || []).map(a => [a.student.id, a] as const));
  const hasAnalyses = analysisMap.size > 0;
  const classHasScores = (analyses || []).some(a => a.classHasScores);
  const hasConduct = (analyses || []).some(a => a.hasConductInClass);
  const hasHw = (analyses || []).some(a => a.hasHwInClass);
  const hasQuiz = (analyses || []).some(a => a.hasQuizInClass);
  const hasTest = (analyses || []).some(a => a.hasTestInClass);
  const hasAttendance = (analyses || []).some(a => a.attendance.total > 0);

  const data = sortedStudents.map(student => {
    const analysis = analysisMap.get(student.id);
    const row: Record<string, string | number> = {
      'Student Number': student.displayNum,
      'Name': student.name,
      'Name in Khmer': student.nameKhmer || '',
      'Student ID': student.studentId || ''
    };

    if (hasAnalyses && classHasScores) {
      if (hasConduct) {
        row[`Conduct (${gradingSettings?.maxScores.conduct ?? 10})`] =
          analysis?.conductVal !== undefined ? analysis.conductVal : '';
      }
      row[`CP (${gradingSettings?.maxScores.cp ?? 10})`] = analysis ? analysis.effectiveCp : '';
      if (hasHw) row['HW (%)'] = analysis?.hasStudentScoreFields ? analysis.hwTotal : '';
      if (hasQuiz) row['Quiz (%)'] = analysis?.hasStudentScoreFields ? analysis.quizTotal : '';
      if (hasTest) row['Test (%)'] = analysis?.hasStudentScoreFields ? analysis.testTotal : '';
      row[`Q${quarter} Overall (%)`] = analysis?.hasStudentScoreFields ? analysis.overallScore : '';
      row['Grade'] = analysis?.hasStudentScoreFields ? analysis.letterGrade : '';
      row['Rank'] = analysis?.hasStudentScoreFields ? analysis.rank : '';
    }

    if (hasAnalyses && hasAttendance) {
      row['Attendance (%)'] = analysis && analysis.attendance.total > 0 ? analysis.attendance.rate : '';
    }

    row['Q1'] = getStudentQuarterTotal(records, student.id, 1);
    row['Q2'] = getStudentQuarterTotal(records, student.id, 2);
    row['Q3'] = getStudentQuarterTotal(records, student.id, 3);
    row['Q4'] = getStudentQuarterTotal(records, student.id, 4);
    row['Semester 1 Total'] = getStudentSemesterTotal(records, student.id, 1);
    row['Semester 2 Total'] = getStudentSemesterTotal(records, student.id, 2);
    row['Year Total'] = getStudentYearTotal(records, student.id);

    if (hasAnalyses) {
      row['Constructive Feedback'] = analysis?.comment || '';
    }

    return row;
  });
  
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  await exportToExcel(data, `Class_${cleanClassName}_Q${quarter}_Summary`);
};

/**
 * Exports the official WIS-style Quarter Score List (1..6 HW, 1..6 Quizzes, 1..3 Monthly Tests)
 * with merged two-row headers and landscape print configuration.
 */
const QUARTER_SHEET_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="7">
    <font>
      <sz val="12"/>
      <color rgb="FF111827"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="12"/>
      <color rgb="FF000000"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="12"/>
      <color rgb="FFFFFFFF"/>
      <name val="Leelawadee UI"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="12"/>
      <color rgb="FF000000"/>
      <name val="Leelawadee UI"/>
      <family val="2"/>
    </font>
    <font>
      <sz val="12"/>
      <color rgb="FF111827"/>
      <name val="Leelawadee UI"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="12"/>
      <color rgb="FF000000"/>
      <name val="Leelawadee UI"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="12"/>
      <color rgb="FF172A58"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="15">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Black Banner (#000000) White Bold Text -->
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 2: Letterhead Khmer Bold -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 3: Letterhead English Navy Bold -->
    <xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 4: Letterhead Subtitle Centered -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 5: Metadata Bold Label Left -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 6: Metadata Value Khmer/Latin Left -->
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 7: Table Header Center (Bilingual + Wrap) -->
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 8: Table Header Vertical Rotated (Conduct / C.P.) -->
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" textRotation="90" wrapText="1"/>
    </xf>
    <!-- 9: White Row - Center -->
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 10: White Row - Left English -->
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 11: White Row - Left Khmer (Leelawadee UI) -->
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 12: Light Gray Row (#F2F2F2) - Center -->
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 13: Light Gray Row (#F2F2F2) - Left English -->
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 14: Light Gray Row (#F2F2F2) - Left Khmer (Leelawadee UI) -->
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

const WIS_LOGO_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 10 156 166" width="260" height="277">
  <defs>
    <clipPath id="wis-flag-w">
      <path d="M54 76 L72 76 L82 117 L93 76 L108 76 L119 117 L129 76 L147 76 L130 140 L110 140 L100 104 L90 140 L70 140 Z"/>
    </clipPath>
  </defs>
  <g clip-path="url(#wis-flag-w)">
    <rect x="50" y="74" width="102" height="68" fill="#FFFFFF"/>
    <rect x="50" y="76" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="86" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="96" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="106" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="116" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="126" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="135" width="102" height="5" fill="#D92027"/>
    <rect x="50" y="74" width="49" height="40" fill="#172A58"/>
    <g fill="#FFFFFF">
      <circle cx="60" cy="83" r="1.5"/><circle cx="70" cy="83" r="1.5"/><circle cx="80" cy="83" r="1.5"/><circle cx="90" cy="83" r="1.5"/>
      <circle cx="65" cy="90" r="1.5"/><circle cx="75" cy="90" r="1.5"/><circle cx="85" cy="90" r="1.5"/>
      <circle cx="60" cy="97" r="1.5"/><circle cx="70" cy="97" r="1.5"/><circle cx="80" cy="97" r="1.5"/><circle cx="90" cy="97" r="1.5"/>
      <circle cx="65" cy="104" r="1.5"/><circle cx="75" cy="104" r="1.5"/><circle cx="85" cy="104" r="1.5"/>
      <circle cx="70" cy="110" r="1.5"/><circle cx="80" cy="110" r="1.5"/><circle cx="90" cy="110" r="1.5"/>
    </g>
  </g>
  <path d="M49 52 L48 73 C48 77 72 86 100 86 C128 86 152 77 152 73 L151 52 Z" fill="#0F1115"/>
  <path d="M100 13 L172 39 C177 41 177 44 172 46 L100 72 L28 46 C23 44 23 41 28 39 Z" fill="#0F1115"/>
  <polygon points="100,19 161,41.5 100,65 39,41.5" fill="#475055"/>
  <circle cx="102" cy="40" r="3.2" fill="#181A1E"/>
  <path d="M102 40 L155 47 C162 48 165 53 165 62" stroke="#D92027" stroke-width="4" stroke-linecap="round" fill="none"/>
  <rect x="160" y="61" width="10" height="3.2" rx="1.4" fill="#F2D024"/>
  <path d="M161 64 L156 95 L159.5 95 L163 67 L163 95 L166.5 95 L166 67 L169.5 95 L173 95 L168 64 Z" fill="#D92027"/>
  <path d="M48 140 L152 140 C152 145 155 147 160 147 L160 158 L40 158 L40 147 C45 147 48 145 48 140 Z" fill="#172A58"/>
  <text x="100" y="153.5" text-anchor="middle" fill="#FFFFFF" font-family="Georgia, 'Times New Roman', serif" font-size="14.5" font-weight="700" letter-spacing="1">WESTERN</text>
  <text x="100" y="171" text-anchor="middle" fill="#172A58" font-family="Arial, Helvetica, sans-serif" font-size="9.6" font-weight="800" letter-spacing="0.4">INTERNATIONAL SCHOOL</text>
</svg>`;

export async function drawWisLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    const svgBlob = new Blob([WIS_LOGO_SVG_MARKUP], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return await new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(false);
      }, 1500);

      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, x, y, width, height);
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(true);
        } catch {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(false);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  } catch {
    return false;
  }
}

async function renderWisLogoPngBytes(): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 277;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const drawn = await drawWisLogoOnCanvas(ctx, 0, 0, canvas.width, canvas.height);
    if (!drawn) return null;

    return await new Promise<Uint8Array | null>(resolve => {
      canvas.toBlob(async blob => {
        if (!blob) {
          resolve(null);
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      }, 'image/png');
    });
  } catch {
    return null;
  }
}

const WIS_DRAWING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>1</xdr:col>
      <xdr:colOff>520000</xdr:colOff>
      <xdr:row>0</xdr:row>
      <xdr:rowOff>12000</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="1066800" cy="1136500"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="1" name="Western_International_School_Logo"/>
        <xdr:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId1"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="1066800" cy="1136500"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;

const WIS_DRAWING_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

function buildQuarterScoreWorksheetXml(params: {
  students: (Student & { displayNum: number })[];
  scores: ScoreRecord[];
  records: ParticipationRecord[];
  classObj: Class;
  quarter: Quarter;
  settings: GradingSettings;
  teacherName?: string;
  subject?: string;
  hasLogo?: boolean;
}): string {
  const { students, scores, records, classObj, quarter, settings, teacherName = '', subject = '', hasLogo = false } = params;
  const classScores = scores.filter(
    s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
  );

  let maxNameLen = 18;
  let maxKhmerLen = 14;
  const studentRows = students.map(student => {
    if (student.name.length > maxNameLen) maxNameLen = student.name.length;
    if ((student.nameKhmer || '').length > maxKhmerLen) maxKhmerLen = (student.nameKhmer || '').length;

    const score = classScores.find(s => s.studentId === student.id);
    const rawCp = getStudentQuarterTotal(records, student.id, quarter);
    const cappedCp = Math.min(rawCp, settings.maxScores?.cp || 10);
    const cpDisplay = score?.cpScore !== undefined ? score.cpScore : (rawCp > 0 ? cappedCp : '');
    const sexShort = student.sex === 'Male' ? 'M' : student.sex === 'Female' ? 'F' : (student.sex || '');
    const groupValue = student.group && student.group.trim() !== '' ? student.group : 'III';

    return [
      student.displayNum,
      student.name,
      student.nameKhmer || '',
      sexShort,
      groupValue,
      score?.conduct ?? '',
      cpDisplay,
      score?.hw1 ?? '',
      score?.hw2 ?? '',
      score?.hw3 ?? '',
      score?.hw4 ?? '',
      score?.hw5 ?? '',
      score?.hw6 ?? '',
      score?.quiz1 ?? '',
      score?.quiz2 ?? '',
      score?.quiz3 ?? '',
      score?.quiz4 ?? '',
      score?.quiz5 ?? '',
      score?.quiz6 ?? '',
      score?.test1 ?? '',
      score?.test2 ?? '',
      score?.test3 ?? ''
    ];
  });

  const colWidths = [
    6,
    Math.max(28, Math.min(44, maxNameLen + 6)),
    Math.max(24, Math.min(38, maxKhmerLen + 7)),
    8,
    8.5,
    7.5,
    7.5,
    6.5, 6.5, 6.5, 6.5, 6.5, 6.5, // HW 1-6
    6.5, 6.5, 6.5, 6.5, 6.5, 6.5, // Quiz 1-6
    8.5, 8.5, 8.5                 // Test 1-3
  ];
  const totalCols = colWidths.length; // 22 cols (A..V)

  let colsXml = '<cols>';
  colWidths.forEach((w, idx) => {
    colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`;
  });
  colsXml += '</cols>';

  let sheetDataXml = '<sheetData>';

  // Row 1: Dedicated left space for School Logo (A1:C3) + Black Title Banner (H1:V1)
  sheetDataXml += '<row r="1" ht="32" customHeight="1">';
  if (!hasLogo) {
    sheetDataXml += `<c r="A1" s="3" t="inlineStr"><is><t xml:space="preserve">${escapeXml('WESTERN INTERNATIONAL SCHOOL')}</t></is></c>`;
    sheetDataXml += '<c r="B1" s="0"/><c r="C1" s="0"/>';
  }
  sheetDataXml += `<c r="H1" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml('តារាងសម្រង់ពិន្ទុ / Score List')}</t></is></c>`;
  for (let c = 8; c < totalCols; c++) {
    sheetDataXml += `<c r="${colName(c)}1" s="1"/>`;
  }
  sheetDataXml += '</row>';

  // Row 2: Teacher Name
  sheetDataXml += '<row r="2" ht="30" customHeight="1">';
  sheetDataXml += `<c r="H2" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml('Teacher Name:')}</t></is></c>`;
  sheetDataXml += `<c r="L2" s="6" t="inlineStr"><is><t xml:space="preserve">${escapeXml(teacherName)}</t></is></c>`;
  sheetDataXml += '</row>';

  // Row 3: Subject
  sheetDataXml += '<row r="3" ht="28" customHeight="1">';
  sheetDataXml += `<c r="H3" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml('Subject:')}</t></is></c>`;
  sheetDataXml += `<c r="L3" s="6" t="inlineStr"><is><t xml:space="preserve">${escapeXml(subject)}</t></is></c>`;
  sheetDataXml += '</row>';

  // Row 4: School Khmer title (below logo) + Grade + For: Quarter X
  sheetDataXml += '<row r="4" ht="22" customHeight="1">';
  sheetDataXml += `<c r="A4" s="2" t="inlineStr"><is><t xml:space="preserve">${escapeXml('សាលាវ៉េស្ទើនអន្តរជាតិ')}</t></is></c>`;
  sheetDataXml += '<c r="B4" s="0"/><c r="C4" s="0"/>';
  sheetDataXml += `<c r="H4" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml('Grade:')}</t></is></c>`;
  sheetDataXml += `<c r="L4" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml(classObj.name)}</t></is></c>`;
  sheetDataXml += `<c r="O4" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml('For :')}</t></is></c>`;
  sheetDataXml += `<c r="R4" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml(`Quarter ${quarter}`)}</t></is></c>`;
  sheetDataXml += '</row>';

  // Row 5: Registrar's Office • STD (below Khmer title)
  sheetDataXml += '<row r="5" ht="21" customHeight="1">';
  sheetDataXml += `<c r="A5" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml("Registrar's Office • STD")}</t></is></c>`;
  sheetDataXml += '<c r="B5" s="0"/><c r="C5" s="0"/>';
  sheetDataXml += '</row>';

  // Row 6: Thin blank spacer before table
  sheetDataXml += '<row r="6" ht="8" customHeight="1"/>';

  // Row 7: Table Header Row 1
  const leftHeaders = [
    { label: 'N°', style: 7 },
    { label: 'Name', style: 7 },
    { label: 'ឈ្មោះ', style: 7 },
    { label: 'Sex\nភេទ', style: 7 },
    { label: 'Group\nក្រុម', style: 7 },
    { label: 'Conduct', style: 8 },
    { label: 'C.P.', style: 8 }
  ];
  sheetDataXml += '<row r="7" ht="36" customHeight="1">';
  leftHeaders.forEach((h, idx) => {
    sheetDataXml += `<c r="${colName(idx)}7" s="${h.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(h.label)}</t></is></c>`;
  });
  sheetDataXml += `<c r="H7" s="7" t="inlineStr"><is><t xml:space="preserve">${escapeXml('កិច្ចការផ្ទះ / Homework')}</t></is></c>`;
  for (let i = 8; i <= 12; i++) sheetDataXml += `<c r="${colName(i)}7" s="7"/>`;
  sheetDataXml += `<c r="N7" s="7" t="inlineStr"><is><t xml:space="preserve">${escapeXml('តេស្តខ្លី / Quizzes')}</t></is></c>`;
  for (let i = 14; i <= 18; i++) sheetDataXml += `<c r="${colName(i)}7" s="7"/>`;
  sheetDataXml += `<c r="T7" s="7" t="inlineStr"><is><t xml:space="preserve">${escapeXml('Monthly Test\nតេស្តប្រចាំខែ')}</t></is></c>`;
  for (let i = 20; i <= 21; i++) sheetDataXml += `<c r="${colName(i)}7" s="7"/>`;
  sheetDataXml += '</row>';

  // Row 8: Table Header Row 2 (Sub-numbers)
  sheetDataXml += '<row r="8" ht="22" customHeight="1">';
  leftHeaders.forEach((h, idx) => {
    sheetDataXml += `<c r="${colName(idx)}8" s="${h.style}"/>`;
  });
  for (let i = 1; i <= 6; i++) sheetDataXml += `<c r="${colName(6 + i)}8" s="7" t="n"><v>${i}</v></c>`;
  for (let i = 1; i <= 6; i++) sheetDataXml += `<c r="${colName(12 + i)}8" s="7" t="n"><v>${i}</v></c>`;
  for (let i = 1; i <= 3; i++) sheetDataXml += `<c r="${colName(18 + i)}8" s="7" t="n"><v>${i}</v></c>`;
  sheetDataXml += '</row>';

  // Data Rows starting Row 9 (White on Row 9, Light Gray on Row 10, alternating)
  studentRows.forEach((vals, rIdx) => {
    const rowNum = rIdx + 9;
    const isWhite = rIdx % 2 === 0;
    sheetDataXml += `<row r="${rowNum}" ht="25" customHeight="1">`;
    vals.forEach((val, colIdx) => {
      let styleId = isWhite ? 9 : 12; // Center numeric/short
      if (colIdx === 1) styleId = isWhite ? 10 : 13; // English Name left
      else if (colIdx === 2) styleId = isWhite ? 11 : 14; // Khmer Name left (Leelawadee UI)
      sheetDataXml += renderCell(`${colName(colIdx)}${rowNum}`, val, styleId);
    });
    sheetDataXml += '</row>';
  });

  sheetDataXml += '</sheetData>';

  const merges: string[] = [
    ...(!hasLogo ? ['A1:C1'] : []),
    'H1:V1',
    'H2:K2',
    'L2:V2',
    'H3:K3',
    'L3:V3',
    'A4:C4',
    'H4:K4',
    'L4:N4',
    'O4:Q4',
    'R4:V4',
    'A5:C5',
    'A7:A8',
    'B7:B8',
    'C7:C8',
    'D7:D8',
    'E7:E8',
    'F7:F8',
    'G7:G8',
    'H7:M7',
    'N7:S7',
    'T7:V7'
  ];

  const mergeXml = `<mergeCells count="${merges.length}">${merges
    .map(ref => `<mergeCell ref="${ref}"/>`)
    .join('')}</mergeCells>`;

  const lastColLetter = colName(totalCols - 1);
  const totalSheetRows = Math.max(studentRows.length + 8, 8);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColLetter}${totalSheetRows}"/>
  <sheetViews>
    <sheetView showGridLines="1" tabSelected="1" workbookViewId="0">
      <pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  ${sheetDataXml}
  ${mergeXml}
  <pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.25" footer="0.25"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
  ${hasLogo ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

function buildMultiSheetExcelArchive(
  sheets: { name: string; xml: string }[],
  stylesXml: string,
  logoPng?: Uint8Array | null
): Uint8Array {
  const encoder = new TextEncoder();
  const hasLogo = Boolean(logoPng && logoPng.length > 0);

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n');

  const drawingOverrides = hasLogo
    ? sheets
        .map(
          (_, i) =>
            `  <Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
        )
        .join('\n')
    : '';

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${hasLogo ? '  <Default Extension="png" ContentType="image/png"/>' : ''}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
${drawingOverrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const sheetTags = sheets
    .map((s, i) => {
      const safeName = s.name.replace(/[\\/?*[\]:]/g, '_').substring(0, 31);
      return `    <sheet name="${escapeXml(safeName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
    })
    .join('\n');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>
  </bookViews>
  <sheets>
${sheetTags}
  </sheets>
  <calcPr calcId="124511"/>
</workbook>`;

  const sheetRels = sheets
    .map(
      (_, i) =>
        `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n');

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zipFiles: ZipFileItem[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(s.xml)
    }))
  ];

  if (hasLogo && logoPng) {
    zipFiles.push({ name: 'xl/media/image1.png', data: logoPng });
    sheets.forEach((_, i) => {
      const sheetDrawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/>
</Relationships>`;
      zipFiles.push({ name: `xl/drawings/drawing${i + 1}.xml`, data: encoder.encode(WIS_DRAWING_XML) });
      zipFiles.push({
        name: `xl/drawings/_rels/drawing${i + 1}.xml.rels`,
        data: encoder.encode(WIS_DRAWING_RELS_XML)
      });
      zipFiles.push({
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: encoder.encode(sheetDrawingRels)
      });
    });
  }

  return buildZipArchive(zipFiles);
}

/**
 * Exports the official WIS-style Quarter Score List (1..6 HW, 1..6 Quizzes, 1..3 Monthly Tests)
 * with embedded school logo, black table borders, zebra rows, Khmer font, Group III, and landscape setup.
 */
export const exportQuarterScoreSheet = async (params: {
  students: (Student & { displayNum: number })[];
  scores: ScoreRecord[];
  records: ParticipationRecord[];
  classObj: Class;
  quarter: Quarter;
  settings: GradingSettings;
  teacherName?: string;
  subject?: string;
}) => {
  const { students, scores, records, classObj, quarter, settings, teacherName = '', subject = '' } = params;
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  const filename = `Class_${cleanClassName}_Q${quarter}_ScoreSheet.xlsx`;

  try {
    const logoPng = await renderWisLogoPngBytes();
    const worksheetXml = buildQuarterScoreWorksheetXml({
      students,
      scores,
      records,
      classObj,
      quarter,
      settings,
      teacherName,
      subject,
      hasLogo: Boolean(logoPng)
    });
    const zipBuffer = buildMultiSheetExcelArchive(
      [{ name: `Quarter ${quarter}`, xml: worksheetXml }],
      QUARTER_SHEET_STYLES_XML,
      logoPng
    );
    downloadExcelBlob(zipBuffer, filename);
  } catch (error) {
    console.error('Styled Quarter Score Sheet export error, falling back:', error);
    const classScores = scores.filter(
      s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
    );
    const fallbackRows = students.map(student => {
      const score = classScores.find(s => s.studentId === student.id);
      const rawCp = getStudentQuarterTotal(records, student.id, quarter);
      const cappedCp = Math.min(rawCp, settings.maxScores?.cp || 10);
      const cpDisplay = score?.cpScore !== undefined ? score.cpScore : (rawCp > 0 ? cappedCp : '');
      const sexShort = student.sex === 'Male' ? 'M' : student.sex === 'Female' ? 'F' : (student.sex || '');
      const groupValue = student.group && student.group.trim() !== '' ? student.group : 'III';
      return {
        'No.': student.displayNum,
        'Name': student.name,
        'Name in Khmer': student.nameKhmer || '',
        'Sex': sexShort,
        'Group': groupValue,
        'Conduct': score?.conduct ?? '',
        'C.P.': cpDisplay,
        'HW1': score?.hw1 ?? '',
        'HW2': score?.hw2 ?? '',
        'HW3': score?.hw3 ?? '',
        'HW4': score?.hw4 ?? '',
        'HW5': score?.hw5 ?? '',
        'HW6': score?.hw6 ?? '',
        'Quiz1': score?.quiz1 ?? '',
        'Quiz2': score?.quiz2 ?? '',
        'Quiz3': score?.quiz3 ?? '',
        'Quiz4': score?.quiz4 ?? '',
        'Quiz5': score?.quiz5 ?? '',
        'Quiz6': score?.quiz6 ?? '',
        'Monthly Test 1': score?.test1 ?? '',
        'Monthly Test 2': score?.test2 ?? '',
        'Monthly Test 3': score?.test3 ?? ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(fallbackRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Quarter ${quarter}`);
    XLSX.writeFile(wb, filename);
  }
};

/**
 * Exports all 4 Quarters (Q1–Q4) into a single styled multi-sheet Excel workbook with school logo.
 */
export const exportAllQuartersScoreSheet = async (params: {
  students: (Student & { displayNum: number })[];
  scores: ScoreRecord[];
  records: ParticipationRecord[];
  classObj: Class;
  settings: GradingSettings;
  quarterSheetInfos: QuarterSheetInfo[];
}) => {
  const { students, scores, records, classObj, settings, quarterSheetInfos } = params;
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  const filename = `Class_${cleanClassName}_All_Quarters_ScoreSheet.xlsx`;

  const fallbackMeta = quarterSheetInfos.find(
    i => i.classId === classObj.id && (i.teacherName || i.subject)
  );

  const logoPng = await renderWisLogoPngBytes();
  const quarters: Quarter[] = [1, 2, 3, 4];
  const sheets = quarters.map(q => {
    const info = quarterSheetInfos.find(i => i.id === `${classObj.id}-${q}`);
    return {
      name: `Quarter ${q}`,
      xml: buildQuarterScoreWorksheetXml({
        students,
        scores,
        records,
        classObj,
        quarter: q,
        settings,
        teacherName: info?.teacherName || fallbackMeta?.teacherName || '',
        subject: info?.subject || fallbackMeta?.subject || '',
        hasLogo: Boolean(logoPng)
      })
    };
  });

  const zipBuffer = buildMultiSheetExcelArchive(sheets, QUARTER_SHEET_STYLES_XML, logoPng);
  downloadExcelBlob(zipBuffer, filename);
};

/**
 * Parses uploaded Excel student roster file.
 */
export const parseExcelStudents = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
