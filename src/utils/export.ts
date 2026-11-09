import * as XLSX from 'xlsx';
import { Student, ParticipationRecord, Class, Quarter } from '../types';
import { 
  getStudentQuarterTotal, 
  getStudentSemesterTotal, 
  getStudentYearTotal, 
  getClassRoster, 
  calculateStudentGrades 
} from './calculations';

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
 * Compresses data using RFC 1951 raw DEFLATE format (PKZIP Method 8).
 * Microsoft Excel requires XML parts in an .xlsx package to be DEFLATED.
 * Uses native browser CompressionStream when available, with RFC 1951 fallback.
 */
async function deflateData(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();
      const reader = cs.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const res = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of chunks) {
        res.set(c, pos);
        pos += c.length;
      }
      return res;
    } catch {
      // Fallback below if stream execution encounters an exception
    }
  }

  // Fallback RFC 1951 raw Deflate uncompressed blocks (Method 8 compliant)
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
async function buildZipArchive(files: ZipFileItem[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const fileItems = await Promise.all(
    files.map(async f => {
      const nameBytes = encoder.encode(f.name);
      const crc = calculateCrc32(f.data);
      const compressedData = await deflateData(f.data);
      return {
        name: f.name,
        nameBytes,
        uncompressedSize: f.data.length,
        compressedData,
        crc,
        localOffset: 0
      };
    })
  );

  let totalLocalSize = 0;
  let totalCentralDirSize = 0;
  for (const f of fileItems) {
    totalLocalSize += 30 + f.nameBytes.length + f.compressedData.length;
    totalCentralDirSize += 46 + f.nameBytes.length;
  }
  const totalSize = totalLocalSize + totalCentralDirSize + 22;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  let currentOffset = 0;

  // 1. Write Local File Headers and Data
  for (const f of fileItems) {
    f.localOffset = currentOffset;

    view.setUint32(currentOffset, 0x04034b50, true);     // Local file header signature
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
    view.setUint32(currentOffset, 0x02014b50, true);     // Central dir signature
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
  view.setUint32(currentOffset, 0x06054b50, true);      // EOCD signature
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

function downloadExcelBlob(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function renderCell(cellRef: string, value: string | number | undefined | null, styleId: number): string {
  if (value === undefined || value === null || value === '' || value === '-') {
    return `<c r="${cellRef}" s="${styleId}"/>`;
  }
  if (typeof value === 'number' && !isNaN(value)) {
    return `<c r="${cellRef}" s="${styleId}" t="n"><v>${value}</v></c>`;
  }
  return `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
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
  // Excel sheet names cannot exceed 31 chars and cannot contain \ / ? * [ ] :
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
 * This guarantees the export reflects the exact onscreen table structure,
 * column order, and values.
 */
function extractDataFromDomTable(): { headers: string[]; rows: (string | number)[][] } | null {
  if (typeof document === 'undefined') return null;
  const table = document.getElementById('score-table-view') as HTMLTableElement | null;
  if (!table) return null;

  const thElements = Array.from(table.querySelectorAll('thead th'));
  if (thElements.length === 0) return null;

  const headers = thElements.map(th => {
    // Clean text by replacing linebreaks with single space
    const clone = th.cloneNode(true) as HTMLElement;
    return clone.innerText.replace(/\s+/g, ' ').trim();
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
  const domExtraction = extractDataFromDomTable();
  const sortedStudents = getClassRoster(students, classObj.id);
  const classScores = scores.filter(
    s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
  );

  // Column definitions matching ScoreList.tsx exactly
  const baseColumns = [
    { key: 'no', title: 'No.', width: 6, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
    { key: 'name', title: 'Name', width: 26, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
    { key: 'sex', title: 'Sex', width: 9, headerStyle: 1, isLeft: false, isTotal: false, isIndigo: false },
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
    { key: 'achievement', title: 'Achievement', width: 52, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
    { key: 'attitude', title: 'Attitude', width: 36, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
    { key: 'areasToImprove', title: 'Areas to Improve', width: 40, headerStyle: 2, isLeft: true, isTotal: false, isIndigo: false },
  ];

  let headersToRender: string[] = [];
  let rowsToRender: (string | number | undefined)[][] = [];

  if (domExtraction && domExtraction.headers.length >= 10 && domExtraction.rows.length > 0) {
    // Source of truth: live rendered DOM table
    headersToRender = domExtraction.headers;
    rowsToRender = domExtraction.rows;
  } else {
    // Structured data model calculation fallback
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
        sexDisplay,
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
        score?.achievement || calculated.autoAchievement,
        score?.attitude || calculated.autoAttitude,
        score?.areasToImprove || calculated.autoImprovement
      ];
    });
  }

  const totalRows = rowsToRender.length + 1; // 1 header row + N student rows

  // Build column configuration dynamically
  const colConfigs = headersToRender.map((hdr, idx) => {
    const match = baseColumns.find(bc => 
      bc.title.toLowerCase() === hdr.toLowerCase() || 
      hdr.toLowerCase().startsWith(bc.title.toLowerCase())
    );
    if (match) return match;

    const isLeft = /name|achievement|attitude|areas|improve/i.test(hdr);
    const isIndigo = /overall|grade/i.test(hdr);
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
    sheetDataXml += `<c r="${cellRef}" s="${colCfg.headerStyle}" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c>`;
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

  const zipBuffer = await buildZipArchive(zipFiles);
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  const filename = `Class_${cleanClassName}_Q${quarter}_EGradeBook.xlsx`;

  downloadExcelBlob(zipBuffer, filename);
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

  const keys = Object.keys(data[0]);
  const totalRows = data.length + 1;

  // Auto calculate reasonable column widths
  const colWidths = keys.map(k => {
    let maxLen = k.length;
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const valStr = String(data[i][k] ?? '');
      if (valStr.length > maxLen) maxLen = valStr.length;
    }
    return Math.min(Math.max(maxLen + 4, 10), 55);
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
    sheetDataXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t>${escapeXml(key)}</t></is></c>`;
  });
  sheetDataXml += '</row>';

  // Data rows
  data.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 2;
    const isWhiteRow = rowIdx % 2 === 0;
    const sCenter = isWhiteRow ? 6 : 10;
    const sLeft = isWhiteRow ? 7 : 11;

    sheetDataXml += `<row r="${rowNum}" ht="22" customHeight="1">`;
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

  const zipBuffer = await buildZipArchive(zipFiles);
  downloadExcelBlob(zipBuffer, filename);
};

/**
 * Formatted Quarter Summary export to Excel with alternating row colors.
 */
export const exportQuarterSummary = async (
  students: Student[], 
  records: ParticipationRecord[], 
  classObj: Class, 
  quarter: Quarter
) => {
  const sortedStudents = getClassRoster(students, classObj.id);

  const data = sortedStudents.map(student => ({
    'Student Number': student.displayNum,
    'Name': student.name,
    'Student ID': student.studentId || '',
    'Q1': getStudentQuarterTotal(records, student.id, 1),
    'Q2': getStudentQuarterTotal(records, student.id, 2),
    'Q3': getStudentQuarterTotal(records, student.id, 3),
    'Q4': getStudentQuarterTotal(records, student.id, 4),
    'Semester 1 Total': getStudentSemesterTotal(records, student.id, 1),
    'Semester 2 Total': getStudentSemesterTotal(records, student.id, 2),
    'Year Total': getStudentYearTotal(records, student.id)
  }));
  
  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  await exportToExcel(data, `Class_${cleanClassName}_Q${quarter}_Summary`);
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
