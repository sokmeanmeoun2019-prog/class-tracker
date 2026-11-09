import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  RefreshCw,
  Check,
  HelpCircle,
  ChevronDown,
  FileCheck,
  AlertCircle,
  SlidersHorizontal,
  ArrowRightLeft,
  UserPlus
} from 'lucide-react';
import { Student, ScoreRecord, Quarter, ClassRoom } from '../types';
import { useData } from '../store/DataContext';

interface ExcelImportMeta {
  classId: string;
  quarter: Quarter;
  fileName: string;
  sheetName: string;
  uploadedAt: string;
  matchedCount: number;
  totalRows: number;
}

interface ExcelScoreImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClassId: string;
  currentClassName: string;
  currentQuarter: Quarter;
  classStudents: Student[];
}

export interface ExtractedStudentScore {
  rowIndex: number;
  excelId?: string;
  excelName: string;
  matchedStudent?: Student;
  matchType: 'exact-id' | 'exact-name' | 'fuzzy-name' | 'manual' | 'unmatched' | 'duplicate';
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  conduct?: number;
  cpScore?: number;
  hw1?: number;
  hw2?: number;
  hw3?: number;
  quiz1?: number;
  quiz2?: number;
  quiz3?: number;
  test1?: number;
  test2?: number;
  missingFields: string[];
  warnings: string[];
  hasAnyScore: boolean;
  selected: boolean;
}

interface ColumnMapping {
  nameCol: number;
  idCol: number;
  conductCol: number;
  cpCol: number;
  hw1Col: number;
  hw2Col: number;
  hw3Col: number;
  quiz1Col: number;
  quiz2Col: number;
  quiz3Col: number;
  test1Col: number;
  test2Col: number;
}

interface WorksheetGridData {
  rawGrid: any[][];
  formattedGrid: string[][];
  formulaGrid: string[][];
  numRows: number;
  numCols: number;
}

interface SheetDiagnosticSummary {
  sheetName: string;
  matchedTargetCount: number;
  otherClassId?: string;
  otherClassName?: string;
  otherClassMatchCount: number;
  mappedFieldCount: number;
  subFieldCount: number;
  selectionScore: number;
}

// Convert Khmer numerals (០-៩) to standard ASCII digits (0-9)
const replaceKhmerDigits = (input: string): string => {
  const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.replace(new RegExp(khmerDigits[i], 'g'), String(i));
  }
  return out;
};

// Normalize strings for comparison (preserving spaces between words)
const normalizeText = (str: any): string => {
  if (str === null || str === undefined) return '';
  return replaceKhmerDigits(String(str))
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^a-z0-9\u1780-\u17ff\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Compact alphanumeric string with all spaces/punctuation removed (so "9A (M)" -> "9am" matches "Grade9AM" -> "grade9am")
const compactAlphaNum = (str: any): string => {
  if (str === null || str === undefined) return '';
  return replaceKhmerDigits(String(str))
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^a-z0-9\u1780-\u17ff]/gi, '');
};

