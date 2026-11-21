import { Class, GradingSettings, ParticipationRecord, Quarter, ScoreRecord, Student } from '../types';
import { getStudentQuarterTotal } from './calculations';
import { drawWisLogoOnCanvas } from './export';

interface PdfPageImage {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

const KHMER_MUOL_FONT_STACK =
  "'Khmer OS Muol Light', 'Khmer OS Muol', 'Moul', 'Khmer OS Siemreap', 'Leelawadee UI', sans-serif";
const KHMER_FONT_STACK =
  "'Khmer OS Battambang', 'Khmer OS Siemreap', 'Leelawadee UI', 'Noto Sans Khmer', Arial, sans-serif";
const LATIN_FONT_STACK = "'Calibri', 'Segoe UI', Arial, sans-serif";

/**
 * Assembles a valid PDF 1.4 binary document embedding one JPEG image per A4 Landscape page.
 * Uses exact 20-byte xref table entries so desktop PDF readers open cleanly without prompts.
 */
function buildPdfFromJpegPages(pages: PdfPageImage[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushAscii = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  // A4 Landscape dimensions in PDF points (297mm x 210mm)
  const PAGE_W = '841.89';
  const PAGE_H = '595.28';

  const pageCount = pages.length;
  const totalObjs = 3 + pageCount * 3; // 0 (free) + 1 (Catalog) + 2 (Pages) + 3 per page
  const offsets: number[] = new Array(totalObjs).fill(0);

  // Header
  pushAscii('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Object 1: Catalog
  offsets[1] = offset;
  pushAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  const kidsRefs = pages.map((_, p) => `${3 + p * 3} 0 R`).join(' ');
  offsets[2] = offset;
  pushAscii(`2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`);

  // Page + Image XObject + Content Stream per page
  pages.forEach((page, p) => {
    const pageObjId = 3 + p * 3;
    const imgObjId = pageObjId + 1;
    const contentObjId = pageObjId + 2;

    // Page object
    offsets[pageObjId] = offset;
    pushAscii(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /XObject << /Im${p} ${imgObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // JPEG Image XObject
    offsets[imgObjId] = offset;
    pushAscii(
      `${imgObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(page.jpegBytes);
    pushAscii('\nendstream\nendobj\n');

    // Drawing instructions fitting image cleanly to A4 Landscape
    const contentStream = `q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im${p} Do\nQ\n`;
    offsets[contentObjId] = offset;
    pushAscii(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );
  });

  // Cross-reference table
  const xrefStart = offset;
  pushAscii(`xref\n0 ${totalObjs}\n`);
  pushAscii('0000000000 65535 f \n');
  for (let i = 1; i < totalObjs; i++) {
    pushAscii(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  pushAscii(
    `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  // Merge chunks into single Uint8Array
  const result = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function drawFitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontWeight: string,
  baseSize: number,
  fontFamily: string,
  align: CanvasTextAlign = 'left'
) {
  if (!text) return;
  let size = baseSize;
  ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  while (size > 11 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y, maxWidth);
}

/**
 * Generates and automatically downloads an A4 Landscape PDF matching the WIS Quarter Score List sheet,
 * including school logo, Khmer Unicode names, Group III, black borders, and alternating zebra rows.
 */
export async function exportQuarterScoreSheetPdf(params: {
  students: (Student & { displayNum: number })[];
  scores: ScoreRecord[];
  records: ParticipationRecord[];
  classObj: Class;
  quarter: Quarter;
  settings: GradingSettings;
  teacherName?: string;
  subject?: string;
}): Promise<void> {
  const { students, scores, records, classObj, quarter, settings, teacherName = '', subject = '' } =
    params;

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed cleanly even if font readiness check rejects
    }
  }

  const CANVAS_W = 2338; // 200 DPI A4 Landscape (297mm = 841.89pt)
  const CANVAS_H = 1654; // 200 DPI A4 Landscape (210mm = 595.28pt)
  const MARGIN_X = 77;
  const MARGIN_Y = 56;
  const TABLE_W = CANVAS_W - MARGIN_X * 2; // 2184px
  // Exact 12pt physical size on A4 Landscape (12 * 2338 / 841.89 = 33.3px)
  const FONT_12PT = 33;

  const colWidths = [
    52,  // N°
    430, // Name
    310, // ឈ្មោះ
    56,  // Sex
    66,  // Group
    58,  // Conduct
    54,  // C.P.
    72, 72, 72, 72, 72, 72, // Homework 1-6 (432)
    72, 72, 72, 72, 72, 72, // Quizzes 1-6 (432)
    98, 98, 98              // Monthly Test 1-3 (294)
  ];

  const colXs: number[] = [];
  let runningX = MARGIN_X;
  for (const w of colWidths) {
    colXs.push(runningX);
    runningX += w;
  }

  const classScores = scores.filter(
    s => (!s.classId || s.classId === classObj.id) && Number(s.quarter) === Number(quarter)
  );

  const HEADER_BLOCK_H = 300;
  const HDR_ROW1_H = 88;
  const HDR_ROW2_H = 44;
  const DATA_ROW_H = 52;
  const TABLE_START_Y = MARGIN_Y + HEADER_BLOCK_H;
  const DATA_START_Y = TABLE_START_Y + HDR_ROW1_H + HDR_ROW2_H;
  const AVAILABLE_DATA_H = CANVAS_H - MARGIN_Y - 30 - DATA_START_Y;
  const ROWS_PER_PAGE = Math.max(1, Math.floor(AVAILABLE_DATA_H / DATA_ROW_H));

  const totalPages = Math.max(1, Math.ceil(students.length / ROWS_PER_PAGE));
  const pdfPages: PdfPageImage[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Fill solid white background (required for JPEG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 1. Top-Left School Logo & Bilingual Branding (12pt, proportioned to match text below)
    await drawWisLogoOnCanvas(ctx, MARGIN_X + 74, MARGIN_Y - 6, 192, 204);

    ctx.fillStyle = '#000000';
    drawFitText(
      ctx,
      'សាលាវ៉េស្ទើនអន្តរជាតិ',
      MARGIN_X + 170,
      MARGIN_Y + 216,
      380,
      'normal',
      FONT_12PT,
      KHMER_MUOL_FONT_STACK,
      'center'
    );
    drawFitText(
      ctx,
      "Registrar's Office",
      MARGIN_X + 170,
      MARGIN_Y + 250,
      340,
      'bold',
      FONT_12PT,
      LATIN_FONT_STACK,
      'center'
    );
    drawFitText(
      ctx,
      'STD',
      MARGIN_X + 170,
      MARGIN_Y + 282,
      180,
      'bold',
      FONT_12PT,
      LATIN_FONT_STACK,
      'center'
    );

    // 2. Top-Right Black Banner & Metadata (12pt)
    const bannerX = CANVAS_W - MARGIN_X - 920;
    const bannerW = 920;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bannerX, MARGIN_Y + 42, bannerW, 52);

    ctx.fillStyle = '#FFFFFF';
    const khmerBannerPart = 'តារាងសម្រង់ពិន្ទុ';
    const englishBannerPart = ' / Score List';
    ctx.font = `normal ${FONT_12PT}px ${KHMER_MUOL_FONT_STACK}`;
    const khmerBannerW = ctx.measureText(khmerBannerPart).width;
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    const englishBannerW = ctx.measureText(englishBannerPart).width;
    const totalBannerTextW = khmerBannerW + englishBannerW;
    const bannerStartX = bannerX + (bannerW - totalBannerTextW) / 2;
    const bannerMidY = MARGIN_Y + 68;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `normal ${FONT_12PT}px ${KHMER_MUOL_FONT_STACK}`;
    ctx.fillText(khmerBannerPart, bannerStartX, bannerMidY);
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    ctx.fillText(englishBannerPart, bannerStartX + khmerBannerW, bannerMidY);

    ctx.fillStyle = '#111827';
    const metaLabelX = bannerX;
    const metaValX = bannerX + 245;

    // Teacher Name
    drawFitText(ctx, 'Teacher Name', metaLabelX, MARGIN_Y + 128, 235, 'bold', FONT_12PT, LATIN_FONT_STACK, 'left');
    drawFitText(ctx, teacherName || '', metaValX, MARGIN_Y + 128, 660, 'bold', FONT_12PT, KHMER_FONT_STACK, 'left');

    // Subject
    drawFitText(ctx, 'Subject', metaLabelX, MARGIN_Y + 170, 235, 'bold', FONT_12PT, LATIN_FONT_STACK, 'left');
    drawFitText(ctx, subject || '', metaValX, MARGIN_Y + 170, 660, 'bold', FONT_12PT, KHMER_FONT_STACK, 'left');

    // Grade & Quarter
    drawFitText(ctx, 'Grade', metaLabelX, MARGIN_Y + 212, 235, 'bold', FONT_12PT, LATIN_FONT_STACK, 'left');
    drawFitText(ctx, classObj.name, metaValX + 75, MARGIN_Y + 212, 210, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
    drawFitText(ctx, 'For :', bannerX + 520, MARGIN_Y + 212, 110, 'bold', FONT_12PT, LATIN_FONT_STACK, 'left');
    drawFitText(
      ctx,
      `Quarter ${quarter}`,
      bannerX + 630,
      MARGIN_Y + 212,
      280,
      'bold',
      FONT_12PT,
      LATIN_FONT_STACK,
      'left'
    );

    // 3. Table Header Backgrounds (#F3F4F6)
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(MARGIN_X, TABLE_START_Y, TABLE_W, HDR_ROW1_H + HDR_ROW2_H);

    // Draw Header Text (12pt)
    ctx.fillStyle = '#000000';
    const mergedHdrMidY = TABLE_START_Y + (HDR_ROW1_H + HDR_ROW2_H) / 2;

    drawFitText(ctx, 'N°', colXs[0] + colWidths[0] / 2, mergedHdrMidY, colWidths[0] - 8, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
    drawFitText(ctx, 'Name', colXs[1] + colWidths[1] / 2, mergedHdrMidY, colWidths[1] - 16, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
    drawFitText(ctx, 'ឈ្មោះ', colXs[2] + colWidths[2] / 2, mergedHdrMidY, colWidths[2] - 16, 'bold', FONT_12PT, KHMER_FONT_STACK, 'center');

    // Vertical Sex + Khmer ភេទ
    ctx.save();
    ctx.translate(colXs[3] + colWidths[3] / 2, TABLE_START_Y + 42);
    ctx.rotate(Math.PI / 2);
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sex', 0, 0);
    ctx.restore();
    drawFitText(ctx, 'ភេទ', colXs[3] + colWidths[3] / 2, TABLE_START_Y + 106, colWidths[3] - 4, 'bold', FONT_12PT, KHMER_FONT_STACK, 'center');

    // Vertical Group + Khmer ក្រុម
    ctx.save();
    ctx.translate(colXs[4] + colWidths[4] / 2, TABLE_START_Y + 44);
    ctx.rotate(Math.PI / 2);
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Group', 0, 0, 82);
    ctx.restore();
    drawFitText(ctx, 'ក្រុម', colXs[4] + colWidths[4] / 2, TABLE_START_Y + 106, colWidths[4] - 4, 'bold', FONT_12PT, KHMER_FONT_STACK, 'center');

    // Vertical Conduct
    ctx.save();
    ctx.translate(colXs[5] + colWidths[5] / 2, mergedHdrMidY);
    ctx.rotate(Math.PI / 2);
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Conduct', 0, 0, HDR_ROW1_H + HDR_ROW2_H - 12);
    ctx.restore();

    // Vertical C.P.
    ctx.save();
    ctx.translate(colXs[6] + colWidths[6] / 2, mergedHdrMidY);
    ctx.rotate(Math.PI / 2);
    ctx.font = `bold ${FONT_12PT}px ${LATIN_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C.P.', 0, 0, HDR_ROW1_H + HDR_ROW2_H - 12);
    ctx.restore();

    // Group Header Titles (Row 1 - 12pt)
    const hwSpanW = colWidths.slice(7, 13).reduce((a, b) => a + b, 0);
    const quizSpanW = colWidths.slice(13, 19).reduce((a, b) => a + b, 0);
    const testSpanW = colWidths.slice(19, 22).reduce((a, b) => a + b, 0);

    drawFitText(
      ctx,
      'កិច្ចការផ្ទះ / Homework',
      colXs[7] + hwSpanW / 2,
      TABLE_START_Y + HDR_ROW1_H / 2,
      hwSpanW - 16,
      'bold',
      FONT_12PT,
      KHMER_FONT_STACK,
      'center'
    );
    drawFitText(
      ctx,
      'តេស្តខ្លី / Quizzes',
      colXs[13] + quizSpanW / 2,
      TABLE_START_Y + HDR_ROW1_H / 2,
      quizSpanW - 16,
      'bold',
      FONT_12PT,
      KHMER_FONT_STACK,
      'center'
    );
    drawFitText(
      ctx,
      'Monthly Test',
      colXs[19] + testSpanW / 2,
      TABLE_START_Y + 26,
      testSpanW - 12,
      'bold',
      FONT_12PT,
      LATIN_FONT_STACK,
      'center'
    );
    drawFitText(
      ctx,
      'តេស្តប្រចាំខែ',
      colXs[19] + testSpanW / 2,
      TABLE_START_Y + 62,
      testSpanW - 12,
      'bold',
      FONT_12PT,
      KHMER_FONT_STACK,
      'center'
    );

    // Sub-numbers Row 2 (12pt)
    const subRowMidY = TABLE_START_Y + HDR_ROW1_H + HDR_ROW2_H / 2;
    for (let i = 0; i < 6; i++) {
      drawFitText(ctx, String(i + 1), colXs[7 + i] + colWidths[7 + i] / 2, subRowMidY, colWidths[7 + i] - 8, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
      drawFitText(ctx, String(i + 1), colXs[13 + i] + colWidths[13 + i] / 2, subRowMidY, colWidths[13 + i] - 8, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
    }
    for (let i = 0; i < 3; i++) {
      drawFitText(ctx, String(i + 1), colXs[19 + i] + colWidths[19 + i] / 2, subRowMidY, colWidths[19 + i] - 8, 'bold', FONT_12PT, LATIN_FONT_STACK, 'center');
    }

    // 4. Student Rows with Alternating White (#FFFFFF) / Light Gray (#F2F2F2) at 12pt
    const pageStudents = students.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);

    pageStudents.forEach((student, localIdx) => {
      const globalIdx = pageIdx * ROWS_PER_PAGE + localIdx;
      const rowY = DATA_START_Y + localIdx * DATA_ROW_H;
      const midY = rowY + DATA_ROW_H / 2;

      ctx.fillStyle = globalIdx % 2 === 0 ? '#FFFFFF' : '#F2F2F2';
      ctx.fillRect(MARGIN_X, rowY, TABLE_W, DATA_ROW_H);

      const score = classScores.find(s => s.studentId === student.id);
      const rawCp = getStudentQuarterTotal(records, student.id, quarter);
      const cappedCp = Math.min(rawCp, settings.maxScores?.cp || 10);
      const cpDisplay =
        score?.cpScore !== undefined
          ? String(score.cpScore)
          : rawCp > 0
          ? String(cappedCp)
          : '';
      const sexShort =
        student.sex === 'Male' ? 'M' : student.sex === 'Female' ? 'F' : student.sex || '';
      const groupVal = student.group && student.group.trim() !== '' ? student.group : 'III';

      ctx.fillStyle = '#000000';
      drawFitText(ctx, String(student.displayNum), colXs[0] + colWidths[0] / 2, midY, colWidths[0] - 8, 'normal', FONT_12PT, LATIN_FONT_STACK, 'center');
      drawFitText(ctx, student.name, colXs[1] + 10, midY, colWidths[1] - 20, '600', FONT_12PT, LATIN_FONT_STACK, 'left');
      drawFitText(ctx, student.nameKhmer || '', colXs[2] + 10, midY, colWidths[2] - 20, 'normal', FONT_12PT, KHMER_FONT_STACK, 'left');
      drawFitText(ctx, sexShort, colXs[3] + colWidths[3] / 2, midY, colWidths[3] - 8, '600', FONT_12PT, LATIN_FONT_STACK, 'center');
      drawFitText(ctx, groupVal, colXs[4] + colWidths[4] / 2, midY, colWidths[4] - 8, '600', FONT_12PT, LATIN_FONT_STACK, 'center');
      drawFitText(ctx, score?.conduct !== undefined ? String(score.conduct) : '', colXs[5] + colWidths[5] / 2, midY, colWidths[5] - 8, '600', FONT_12PT, LATIN_FONT_STACK, 'center');
      drawFitText(ctx, cpDisplay, colXs[6] + colWidths[6] / 2, midY, colWidths[6] - 8, '600', FONT_12PT, LATIN_FONT_STACK, 'center');

      const slots: (number | undefined)[] = [
        score?.hw1, score?.hw2, score?.hw3, score?.hw4, score?.hw5, score?.hw6,
        score?.quiz1, score?.quiz2, score?.quiz3, score?.quiz4, score?.quiz5, score?.quiz6,
        score?.test1, score?.test2, score?.test3
      ];
      slots.forEach((val, sIdx) => {
        if (val !== undefined) {
          drawFitText(
            ctx,
            String(val),
            colXs[7 + sIdx] + colWidths[7 + sIdx] / 2,
            midY,
            colWidths[7 + sIdx] - 8,
            '600',
            FONT_12PT,
            LATIN_FONT_STACK,
            'center'
          );
        }
      });
    });

    // Empty message if 0 students
    if (students.length === 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(MARGIN_X, DATA_START_Y, TABLE_W, 70);
      ctx.fillStyle = '#6B7280';
      drawFitText(
        ctx,
        `No students found in ${classObj.name}.`,
        MARGIN_X + TABLE_W / 2,
        DATA_START_Y + 35,
        TABLE_W - 40,
        'normal',
        18,
        LATIN_FONT_STACK,
        'center'
      );
    }

    // 5. Crisp Black Grid Borders
    const renderedRows = Math.max(pageStudents.length, 0);
    const tableBottomY =
      students.length === 0 ? DATA_START_Y + 70 : DATA_START_Y + renderedRows * DATA_ROW_H;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, TABLE_START_Y);
    ctx.lineTo(MARGIN_X + TABLE_W, TABLE_START_Y);
    // Header row 2 divider only across HW/Quizzes/Tests
    ctx.moveTo(colXs[7], TABLE_START_Y + HDR_ROW1_H);
    ctx.lineTo(MARGIN_X + TABLE_W, TABLE_START_Y + HDR_ROW1_H);
    ctx.moveTo(MARGIN_X, DATA_START_Y);
    ctx.lineTo(MARGIN_X + TABLE_W, DATA_START_Y);

    for (let r = 1; r <= renderedRows; r++) {
      const yLine = DATA_START_Y + r * DATA_ROW_H;
      ctx.moveTo(MARGIN_X, yLine);
      ctx.lineTo(MARGIN_X + TABLE_W, yLine);
    }
    if (students.length === 0) {
      ctx.moveTo(MARGIN_X, tableBottomY);
      ctx.lineTo(MARGIN_X + TABLE_W, tableBottomY);
    }
    ctx.stroke();

    // Vertical lines
    ctx.beginPath();
    for (let c = 0; c <= colWidths.length; c++) {
      const xLine = c < colWidths.length ? colXs[c] : MARGIN_X + TABLE_W;
      const isSubCol = (c > 7 && c < 13) || (c > 13 && c < 19) || (c > 19 && c < 22);
      const startY =
        students.length === 0 && c > 0 && c < colWidths.length
          ? TABLE_START_Y
          : isSubCol
          ? TABLE_START_Y + HDR_ROW1_H
          : TABLE_START_Y;
      const endY = students.length === 0 && c > 0 && c < colWidths.length ? DATA_START_Y : tableBottomY;
      ctx.moveTo(xLine, startY);
      ctx.lineTo(xLine, endY);
    }
    ctx.stroke();

    // Outer thick black table frame
    ctx.lineWidth = 2.4;
    ctx.strokeRect(MARGIN_X, TABLE_START_Y, TABLE_W, tableBottomY - TABLE_START_Y);

    if (totalPages > 1) {
      ctx.fillStyle = '#4B5563';
      drawFitText(
        ctx,
        `${classObj.name} — Quarter ${quarter} Score List (Page ${pageIdx + 1} of ${totalPages})`,
        CANVAS_W - MARGIN_X,
        CANVAS_H - 28,
        800,
        'normal',
        14,
        LATIN_FONT_STACK,
        'right'
      );
    }

    const jpegBytes = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        async blob => {
          if (!blob) {
            reject(new Error('Failed to render PDF page image'));
            return;
          }
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        },
        'image/jpeg',
        0.95
      );
    });

    pdfPages.push({
      jpegBytes,
      width: CANVAS_W,
      height: CANVAS_H
    });
  }

  const pdfBytes = buildPdfFromJpegPages(pdfPages);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const cleanClassName = classObj.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
  const filename = cleanClassName
    ? `Quarter_${quarter}_Score_List_${cleanClassName}.pdf`
    : `Quarter_${quarter}_Score_List.pdf`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