// Strip prefixes/titles/numbering/gender tags from student names
const cleanStudentName = (raw: string): string => {
  if (!raw) return '';
  return replaceKhmerDigits(String(raw))
    .replace(/^\s*\d+[\.\)\-\s]+/, '')
    .replace(/\((?:m|f|male|female|ប្រុស|ស្រី|ប|ស)\)/gi, ' ')
    .replace(/\b(?:mr|ms|miss|mrs)\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Extract only Latin (A-Z) words from a potentially bilingual Khmer/English name cell
const extractLatinName = (raw: string): string => {
  if (!raw) return '';
  const cleaned = cleanStudentName(raw);
  const latinWords = cleaned.match(/[a-zA-Z]+/g);
  if (!latinWords || latinWords.length === 0) return '';
  return latinWords.join(' ').toLowerCase();
};

// Levenshtein edit distance for minor spelling differences
const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Match an Excel student name/ID against the class roster
const matchStudent = (
  excelName: string,
  excelId: string | undefined,
  roster: Student[]
): {
  student?: Student;
  matchType: ExtractedStudentScore['matchType'];
  confidence: ExtractedStudentScore['matchConfidence'];
} => {
  // 1. Check ID match first if excelId is provided and matches student.id or student.studentId
  if (excelId) {
    const cleanExcelId = String(excelId).trim().toLowerCase();
    if (cleanExcelId && cleanExcelId.length >= 2) {
      const idMatch = roster.find(
        s =>
          s.id.toLowerCase() === cleanExcelId ||
          (s.studentId && s.studentId.trim().toLowerCase() === cleanExcelId)
      );
      if (idMatch) {
        return { student: idMatch, matchType: 'exact-id', confidence: 'high' };
      }
    }
  }

  const normExcel = normalizeText(excelName);
  const cleanedExcel = normalizeText(cleanStudentName(excelName));
  const latinExcel = extractLatinName(excelName);

  if (!normExcel && !cleanedExcel) {
    return { matchType: 'unmatched', confidence: 'none' };
  }

  // 2. Exact normalized name match (English name, Khmer name, or space-insensitive compact name)
  const compactExcel = compactAlphaNum(cleanStudentName(excelName));
  for (const s of roster) {
    const normRoster = normalizeText(s.name);
    const cleanedRoster = normalizeText(cleanStudentName(s.name));
    const compactRoster = compactAlphaNum(cleanStudentName(s.name));
    const normKhmer = s.nameKhmer ? normalizeText(s.nameKhmer) : '';
    if (
      (normExcel && (normRoster === normExcel || (normKhmer && normKhmer === normExcel))) ||
      (cleanedExcel && (cleanedRoster === cleanedExcel || (normKhmer && normKhmer === cleanedExcel))) ||
      (compactExcel && compactExcel.length >= 4 && compactExcel === compactRoster)
    ) {
      return { student: s, matchType: 'exact-name', confidence: 'high' };
    }
  }

  // 3. Latin-only exact match (when Excel cell has both Khmer + English name in one cell)
  if (latinExcel && latinExcel.length >= 3) {
    for (const s of roster) {
      const latinRoster = extractLatinName(s.name);
      if (latinRoster && latinRoster === latinExcel) {
        return { student: s, matchType: 'exact-name', confidence: 'high' };
      }
    }
  }

  // 4. Token-order independent match (e.g., "Sokmean Kun" vs "Kun Sokmean")
  const excelTokens = (cleanedExcel || normExcel).split(' ').filter(Boolean).sort();
  if (excelTokens.length >= 2) {
    for (const s of roster) {
      const rosterTokens = normalizeText(cleanStudentName(s.name)).split(' ').filter(Boolean).sort();
      if (
        excelTokens.length === rosterTokens.length &&
        excelTokens.every((t, i) => t === rosterTokens[i])
      ) {
        return { student: s, matchType: 'fuzzy-name', confidence: 'high' };
      }
    }
  }

  // 5. Latin token-order independent match
  if (latinExcel) {
    const latinExcelTokens = latinExcel.split(' ').filter(Boolean).sort();
    if (latinExcelTokens.length >= 2) {
      for (const s of roster) {
        const latinRoster = extractLatinName(s.name);
        const latinRosterTokens = latinRoster.split(' ').filter(Boolean).sort();
        if (
          latinExcelTokens.length === latinRosterTokens.length &&
          latinExcelTokens.every((t, i) => t === latinRosterTokens[i])
        ) {
          return { student: s, matchType: 'fuzzy-name', confidence: 'high' };
        }
      }
    }
  }

  // 6. Substring/Subset token match (only if unique in the class roster)
  const subsetCandidates: Student[] = [];
  for (const s of roster) {
    const rNorm = normalizeText(cleanStudentName(s.name));
    const eNorm = cleanedExcel || normExcel;
    if (!rNorm || !eNorm) continue;

    if (rNorm.includes(eNorm) || eNorm.includes(rNorm)) {
      const rWords = rNorm.split(' ').filter(Boolean);
      const eWords = eNorm.split(' ').filter(Boolean);
      const sharedWords = rWords.filter(w => eWords.includes(w));
      if (sharedWords.length >= Math.min(rWords.length, eWords.length) && sharedWords.join('').length >= 3) {
        subsetCandidates.push(s);
      }
    }
  }
  if (subsetCandidates.length === 1) {
    return { student: subsetCandidates[0], matchType: 'fuzzy-name', confidence: 'medium' };
  }

  // 7. Levenshtein distance match for minor 1-2 character typos
  let bestStudent: Student | undefined;
  let bestDist = Infinity;
  let secondBestDist = Infinity;

  const targetStr = cleanedExcel || normExcel;
  for (const s of roster) {
    const rNorm = normalizeText(cleanStudentName(s.name));
    if (!rNorm) continue;
    const dist = levenshteinDistance(targetStr, rNorm);
    if (dist < bestDist) {
      secondBestDist = bestDist;
      bestDist = dist;
      bestStudent = s;
    } else if (dist < secondBestDist) {
      secondBestDist = dist;
    }

    const rReversed = rNorm.split(' ').reverse().join(' ');
    const revDist = levenshteinDistance(targetStr, rReversed);
    if (revDist < bestDist) {
      secondBestDist = bestDist;
      bestDist = revDist;
      bestStudent = s;
    }
  }

  const maxAllowedDist = targetStr.length >= 10 ? 2 : targetStr.length >= 5 ? 1 : 0;
  if (bestStudent && bestDist <= maxAllowedDist && bestDist < secondBestDist) {
    return { student: bestStudent, matchType: 'fuzzy-name', confidence: 'medium' };
  }

  return { matchType: 'unmatched', confidence: 'none' };
};

const EMPTY_RESOLVED_CELL: XLSX.CellObject = { t: 's', v: '', w: '' };

const findWorksheetByName = (wb: XLSX.WorkBook, rawName: string): { ws?: XLSX.WorkSheet; actualName: string } => {
  const clean = rawName.trim().replace(/^'+|'+$/g, '').replace(/''/g, "'");
  if (wb.Sheets[clean]) return { ws: wb.Sheets[clean], actualName: clean };
  const matchKey = Object.keys(wb.Sheets).find(k => k.trim().toLowerCase() === clean.toLowerCase());
  return matchKey ? { ws: wb.Sheets[matchKey], actualName: matchKey } : { actualName: clean };
};

// Resolve direct cell reference formulas (e.g. SETTINGS!B10, ='Student List'!B6, =IF(SETTINGS!B10="","",SETTINGS!B10),
// VLOOKUP(A10,SETTINGS!$A$10:$E$45,2,0), etc.) across the workbook so stale cached values from copied templates
// (such as Grade 9B names cached inside a Grade 9AM file) are replaced with the live cell values (or blank if empty).
const resolveDirectFormulaCell = (
  cell: XLSX.CellObject,
  currentSheetName: string,
  wb?: XLSX.WorkBook,
  depth = 0
): XLSX.CellObject => {
  if (!wb || !cell.f || depth >= 4) return cell;

  // SheetJS stores cell.f WITHOUT a leading '=', so strip optional leading '=' or '+'
  const f = String(cell.f).trim().replace(/^[+=]+/, '').trim();
  if (!f) return cell;

  // Do not treat aggregate or arithmetic score formulas as single-cell pass-through references
  if (/\b(SUM|AVERAGE|AVG|MEAN|RANK|MIN|MAX|COUNT|COUNTA|STDEV|ROUND|ROUNDUP|ROUNDDOWN)\s*\(/i.test(f)) {
    return cell;
  }

  // 1. VLOOKUP across sheets (including when wrapped in IF / IFERROR):
  // e.g. VLOOKUP(A10, SETTINGS!$A$10:$F$45, 2, FALSE) or IFERROR(VLOOKUP(A10, SETTINGS!$A$10:$F$45, 2, 0), "")
  const vlookupMatch = f.match(
    /VLOOKUP\s*\(\s*([^,]+)\s*,\s*(?:'([^']+)'|([A-Za-z0-9_.\s\-]+))!\$?([A-Za-z]+)\$?(\d+)\s*:\s*\$?([A-Za-z]+)\$?(\d+)\s*,\s*(\d+)/i
  );
  if (vlookupMatch) {
    const lookupExpr = vlookupMatch[1].trim();
    const targetSheetRaw = (vlookupMatch[2] || vlookupMatch[3] || '').trim();
    const startColStr = vlookupMatch[4].toUpperCase();
    const startRowNum = parseInt(vlookupMatch[5], 10);
    const endRowNum = parseInt(vlookupMatch[7], 10);
    const colIndexNum = parseInt(vlookupMatch[8], 10);

    const { ws: targetWs, actualName: targetActualName } = findWorksheetByName(wb, targetSheetRaw);
    const { ws: currentWs } = findWorksheetByName(wb, currentSheetName);

    if (targetWs && colIndexNum >= 1 && startRowNum >= 1 && endRowNum >= startRowNum) {
      let lookupVal: string | number = '';
      const localRefMatch = lookupExpr.match(/^\$?([A-Za-z]+)\$?(\d+)$/);
      if (localRefMatch && currentWs) {
        const refAddr = `${localRefMatch[1].toUpperCase()}${localRefMatch[2]}`;
        const refCell = currentWs[refAddr] as XLSX.CellObject | undefined;
        const resolvedRef = refCell
          ? resolveDirectFormulaCell(refCell, currentSheetName, wb, depth + 1)
          : undefined;
        lookupVal = resolvedRef?.v !== undefined ? resolvedRef.v : '';
      } else {
        lookupVal = lookupExpr.replace(/^["']+|["']+$/g, '');
      }

      if (lookupVal === '' || lookupVal === undefined || lookupVal === null) {
        return EMPTY_RESOLVED_CELL;
      }

      const startColIdx = XLSX.utils.decode_col(startColStr);
      const targetColIdx = startColIdx + colIndexNum - 1;
      const normLookup = String(lookupVal).trim().toLowerCase();

      for (let r = startRowNum - 1; r <= Math.min(endRowNum - 1, startRowNum + 200); r++) {
        const keyAddr = XLSX.utils.encode_cell({ r, c: startColIdx });
        const keyCell = targetWs[keyAddr] as XLSX.CellObject | undefined;
        if (!keyCell || keyCell.v === undefined) continue;
        if (String(keyCell.v).trim().toLowerCase() === normLookup) {
          const valAddr = XLSX.utils.encode_cell({ r, c: targetColIdx });
          const valCell = targetWs[valAddr] as XLSX.CellObject | undefined;
          if (!valCell || valCell.v === undefined || String(valCell.v).trim() === '') {
            return EMPTY_RESOLVED_CELL;
          }
          return resolveDirectFormulaCell(valCell, targetActualName, wb, depth + 1);
        }
      }
      return EMPTY_RESOLVED_CELL;
    }
  }

  // 2. Direct cross-sheet reference (with optional TRIM/UPPER/PROPER/CLEAN wrapper or &"" suffix):
  // e.g. SETTINGS!B10, 'SETTINGS'!$B$10, TRIM(SETTINGS!B10), SETTINGS!B10&""
  const crossMatch = f.match(
    /^(?:(?:TRIM|UPPER|LOWER|PROPER|CLEAN)\s*\(\s*)?(?:'([^']+)'|([A-Za-z0-9_.\s\-]+))!\$?([A-Za-z]+)\$?(\d+)(?:\s*&\s*""\s*)?\)?$/i
  );
  if (crossMatch) {
    const targetSheetRaw = (crossMatch[1] || crossMatch[2] || '').trim();
    const targetAddr = `${crossMatch[3].toUpperCase()}${crossMatch[4]}`;
    const { ws: targetWs, actualName: targetActualName } = findWorksheetByName(wb, targetSheetRaw);
    if (targetWs) {
      const targetCell = targetWs[targetAddr] as XLSX.CellObject | undefined;
      if (!targetCell || targetCell.v === undefined || String(targetCell.v).trim() === '') {
        return EMPTY_RESOLVED_CELL;
      }
      const resolved = resolveDirectFormulaCell(targetCell, targetActualName, wb, depth + 1);
      if (resolved.v === undefined || String(resolved.v).trim() === '') {
        return EMPTY_RESOLVED_CELL;
      }
      return resolved;
    }
  }

  // 3. Conditional pass-through cross-sheet reference:
  // e.g. IF(SETTINGS!B10="","",SETTINGS!B10), IF(ISBLANK(SETTINGS!B10),"",SETTINGS!B10),
  // IF(SETTINGS!A10="","",SETTINGS!B10), IFERROR(SETTINGS!B10,"")
  if (/^IF(?:ERROR|NA)?\s*\(/i.test(f)) {
    // Reject arithmetic expressions inside IF (such as score calculations with +, -, *, /)
    const withoutStrings = f.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
    if (!/[+\*\/]/.test(withoutStrings)) {
      const refs = Array.from(
        f.matchAll(/(?:'([^']+)'|([A-Za-z0-9_.\s\-]+))!\$?([A-Za-z]+)\$?(\d+)(?!\s*:)/g)
      );
      if (refs.length >= 1) {
        // Check if any referenced condition cell is empty first
        for (const m of refs) {
          const sName = (m[1] || m[2] || '').trim();
          const addr = `${m[3].toUpperCase()}${m[4]}`;
          const { ws: condWs, actualName: condActual } = findWorksheetByName(wb, sName);
          if (condWs) {
            const condCell = condWs[addr] as XLSX.CellObject | undefined;
            const resolvedCond = condCell
              ? resolveDirectFormulaCell(condCell, condActual, wb, depth + 1)
              : undefined;
            if (!resolvedCond || resolvedCond.v === undefined || String(resolvedCond.v).trim() === '') {
              return EMPTY_RESOLVED_CELL;
            }
          }
        }

        // The value reference in IF(cond, "", Sheet!Target) or IF(cond, Sheet!Target, "") is the last cross-sheet ref
        const valRef = refs[refs.length - 1];
        const targetSheetRaw = (valRef[1] || valRef[2] || '').trim();
        const targetAddr = `${valRef[3].toUpperCase()}${valRef[4]}`;
        const { ws: targetWs, actualName: targetActualName } = findWorksheetByName(wb, targetSheetRaw);
        if (targetWs) {
          const targetCell = targetWs[targetAddr] as XLSX.CellObject | undefined;
          if (!targetCell || targetCell.v === undefined || String(targetCell.v).trim() === '') {
            return EMPTY_RESOLVED_CELL;
          }
          const resolved = resolveDirectFormulaCell(targetCell, targetActualName, wb, depth + 1);
          if (resolved.v === undefined || String(resolved.v).trim() === '') {
            return EMPTY_RESOLVED_CELL;
          }
          return resolved;
        }
      }
    }
  }

  // 4. Direct same-sheet reference: =$B$6 or B6
  const sameMatch = f.match(/^\$?([A-Za-z]+)\$?(\d+)(?:\s*&\s*""\s*)?$/);
  if (sameMatch && currentSheetName) {
    const { ws: currentWs, actualName } = findWorksheetByName(wb, currentSheetName);
    if (currentWs) {
      const targetAddr = `${sameMatch[1].toUpperCase()}${sameMatch[2]}`;
      const targetCell = currentWs[targetAddr] as XLSX.CellObject | undefined;
      if (!targetCell || targetCell.v === undefined || String(targetCell.v).trim() === '') {
        return EMPTY_RESOLVED_CELL;
      }
      return resolveDirectFormulaCell(targetCell, actualName, wb, depth + 1);
    }
  }

  return cell;
};

// Extract 2D grids from an XLSX worksheet while expanding merged header cells and preserving raw values + formulas
const extractGridFromWorksheet = (
  ws: XLSX.WorkSheet,
  sheetName = '',
  wb?: XLSX.WorkBook
): WorksheetGridData => {
  const ref = ws['!ref'];
  if (!ref) {
    return { rawGrid: [], formattedGrid: [], formulaGrid: [], numRows: 0, numCols: 0 };
  }

  const decoded = XLSX.utils.decode_range(ref);
  const maxEndRow = Math.min(decoded.e.r, decoded.s.r + 300);
  const maxEndCol = Math.min(decoded.e.c, decoded.s.c + 60);

  const numRows = maxEndRow - decoded.s.r + 1;
  const numCols = maxEndCol - decoded.s.c + 1;

  if (numRows <= 0 || numCols <= 0) {
    return { rawGrid: [], formattedGrid: [], formulaGrid: [], numRows: 0, numCols: 0 };
  }

  const rawGrid: any[][] = Array.from({ length: numRows }, () => Array(numCols).fill(''));
  const formattedGrid: string[][] = Array.from({ length: numRows }, () => Array(numCols).fill(''));
  const formulaGrid: string[][] = Array.from({ length: numRows }, () => Array(numCols).fill(''));

  let lastNonEmptyRow = 0;
  let lastNonEmptyCol = 0;

  for (let r = decoded.s.r; r <= maxEndRow; r++) {
    const rowIdx = r - decoded.s.r;
    for (let c = decoded.s.c; c <= maxEndCol; c++) {
      const colIdx = c - decoded.s.c;
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const origCell = ws[cellAddress] as XLSX.CellObject | undefined;
      if (!origCell) continue;

      if (origCell.f) {
        formulaGrid[rowIdx][colIdx] = String(origCell.f).toUpperCase();
      }

      const cell = resolveDirectFormulaCell(origCell, sheetName, wb);

      // Ignore Excel formula errors (#DIV/0!, #VALUE!, #N/A, #REF!)
      if (cell.t === 'e') {
        rawGrid[rowIdx][colIdx] = '';
        formattedGrid[rowIdx][colIdx] = '';
        continue;
      }

      if (cell.t === 'n' && typeof cell.v === 'number') {
        const wStr = cell.w ? String(cell.w).trim() : '';
        if (wStr.endsWith('%') && Math.abs(cell.v) <= 1 && cell.v !== 0) {
          const pctVal = Math.round(cell.v * 100 * 100) / 100;
          rawGrid[rowIdx][colIdx] = pctVal;
        } else {
          rawGrid[rowIdx][colIdx] = Math.round(cell.v * 100) / 100;
        }
        formattedGrid[rowIdx][colIdx] = wStr || String(rawGrid[rowIdx][colIdx]);
        lastNonEmptyRow = Math.max(lastNonEmptyRow, rowIdx);
        lastNonEmptyCol = Math.max(lastNonEmptyCol, colIdx);
      } else {
        const textVal = String(cell.v ?? cell.w ?? '').trim();
        const fmtVal = String(cell.w ?? cell.v ?? '').trim();
        rawGrid[rowIdx][colIdx] = textVal;
        formattedGrid[rowIdx][colIdx] = fmtVal;
        if (textVal !== '' || fmtVal !== '') {
          lastNonEmptyRow = Math.max(lastNonEmptyRow, rowIdx);
          lastNonEmptyCol = Math.max(lastNonEmptyCol, colIdx);
        }
      }
    }
  }

  const effectiveRows = Math.min(numRows, lastNonEmptyRow + 1);
  const effectiveCols = Math.min(numCols, lastNonEmptyCol + 1);

  if (effectiveRows === 0 || effectiveCols === 0) {
    return { rawGrid: [], formattedGrid: [], formulaGrid: [], numRows: 0, numCols: 0 };
  }

  // Expand merged cells in the header area (top 45 rows)
  const merges: XLSX.Range[] = ws['!merges'] || [];
  for (const m of merges) {
    const startR = m.s.r - decoded.s.r;
    const endR = m.e.r - decoded.s.r;
    const startC = m.s.c - decoded.s.c;
    const endC = m.e.c - decoded.s.c;

    if (startR < 0 || startC < 0 || startR >= effectiveRows || startC >= effectiveCols) continue;
    if (startR >= 45) continue;

    const colSpan = endC - startC + 1;
    const rowSpan = endR - startR + 1;

    // Do not horizontally expand full-sheet title banners (spanning > 12 columns)
    if (colSpan > 12 && rowSpan === 1) continue;

    const topRaw = rawGrid[startR][startC];
    const topFormatted = formattedGrid[startR][startC];
    if (topRaw === '' && topFormatted === '') continue;

    for (let r = startR; r <= Math.min(endR, effectiveRows - 1, 44); r++) {
      for (let c = startC; c <= Math.min(endC, effectiveCols - 1); c++) {
        if (rawGrid[r][c] === '') rawGrid[r][c] = topRaw;
        if (formattedGrid[r][c] === '') formattedGrid[r][c] = topFormatted;
      }
    }
  }

  return {
    rawGrid: rawGrid.slice(0, effectiveRows).map(r => r.slice(0, effectiveCols)),
    formattedGrid: formattedGrid.slice(0, effectiveRows).map(r => r.slice(0, effectiveCols)),
    formulaGrid: formulaGrid.slice(0, effectiveRows).map(r => r.slice(0, effectiveCols)),
    numRows: effectiveRows,
    numCols: effectiveCols
  };
};

// Strictly parse a numerical score from a cell, returning undefined if blank or non-numeric
const parseScoreCellValue = (rawVal: any, formattedVal?: string): number | undefined => {
  if (rawVal === null || rawVal === undefined || rawVal === '') return undefined;

  if (typeof rawVal === 'number') {
    if (Number.isNaN(rawVal) || !Number.isFinite(rawVal)) return undefined;
    return Math.round(rawVal * 100) / 100;
  }

  const str = replaceKhmerDigits(String(rawVal || formattedVal || '')).trim();
  if (!str) return undefined;

  // Common placeholders for missing/absent scores -> must stay blank (undefined), never 0
  if (/^[-–—_\/\\]+$/.test(str)) return undefined;
  if (/^(n\/?a|none|null|abs|absent|exc|excused|missing|blank|#div\/0!|#value!|#ref!|#n\/a|#name\?)$/i.test(str)) {
    return undefined;
  }

  // Handle "9/10" or "85/100" fraction notation if a teacher typed score/max
  const fractionMatch = str.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*(10|100)$/);
  if (fractionMatch) {
    const num = Number(fractionMatch[1]);
    return Number.isNaN(num) ? undefined : Math.round(num * 100) / 100;
  }

  // Strip trailing % if present
  const cleaned = str.replace(/%$/, '').trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) {
    return undefined;
  }

  const num = Number(cleaned);
  if (Number.isNaN(num) || !Number.isFinite(num)) return undefined;
  return Math.round(num * 100) / 100;
};

// Detect parent category from a header string (handling punctuation like C.P., H.W., Q.Z., M.T., and Khmer headers)
type MajorCategory = 'conduct' | 'cp' | 'hw' | 'quiz' | 'test' | 'id' | 'name' | 'sex' | 'summary' | 'unknown';

// Identify worksheets that belong to unrelated sections or documentation/settings tabs
// so we ONLY import from the main score sheet (Conduct, CP, Homework, Quizzes, Monthly Test).
const isExcludedNonTargetSheet = (sheetName: string): boolean => {
  const s = replaceKhmerDigits(String(sheetName || '')).trim();
  if (!s) return true;
  // "Scoring System" is the main E-GradeBook score sheet containing Conduct, CP, Homework, Quizzes, and Monthly Test
  if (/^\s*scoring[\s\-_]*system\s*$/i.test(s)) {
    return false;
  }
  if (
    /\b(settings?|comments?|grading[\s\-_]*system|grading[\s\-_]*policy|rubrics?|sports?|p\.?\s*e\.?|physical\s*education|khmer\s*essays?|khmer\s*dictations?|dictations?|essays?|reading|call?ingraphy|calligraphy|handwriting|public\s*speaking|speaking|evaluations?|attendance|absent|ptc|cover|instructions?|guide)\b/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
};

const classifyCategoryText = (text: string): MajorCategory => {
  const t = replaceKhmerDigits(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return 'unknown';

  // Summary / Total / Derived / Non-target sections (Sport, Reading, Dictation, Essay, Calligraphy, Speaking, Evaluation, Policy text)
  if (
    /(?:^|[\s\(\[\-\/])(overall|gpa|letter\s*grade|rank|ranking|semester|achievement|improve|improvement|remark|comment|pass|fail|sports?|khmer\s*essays?|khmer\s*dictations?|dictations?|essays?|reading|call?ingraphy|calligraphy|public\s*speaking|speaking|evaluations?|attendance|absent|permission|late)(?:$|[\s\)\]\-\/:%])/i.test(
      t
    ) ||
    /\b(hours?\s*\/\s*week|to\s*assess\s*students|western\s*international|grading\s*system)\b/i.test(t) ||
    /(សរុបរួម|ចំណាត់ថ្នាក់|និទ្ទេស|មធ្យមភាគ|កីឡា|តែងសេចក្តី|សរសេរតាមអាន|អំណាន|អក្សរផ្ចង់|ការនិយាយជាសាធារណៈ|ការវាយតម្លៃ|វត្តមាន|អវត្តមាន)/i.test(
      t
    )
  ) {
    return 'summary';
  }

  // Conduct
  if (
    /(?:^|[\s\(\[\-\/])(conduct|con\.?|cond\.?|behavior|behaviour|discipline|moral|morality)(?:$|[\s\)\]\-\/:%])/i.test(t) ||
    /(សីលធម៌|ឥរិយាបថ|វិន័យ|ពិន្ទុសីលធម៌)/i.test(t)
  ) {
    return 'conduct';
  }

  // Class Participation (C.P)
  if (
    /(?:^|[\s\(\[\-\/])(c\.?\s*p\.?|c\/p|c\-p|class\s*participation|participation|class\s*part\.?|part\.?|class\s*activity|activity)(?:$|[\s\)\]\-\/:%])/i.test(t) ||
    /(សកម្មភាព|ការចូលរួម)/i.test(t)
  ) {
    return 'cp';
  }

  // Homework
  if (
    /(?:^|[\s\(\[\-\/])(home\s*works?|home-works?|hw|h\.?\s*w\.?|h\/w|h\-w|assignments?|asg|exercises?)\s*[\.\-\(#]?\s*[123]?(?:st|nd|rd)?(?:$|[\s\)\]\-\/:%#])/i.test(t) ||
    /^h\.?\s*[123](?:\b|\s|\()/i.test(t) ||
    /(កិច្ចការផ្ទះ|លំហាត់)/i.test(t)
  ) {
    return 'hw';
  }

  // Quizzes
  if (
    /(?:^|[\s\(\[\-\/])(quizzes|quizes|quiz|qz|q\.?\s*z\.?|q\/z|q\-z|mini\s*tests?|short\s*tests?|pop\s*quiz)\s*[\.\-\(#]?\s*[123]?(?:st|nd|rd)?(?:$|[\s\)\]\-\/:%#])/i.test(t) ||
    /^q\.?\s*[123](?:\b|\s|\()/i.test(t) ||
    /(តេស្តតូច|ប្រឡងតូច|សំណួរត្រិះរិះ|កម្រងសំណួរ)/i.test(t)
  ) {
    return 'quiz';
  }

  // Monthly Test
  if (
    /(?:^|[\s\(\[\-\/])(monthly\s*tests?|month\s*tests?|m\.?\s*tests?|m\-tests?|m\.?\s*t\.?|mt|chapter\s*tests?|unit\s*tests?|tests?|monthly\s*exams?|exams?)\s*[\.\-\(#]?\s*[12]?(?:st|nd)?(?:$|[\s\)\]\-\/:%#])/i.test(t) ||
    /^t\.?\s*[12](?:\b|\s|\()/i.test(t) ||
    /(ប្រឡងប្រចាំខែ|តេស្តប្រចាំខែ|ប្រឡងខែ)/i.test(t)
  ) {
    return 'test';
  }

  // Student Name
  if (
    /(?:^|[\s\(\[\-\/])(student\s*name|students?\s*name|full\s*name|english\s*name|khmer\s*name|name\s*in\s*latin|student|name|pupil)(?:$|[\s\)\]\-\/:])/i.test(t) ||
    /(ឈ្មោះ|គោត្តនាម)/i.test(t)
  ) {
    return 'name';
  }

  // Student ID
  if (/(?:^|[\s\(\[\-\/])(student\s*id|id\s*no|id\s*number|id|code)(?:$|[\s\)\]\-\/:])/i.test(t) || /(អត្តលេខ)/i.test(t)) {
    return 'id';
  }

  // Sex / Gender
  if (/(?:^|[\s\(\[\-\/])(sex|gender|m\/f)(?:$|[\s\)\]\-\/:])/i.test(t) || /(ភេទ)/i.test(t)) {
    return 'sex';
  }

  return 'unknown';
};

// Check if a column's header parts contain explicit Total / Average / Summary words
const hasExplicitSummaryWord = (allParts: string[]): boolean => {
  for (const part of allParts) {
    const p = replaceKhmerDigits(part).toLowerCase().trim();
    if (
      /(?:^|[\s\(\[\-\/])(total|tot|sum|avg|average|mean|overall|subtotal|sub-total|weight|weighted|rank|grade|gpa)(?:$|[\s\)\]\-\/:%])/i.test(p) ||
      /(សរុប|មធ្យមភាគ)/i.test(p)
    ) {
      return true;
    }
  }
  return false;
};

// Extract explicit sub-item index (1, 2, or 3) from a column's header parts
const extractSubItemIndex = (parts: string[], category: MajorCategory): 1 | 2 | 3 | null => {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = replaceKhmerDigits(parts[i]).trim();
    if (!p) continue;
    // Skip pure max-score or percentage labels like "100", "10", "20%", "40%", "100 pts"
    if (
      /^\(?(\d+(\.\d+)?)\s*%\)?$/.test(p) ||
      /^\(?(10|20|40|50|100)\s*(pts|points|ពិន្ទុ)?\)?$/i.test(p)
    ) {
      continue;
    }

    if (category === 'hw') {
      const m =
        p.match(/(?:home\s*works?|home-works?|hw|h\.?\s*w\.?|h\/w|h\-w|assignments?|asg|exercises?|h|ទី|#|\bno\.?)\s*[\.\-\(\[_]?\s*0*([123])(?:st|nd|rd)?(?:\)|\]|\b|$)/i) ||
        p.match(/^\(?#?0*([123])(?:st|nd|rd)?(?:\s*[\(\-\/]\s*(?:100|10|20|40|50)\b.*)?\)?$/i) ||
        p.match(/^(I|II|III)$/i);
      if (m) {
        const tok = m[1].toUpperCase();
        if (tok === '1' || tok === 'I') return 1;
        if (tok === '2' || tok === 'II') return 2;
        if (tok === '3' || tok === 'III') return 3;
      }
    } else if (category === 'quiz') {
      const m =
        p.match(/(?:quizzes|quizes|quiz|qz|q\.?\s*z\.?|q\/z|q\-z|mini\s*tests?|short\s*tests?|q|ទី|#|\bno\.?)\s*[\.\-\(\[_]?\s*0*([123])(?:st|nd|rd)?(?:\)|\]|\b|$)/i) ||
        p.match(/^\(?#?0*([123])(?:st|nd|rd)?(?:\s*[\(\-\/]\s*(?:100|10|20|40|50)\b.*)?\)?$/i) ||
        p.match(/^(I|II|III)$/i);
      if (m) {
        const tok = m[1].toUpperCase();
        if (tok === '1' || tok === 'I') return 1;
        if (tok === '2' || tok === 'II') return 2;
        if (tok === '3' || tok === 'III') return 3;
      }
    } else if (category === 'test') {
      const m =
        p.match(/(?:monthly\s*tests?|month\s*tests?|m\.?\s*tests?|m\-tests?|m\.?\s*t\.?|tests?|exams?|mt|t|month|m|ទី|#|\bno\.?)\s*[\.\-\(\[_]?\s*0*([12])(?:st|nd)?(?:\)|\]|\b|$)/i) ||
        p.match(/^\(?#?0*([12])(?:st|nd)?(?:\s*[\(\-\/]\s*(?:100|10|20|40|50)\b.*)?\)?$/i) ||
        p.match(/^(I|II)$/i);
      if (m) {
        const tok = m[1].toUpperCase();
        if (tok === '1' || tok === 'I') return 1;
        if (tok === '2' || tok === 'II') return 2;
      }
    }
  }
  return null;
};

// Detect header block and column mappings from a worksheet grid
const detectColumns = (
  gridData: WorksheetGridData,
  roster: Student[],
  forcedHeaderRow?: number
): {
  headerRowIndex: number;
  dataStartRowIndex: number;
  mapping: ColumnMapping;
  headers: string[];
  sampleValues: string[];
} => {
  const { rawGrid, formattedGrid, formulaGrid, numRows, numCols } = gridData;

  const emptyResult = {
    headerRowIndex: 0,
    dataStartRowIndex: 1,
    mapping: {
      nameCol: -1,
      idCol: -1,
      conductCol: -1,
      cpCol: -1,
      hw1Col: -1,
      hw2Col: -1,
      hw3Col: -1,
      quiz1Col: -1,
      quiz2Col: -1,
      quiz3Col: -1,
      test1Col: -1,
      test2Col: -1
    },
    headers: [],
    sampleValues: []
  };

  if (numRows === 0 || numCols === 0) return emptyResult;

  // Step 1: Locate the first row that matches a student in our target class roster
  let firstRosterRow = -1;
  const maxScanRow = Math.min(numRows, 85);

  const findFirstMatchRow = (studentPool: Student[]): number => {
    if (!studentPool || studentPool.length === 0) return -1;
    for (let r = 0; r < maxScanRow; r++) {
      const row = formattedGrid[r];
      if (!row) continue;

      // Only check the first 5 columns for category header words so remarks/legends on the right don't skip student rows
      const leftJoined = row.slice(0, 5).join(' ').toLowerCase();
      if (/\b(conduct|homework|quizzes|monthly\s*test|class\s*participation|student\s*name)\b/i.test(leftJoined)) {
        continue;
      }

      for (let c = 0; c < Math.min(numCols, 12); c++) {
        const cellText = String(row[c] || '').trim();
        if (!cellText || cellText.length < 3) continue;
        if (/^(no\.?|id|name|student\s*name|sex|gender|male|female|total|average|conduct|homework|quizzes)$/i.test(cellText)) {
          continue;
        }

        const m = matchStudent(cellText, undefined, studentPool);
        if (m.student && (m.confidence === 'high' || m.confidence === 'medium')) {
          return r;
        }
      }
    }
    return -1;
  };

  firstRosterRow = findFirstMatchRow(roster);

  // Step 2: Score candidate header rows above firstRosterRow (or in top 35 rows)
  const headerSearchLimit = firstRosterRow > 0 ? firstRosterRow : Math.min(numRows, 35);

  const scoreHeaderRow = (r: number): number => {
    const row = formattedGrid[r];
    if (!row) return 0;
    let score = 0;
    let nonEmpty = 0;
    const seenCats = new Set<string>();

    for (let c = 0; c < numCols; c++) {
      const val = String(row[c] || '').trim();
      if (!val) continue;
      nonEmpty++;

      const cat = classifyCategoryText(val);
      if (cat === 'name') {
        score += 6;
        seenCats.add(cat);
      } else if (cat === 'sex' || cat === 'id') {
        score += 3;
        seenCats.add(cat);
      } else if (cat === 'conduct' || cat === 'cp' || cat === 'hw' || cat === 'quiz' || cat === 'test') {
        score += seenCats.has(cat) ? 2 : 6;
        seenCats.add(cat);
      }
    }

    if (nonEmpty < 2) return 0;
    return score;
  };

  let anchorHeaderRow = 0;
  if (forcedHeaderRow !== undefined && forcedHeaderRow >= 0 && forcedHeaderRow < numRows) {
    anchorHeaderRow = forcedHeaderRow;
  } else {
    let bestScore = -1;
    for (let r = 0; r < headerSearchLimit; r++) {
      const s = scoreHeaderRow(r);
      if (s > bestScore) {
        bestScore = s;
        anchorHeaderRow = r;
      }
    }
  }

  // Step 2b: If firstRosterRow is still -1, detect the first student-like data row below anchorHeaderRow
  let firstStudentLikeRow = firstRosterRow;
  if (firstStudentLikeRow === -1) {
    for (let r = anchorHeaderRow + 1; r < Math.min(numRows, anchorHeaderRow + 25); r++) {
      const row = formattedGrid[r] || [];
      // Skip rows that contain sub-header tokens (HW1, Quiz 1, Test 1, Total, Average, 10%, 20%, 40%)
      let hasSubHeaderKeywords = false;
      for (let c = 0; c < numCols; c++) {
        const cellTxt = replaceKhmerDigits(String(row[c] || '')).trim();
        if (!cellTxt) continue;
        const cat = classifyCategoryText(cellTxt);
        if (
          cat === 'hw' ||
          cat === 'quiz' ||
          cat === 'test' ||
          cat === 'conduct' ||
          cat === 'cp' ||
          /^(total|tot|avg|average|sum|max|pts|points|1st|2nd|3rd|10%|20%|40%|100%)$/i.test(cellTxt)
        ) {
          hasSubHeaderKeywords = true;
          break;
        }
      }
      if (hasSubHeaderKeywords) continue;

      // Check if row has a student-like name in cols 0..5 (2+ words of letters, not a header keyword) and at least 1 numeric score
      let hasCandidateName = false;
      for (let c = 0; c < Math.min(numCols, 6); c++) {
        const txt = String(row[c] || '').trim();
        if (txt.length >= 4 && /[a-zA-Z\u1780-\u17ff]{2,}\s+[a-zA-Z\u1780-\u17ff]{2,}/.test(txt)) {
          const cat = classifyCategoryText(txt);
          if (
            cat === 'unknown' &&
            !/\b(total|average|max|score|points|weight|percentage|quarter|semester|grade|class|teacher|subject|school|academic|system|roll|number|date|birth)\b/i.test(
              txt
            )
          ) {
            hasCandidateName = true;
            break;
          }
        }
      }
      if (hasCandidateName) {
        let numScoresOnRow = 0;
        for (let c = 2; c < numCols; c++) {
          const v = parseScoreCellValue(rawGrid[r]?.[c], formattedGrid[r]?.[c]);
          if (v !== undefined && v >= 0 && v <= 100) {
            numScoresOnRow++;
          }
        }
        if (numScoresOnRow >= 1) {
          firstStudentLikeRow = r;
          break;
        }
      }
    }
  }

  // Step 3: Expand header block [headerStartRow .. headerEndRow] around anchorHeaderRow
  let headerStartRow = anchorHeaderRow;
  let headerEndRow = anchorHeaderRow;

  for (let r = anchorHeaderRow - 1; r >= Math.max(0, anchorHeaderRow - 3); r--) {
    if (scoreHeaderRow(r) >= 4) {
      headerStartRow = r;
    }
  }

  if (firstStudentLikeRow > anchorHeaderRow) {
    headerEndRow = Math.min(firstStudentLikeRow - 1, anchorHeaderRow + 4);
  } else {
    for (let r = anchorHeaderRow + 1; r <= Math.min(numRows - 1, anchorHeaderRow + 3); r++) {
      const row = formattedGrid[r];
      if (!row) continue;

      let subHeaderTokens = 0;
      for (let c = 0; c < numCols; c++) {
        const cell = replaceKhmerDigits(String(row[c] || '')).trim().toLowerCase();
        if (!cell) continue;
        const cat = classifyCategoryText(cell);
        if (
          cat === 'hw' ||
          cat === 'quiz' ||
          cat === 'test' ||
          /^(#?[123](?:st|nd|rd)?|no\.?\s*[123]|ទី\s*[123]|i|ii|iii)$/i.test(cell) ||
          /^(total|tot|avg|average|sum|max|pts|points|score)$/i.test(cell) ||
          /^\(?(\d+(\.\d+)?)\s*%\)?$/.test(cell) ||
          /^(10|20|40|50|100)$/.test(cell)
        ) {
          subHeaderTokens++;
        }
      }

      if (scoreHeaderRow(r) >= 4 || subHeaderTokens >= 2) {
        headerEndRow = r;
      }
    }
  }

  let dataStartRowIndex = firstStudentLikeRow > headerEndRow ? firstStudentLikeRow : headerEndRow + 1;

  // Step 4: Build header block and collect raw header parts per column
  const headerBlock: string[][] = [];
  for (let r = headerStartRow; r <= headerEndRow; r++) {
    headerBlock.push([...(formattedGrid[r] || Array(numCols).fill(''))]);
  }

  // Propagate parent categories horizontally across unmerged / Center-Across-Selection / multi-row sub-headers
  for (let hr = 0; hr < headerBlock.length; hr++) {
    let activeParentText = '';
    let activeParentCat: MajorCategory = 'unknown';

    for (let c = 0; c < numCols; c++) {
      const cellText = String(headerBlock[hr][c] || '').trim();
      const cat = classifyCategoryText(cellText);

      if (cat === 'hw' || cat === 'quiz' || cat === 'test') {
        activeParentText = cellText;
        activeParentCat = cat;
      } else if (cat === 'conduct' || cat === 'cp' || cat === 'summary' || cat === 'name' || cat === 'id' || cat === 'sex') {
        activeParentText = '';
        activeParentCat = 'unknown';
      } else if (cellText === '' && activeParentText !== '') {
        // Check if any row in headerBlock at column c starts a new major category
        let otherRowCat: MajorCategory = 'unknown';
        for (let r2 = 0; r2 < headerBlock.length; r2++) {
          if (r2 === hr) continue;
          const c2 = classifyCategoryText(String(headerBlock[r2][c] || '').trim());
          if (c2 !== 'unknown') {
            otherRowCat = c2;
            break;
          }
        }

        if (otherRowCat === 'unknown' || otherRowCat === activeParentCat) {
          // Check if any lower row has a sub-header token or if this column has data
          const lowerTokens = headerBlock
            .slice(hr + 1)
            .map(row => replaceKhmerDigits(String(row[c] || '')).trim())
            .filter(Boolean);

          const looksLikeSubColumn =
            lowerTokens.length > 0 &&
            lowerTokens.every(
              tok =>
                classifyCategoryText(tok) === activeParentCat ||
                /^(#?0*[123](?:st|nd|rd)?|no\.?\s*[123]|ទី\s*[123]|i|ii|iii|total|tot|avg|average|sum|max|pts|points|score|\(?(\d+(\.\d+)?)\s*%\)?|\(?(10|20|40|50|100)\s*(pts|points)?\)?)$/i.test(
                  tok
                )
            );

          if (looksLikeSubColumn) {
            headerBlock[hr][c] = activeParentText;
          }
        } else {
          activeParentText = '';
          activeParentCat = 'unknown';
        }
      }
    }
  }

  // Step 5: Build human-readable composite headers per column
  const compositeHeaders: string[] = [];
  const colHeaderParts: string[][] = [];

  for (let c = 0; c < numCols; c++) {
    const parts: string[] = [];
    for (let hr = 0; hr < headerBlock.length; hr++) {
      const val = String(headerBlock[hr][c] || '').replace(/\s+/g, ' ').trim();
      if (val && !parts.some(p => p.toLowerCase() === val.toLowerCase())) {
        parts.push(val);
      }
    }
    colHeaderParts.push(parts);
    compositeHeaders.push(parts.join(' - '));
  }

  const mapping: ColumnMapping = {
    nameCol: -1,
    idCol: -1,
    conductCol: -1,
    cpCol: -1,
    hw1Col: -1,
    hw2Col: -1,
    hw3Col: -1,
    quiz1Col: -1,
    quiz2Col: -1,
    quiz3Col: -1,
    test1Col: -1,
    test2Col: -1
  };

  // Step 6: Detect Student Name and Student ID columns
  const dataRowLimit = Math.min(numRows, dataStartRowIndex + 50);
  let bestRosterMatchCol = -1;
  let bestRosterMatches = 0;

  const matchPool = roster;
  for (let c = 0; c < Math.min(numCols, 12); c++) {
    let matches = 0;
    for (let r = dataStartRowIndex; r < dataRowLimit; r++) {
      const val = String(formattedGrid[r]?.[c] || '').trim();
      if (!val || val.length < 2) continue;
      const m = matchStudent(val, undefined, matchPool);
      if (m.student) matches++;
    }
    if (matches > bestRosterMatches) {
      bestRosterMatches = matches;
      bestRosterMatchCol = c;
    }
  }

  for (let c = 0; c < numCols; c++) {
    const joined = colHeaderParts[c].join(' ');
    const cat = classifyCategoryText(joined);
    if (cat === 'id' && mapping.idCol === -1) {
      mapping.idCol = c;
    }
    if (cat === 'name' && mapping.nameCol === -1) {
      mapping.nameCol = c;
    }
  }

  if (bestRosterMatchCol !== -1 && bestRosterMatches >= 1) {
    mapping.nameCol = bestRosterMatchCol;
  }

  if (mapping.nameCol === -1) {
    for (let c = 0; c < Math.min(numCols, 8); c++) {
      if (c === mapping.idCol) continue;
      let textRows = 0;
      for (let r = dataStartRowIndex; r < Math.min(numRows, dataStartRowIndex + 20); r++) {
        const val = String(formattedGrid[r]?.[c] || '').trim();
        if (val.length >= 3 && !/^(male|female|m|f|ប្រុស|ស្រី|\d+(\.\d+)?%?)$/i.test(val)) {
          textRows++;
        }
      }
      if (textRows >= 2) {
        mapping.nameCol = c;
        break;
      }
    }
  }

  // Advance dataStartRowIndex past any blank or Max-Points sub-rows before the first student name
  if (mapping.nameCol !== -1 && firstStudentLikeRow === -1) {
    while (dataStartRowIndex < numRows - 1) {
      const candidateName = String(formattedGrid[dataStartRowIndex]?.[mapping.nameCol] || '').trim();
      if (
        !candidateName ||
        /^(max|max\s*score|full\s*score|points|weight|percentage|10|20|40|50|100|10%|20%|40%|100%)$/i.test(
          candidateName
        )
      ) {
        dataStartRowIndex++;
      } else {
        break;
      }
    }
  }

  // Step 7: Inspect student data rows to detect formula-based summary columns and numeric sample values
  const isFormulaSummaryCol: boolean[] = Array(numCols).fill(false);
  const numericCountInCol: number[] = Array(numCols).fill(0);
  const sampleValues: string[] = Array(numCols).fill('');

  const scanEndRow = Math.min(numRows, dataStartRowIndex + 45);
  for (let c = 0; c < numCols; c++) {
    let formulaSummaries = 0;
    let totalFormulas = 0;
    for (let r = dataStartRowIndex; r < scanEndRow; r++) {
      const rawFormula = formulaGrid[r]?.[c] || '';
      if (rawFormula) {
        totalFormulas++;
        // Strip sheet prefixes like 'Sheet-1'! or Sheet1! before checking for arithmetic summary formulas
        const fClean = rawFormula.replace(/'[^']+'!/g, '').replace(/[A-Z0-9_]+!/gi, '');
        if (
          /\b(SUM|AVERAGE|AVG|MEAN|RANK|MIN|MAX)\s*\(/i.test(fClean) ||
          /\$?[A-Z]+\$?\d+\s*[+\-]\s*\$?[A-Z]+\$?\d+/i.test(fClean) ||
          /\$?[A-Z]+\$?\d+\s*[\*\/]\s*(0\.[124]|10%|20%|40%|3|5)\b/i.test(fClean) ||
          /\*\s*(0\.[124]|10%|20%|40%)\b/i.test(fClean)
        ) {
          formulaSummaries++;
        }
      }
      const parsed = parseScoreCellValue(rawGrid[r]?.[c], formattedGrid[r]?.[c]);
      if (parsed !== undefined) {
        numericCountInCol[c]++;
        if (!sampleValues[c]) {
          sampleValues[c] = String(parsed);
        }
      } else if (!sampleValues[c] && formattedGrid[r]?.[c]) {
        sampleValues[c] = String(formattedGrid[r][c]).trim().slice(0, 20);
      }
    }
    if (formulaSummaries > 0 && formulaSummaries >= Math.ceil(totalFormulas * 0.5)) {
      isFormulaSummaryCol[c] = true;
    }
  }

  // Step 8: Classify and assign the 5 score categories into the 10 score fields
  interface ColCandidate {
    col: number;
    subIdx: 1 | 2 | 3 | null;
    hasTotalWord: boolean;
    isFormulaSummary: boolean;
    isPercentLeaf: boolean;
  }

  const conductCols: ColCandidate[] = [];
  const cpCols: ColCandidate[] = [];
  const hwCols: ColCandidate[] = [];
  const quizCols: ColCandidate[] = [];
  const testCols: ColCandidate[] = [];

  // Track the most recently seen multi-column category ('hw', 'quiz', 'test') so adjacent sub-columns
  // whose headers only contain "2", "3", "100", or blank cells still inherit their section category,
  // while never bleeding into unrelated sections.
  let runningMultiCategory: MajorCategory = 'unknown';
  let runningMultiSubColCount = 0;

  const isAllowedSubColHeader = (parts: string[]): boolean => {
    if (parts.length === 0) return true;
    return parts.every(rawP => {
      const p = replaceKhmerDigits(rawP).trim();
      if (!p) return true;
      return (
        /^(#?0*[123](?:st|nd|rd)?|no\.?\s*0*[123]|លើកទី\s*0*[123]|ទី\s*0*[123]|i|ii|iii)$/i.test(p) ||
        /^\(?(10|20|40|50|100)\s*(pts|points|ពិន្ទុ)?\)?$/i.test(p) ||
        /^\(?(\d+(\.\d+)?)\s*%\)?$/.test(p) ||
        /^(total|tot|avg|average|sum|max|pts|points|score|សរុប|មធ្យមភាគ|ពិន្ទុពេញ)$/i.test(p) ||
        /^(m[123]|w[123]|t[12]|q[123]|h[123])$/i.test(p)
      );
    });
  };

  for (let c = 0; c < numCols; c++) {
    if (c <= mapping.nameCol || c === mapping.idCol) continue;
    const parts = colHeaderParts[c];

    let category: MajorCategory = 'unknown';
    for (const p of parts) {
      const pCat = classifyCategoryText(p);
      if (pCat === 'summary') {
        category = 'summary';
        break;
      }
      if (pCat === 'conduct' || pCat === 'cp' || pCat === 'hw' || pCat === 'quiz' || pCat === 'test') {
        category = pCat;
      }
    }
    if (category === 'unknown' && parts.length > 0) {
      category = classifyCategoryText(parts.join(' '));
    }

    if (category === 'hw' || category === 'quiz' || category === 'test') {
      runningMultiCategory = category;
      runningMultiSubColCount = 1;
    } else if (
      category === 'conduct' ||
      category === 'cp' ||
      category === 'summary' ||
      category === 'name' ||
      category === 'id' ||
      category === 'sex'
    ) {
      runningMultiCategory = 'unknown';
      runningMultiSubColCount = 0;
    } else if (category === 'unknown' && runningMultiCategory !== 'unknown') {
      const maxAllowedCols = runningMultiCategory === 'test' ? 4 : 5;
      if (
        runningMultiSubColCount < maxAllowedCols &&
        isAllowedSubColHeader(parts) &&
        (parts.length > 0 || numericCountInCol[c] > 0)
      ) {
        category = runningMultiCategory;
        runningMultiSubColCount++;
        if (!compositeHeaders[c]) {
          const catTitle =
            runningMultiCategory === 'hw'
              ? 'Homework'
              : runningMultiCategory === 'quiz'
              ? 'Quizzes'
              : 'Monthly Test';
          compositeHeaders[c] = `${catTitle} (Col ${XLSX.utils.encode_col(c)})`;
        }
      } else {
        runningMultiCategory = 'unknown';
        runningMultiSubColCount = 0;
      }
    }

    if (
      category === 'summary' ||
      category === 'unknown' ||
      category === 'name' ||
      category === 'id' ||
      category === 'sex'
    ) {
      continue;
    }

    const subIdx = extractSubItemIndex(parts, category);
    const hasTotalWord = hasExplicitSummaryWord(parts);
    const leafText = replaceKhmerDigits(parts[parts.length - 1] || '').trim();
    const isPercentLeaf = subIdx === null && /^\(?(\d+(\.\d+)?)\s*%\)?$/.test(leafText);

    const candidate: ColCandidate = {
      col: c,
      subIdx,
      hasTotalWord,
      isFormulaSummary: isFormulaSummaryCol[c],
      isPercentLeaf
    };

    if (category === 'conduct') conductCols.push(candidate);
    else if (category === 'cp') cpCols.push(candidate);
    else if (category === 'hw') hwCols.push(candidate);
    else if (category === 'quiz') quizCols.push(candidate);
    else if (category === 'test') testCols.push(candidate);
  }

  // Assign Conduct & CP (preferring non-summary, non-formula columns with numeric values)
  const pickBestSingleCol = (candidates: ColCandidate[]): number => {
    if (candidates.length === 0) return -1;
    const rawWithNums = candidates.find(
      c => !c.hasTotalWord && !c.isFormulaSummary && !c.isPercentLeaf && numericCountInCol[c.col] > 0
    );
    if (rawWithNums) return rawWithNums.col;
    const anyWithNums = candidates.find(c => numericCountInCol[c.col] > 0);
    if (anyWithNums) return anyWithNums.col;
    const rawFirst = candidates.find(c => !c.hasTotalWord && !c.isFormulaSummary);
    return rawFirst ? rawFirst.col : candidates[0].col;
  };

  mapping.conductCol = pickBestSingleCol(conductCols);
  mapping.cpCol = pickBestSingleCol(cpCols);

  // Assign Homework (HW1, HW2, HW3)
  for (const cand of hwCols) {
    if (cand.hasTotalWord || cand.isPercentLeaf) continue;
    if (cand.subIdx === 1 && mapping.hw1Col === -1) mapping.hw1Col = cand.col;
    else if (cand.subIdx === 2 && mapping.hw2Col === -1) mapping.hw2Col = cand.col;
    else if (cand.subIdx === 3 && mapping.hw3Col === -1) mapping.hw3Col = cand.col;
  }
  for (const cand of hwCols) {
    if (cand.hasTotalWord || cand.isFormulaSummary || cand.isPercentLeaf) continue;
    if ([mapping.hw1Col, mapping.hw2Col, mapping.hw3Col].includes(cand.col)) continue;
    if (mapping.hw1Col === -1) mapping.hw1Col = cand.col;
    else if (mapping.hw2Col === -1) mapping.hw2Col = cand.col;
    else if (mapping.hw3Col === -1) mapping.hw3Col = cand.col;
  }
  if (mapping.hw1Col === -1 && hwCols.length > 0) {
    const nonTotal = hwCols.filter(c => !c.hasTotalWord);
    const pool = nonTotal.length > 0 ? nonTotal : hwCols;
    if (pool[0]) mapping.hw1Col = pool[0].col;
    if (pool[1]) mapping.hw2Col = pool[1].col;
    if (pool[2]) mapping.hw3Col = pool[2].col;
  }

  // Assign Quizzes (Qz1, Qz2, Qz3)
  for (const cand of quizCols) {
    if (cand.hasTotalWord || cand.isPercentLeaf) continue;
    if (cand.subIdx === 1 && mapping.quiz1Col === -1) mapping.quiz1Col = cand.col;
    else if (cand.subIdx === 2 && mapping.quiz2Col === -1) mapping.quiz2Col = cand.col;
    else if (cand.subIdx === 3 && mapping.quiz3Col === -1) mapping.quiz3Col = cand.col;
  }
  for (const cand of quizCols) {
    if (cand.hasTotalWord || cand.isFormulaSummary || cand.isPercentLeaf) continue;
    if ([mapping.quiz1Col, mapping.quiz2Col, mapping.quiz3Col].includes(cand.col)) continue;
    if (mapping.quiz1Col === -1) mapping.quiz1Col = cand.col;
    else if (mapping.quiz2Col === -1) mapping.quiz2Col = cand.col;
    else if (mapping.quiz3Col === -1) mapping.quiz3Col = cand.col;
  }
  if (mapping.quiz1Col === -1 && quizCols.length > 0) {
    const nonTotal = quizCols.filter(c => !c.hasTotalWord);
    const pool = nonTotal.length > 0 ? nonTotal : quizCols;
    if (pool[0]) mapping.quiz1Col = pool[0].col;
    if (pool[1]) mapping.quiz2Col = pool[1].col;
    if (pool[2]) mapping.quiz3Col = pool[2].col;
  }

  // Assign Monthly Test (Test1, Test2)
  for (const cand of testCols) {
    if (cand.hasTotalWord || cand.isPercentLeaf) continue;
    if (cand.subIdx === 1 && mapping.test1Col === -1) mapping.test1Col = cand.col;
    else if (cand.subIdx === 2 && mapping.test2Col === -1) mapping.test2Col = cand.col;
  }
  for (const cand of testCols) {
    if (cand.hasTotalWord || cand.isFormulaSummary || cand.isPercentLeaf) continue;
    if ([mapping.test1Col, mapping.test2Col].includes(cand.col)) continue;
    if (mapping.test1Col === -1) mapping.test1Col = cand.col;
    else if (mapping.test2Col === -1) mapping.test2Col = cand.col;
  }
  if (mapping.test1Col === -1 && testCols.length > 0) {
    const nonTotal = testCols.filter(c => !c.hasTotalWord);
    const pool = nonTotal.length > 0 ? nonTotal : testCols;
    if (pool[0]) mapping.test1Col = pool[0].col;
    if (pool[1]) mapping.test2Col = pool[1].col;
  }

  return {
    headerRowIndex: headerEndRow,
    dataStartRowIndex,
    mapping,
    headers: compositeHeaders,
    sampleValues
  };
};

// If a score worksheet (e.g. "Scoring System") still has 0 matches for our target class roster because Excel saved
// stale cached names from a copied template, check if a helper sheet in the same workbook (e.g. "SETTINGS" or "COMMENTS")
// contains the target class's student roster, and synchronize those live student names into the score grid.
const syncStudentNamesFromHelperSheets = (
  gridData: WorksheetGridData,
  wb: XLSX.WorkBook,
  targetRoster: Student[]
): WorksheetGridData => {
  if (!wb || targetRoster.length === 0 || gridData.numRows <= 1 || gridData.numCols <= 1) {
    return gridData;
  }

  // First check if gridData already matches at least 1 student in targetRoster
  const maxRowScan = Math.min(gridData.numRows, 100);
  for (let r = 0; r < maxRowScan; r++) {
    const row = gridData.formattedGrid[r];
    if (!row) continue;
    for (let c = 0; c < Math.min(gridData.numCols, 12); c++) {
      const txt = String(row[c] || '').trim();
      if (!txt || txt.length < 3) continue;
      const m = matchStudent(txt, undefined, targetRoster);
      if (m.student && (m.confidence === 'high' || m.confidence === 'medium')) {
        return gridData;
      }
    }
  }

  // Search helper tabs (SETTINGS, COMMENTS, etc.) for a column that matches targetRoster
  const helperSheets = (wb.SheetNames || []).filter(s =>
    /\b(settings?|comments?|students?|roster|list)\b/i.test(s)
  );
  if (helperSheets.length === 0) return gridData;

  let bestHelperNames: string[] = [];
  let bestHelperMatchCount = 0;

  for (const hName of helperSheets) {
    const hWs = wb.Sheets[hName];
    if (!hWs) continue;
    const hGrid = extractGridFromWorksheet(hWs, hName, wb);
    if (hGrid.numRows <= 1 || hGrid.numCols === 0) continue;

    for (let c = 0; c < hGrid.numCols; c++) {
      let matchCnt = 0;
      let firstMatchRow = -1;
      for (let r = 0; r < hGrid.numRows; r++) {
        const val = String(hGrid.formattedGrid[r]?.[c] ?? hGrid.rawGrid[r]?.[c] ?? '').trim();
        if (!val || val.length < 3) continue;
        const m = matchStudent(val, undefined, targetRoster);
        if (m.student && (m.confidence === 'high' || m.confidence === 'medium')) {
          matchCnt++;
          if (firstMatchRow === -1) firstMatchRow = r;
        }
      }

      if (matchCnt >= 2 && matchCnt > bestHelperMatchCount && firstMatchRow !== -1) {
        const names: string[] = [];
        for (let r = firstMatchRow; r < hGrid.numRows; r++) {
          const val = String(hGrid.formattedGrid[r]?.[c] ?? hGrid.rawGrid[r]?.[c] ?? '').trim();
          if (!val) break;
          if (/^(total|average|mean|summary|prepared\s*by|approved\s*by|teacher|signature)$/i.test(val)) {
            break;
          }
          names.push(val);
        }
        if (names.length >= 2) {
          bestHelperMatchCount = matchCnt;
          bestHelperNames = names;
        }
      }
    }
  }

  if (bestHelperNames.length === 0) {
    return gridData;
  }

  const prelimDetected = detectColumns(gridData, targetRoster);
  const nameCol = prelimDetected.mapping.nameCol;
  if (nameCol === -1) return gridData;

  const startRow = Math.max(prelimDetected.headerRowIndex + 1, prelimDetected.dataStartRowIndex);
  const clonedRaw = gridData.rawGrid.map(row => [...row]);
  const clonedFmt = gridData.formattedGrid.map(row => [...row]);

  for (let r = startRow; r < gridData.numRows; r++) {
    const offset = r - startRow;
    const currentVal = String(clonedFmt[r]?.[nameCol] ?? '').trim();
    if (offset < bestHelperNames.length) {
      clonedRaw[r][nameCol] = bestHelperNames[offset];
      clonedFmt[r][nameCol] = bestHelperNames[offset];
    } else if (
      currentVal &&
      !/^(total|average|mean|max|min|summary|prepared\s*by|approved\s*by|signature)/i.test(currentVal)
    ) {
      clonedRaw[r][nameCol] = '';
      clonedFmt[r][nameCol] = '';
    }
  }

  return {
    ...gridData,
    rawGrid: clonedRaw,
    formattedGrid: clonedFmt
  };
};

// Detect if the uploaded Excel filename, worksheet name, or top title banner cells explicitly reference
// a different class in the database (e.g. uploading a Grade 9B file while Grade 9AM is selected).
const detectFileOrHeaderClassMismatch = (
  fileName: string,
  sheetName: string,
  gridData: WorksheetGridData,
  targetClassId: string,
  targetClassName: string,
  allClasses: ClassRoom[]
): string | undefined => {
  const otherClasses = allClasses.filter(c => c.id !== targetClassId);
  if (otherClasses.length === 0) return undefined;

  const getShortCode = (name: string): string =>
    compactAlphaNum(name)
      .replace(/^grade/, '')
      .replace(/^class/, '');

  // Collapse parenthetical suffixes like "9A (M)" -> "9am" so "9A (M)" matches "Grade9AM" and never falsely matches "9A"
  const normalizeSourceForClassScan = (s: string): string =>
    replaceKhmerDigits(String(s || ''))
      .toLowerCase()
      .replace(/(\d+[a-z])\s*\(\s*([a-z0-9]+)\s*\)/gi, '$1$2')
      .replace(/grade\s*(\d+)/gi, 'grade$1');

  const targetShortCode = getShortCode(targetClassName);
  if (!targetShortCode) return undefined;

  const containsClassCode = (normSource: string, code: string): boolean => {
    if (!code || code.length < 2) return false;
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-z0-9])(?:grade\\s*|class\\s*)?${escaped}(?:$|[^a-z0-9])`, 'i');
    return regex.test(normSource);
  };

  // Collect text from filename, sheetName, and top 8 header/title rows
  const headerTexts: string[] = [];
  for (let r = 0; r < Math.min(gridData.numRows, 8); r++) {
    const row = gridData.formattedGrid[r];
    if (!row) continue;
    for (let c = 0; c < Math.min(gridData.numCols, 15); c++) {
      const txt = String(row[c] || '').trim();
      if (txt && txt.length >= 2 && txt.length <= 120) {
        headerTexts.push(txt);
      }
    }
  }

  const combinedSources = [fileName, sheetName, ...headerTexts].map(normalizeSourceForClassScan);

  // If the file/sheet explicitly contains the target class code (e.g. "9A (M)" -> "9am"), it's not a filename mismatch
  if (combinedSources.some(src => containsClassCode(src, targetShortCode))) {
    return undefined;
  }

  // Otherwise check if any other class's code appears in the filename, sheet name, or title banner
  for (const cls of otherClasses) {
    const otherCode = getShortCode(cls.name);
    if (!otherCode || otherCode === targetShortCode) continue;
    if (combinedSources.some(src => containsClassCode(src, otherCode))) {
      return cls.name;
    }
  }

  return undefined;
};

// Analyze a worksheet for student roster matches (both target class and any other class in the app) and score columns
const analyzeWorksheet = (
  sheetName: string,
  ws: XLSX.WorkSheet,
  wb: XLSX.WorkBook,
  currentClassId: string,
  currentClassName: string,
  currentQuarter: Quarter,
  classStudents: Student[],
  allClasses: ClassRoom[],
  allStudents: Student[]
): SheetDiagnosticSummary => {
  if (isExcludedNonTargetSheet(sheetName)) {
    return {
      sheetName,
      matchedTargetCount: 0,
      otherClassMatchCount: 0,
      mappedFieldCount: 0,
      subFieldCount: 0,
      selectionScore: -100000
    };
  }

  const rawExtracted = extractGridFromWorksheet(ws, sheetName, wb);
  const gridData = syncStudentNamesFromHelperSheets(rawExtracted, wb, classStudents);
  if (gridData.numRows <= 1 || gridData.numCols <= 1) {
    return {
      sheetName,
      matchedTargetCount: 0,
      otherClassMatchCount: 0,
      mappedFieldCount: 0,
      subFieldCount: 0,
      selectionScore: -10000
    };
  }

  // 1. Scan cells across all columns for matches against target class vs other classes
  const matchedTargetIds = new Set<string>();
  const otherClassMatchSets = new Map<string, Set<string>>();

  const otherClasses = allClasses.filter(c => c.id !== currentClassId);
  const studentsByOtherClass = new Map<string, Student[]>();
  for (const cls of otherClasses) {
    studentsByOtherClass.set(
      cls.id,
      allStudents.filter(s => s.classId === cls.id)
    );
    otherClassMatchSets.set(cls.id, new Set<string>());
  }

  const maxRowScan = Math.min(gridData.numRows, 100);
  const maxColScan = Math.min(gridData.numCols, 20);

  for (let r = 0; r < maxRowScan; r++) {
    const row = gridData.formattedGrid[r];
    if (!row) continue;
    for (let c = 0; c < maxColScan; c++) {
      const cellText = String(row[c] || '').trim();
      if (!cellText || cellText.length < 3) continue;
      if (/^(no\.?|id|name|student\s*name|sex|gender|male|female|total|average|conduct|homework|quizzes)$/i.test(cellText)) {
        continue;
      }

      const targetMatch = matchStudent(cellText, undefined, classStudents);
      if (targetMatch.student && (targetMatch.confidence === 'high' || targetMatch.confidence === 'medium')) {
        matchedTargetIds.add(targetMatch.student.id);
      } else {
        for (const cls of otherClasses) {
          const pool = studentsByOtherClass.get(cls.id) || [];
          if (pool.length === 0) continue;
          const m = matchStudent(cellText, undefined, pool);
          if (m.student && m.confidence === 'high') {
            otherClassMatchSets.get(cls.id)?.add(m.student.id);
          }
        }
      }
    }
  }

  const matchedTargetCount = matchedTargetIds.size;
  let bestOtherClassId: string | undefined;
  let bestOtherClassName: string | undefined;
  let bestOtherClassCount = 0;

  for (const cls of otherClasses) {
    const cnt = otherClassMatchSets.get(cls.id)?.size || 0;
    if (cnt > bestOtherClassCount) {
      bestOtherClassCount = cnt;
      bestOtherClassId = cls.id;
      bestOtherClassName = cls.name;
    }
  }

  // 2. Detect columns on this sheet
  const detected = detectColumns(gridData, classStudents);
  const m = detected.mapping;

  const allMappedCols = [
    m.conductCol,
    m.cpCol,
    m.hw1Col,
    m.hw2Col,
    m.hw3Col,
    m.quiz1Col,
    m.quiz2Col,
    m.quiz3Col,
    m.test1Col,
    m.test2Col
  ].filter(c => c !== -1);

  const subMappedCols = [m.hw2Col, m.hw3Col, m.quiz2Col, m.quiz3Col, m.test2Col].filter(c => c !== -1);

  const mappedFieldCount = allMappedCols.length;
  const subFieldCount = subMappedCols.length;

  // 3. Compute overall selection score
  let selectionScore = 0;

  // Strongly prefer the main "Scoring System" sheet (which holds Conduct, CP, Homework, Quizzes, Monthly Test)
  if (/^\s*scoring[\s\-_]*system\s*$/i.test(sheetName)) {
    selectionScore += 3500;
  }

  // Roster match priority (highest weight so a sheet with the right class's students always wins)
  if (matchedTargetCount > 0) {
    selectionScore += 8000 + matchedTargetCount * 200;
  } else if (bestOtherClassCount >= 3) {
    selectionScore -= 1200;
  }

  // Class name affinity (comparing compact alphanumeric strings so "9A (M)" == "9am" matches "Grade9AM")
  const compactSheet = compactAlphaNum(sheetName);
  const compactTarget = compactAlphaNum(currentClassName);
  const compactShortTarget = compactTarget.replace(/^grade/, '');

  if (
    compactShortTarget &&
    (compactSheet.includes(compactTarget) || compactSheet.includes(compactShortTarget))
  ) {
    selectionScore += 800;
  } else {
    for (const cls of otherClasses) {
      const cOther = compactAlphaNum(cls.name).replace(/^grade/, '');
      if (cOther && cOther !== compactShortTarget && compactSheet.includes(cOther)) {
        selectionScore -= 2000;
        break;
      }
    }
  }

  // Quarter affinity
  const qNum = Number(currentQuarter);
  const quarterRegex = new RegExp(`\\b(q\\s*${qNum}|quarter\\s*${qNum}|ត្រីមាសទី\\s*${qNum})\\b`, 'i');
  const otherQuarterRegex = new RegExp(`\\b(q\\s*[1234]|quarter\\s*[1234]|ត្រីមាសទី\\s*[1234])\\b`, 'i');
  const normSheetDigits = replaceKhmerDigits(sheetName);
  if (quarterRegex.test(normSheetDigits)) {
    selectionScore += 400;
  } else if (otherQuarterRegex.test(normSheetDigits)) {
    selectionScore -= 600;
  }

  // Prefer sheets with all 10 individual score columns (especially HW2, HW3, Qz2, Qz3, Test2)
  selectionScore += mappedFieldCount * 60 + subFieldCount * 150;

  // Count actual numeric values in mapped score columns
  let numericScoresFound = 0;
  if (m.nameCol !== -1 && allMappedCols.length > 0) {
    const maxR = Math.min(gridData.numRows, detected.dataStartRowIndex + 60);
    for (let r = detected.dataStartRowIndex; r < maxR; r++) {
      for (const colIdx of allMappedCols) {
        const val = parseScoreCellValue(gridData.rawGrid[r]?.[colIdx], gridData.formattedGrid[r]?.[colIdx]);
        if (val !== undefined) numericScoresFound++;
      }
    }
  }
  if (numericScoresFound > 0) {
    selectionScore += 200 + Math.min(numericScoresFound, 200);
  }

  return {
    sheetName,
    matchedTargetCount,
    otherClassId: bestOtherClassCount >= 3 ? bestOtherClassId : undefined,
    otherClassName: bestOtherClassCount >= 3 ? bestOtherClassName : undefined,
    otherClassMatchCount: bestOtherClassCount,
    mappedFieldCount,
    subFieldCount,
    selectionScore
  };
};

const EXCEL_META_STORAGE_KEY = 'class_tracker_excel_imports_meta';

const loadExcelImportMeta = (classId: string, quarter: Quarter): ExcelImportMeta | undefined => {
  try {
    const raw = localStorage.getItem(EXCEL_META_STORAGE_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, ExcelImportMeta>;
    return map[`${classId}-${Number(quarter)}`];
  } catch {
    return undefined;
  }
};

const saveExcelImportMeta = (meta: ExcelImportMeta) => {
  try {
    const raw = localStorage.getItem(EXCEL_META_STORAGE_KEY);
    const map: Record<string, ExcelImportMeta> = raw ? JSON.parse(raw) : {};
    map[`${meta.classId}-${Number(meta.quarter)}`] = meta;
    localStorage.setItem(EXCEL_META_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
};

export const ExcelScoreImportModal: React.FC<ExcelScoreImportModalProps> = ({
  isOpen,
  onClose,
  currentClassId,
  currentClassName,
  currentQuarter,
  classStudents
}) => {
  const { state, dispatch } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Target class & quarter for this import session
  const [lockedClassId, setLockedClassId] = useState<string>(currentClassId);
  const [lockedClassName, setLockedClassName] = useState<string>(currentClassName);
  const [lockedQuarter, setLockedQuarter] = useState<Quarter>(currentQuarter);

  // Strictly constrain the student roster to students belonging to lockedClassId
  const targetClassStudents = useMemo(() => {
    const fromState = state.students.filter(s => s.classId === lockedClassId);
    if (fromState.length > 0) return fromState;
    return classStudents.filter(s => s.classId === lockedClassId);
  }, [state.students, lockedClassId, classStudents]);

  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [sheetDiagnostics, setSheetDiagnostics] = useState<Record<string, SheetDiagnosticSummary>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [gridData, setGridData] = useState<WorksheetGridData>({
    rawGrid: [],
    formattedGrid: [],
    formulaGrid: [],
    numRows: 0,
    numCols: 0
  });
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [dataStartRowIndex, setDataStartRowIndex] = useState<number>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleValues, setSampleValues] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    nameCol: -1,
    idCol: -1,
    conductCol: -1,
    cpCol: -1,
    hw1Col: -1,
    hw2Col: -1,
    hw3Col: -1,
    quiz1Col: -1,
    quiz2Col: -1,
    quiz3Col: -1,
    test1Col: -1,
    test2Col: -1
  });
  const [manualMatches, setManualMatches] = useState<Record<number, string>>({});
  const [deselectedRows, setDeselectedRows] = useState<Record<number, boolean>>({});
  const [showColumnMapper, setShowColumnMapper] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const existingMeta: ExcelImportMeta | undefined = loadExcelImportMeta(lockedClassId, lockedQuarter);

  const maxScores = state.gradingSettings?.maxScores || {
    conduct: 10,
    cp: 10,
    hw: 100,
    quiz: 100,
    test: 100
  };
  const isGrade12 = lockedClassName.includes('12');

  // Detect if the uploaded filename, worksheet name, or header titles reference another class
  const fileClassMismatch = useMemo(() => {
    if (!workbook || !fileName) return undefined;
    return detectFileOrHeaderClassMismatch(
      fileName,
      selectedSheet,
      gridData,
      lockedClassId,
      lockedClassName,
      state.classes
    );
  }, [workbook, fileName, selectedSheet, gridData, lockedClassId, lockedClassName, state.classes]);

  // Build a cross-tab score lookup map from other worksheets in the same workbook in case scores
  // (e.g. HW1-HW3, Qz1-Qz3, Test1-Test2) are stored on separate tabs from the selected tab.
  const crossTabStudentScores = useMemo(() => {
    const byNormName = new Map<
      string,
      Partial<Pick<ExtractedStudentScore, 'conduct' | 'cpScore' | 'hw1' | 'hw2' | 'hw3' | 'quiz1' | 'quiz2' | 'quiz3' | 'test1' | 'test2'>>
    >();
    if (!workbook || availableSheets.length <= 1) return byNormName;

    const qNum = Number(lockedQuarter);
    const otherQuarterRegex = new RegExp(`\\b(q\\s*[1234]|quarter\\s*[1234]|ត្រីមាសទី\\s*[1234])\\b`, 'i');
    const thisQuarterRegex = new RegExp(`\\b(q\\s*${qNum}|quarter\\s*${qNum}|ត្រីមាសទី\\s*${qNum})\\b`, 'i');

    for (const sName of availableSheets) {
      if (sName === selectedSheet || isExcludedNonTargetSheet(sName)) continue;
      const normDigits = replaceKhmerDigits(sName);
      if (otherQuarterRegex.test(normDigits) && !thisQuarterRegex.test(normDigits)) {
        continue;
      }

      const ws = workbook.Sheets[sName];
      if (!ws) continue;
      const gRaw = extractGridFromWorksheet(ws, sName, workbook);
      const g = syncStudentNamesFromHelperSheets(gRaw, workbook, targetClassStudents);
      if (g.numRows <= 1 || g.numCols <= 1) continue;

      const det = detectColumns(g, targetClassStudents);
      const m = det.mapping;
      if (m.nameCol === -1) continue;

      const startR = Math.max(det.headerRowIndex + 1, det.dataStartRowIndex);
      for (let r = startR; r < g.numRows; r++) {
        const rawRow = g.rawGrid[r];
        const fmtRow = g.formattedGrid[r];
        if (!rawRow || !fmtRow) continue;
        const nameStr = String(fmtRow[m.nameCol] ?? rawRow[m.nameCol] ?? '').trim();
        if (!nameStr || nameStr.length < 2) continue;

        const key = normalizeText(cleanStudentName(nameStr));
        if (!key) continue;

        const existing = byNormName.get(key) || {};
        const readCol = (colIdx: number) =>
          colIdx !== -1 ? parseScoreCellValue(rawRow[colIdx], fmtRow[colIdx]) : undefined;

        const cVal = readCol(m.conductCol);
        const cpVal = readCol(m.cpCol);
        const h1 = readCol(m.hw1Col);
        const h2 = readCol(m.hw2Col);
        const h3 = readCol(m.hw3Col);
        const q1 = readCol(m.quiz1Col);
        const q2 = readCol(m.quiz2Col);
        const q3 = readCol(m.quiz3Col);
        const t1 = readCol(m.test1Col);
        const t2 = readCol(m.test2Col);

        if (existing.conduct === undefined && cVal !== undefined) existing.conduct = cVal;
        if (existing.cpScore === undefined && cpVal !== undefined) existing.cpScore = cpVal;
        if (existing.hw1 === undefined && h1 !== undefined) existing.hw1 = h1;
        if (existing.hw2 === undefined && h2 !== undefined) existing.hw2 = h2;
        if (existing.hw3 === undefined && h3 !== undefined) existing.hw3 = h3;
        if (existing.quiz1 === undefined && q1 !== undefined) existing.quiz1 = q1;
        if (existing.quiz2 === undefined && q2 !== undefined) existing.quiz2 = q2;
        if (existing.quiz3 === undefined && q3 !== undefined) existing.quiz3 = q3;
        if (existing.test1 === undefined && t1 !== undefined) existing.test1 = t1;
        if (existing.test2 === undefined && t2 !== undefined) existing.test2 = t2;

        byNormName.set(key, existing);
      }
    }

    return byNormName;
  }, [workbook, availableSheets, selectedSheet, lockedQuarter, targetClassStudents]);

  // Parse student rows using the current gridData and columnMapping
  const extractedRows: ExtractedStudentScore[] = useMemo(() => {
    const { rawGrid, formattedGrid, numRows } = gridData;
    if (!rawGrid || numRows === 0 || columnMapping.nameCol === -1) return [];

    const results: ExtractedStudentScore[] = [];
    const seenStudentIds = new Map<string, number>();

    const activeFieldChecks: Array<{ key: keyof ExtractedStudentScore; label: string; col: number; max: number }> = [
      { key: 'conduct', label: 'Conduct', col: columnMapping.conductCol, max: maxScores.conduct || 10 },
      { key: 'cpScore', label: 'CP', col: columnMapping.cpCol, max: maxScores.cp || 10 },
      { key: 'hw1', label: 'HW1', col: columnMapping.hw1Col, max: maxScores.hw || 100 },
      { key: 'hw2', label: 'HW2', col: columnMapping.hw2Col, max: maxScores.hw || 100 },
      ...(columnMapping.hw3Col !== -1 || isGrade12
        ? [{ key: 'hw3' as const, label: 'HW3', col: columnMapping.hw3Col, max: maxScores.hw || 100 }]
        : []),
      { key: 'quiz1', label: 'Qz1', col: columnMapping.quiz1Col, max: maxScores.quiz || 100 },
      { key: 'quiz2', label: 'Qz2', col: columnMapping.quiz2Col, max: maxScores.quiz || 100 },
      ...(columnMapping.quiz3Col !== -1 || isGrade12
        ? [{ key: 'quiz3' as const, label: 'Qz3', col: columnMapping.quiz3Col, max: maxScores.quiz || 100 }]
        : []),
      { key: 'test1', label: 'Test1', col: columnMapping.test1Col, max: maxScores.test || 100 },
      ...(columnMapping.test2Col !== -1 || isGrade12
        ? [{ key: 'test2' as const, label: 'Test2', col: columnMapping.test2Col, max: maxScores.test || 100 }]
        : [])
    ];

    const startRow = Math.max(headerRowIndex + 1, dataStartRowIndex);

    for (let r = startRow; r < numRows; r++) {
      const rawRow = rawGrid[r];
      const fmtRow = formattedGrid[r];
      if (!rawRow || !fmtRow) continue;

      const rawName = String(fmtRow[columnMapping.nameCol] ?? rawRow[columnMapping.nameCol] ?? '').trim();
      const rawId =
        columnMapping.idCol !== -1
          ? String(fmtRow[columnMapping.idCol] ?? rawRow[columnMapping.idCol] ?? '').trim()
          : undefined;

      if (!rawName) continue;

      const lowerName = replaceKhmerDigits(rawName).toLowerCase();
      // Skip non-student summary, max-points, footer, Roman numerals, or category/rubric rows
      if (
        /^(total|average|mean|max|max\s*score|full\s*score|points|weight|percentage|min|summary|class\s*average|overall|grand\s*total|student\s*name|name|no\.?|#|\d+(\.\d+)?%?|male|female|signature|teacher|prepared\s*by|approved\s*by|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(
          lowerName
        ) ||
        classifyCategoryText(rawName) !== 'unknown' ||
        lowerName.startsWith('total ') ||
        lowerName.startsWith('average ') ||
        lowerName.includes('student name') ||
        /(សរុប|មធ្យមភាគ|ហត្ថលេខា|ពិន្ទុពេញ|ពិន្ទុអតិបរមា)/i.test(lowerName)
      ) {
        continue;
      }

      const readScore = (colIdx: number): number | undefined => {
        if (colIdx === -1) return undefined;
        return parseScoreCellValue(rawRow[colIdx], fmtRow[colIdx]);
      };

      const normKey = normalizeText(cleanStudentName(rawName));
      const supplement = normKey ? crossTabStudentScores.get(normKey) : undefined;

      const conduct = readScore(columnMapping.conductCol) ?? supplement?.conduct;
      const cpScore = readScore(columnMapping.cpCol) ?? supplement?.cpScore;
      const hw1 = readScore(columnMapping.hw1Col) ?? supplement?.hw1;
      const hw2 = readScore(columnMapping.hw2Col) ?? supplement?.hw2;
      const hw3 = readScore(columnMapping.hw3Col) ?? supplement?.hw3;
      const quiz1 = readScore(columnMapping.quiz1Col) ?? supplement?.quiz1;
      const quiz2 = readScore(columnMapping.quiz2Col) ?? supplement?.quiz2;
      const quiz3 = readScore(columnMapping.quiz3Col) ?? supplement?.quiz3;
      const test1 = readScore(columnMapping.test1Col) ?? supplement?.test1;
      const test2 = readScore(columnMapping.test2Col) ?? supplement?.test2;

      const hasAnyScore = [
        conduct,
        cpScore,
        hw1,
        hw2,
        hw3,
        quiz1,
        quiz2,
        quiz3,
        test1,
        test2
      ].some(v => v !== undefined);

      // Match student against roster (or use manual override if set)
      let matchedStudent: Student | undefined;
      let matchType: ExtractedStudentScore['matchType'] = 'unmatched';
      let matchConfidence: ExtractedStudentScore['matchConfidence'] = 'none';

      const manualStudentId = manualMatches[r];
      if (manualStudentId) {
        if (manualStudentId === '__NONE__') {
          matchedStudent = undefined;
          matchType = 'unmatched';
          matchConfidence = 'none';
        } else {
          matchedStudent =
            targetClassStudents.find(s => s.id === manualStudentId) ||
            state.students.find(s => s.id === manualStudentId);
          if (matchedStudent) {
            matchType = 'manual';
            matchConfidence = 'high';
          }
        }
      } else {
        const autoMatch = matchStudent(rawName, rawId, targetClassStudents);
        matchedStudent = autoMatch.student;
        matchType = autoMatch.matchType;
        matchConfidence = autoMatch.confidence;
      }

      // Skip trailing non-student notes/metadata rows that neither matched a student nor have any scores
      if (!matchedStudent && !hasAnyScore && results.length > 0 && rawName.length < 3) {
        continue;
      }

      const missingFields: string[] = [];
      const warnings: string[] = [];

      // Check for duplicate student assignment in the same sheet
      if (matchedStudent) {
        if (seenStudentIds.has(matchedStudent.id)) {
          matchType = 'duplicate';
          warnings.push(`Duplicate match for "${matchedStudent.name}"`);
        } else {
          seenStudentIds.set(matchedStudent.id, r);
        }
      }

      const itemScores: Record<string, number | undefined> = {
        conduct,
        cpScore,
        hw1,
        hw2,
        hw3,
        quiz1,
        quiz2,
        quiz3,
        test1,
        test2
      };

      for (const check of activeFieldChecks) {
        const val = itemScores[check.key];
        if (val === undefined) {
          if (check.col !== -1) {
            missingFields.push(check.label);
          }
        } else {
          if (val < 0) {
            warnings.push(`${check.label} (${val}) is negative`);
          } else if (val > check.max) {
            warnings.push(`${check.label} (${val}) exceeds max ${check.max}`);
          }
        }
      }

      if (!hasAnyScore) {
        warnings.push('No numeric scores found on this row');
      }

      const defaultSelected = Boolean(matchedStudent && matchType !== 'duplicate' && hasAnyScore);
      const isSelected = deselectedRows[r] !== undefined ? !deselectedRows[r] : defaultSelected;

      results.push({
        rowIndex: r,
        excelId: rawId,
        excelName: rawName,
        matchedStudent,
        matchType,
        matchConfidence,
        conduct,
        cpScore,
        hw1,
        hw2,
        hw3,
        quiz1,
        quiz2,
        quiz3,
        test1,
        test2,
        missingFields,
        warnings,
        hasAnyScore,
        selected: isSelected
      });
    }

    return results;
  }, [
    gridData,
    headerRowIndex,
    dataStartRowIndex,
    columnMapping,
    targetClassStudents,
    state.students,
    manualMatches,
    deselectedRows,
    maxScores,
    isGrade12,
    crossTabStudentScores
  ]);

  // Identify any of the 5 required categories that could not be auto-detected
  const missingCategories = useMemo(() => {
    const missing: string[] = [];
    if (columnMapping.conductCol === -1) missing.push('Conduct');
    if (columnMapping.cpCol === -1) missing.push('Class Participation (C.P)');
    if (columnMapping.hw1Col === -1 && columnMapping.hw2Col === -1 && columnMapping.hw3Col === -1) {
      missing.push('Homework (HW1, HW2, HW3)');
    }
    if (columnMapping.quiz1Col === -1 && columnMapping.quiz2Col === -1 && columnMapping.quiz3Col === -1) {
      missing.push('Quizzes (Qz1, Qz2, Qz3)');
    }
    if (columnMapping.test1Col === -1 && columnMapping.test2Col === -1) {
      missing.push('Monthly Test (Test1, Test2)');
    }
    return missing;
  }, [columnMapping]);

  if (!isOpen) return null;

  const applySheetDetection = (wb: XLSX.WorkBook, sheetName: string, forcedHdrRow?: number) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      setErrorMessage(`Worksheet "${sheetName}" could not be read.`);
      return;
    }

    const rawExtracted = extractGridFromWorksheet(ws, sheetName, wb);
    const extracted = syncStudentNamesFromHelperSheets(rawExtracted, wb, targetClassStudents);
    if (extracted.numRows === 0) {
      setErrorMessage(`The worksheet "${sheetName}" appears to be empty.`);
      return;
    }

    const detected = detectColumns(extracted, targetClassStudents, forcedHdrRow);
    setSelectedSheet(sheetName);
    setGridData(extracted);
    setHeaderRowIndex(detected.headerRowIndex);
    setDataStartRowIndex(detected.dataStartRowIndex);
    setHeaders(detected.headers);
    setSampleValues(detected.sampleValues);
    setColumnMapping(detected.mapping);
    setManualMatches({});
    setDeselectedRows({});

    const m = detected.mapping;
    const anyMainMissing =
      m.nameCol === -1 ||
      m.conductCol === -1 ||
      m.cpCol === -1 ||
      (m.hw1Col === -1 && m.hw2Col === -1) ||
      (m.quiz1Col === -1 && m.quiz2Col === -1) ||
      m.test1Col === -1;

    if (forcedHdrRow === undefined) {
      setShowColumnMapper(anyMainMissing);
    }
    setStep('preview');
  };

  const handleProcessWorkbook = (wb: XLSX.WorkBook, uploadedFileName: string) => {
    setErrorMessage('');
    setImportSuccess(false);
    const allSheets = wb.SheetNames || [];
    if (allSheets.length === 0) {
      setErrorMessage('The uploaded Excel file contains no worksheets.');
      return;
    }

    // Filter out non-target tabs (SETTINGS, COMMENTS, GRADING-SYSTEM, SPORT, Khmer Essays, Khmer Dictations, Reading, Callingraphy, Public Speaking, EVALUATION)
    const targetSheets = allSheets.filter(s => !isExcludedNonTargetSheet(s));
    const sheets = targetSheets.length > 0 ? targetSheets : allSheets;

    setWorkbook(wb);
    setFileName(uploadedFileName);
    setAvailableSheets(sheets);

    const diagnosticsMap: Record<string, SheetDiagnosticSummary> = {};
    let bestSheet = sheets[0];
    let bestScore = -Infinity;

    for (const sName of sheets) {
      const ws = wb.Sheets[sName];
      const diag = analyzeWorksheet(
        sName,
        ws,
        wb,
        lockedClassId,
        lockedClassName,
        lockedQuarter,
        targetClassStudents,
        state.classes,
        state.students
      );
      diagnosticsMap[sName] = diag;
      if (diag.selectionScore > bestScore) {
        bestScore = diag.selectionScore;
        bestSheet = sName;
      }
    }

    setSheetDiagnostics(diagnosticsMap);
    applySheetDetection(wb, bestSheet);
  };

  const handleSwitchTargetClass = (newClassId: string, newClassName: string) => {
    setLockedClassId(newClassId);
    setLockedClassName(newClassName);
    setManualMatches({});
    setDeselectedRows({});
    setErrorMessage('');
    if (workbook && selectedSheet) {
      const newClassStudents = state.students.filter(s => s.classId === newClassId);
      const ws = workbook.Sheets[selectedSheet];
      if (ws) {
        const rawExtracted = extractGridFromWorksheet(ws, selectedSheet, workbook);
        const extracted = syncStudentNamesFromHelperSheets(rawExtracted, workbook, newClassStudents);
        const detected = detectColumns(extracted, newClassStudents);
        setGridData(extracted);
        setHeaderRowIndex(detected.headerRowIndex);
        setDataStartRowIndex(detected.dataStartRowIndex);
        setHeaders(detected.headers);
        setSampleValues(detected.sampleValues);
        setColumnMapping(detected.mapping);
      }
    }
  };

  const handleEnrollAllUnmatched = () => {
    const unmatched = extractedRows.filter(r => !r.matchedStudent && r.excelName.trim().length >= 2);
    if (unmatched.length === 0) return;

    const currentRoster = state.students.filter(s => s.classId === lockedClassId);
    const newStudents: Student[] = [];
    const nextManual: Record<number, string> = { ...manualMatches };

    unmatched.forEach((row, i) => {
      const cleanName = cleanStudentName(row.excelName);
      const newId = uuidv4();
      const newStudent: Student = {
        id: newId,
        classId: lockedClassId,
        name: cleanName,
        studentId: row.excelId || '',
        rosterNumber: currentRoster.length + i + 1
      };
      newStudents.push(newStudent);
      nextManual[row.rowIndex] = newId;
    });

    newStudents.forEach(st => {
      dispatch({ type: 'ADD_STUDENT', payload: st });
    });

    setManualMatches(nextManual);
    setDeselectedRows({});
  };

  const handleEnrollSingleStudent = (rowIndex: number, excelName: string, excelId?: string) => {
    const currentRoster = state.students.filter(s => s.classId === lockedClassId);
    const cleanName = cleanStudentName(excelName);
    const newId = uuidv4();
    const newStudent: Student = {
      id: newId,
      classId: lockedClassId,
      name: cleanName,
      studentId: excelId || '',
      rosterNumber: currentRoster.length + 1
    };

    dispatch({ type: 'ADD_STUDENT', payload: newStudent });
    setManualMatches(prev => ({
      ...prev,
      [rowIndex]: newId
    }));
  };

  const handleSheetChange = (newSheetName: string) => {
    if (!workbook) return;
    setErrorMessage('');
    applySheetDetection(workbook, newSheetName);
  };

  const handleHeaderRowChange = (newHdrRow: number) => {
    if (!workbook || !selectedSheet) return;
    applySheetDetection(workbook, selectedSheet, newHdrRow);
  };

  const processSelectedFile = (file: File) => {
    setErrorMessage('');
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer || buffer.byteLength === 0) {
          setErrorMessage(`The file "${file.name}" is empty.`);
          return;
        }
        const data = new Uint8Array(buffer);
        const wb = XLSX.read(data, {
          type: 'array',
          cellFormula: true,
          cellNF: true,
          cellText: true
        });
        handleProcessWorkbook(wb, file.name);
      } catch (err: any) {
        console.error('Excel parse error:', err);
        setErrorMessage(
          `Could not parse "${file.name}". Please ensure it is a valid Excel or spreadsheet file (.xlsx, .xlsm, .xlsb, .xls, or .csv).`
        );
      }
    };
    reader.onerror = () => {
      setErrorMessage(`Failed to read "${file.name}" from disk.`);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleConfirmImport = () => {
    const rowsToImport = extractedRows.filter(
      r => r.selected && r.matchedStudent && r.matchType !== 'duplicate' && r.hasAnyScore
    );

    if (rowsToImport.length === 0) {
      setErrorMessage('No matched students with valid scores are selected for import.');
      return;
    }

    // Safety Verification: Ensure no student belongs to another class
    const wrongClassStudent = rowsToImport.find(
      r => r.matchedStudent && r.matchedStudent.classId !== lockedClassId
    );
    if (wrongClassStudent) {
      setErrorMessage(
        `Cannot import: Student "${wrongClassStudent.matchedStudent?.name}" does not belong to ${lockedClassName}.`
      );
      return;
    }

    // If there is an Excel file/header or roster class mismatch warning, require explicit confirmation
    const mismatchWarning = fileClassMismatch || currentSheetDiag?.otherClassName;
    if (mismatchWarning) {
      const confirmed = window.confirm(
        `Warning: The uploaded Excel file appears to belong to "${mismatchWarning}", but you are importing into "${lockedClassName}".\n\nDo you want to proceed and import these scores into "${lockedClassName}"?`
      );
      if (!confirmed) {
        return;
      }
    }

    const updatedScoreRecords: ScoreRecord[] = [];
    const normalizedQuarter = Number(lockedQuarter) as Quarter;

    rowsToImport.forEach(item => {
      const student = item.matchedStudent!;
      const existing = state.scores.find(
        s => s.studentId === student.id && Number(s.quarter) === normalizedQuarter
      );

      const record: ScoreRecord = existing
        ? {
            ...existing,
            id: `${student.id}-${normalizedQuarter}`,
            classId: lockedClassId,
            quarter: normalizedQuarter
          }
        : {
            id: `${student.id}-${normalizedQuarter}`,
            studentId: student.id,
            classId: lockedClassId,
            quarter: normalizedQuarter
          };

      // Map extracted scores strictly into their individual fields without inventing 0 for blank scores
      if (item.conduct !== undefined) record.conduct = item.conduct;
      if (item.cpScore !== undefined) record.cpScore = item.cpScore;
      if (item.hw1 !== undefined) record.hw1 = item.hw1;
      if (item.hw2 !== undefined) record.hw2 = item.hw2;
      if (item.hw3 !== undefined) record.hw3 = item.hw3;
      if (item.quiz1 !== undefined) record.quiz1 = item.quiz1;
      if (item.quiz2 !== undefined) record.quiz2 = item.quiz2;
      if (item.quiz3 !== undefined) record.quiz3 = item.quiz3;
      if (item.test1 !== undefined) record.test1 = item.test1;
      if (item.test2 !== undefined) record.test2 = item.test2;

      updatedScoreRecords.push(record);
    });

    const meta: ExcelImportMeta = {
      classId: lockedClassId,
      quarter: normalizedQuarter,
      fileName: fileName || 'E-GradeBook.xlsx',
      sheetName: selectedSheet,
      uploadedAt: new Date().toISOString(),
      matchedCount: rowsToImport.length,
      totalRows: extractedRows.length
    };

    saveExcelImportMeta(meta);

    dispatch({
      type: 'BULK_UPDATE_SCORES',
      payload: updatedScoreRecords
    });

    setImportSuccess(true);
    if (state.currentClassId !== lockedClassId) {
      dispatch({ type: 'SET_CURRENT_CLASS', payload: lockedClassId });
    }
    setTimeout(() => {
      onClose();
      setStep('upload');
      setImportSuccess(false);
    }, 900);
  };

  const matchedCount = extractedRows.filter(r => r.matchedStudent && r.matchType !== 'duplicate').length;
  const unmatchedCount = extractedRows.filter(r => !r.matchedStudent).length;
  const duplicateCount = extractedRows.filter(r => r.matchType === 'duplicate').length;
  const missingScoreRowCount = extractedRows.filter(
    r => r.matchedStudent && r.missingFields.length > 0
  ).length;
  const selectedImportCount = extractedRows.filter(
    r => r.selected && r.matchedStudent && r.matchType !== 'duplicate' && r.hasAnyScore
  ).length;

  const rosterStudentsNotInExcel = targetClassStudents.filter(
    s => !extractedRows.some(r => r.matchedStudent?.id === s.id)
  );

  const currentSheetDiag = sheetDiagnostics[selectedSheet];
  const bestMatchingSheetForTarget = availableSheets
    .map(s => sheetDiagnostics[s])
    .filter((d): d is SheetDiagnosticSummary => Boolean(d && d.matchedTargetCount > 0))
    .sort((a, b) => b.selectionScore - a.selectionScore)[0];

  const renderColumnSelect = (label: string, field: keyof ColumnMapping, badgeColor: string) => {
    const currentVal = columnMapping[field];
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
          <span>{label}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              currentVal !== -1 ? badgeColor : 'bg-amber-100 text-amber-800'
            }`}
          >
            {currentVal !== -1 ? `Col ${XLSX.utils.encode_col(currentVal)}` : 'Not Mapped'}
          </span>
        </label>
        <select
          value={currentVal}
          onChange={e =>
            setColumnMapping(prev => ({
              ...prev,
              [field]: Number(e.target.value)
            }))
          }
          className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none ${
            currentVal === -1 ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
          }`}
        >
          <option value={-1}>-- Not Mapped / Blank --</option>
          {headers.map((h, idx) => {
            const colLetter = XLSX.utils.encode_col(idx);
            const sample = sampleValues[idx] ? ` [Sample: ${sampleValues[idx]}]` : '';
            const labelText = h || `(Unnamed Column ${colLetter})`;
            return (
              <option key={idx} value={idx}>
                Col {colLetter}: {labelText}
                {sample}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  const renderScoreCell = (val: number | undefined, max: number, bgClass: string) => {
    if (val === undefined) {
      return (
        <td
          className={`px-2 py-2 text-center border-r border-gray-100 text-gray-300 font-normal ${bgClass}`}
          title="Blank / Missing in Excel (will not insert 0)"
        >
          —
        </td>
      );
    }
    const isOverMax = val > max || val < 0;
    return (
      <td
        className={`px-2 py-2 text-center border-r border-gray-100 font-semibold ${
          isOverMax ? 'bg-red-100 text-red-700' : `text-gray-800 ${bgClass}`
        }`}
      >
        {val}
      </td>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] xl:max-w-7xl max-h-[94vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 to-purple-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 flex-wrap">
                <span>Excel E-GradeBook Score Import</span>
                <span className="text-xs bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                  {lockedClassName} • Quarter {lockedQuarter}
                </span>
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                Automatically extracts Conduct, CP, HW1–HW3, Qz1–Qz3, and Test1–Test2 for {lockedClassName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
              <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {importSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 font-medium">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <span>
                Successfully imported scores for <strong>{selectedImportCount}</strong> students into{' '}
                <strong>{lockedClassName}</strong> (Quarter {lockedQuarter})!
              </span>
            </div>
          )}

          {step === 'upload' ? (
            <div className="space-y-5">
              {existingMeta && (
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Last imported file for <strong>{lockedClassName} (Q{lockedQuarter})</strong>:{' '}
                      <span className="font-semibold underline">{existingMeta.fileName}</span> (Sheet:{' '}
                      <em>{existingMeta.sheetName}</em> • {existingMeta.matchedCount} students matched on{' '}
                      {new Date(existingMeta.uploadedAt).toLocaleDateString()})
                    </span>
                  </div>
                  <span className="text-indigo-600 font-medium">
                    Upload a revised Excel file below to update scores
                  </span>
                </div>
              )}

              {/* Drag and Drop Upload Box */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/70'
                    : 'border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 hover:bg-indigo-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xlsb,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {existingMeta
                      ? `Upload Updated Excel File for ${lockedClassName}`
                      : `Select Excel E-GradeBook File for ${lockedClassName}`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Supports <strong>.xlsx</strong>, <strong>.xlsm</strong>, <strong>.xlsb</strong>,{' '}
                    <strong>.xls</strong>, and <strong>.csv</strong> files • Dedicated to{' '}
                    <strong className="text-indigo-700">{lockedClassName}</strong> (Quarter {lockedQuarter})
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow transition"
                >
                  Choose Excel File
                </button>
              </div>

              {/* Field Mapping Overview Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Automatic Excel-to-App Field Mapping
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <div className="font-bold text-indigo-900">1. Conduct</div>
                    <div className="text-gray-500 mt-0.5">
                      Maps to: <strong className="text-gray-800">Conduct</strong>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <div className="font-bold text-indigo-900">2. Class Participation</div>
                    <div className="text-gray-500 mt-0.5">
                      Maps to: <strong className="text-gray-800">CP</strong>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <div className="font-bold text-indigo-900">3. Homework</div>
                    <div className="text-gray-500 mt-0.5">
                      Maps to: <strong className="text-gray-800">HW1, HW2, HW3</strong>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <div className="font-bold text-indigo-900">4. Quizzes</div>
                    <div className="text-gray-500 mt-0.5">
                      Maps to: <strong className="text-gray-800">Qz1, Qz2, Qz3</strong>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100 col-span-2 sm:col-span-1">
                    <div className="font-bold text-indigo-900">5. Monthly Test</div>
                    <div className="text-gray-500 mt-0.5">
                      Maps to: <strong className="text-gray-800">Test1, Test2</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Prominent Class Target Confirmation Banner */}
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-indigo-950">
                      Importing scores into: <span className="underline">{lockedClassName}</span> (Quarter {lockedQuarter})
                    </div>
                    <div className="text-[11px] text-indigo-700">
                      Target Roster: {targetClassStudents.length} students enrolled in {lockedClassName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-indigo-800 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-xs">
                    Target Class ID: {lockedClassId}
                  </span>
                </div>
              </div>

              {/* Class Mismatch Warning if filename / title references another class */}
              {fileClassMismatch && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-amber-900 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-bold text-sm text-amber-900">
                      Class Mismatch Warning: Excel file references "{fileClassMismatch}"
                    </div>
                    <p className="text-amber-800">
                      The file or title in <strong>"{fileName}"</strong> appears to belong to <strong>{fileClassMismatch}</strong>,
                      but you are currently importing into <strong>{lockedClassName}</strong>.
                      Please double-check before confirming import to avoid importing scores into the wrong class.
                    </p>
                  </div>
                </div>
              )}

              {/* Top Controls Bar: File Info, Sheet Selector, Column Mapping Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span className="truncate max-w-[240px]" title={fileName}>
                      {fileName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-gray-600">Worksheet:</span>
                    <select
                      value={selectedSheet}
                      onChange={e => handleSheetChange(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white font-semibold text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {availableSheets.map(s => {
                        const diag = sheetDiagnostics[s];
                        const badge = diag
                          ? diag.matchedTargetCount > 0
                            ? ` (${diag.matchedTargetCount}/${targetClassStudents.length} ${lockedClassName})`
                            : diag.otherClassName
                            ? ` (${diag.otherClassMatchCount} from ${diag.otherClassName})`
                            : ''
                          : '';
                        return (
                          <option key={s} value={s}>
                            {s}
                            {badge}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowColumnMapper(!showColumnMapper)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                      showColumnMapper || missingCategories.length > 0
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Verify / Adjust Column Mapping</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showColumnMapper ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep('upload');
                      setErrorMessage('');
                    }}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Change File</span>
                  </button>
                </div>
              </div>

              {/* Clickable Worksheet Tab Pills when workbook has multiple sheets */}
              {availableSheets.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-gray-500 font-medium mr-1">Workbook Tabs:</span>
                  {availableSheets.map(s => {
                    const diag = sheetDiagnostics[s];
                    const isSelected = s === selectedSheet;
                    const hasTargetMatches = (diag?.matchedTargetCount || 0) > 0;
                    const hasOtherClass = Boolean(diag?.otherClassName);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSheetChange(s)}
                        className={`px-2.5 py-1 rounded-lg font-medium border transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : hasTargetMatches
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : hasOtherClass
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <span>{s}</span>
                        {diag && diag.matchedTargetCount > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-emerald-200/70 text-emerald-900'
                            }`}
                          >
                            {diag.matchedTargetCount}/{targetClassStudents.length} matched
                          </span>
                        )}
                        {diag && diag.matchedTargetCount === 0 && diag.otherClassName && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-amber-200/70 text-amber-900'
                            }`}
                          >
                            {diag.otherClassName} roster
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Cross-Class Roster Mismatch Warning Banner if the sheet contains another class's students (e.g. Grade9B instead of Grade9AM) */}
              {currentSheetDiag?.otherClassName && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-900 text-xs">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="font-bold text-sm text-red-800">
                      Class Roster Mismatch: Worksheet "{selectedSheet}" contains student names from{' '}
                      {currentSheetDiag.otherClassName} ({currentSheetDiag.otherClassMatchCount} students)
                    </div>
                    <p className="text-red-700">
                      You are currently importing into <strong>{lockedClassName}</strong>, but the student names on
                      worksheet <strong>"{selectedSheet}"</strong> (e.g.{' '}
                      <em>
                        {extractedRows
                          .slice(0, 3)
                          .map(r => r.excelName)
                          .join(', ')}
                      </em>
                      ) match <strong>{currentSheetDiag.otherClassName}</strong> instead of{' '}
                      <strong>{lockedClassName}</strong>.
                    </p>
                    {bestMatchingSheetForTarget ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleSheetChange(bestMatchingSheetForTarget.sheetName)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition"
                        >
                          Switch to Worksheet "{bestMatchingSheetForTarget.sheetName}" (
                          {bestMatchingSheetForTarget.matchedTargetCount}/{targetClassStudents.length}{' '}
                          {lockedClassName} students)
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-red-800 font-medium">
                          The student list inside <strong>"{fileName}"</strong> matches{' '}
                          <strong>{currentSheetDiag.otherClassName}</strong> ({currentSheetDiag.otherClassMatchCount} students) instead of{' '}
                          <strong>{lockedClassName}</strong>. Choose how you would like to proceed:
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {(() => {
                            const otherClassObj = state.classes.find(
                              c =>
                                c.id === currentSheetDiag.otherClassId ||
                                c.name.toLowerCase() === currentSheetDiag.otherClassName?.toLowerCase()
                            );
                            if (!otherClassObj) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => handleSwitchTargetClass(otherClassObj.id, otherClassObj.name)}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Switch Target Class to {otherClassObj.name} & Match Scores</span>
                              </button>
                            );
                          })()}

                          {unmatchedCount > 0 && (
                            <button
                              type="button"
                              onClick={handleEnrollAllUnmatched}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Enroll All {unmatchedCount} Students into {lockedClassName} & Import Scores</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const sortedRoster = [...targetClassStudents].sort((a, b) =>
                                a.name.localeCompare(b.name)
                              );
                              const nextManual: Record<number, string> = {};
                              extractedRows.forEach((row, idx) => {
                                if (idx < sortedRoster.length) {
                                  nextManual[row.rowIndex] = sortedRoster[idx].id;
                                } else {
                                  nextManual[row.rowIndex] = '__NONE__';
                                }
                              });
                              setManualMatches(nextManual);
                              setDeselectedRows({});
                            }}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white font-medium rounded-lg shadow-sm transition"
                          >
                            Map Rows to Current {lockedClassName} Students in Order
                          </button>

                          {Object.keys(manualMatches).length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualMatches({});
                                setDeselectedRows({});
                              }}
                              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-semibold rounded-lg transition"
                            >
                              Reset Mapping
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Warning Banner if any score category was not automatically found */}
              {missingCategories.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
                  <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold">
                      Please confirm column mapping for: {missingCategories.join(', ')}
                    </div>
                    <div className="text-amber-800 mt-0.5">
                      Some category headings in worksheet <strong>"{selectedSheet}"</strong> could not be
                      automatically identified, or this worksheet uses custom column titles. Select the
                      corresponding columns below or switch to a different worksheet tab if needed. Unmapped
                      fields will be left blank (never filled with 0).
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Column Mapper Panel */}
              {showColumnMapper && (
                <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                        Excel Column Mapping Confirmation
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Each dropdown shows the detected Excel column header and a sample value from the sheet.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-gray-700">Header Row:</span>
                        <select
                          value={headerRowIndex}
                          onChange={e => handleHeaderRowChange(Number(e.target.value))}
                          className="border border-gray-300 rounded-lg px-2 py-1 bg-white font-medium text-gray-800"
                        >
                          {gridData.formattedGrid.slice(0, 30).map((row, rIdx) => {
                            const preview = row
                              .filter(Boolean)
                              .slice(0, 5)
                              .join(' | ')
                              .slice(0, 55);
                            return (
                              <option key={rIdx} value={rIdx}>
                                Row {rIdx + 1}: {preview || '(Empty Row)'}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowColumnMapper(false)}
                        className="text-xs font-semibold text-indigo-700 hover:underline"
                      >
                        Hide Mapping
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {renderColumnSelect('Student Name Column *', 'nameCol', 'bg-indigo-100 text-indigo-800')}
                    {renderColumnSelect('Student ID (Optional)', 'idCol', 'bg-gray-200 text-gray-700')}
                    {renderColumnSelect('1. Conduct → Conduct', 'conductCol', 'bg-emerald-100 text-emerald-800')}
                    {renderColumnSelect('2. Class Participation → CP', 'cpCol', 'bg-emerald-100 text-emerald-800')}
                    {renderColumnSelect('3. Homework 1 → HW1', 'hw1Col', 'bg-blue-100 text-blue-800')}
                    {renderColumnSelect('3. Homework 2 → HW2', 'hw2Col', 'bg-blue-100 text-blue-800')}
                    {renderColumnSelect('3. Homework 3 → HW3', 'hw3Col', 'bg-blue-100 text-blue-800')}
                    {renderColumnSelect('4. Quiz 1 → Qz1', 'quiz1Col', 'bg-purple-100 text-purple-800')}
                    {renderColumnSelect('4. Quiz 2 → Qz2', 'quiz2Col', 'bg-purple-100 text-purple-800')}
                    {renderColumnSelect('4. Quiz 3 → Qz3', 'quiz3Col', 'bg-purple-100 text-purple-800')}
                    {renderColumnSelect('5. Monthly Test 1 → Test1', 'test1Col', 'bg-rose-100 text-rose-800')}
                    {renderColumnSelect('5. Monthly Test 2 → Test2', 'test2Col', 'bg-rose-100 text-rose-800')}
                  </div>
                </div>
              )}

              {/* Summary Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-xs text-emerald-700 font-medium">Matched Students</div>
                  <div className="text-xl font-bold text-emerald-900 mt-0.5">
                    {matchedCount}{' '}
                    <span className="text-xs font-normal text-emerald-700">/ {targetClassStudents.length}</span>
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 border flex flex-col justify-between ${
                    unmatchedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className={`text-xs font-medium ${unmatchedCount > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                      Unmatched Rows
                    </div>
                    {unmatchedCount > 0 && (
                      <button
                        type="button"
                        onClick={handleEnrollAllUnmatched}
                        className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition shadow-xs"
                        title={`Enroll all ${unmatchedCount} unmatched students into ${lockedClassName}`}
                      >
                        + Enroll All
                      </button>
                    )}
                  </div>
                  <div
                    className={`text-xl font-bold mt-0.5 ${
                      unmatchedCount > 0 ? 'text-amber-900' : 'text-gray-700'
                    }`}
                  >
                    {unmatchedCount}
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 border ${
                    missingScoreRowCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${
                      missingScoreRowCount > 0 ? 'text-blue-700' : 'text-gray-500'
                    }`}
                  >
                    Partial / Blank Scores
                  </div>
                  <div
                    className={`text-xl font-bold mt-0.5 ${
                      missingScoreRowCount > 0 ? 'text-blue-900' : 'text-gray-700'
                    }`}
                  >
                    {missingScoreRowCount}
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 border ${
                    duplicateCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className={`text-xs font-medium ${duplicateCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                    Duplicates
                  </div>
                  <div
                    className={`text-xl font-bold mt-0.5 ${
                      duplicateCount > 0 ? 'text-red-900' : 'text-gray-700'
                    }`}
                  >
                    {duplicateCount}
                  </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 col-span-2 sm:col-span-1">
                  <div className="text-xs text-indigo-700 font-medium">Ready to Import</div>
                  <div className="text-xl font-bold text-indigo-900 mt-0.5">{selectedImportCount}</div>
                </div>
              </div>

              {/* Missing Score Notification Banner */}
              {missingScoreRowCount > 0 && (
                <div className="px-3.5 py-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Note:</strong> {missingScoreRowCount} matched student(s) have one or more blank score
                    cells in Excel (shown as <strong>—</strong>). Blank fields will remain blank in your
                    E-GradeBook and will <strong>not</strong> be filled with zero.
                  </span>
                </div>
              )}

              {/* Preview Table with Explicit Individual Columns: Conduct, CP, HW1, HW2, HW3, Qz1, Qz2, Qz3, Test1, Test2 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[44vh]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-800 text-white sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 text-center w-9 border-r border-slate-700">
                          <input
                            type="checkbox"
                            checked={
                              extractedRows.length > 0 &&
                              extractedRows
                                .filter(r => r.matchedStudent && r.matchType !== 'duplicate' && r.hasAnyScore)
                                .every(r => r.selected)
                            }
                            onChange={e => {
                              const checked = e.target.checked;
                              const nextDeselected: Record<number, boolean> = {};
                              extractedRows.forEach(r => {
                                nextDeselected[r.rowIndex] = !checked;
                              });
                              setDeselectedRows(nextDeselected);
                            }}
                            className="rounded border-gray-300"
                            title="Select / Deselect All"
                          />
                        </th>
                        <th className="p-2.5 border-r border-slate-700 min-w-[150px]">Student Name (Excel)</th>
                        <th className="p-2.5 border-r border-slate-700 min-w-[185px]">Matched App Student</th>
                        <th className="p-2 text-center border-r border-slate-700 bg-emerald-900/60 min-w-[58px]">
                          Conduct
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-emerald-900/60 min-w-[52px]">
                          CP
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-blue-900/60 min-w-[52px]">
                          HW1
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-blue-900/60 min-w-[52px]">
                          HW2
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-blue-900/60 min-w-[52px]">
                          HW3
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-purple-900/60 min-w-[52px]">
                          Qz1
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-purple-900/60 min-w-[52px]">
                          Qz2
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-purple-900/60 min-w-[52px]">
                          Qz3
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-rose-900/60 min-w-[54px]">
                          Test1
                        </th>
                        <th className="p-2 text-center border-r border-slate-700 bg-rose-900/60 min-w-[54px]">
                          Test2
                        </th>
                        <th className="p-2.5 min-w-[160px]">Status / Missing Fields</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {extractedRows.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="p-8 text-center text-gray-500">
                            No student rows could be extracted from this worksheet. Click{' '}
                            <strong>"Verify / Adjust Column Mapping"</strong> above to select the Student Name
                            column, or choose another Worksheet tab.
                          </td>
                        </tr>
                      ) : (
                        extractedRows.map(item => {
                          const isUnmatched = !item.matchedStudent;
                          const isDuplicate = item.matchType === 'duplicate';

                          return (
                            <tr
                              key={item.rowIndex}
                              className={`transition ${
                                isUnmatched
                                  ? 'bg-amber-50/70 hover:bg-amber-100/60'
                                  : isDuplicate
                                  ? 'bg-red-50/70 hover:bg-red-100/60'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="p-2 text-center border-r border-gray-100">
                                <input
                                  type="checkbox"
                                  disabled={!item.matchedStudent || isDuplicate || !item.hasAnyScore}
                                  checked={item.selected}
                                  onChange={e =>
                                    setDeselectedRows(prev => ({
                                      ...prev,
                                      [item.rowIndex]: !e.target.checked
                                    }))
                                  }
                                  className="rounded border-gray-300 disabled:opacity-40"
                                />
                              </td>

                              {/* Excel Student Name */}
                              <td className="p-2 font-medium text-gray-900 border-r border-gray-100">
                                <div>{item.excelName}</div>
                                {item.excelId && (
                                  <div className="text-[10px] text-gray-400">ID: {item.excelId}</div>
                                )}
                              </td>

                              {/* App Student Match + Manual Override Select */}
                              <td className="p-2 border-r border-gray-100">
                                <div className="flex flex-col gap-1">
                                  <select
                                    value={item.matchedStudent?.id || '__NONE__'}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === '__ENROLL__') {
                                        handleEnrollSingleStudent(item.rowIndex, item.excelName, item.excelId);
                                      } else {
                                        setManualMatches(prev => ({
                                          ...prev,
                                          [item.rowIndex]: val
                                        }));
                                      }
                                    }}
                                    className={`w-full text-xs rounded-lg px-2 py-1 border outline-none ${
                                      item.matchedStudent && !isDuplicate
                                        ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 font-semibold'
                                        : isDuplicate
                                        ? 'border-red-300 bg-red-50 text-red-800 font-semibold'
                                        : 'border-amber-400 bg-white text-amber-900 font-medium'
                                    }`}
                                  >
                                    <option value="__NONE__">-- Unmatched (Select Student) --</option>
                                    {!item.matchedStudent && (
                                      <option value="__ENROLL__">
                                        + Enroll "{item.excelName}" into {lockedClassName}
                                      </option>
                                    )}
                                    {targetClassStudents.map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.name} ({s.sex})
                                      </option>
                                    ))}
                                  </select>
                                  {item.matchType === 'fuzzy-name' && (
                                    <span className="text-[10px] text-indigo-600 font-medium">
                                      Auto-matched (fuzzy name)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 10 Explicit Individual Score Fields */}
                              {renderScoreCell(item.conduct, maxScores.conduct || 10, 'bg-emerald-50/20')}
                              {renderScoreCell(item.cpScore, maxScores.cp || 10, 'bg-emerald-50/20')}
                              {renderScoreCell(item.hw1, maxScores.hw || 100, 'bg-blue-50/20')}
                              {renderScoreCell(item.hw2, maxScores.hw || 100, 'bg-blue-50/20')}
                              {renderScoreCell(item.hw3, maxScores.hw || 100, 'bg-blue-50/20')}
                              {renderScoreCell(item.quiz1, maxScores.quiz || 100, 'bg-purple-50/20')}
                              {renderScoreCell(item.quiz2, maxScores.quiz || 100, 'bg-purple-50/20')}
                              {renderScoreCell(item.quiz3, maxScores.quiz || 100, 'bg-purple-50/20')}
                              {renderScoreCell(item.test1, maxScores.test || 100, 'bg-rose-50/20')}
                              {renderScoreCell(item.test2, maxScores.test || 100, 'bg-rose-50/20')}

                              {/* Status & Missing Score Notifications */}
                              <td className="p-2 text-[11px]">
                                {isUnmatched ? (
                                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Unmatched student
                                  </span>
                                ) : isDuplicate ? (
                                  <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                                    Duplicate student match
                                  </span>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      Matched
                                    </span>
                                    {item.missingFields.length > 0 && (
                                      <div className="text-amber-700">
                                        Blank: {item.missingFields.join(', ')}
                                      </div>
                                    )}
                                    {item.warnings.map((w, idx) => (
                                      <div key={idx} className="text-red-600 font-medium">
                                        {w}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Roster Students Missing from Excel Notification */}
              {rosterStudentsNotInExcel.length > 0 && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">
                    Students in {lockedClassName} not found in this Excel sheet ({rosterStudentsNotInExcel.length}
                    ):
                  </span>{' '}
                  {rosterStudentsNotInExcel.map(s => s.name).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-gray-500">
            Target: <strong className="text-gray-800">{lockedClassName}</strong> •{' '}
            <strong className="text-gray-800">Quarter {lockedQuarter}</strong> (Other classes will not be modified)
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold transition"
            >
              Cancel
            </button>

            {step === 'preview' && (
              <button
                type="button"
                disabled={selectedImportCount === 0 || importSuccess}
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                <span>
                  Confirm & Import Scores ({selectedImportCount} Student
                  {selectedImportCount === 1 ? '' : 's'})
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
