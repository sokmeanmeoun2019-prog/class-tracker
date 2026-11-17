import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  X,
  ChevronDown,
  Check,
  UserPlus,
  SlidersHorizontal,
  Search,
  UserCheck,
  FileCheck,
  ShieldCheck
} from 'lucide-react';
import { Student } from '../types';
import { useData } from '../store/DataContext';

interface ExcelStudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClassId: string;
  currentClassName: string;
  classStudents: Student[];
  initialFile?: File | null;
}

export interface ExtractedStudentRow {
  rowIndex: number;
  rawId: string;
  rawName: string;
  rawNameKhmer: string;
  rawGender: string;
  normalizedGender: 'Male' | 'Female' | '';
  isGenderValid: boolean;
  matchedStudent?: Student;
  matchType: 'id' | 'name' | 'new';
  matchReason?: string;
  warnings: string[];
  selected: boolean;
  isValid: boolean;
}

interface ColumnMapping {
  idCol: number;
  nameCol: number;
  nameKhmerCol: number;
  genderCol: number;
  headerRowIndex: number;
}

interface GridExtract {
  grid: string[][];
  numRows: number;
  numCols: number;
}

type ImportMode = 'update-only' | 'add-and-update';

// Convert Khmer numerals (០-៩) to ASCII digits (0-9)
const replaceKhmerDigits = (input: string): string => {
  const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.replace(new RegExp(khmerDigits[i], 'g'), String(i));
  }
  return out;
};

// Normalize text for comparison
const normalizeText = (str: any): string => {
  if (str === null || str === undefined) return '';
  return replaceKhmerDigits(String(str))
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^a-z0-9\u1780-\u17ff]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Strip numbering prefixes / gender tags from a student name for fuzzy roster matching
const cleanStudentNameForMatch = (raw: string): string => {
  if (!raw) return '';
  return replaceKhmerDigits(String(raw))
    .replace(/^\s*\d+[\.\)\-\s]+/, '')
    .replace(/\((?:m|f|male|female|ប្រុស|ស្រី|ប|ស)\)/gi, ' ')
    .replace(/\b(?:mr|ms|miss|mrs)\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractLatinName = (raw: string): string => {
  const cleaned = cleanStudentNameForMatch(raw);
  const words = cleaned.match(/[a-zA-Z]+/g);
  return words ? words.join(' ').toLowerCase() : '';
};

const compactAlphaNum = (str: string): string => {
  return normalizeText(str).replace(/\s+/g, '');
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
};

const isNoHeader = (h: string): boolean => {
  return /^(no|num|number|#|index|order|item|s\s*n|seq|ល\.?\s*រ|លរ)$/i.test(h);
};

const isScoreOrOtherHeader = (h: string): boolean => {
  return /\b(conduct|c\.?\s*p\.?|participation|hw|homework|quiz|qz|test|exam|total|average|overall|grade|rank|remark|comment|achievement|attitude|improve|score|points|weight)\b/i.test(h);
};

// Detect school/settings metadata labels so they are NEVER mistaken for Student Name column or Student rows
const isMetadataLabel = (raw: string): boolean => {
  const h = normalizeText(raw);
  if (!h) return false;
  if (
    /^(campus|academic\s*year|year|quarter|semester|grade|class|teacher(?:\s*s)?\s*name|subject|submitted\s*date|date|school\s*name|school|director|principal|signature|prepared\s*by|approved\s*by|note|notes|remark|remarks|total|average|mean|summary|max|min|max\s*score|full\s*score|points|weight|scoring\s*system|grading\s*system)$/i.test(
      h
    )
  ) {
    return true;
  }
  if (/(ឈ្មោះគ្រូ|ឆ្នាំសិក្សា|ត្រីមាស|ថ្នាក់ទី|មុខវិជ្ជា|កាលបរិច្ឆេទ|សាខា|សាលា|ហត្ថលេខា|សរុប|មធ្យមភាគ)/i.test(h)) {
    return true;
  }
  return false;
};

const isIdHeader = (rawHeader: string): boolean => {
  const h = normalizeText(rawHeader);
  if (!h || isNoHeader(h) || isScoreOrOtherHeader(h) || isMetadataLabel(rawHeader)) return false;
  if (/(អត្តលេខ|លេខសម្គាល់|កូដ)/i.test(h)) return true;
  if (/\b(student\s*id|student\s*code|student\s*number|student\s*no|std\s*id|id\s*no|id\s*number|idno|sid|code\s*id)\b/i.test(h)) {
    return true;
  }
  if (/^(id|code|studentid|studentcode)$/i.test(h)) return true;
  return false;
};

const isNameHeader = (rawHeader: string): boolean => {
  const h = normalizeText(rawHeader);
  if (!h || isScoreOrOtherHeader(h) || isMetadataLabel(rawHeader)) return false;
  if (/\b(teacher(?:\s*s)?|school|campus|class|subject|file|course|parent|guardian|director|principal)\b/i.test(h)) {
    return false;
  }
  if (/(គ្រូ|សាលា|មុខវិជ្ជា|សាខា)/i.test(h)) {
    return false;
  }
  if (/\b(name\s*in\s*khmer|khmer\s*name|name\s*khmer|khmer\s*full\s*name)\b/i.test(h)) {
    return false;
  }
  if (/(ឈ្មោះខ្មែរ|ឈ្មោះជាភាសាខ្មែរ|គោត្តនាម)/i.test(h) && !/\b(english|latin)\b/i.test(h)) {
    return false;
  }
  if (/ឈ្មោះ/.test(h)) return true;
  if (/\b(student\s*name|students\s*name|full\s*name|english\s*name|latin\s*name|name\s*in\s*english|name\s*in\s*latin|name)\b/i.test(h)) {
    return true;
  }
  if (/^(student|pupil|studentname|fullname)$/i.test(h)) return true;
  return false;
};

const isKhmerNameHeader = (rawHeader: string): boolean => {
  const h = normalizeText(rawHeader);
  if (!h || isScoreOrOtherHeader(h) || isMetadataLabel(rawHeader)) return false;
  if (/\b(teacher(?:\s*s)?|school|campus|class|subject|file|course|parent|guardian|director|principal|english|latin|essays?|dictations?)\b/i.test(h)) {
    return false;
  }
  if (/(គ្រូ|សាលា|មុខវិជ្ជា|សាខា)/i.test(h)) {
    return false;
  }
  if (/\b(name\s*in\s*khmer|khmer\s*name|name\s*khmer|khmer\s*full\s*name)\b/i.test(h)) return true;
  if (/(ឈ្មោះខ្មែរ|ឈ្មោះជាភាសាខ្មែរ|គោត្តនាម\s*និង\s*នាម|គោត្តនាម|ឈ្មោះពេញ|ឈ្មោះសិស្ស|ឈ្មោះ)/i.test(h)) {
    return true;
  }
  return false;
};

const isGenderHeader = (rawHeader: string): boolean => {
  const h = normalizeText(rawHeader);
  if (!h || isScoreOrOtherHeader(h) || isMetadataLabel(rawHeader)) return false;
  if (/(ភេទ|ប្រុស\s*ស្រី)/i.test(h)) return true;
  if (/\b(sex|sexes|gender|genders|male\s*female)\b/i.test(h)) return true;
  if (/(?:^|\s)m\s*f(?:\s|$)/i.test(h)) return true;
  return false;
};

// Normalize Gender string to 'Male' | 'Female' | ''
const normalizeGender = (raw: string): { gender: 'Male' | 'Female' | ''; isValid: boolean; warning?: string } => {
  if (!raw || raw.trim() === '' || /^[-–—_\/\\]+$/.test(raw.trim())) {
    return { gender: '', isValid: true };
  }
  const trimmed = raw
    .trim()
    .replace(/[\.\)\(\[\]]/g, '')
    .trim()
    .toLowerCase();

  if (/^(m|male|boy|man|ប្រុស|ប)$/i.test(trimmed)) {
    return { gender: 'Male', isValid: true };
  }
  if (/^(f|female|girl|woman|ស្រី|ស)$/i.test(trimmed)) {
    return { gender: 'Female', isValid: true };
  }
  return {
    gender: '',
    isValid: false,
    warning: `Unrecognized gender "${raw}". Expected Male/Female or M/F.`
  };
};

// Extract 2D text grid from worksheet, preserving leading zeros (.w formatted string) and expanding merges
const extractTextGrid = (ws: XLSX.WorkSheet): GridExtract => {
  if (!ws || !ws['!ref']) {
    return { grid: [], numRows: 0, numCols: 0 };
  }

  const range = XLSX.utils.decode_range(ws['!ref']);
  const numRows = Math.min(range.e.r + 1, 500);
  const numCols = Math.min(range.e.c + 1, 40);

  const grid: string[][] = Array.from({ length: numRows }, () => Array(numCols).fill(''));

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (!cell) continue;
      if (cell.w !== undefined && cell.w !== null && String(cell.w).trim() !== '') {
        grid[r][c] = String(cell.w).trim();
      } else if (cell.v !== undefined && cell.v !== null) {
        grid[r][c] = String(cell.v).trim();
      }
    }
  }

  // Expand merged cells in header region so multi-row / grouped headers resolve cleanly
  const merges = ws['!merges'] || [];
  for (const m of merges) {
    const startR = m.s.r;
    const endR = Math.min(m.e.r, numRows - 1, 30);
    const startC = m.s.c;
    const endC = Math.min(m.e.c, numCols - 1);
    if (startR < 0 || startC < 0 || startR >= numRows || startC >= numCols || startR >= 30) continue;

    const colSpan = endC - startC + 1;
    const rowSpan = endR - startR + 1;
    if (colSpan > 8 && rowSpan === 1) continue;

    const topVal = grid[startR][startC];
    if (!topVal) continue;
    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        if (!grid[r][c]) {
          grid[r][c] = topVal;
        }
      }
    }
  }

  return { grid, numRows, numCols };
};

// Find matching student in existing class roster using Student ID first, then Name (with fuzzy/compact fallback)
const matchStudentInRoster = (
  rawName: string,
  rawId: string,
  roster: Student[]
): { matchedStudent?: Student; matchType: 'id' | 'name' | 'new'; matchReason?: string } => {
  const validRoster = roster.filter(s => !isMetadataLabel(s.name));

  // 1. Primary Match: Student ID
  if (rawId) {
    const trimmedId = rawId.trim().toLowerCase();
    const byExactId = validRoster.find(
      s => s.studentId && s.studentId.trim().toLowerCase() === trimmedId
    );
    if (byExactId) {
      return {
        matchedStudent: byExactId,
        matchType: 'id',
        matchReason: `Matched by ID: ${byExactId.studentId}`
      };
    }

    const strippedId = trimmedId.replace(/^0+/, '');
    if (strippedId) {
      const byStrippedId = validRoster.find(
        s => s.studentId && s.studentId.trim().toLowerCase().replace(/^0+/, '') === strippedId
      );
      if (byStrippedId) {
        return {
          matchedStudent: byStrippedId,
          matchType: 'id',
          matchReason: `Matched by ID: ${byStrippedId.studentId}`
        };
      }
    }
  }

  // 2. Secondary Match: Student Name
  if (rawName && !isMetadataLabel(rawName)) {
    const normTarget = normalizeText(cleanStudentNameForMatch(rawName));
    if (normTarget) {
      const byExactName = validRoster.find(
        s => normalizeText(cleanStudentNameForMatch(s.name)) === normTarget
      );
      if (byExactName) {
        return {
          matchedStudent: byExactName,
          matchType: 'name',
          matchReason: `Matched by Name: ${byExactName.name}`
        };
      }

      const latinTarget = extractLatinName(rawName);
      if (latinTarget && latinTarget.length >= 3) {
        const byLatin = validRoster.find(s => extractLatinName(s.name) === latinTarget);
        if (byLatin) {
          return {
            matchedStudent: byLatin,
            matchType: 'name',
            matchReason: `Matched by Name: ${byLatin.name}`
          };
        }
      }

      const tokensTarget = normTarget.split(' ').filter(Boolean).sort();
      if (tokensTarget.length >= 2) {
        const byTokens = validRoster.find(s => {
          const rTokens = normalizeText(cleanStudentNameForMatch(s.name)).split(' ').filter(Boolean).sort();
          return (
            tokensTarget.length === rTokens.length &&
            tokensTarget.every((t, i) => t === rTokens[i])
          );
        });
        if (byTokens) {
          return {
            matchedStudent: byTokens,
            matchType: 'name',
            matchReason: `Matched by Name: ${byTokens.name}`
          };
        }
      }

      // Space-insensitive compact match ("POK HENG MEANHEANG" vs "POK HENG MEAN HEANG")
      const compactTarget = compactAlphaNum(cleanStudentNameForMatch(rawName));
      if (compactTarget.length >= 4) {
        const byCompact = validRoster.find(
          s => compactAlphaNum(cleanStudentNameForMatch(s.name)) === compactTarget
        );
        if (byCompact) {
          return {
            matchedStudent: byCompact,
            matchType: 'name',
            matchReason: `Matched by Name: ${byCompact.name}`
          };
        }
      }

      // Fuzzy Levenshtein match for minor spelling differences (unique best match <= 2 edits)
      if (compactTarget.length >= 6) {
        let bestFuzzy: Student | undefined;
        let bestDist = 3;
        let tieCount = 0;
        for (const s of validRoster) {
          const rCompact = compactAlphaNum(cleanStudentNameForMatch(s.name));
          if (!rCompact || Math.abs(rCompact.length - compactTarget.length) > 2) continue;
          const dist = levenshteinDistance(compactTarget, rCompact);
          if (dist < bestDist) {
            bestDist = dist;
            bestFuzzy = s;
            tieCount = 1;
          } else if (dist === bestDist) {
            tieCount++;
          }
        }
        if (bestFuzzy && tieCount === 1) {
          return {
            matchedStudent: bestFuzzy,
            matchType: 'name',
            matchReason: `Fuzzy Match: ${bestFuzzy.name}`
          };
        }
      }
    }
  }

  return { matchType: 'new' };
};

// Detect header row, column mapping, and roster match stats from an extracted grid
const analyzeWorksheet = (
  extracted: GridExtract,
  roster: Student[],
  customMapping?: Partial<ColumnMapping>
): {
  mapping: ColumnMapping;
  colOptions: { index: number; label: string }[];
  autoDetected: boolean;
  rosterMatchCount: number;
  sheetScore: number;
} => {
  const { grid, numRows, numCols } = extracted;
  if (numRows === 0 || numCols === 0) {
    return {
      mapping: { idCol: -1, nameCol: -1, nameKhmerCol: -1, genderCol: -1, headerRowIndex: 0 },
      colOptions: [],
      autoDetected: false,
      rosterMatchCount: 0,
      sheetScore: -1
    };
  }

  // Step 1: Scan ALL columns to find which column actually holds the class roster student names
  let bestRosterMatchCol = -1;
  let bestRosterMatchCount = 0;
  let firstRosterRow = -1;

  if (roster.length > 0) {
    for (let c = 0; c < numCols; c++) {
      const matchedIds = new Set<string>();
      let firstRowInCol = -1;
      for (let r = 0; r < Math.min(numRows, 100); r++) {
        const val = grid[r][c];
        if (
          !val ||
          val.length < 3 ||
          isMetadataLabel(val) ||
          isNameHeader(val) ||
          isKhmerNameHeader(val) ||
          isIdHeader(val) ||
          isGenderHeader(val)
        ) {
          continue;
        }
        const m = matchStudentInRoster(val, '', roster);
        if (m.matchedStudent) {
          matchedIds.add(m.matchedStudent.id);
          if (firstRowInCol === -1) firstRowInCol = r;
        }
      }
      if (matchedIds.size > bestRosterMatchCount) {
        bestRosterMatchCount = matchedIds.size;
        bestRosterMatchCol = c;
        firstRosterRow = firstRowInCol;
      }
    }
  }

  const headerSearchLimit = firstRosterRow > 0 ? firstRosterRow : Math.min(numRows, 30);

  let bestHeaderRow = 0;
  let detectedNameCol = -1;
  let detectedNameKhmerCol = -1;
  let detectedIdCol = -1;
  let detectedGenderCol = -1;
  let maxHeaderScore = 0;

  if (customMapping && customMapping.headerRowIndex !== undefined) {
    bestHeaderRow = customMapping.headerRowIndex;
    detectedNameCol = customMapping.nameCol ?? -1;
    detectedNameKhmerCol = customMapping.nameKhmerCol ?? -1;
    detectedIdCol = customMapping.idCol ?? -1;
    detectedGenderCol = customMapping.genderCol ?? -1;
  } else {
    // Step 2: Detect table header row. Prefer rows that contain multiple student-table headers together.
    for (let r = 0; r < headerSearchLimit; r++) {
      let score = 0;
      let nameIdx = -1;
      let khmerNameIdx = -1;
      let idIdx = -1;
      let genderIdx = -1;

      for (let c = 0; c < numCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const combined =
          r > 0 && grid[r - 1][c] && !/\d{3,}/.test(grid[r - 1][c])
            ? `${grid[r - 1][c]} ${cell}`
            : cell;

        if (isKhmerNameHeader(cell) && khmerNameIdx === -1 && c !== bestRosterMatchCol) {
          khmerNameIdx = c;
          score += 4;
        } else if (isNameHeader(cell) && nameIdx === -1) {
          nameIdx = c;
          score += c === bestRosterMatchCol ? 10 : 5;
        } else if (isIdHeader(cell) && idIdx === -1) {
          idIdx = c;
          score += 4;
        } else if (isGenderHeader(cell) && genderIdx === -1) {
          genderIdx = c;
          score += 4;
        } else if (combined !== cell) {
          if (isKhmerNameHeader(combined) && khmerNameIdx === -1 && c !== bestRosterMatchCol) {
            khmerNameIdx = c;
            score += 3;
          } else if (isNameHeader(combined) && nameIdx === -1) {
            nameIdx = c;
            score += c === bestRosterMatchCol ? 8 : 4;
          } else if (isIdHeader(combined) && idIdx === -1) {
            idIdx = c;
            score += 3;
          } else if (isGenderHeader(combined) && genderIdx === -1) {
            genderIdx = c;
            score += 3;
          }
        }
      }

      const hitKinds =
        (nameIdx !== -1 ? 1 : 0) +
        (khmerNameIdx !== -1 ? 1 : 0) +
        (idIdx !== -1 ? 1 : 0) +
        (genderIdx !== -1 ? 1 : 0);
      if (hitKinds >= 2) score += 6;

      if (score >= maxHeaderScore && score > 0) {
        maxHeaderScore = score;
        bestHeaderRow = r;
        detectedNameCol = nameIdx;
        detectedNameKhmerCol = khmerNameIdx;
        detectedIdCol = idIdx;
        detectedGenderCol = genderIdx;
      }
    }

    // Check secondary sub-header row right under bestHeaderRow
    if (bestHeaderRow + 1 < headerSearchLimit && maxHeaderScore > 0) {
      const nextRow = grid[bestHeaderRow + 1];
      let subHits = 0;
      for (let c = 0; c < numCols; c++) {
        const cell = nextRow[c];
        if (
          cell &&
          (isNameHeader(cell) || isKhmerNameHeader(cell) || isIdHeader(cell) || isGenderHeader(cell) || isNoHeader(cell))
        ) {
          subHits++;
        }
      }
      if (subHits >= 2) {
        for (let c = 0; c < numCols; c++) {
          const cell = nextRow[c];
          if (detectedNameKhmerCol === -1 && isKhmerNameHeader(cell) && c !== bestRosterMatchCol) {
            detectedNameKhmerCol = c;
          }
          if (detectedNameCol === -1 && isNameHeader(cell)) detectedNameCol = c;
          if (detectedIdCol === -1 && isIdHeader(cell)) detectedIdCol = c;
          if (detectedGenderCol === -1 && isGenderHeader(cell)) detectedGenderCol = c;
        }
        bestHeaderRow = bestHeaderRow + 1;
      }
    }

    // Always prefer the column that actually matched real roster students!
    if (bestRosterMatchCol !== -1 && bestRosterMatchCount >= 1) {
      detectedNameCol = bestRosterMatchCol;
      if (detectedNameKhmerCol === bestRosterMatchCol) {
        detectedNameKhmerCol = -1;
      }
    }

    const dataStart = firstRosterRow > bestHeaderRow ? firstRosterRow : maxHeaderScore > 0 ? bestHeaderRow + 1 : 0;
    const scanEnd = Math.min(numRows, dataStart + 45);

    // Infer Gender column from cell values across ALL columns if header missed it
    if (detectedGenderCol === -1) {
      for (let c = 0; c < numCols; c++) {
        if (c === detectedNameCol || c === detectedNameKhmerCol || c === detectedIdCol) continue;
        let nonEmpty = 0;
        let genderHits = 0;
        for (let r = dataStart; r < scanEnd; r++) {
          const val = grid[r][c];
          if (!val) continue;
          nonEmpty++;
          if (normalizeGender(val).gender !== '') genderHits++;
        }
        if (genderHits >= 2 && nonEmpty > 0 && genderHits / nonEmpty >= 0.55) {
          detectedGenderCol = c;
          break;
        }
      }
    }

    // Infer Student ID column across ALL columns if header missed it
    if (detectedIdCol === -1) {
      for (let c = 0; c < numCols; c++) {
        if (c === detectedNameCol || c === detectedNameKhmerCol || c === detectedGenderCol) continue;
        const hdr = grid[bestHeaderRow]?.[c] || '';
        if (isNoHeader(hdr) || isScoreOrOtherHeader(hdr) || isMetadataLabel(hdr)) continue;

        let nonEmpty = 0;
        let idLikeCount = 0;
        for (let r = dataStart; r < scanEnd; r++) {
          const val = grid[r][c];
          if (!val) continue;
          nonEmpty++;
          const isZeroPadded = /^0\d{1,}$/.test(val);
          const isAlphanumericId = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9\-_\/]{2,20}$/.test(val);
          const isLongIdNumber = /^\d{4,15}$/.test(val);
          if (isZeroPadded || isAlphanumericId || isLongIdNumber) {
            idLikeCount++;
          }
        }
        if (idLikeCount >= 2 && nonEmpty > 0 && idLikeCount / nonEmpty >= 0.55) {
          detectedIdCol = c;
          break;
        }
      }
    }

    // Infer Name in Khmer column from Khmer script values if header missed it
    if (detectedNameKhmerCol === -1) {
      for (let c = 0; c < numCols; c++) {
        if (c === detectedNameCol || c === detectedIdCol || c === detectedGenderCol) continue;
        const hdr = grid[bestHeaderRow]?.[c] || '';
        if (isNoHeader(hdr) || isScoreOrOtherHeader(hdr) || isMetadataLabel(hdr)) continue;

        let nonEmpty = 0;
        let khmerNameHits = 0;
        let metadataHits = 0;
        for (let r = dataStart; r < scanEnd; r++) {
          const val = grid[r][c];
          if (!val) continue;
          if (isMetadataLabel(val)) {
            metadataHits++;
            continue;
          }
          nonEmpty++;
          if (/[\u1780-\u17FF]{2,}/.test(val) && normalizeGender(val).gender === '') {
            khmerNameHits++;
          }
        }
        if (khmerNameHits >= 2 && metadataHits === 0 && nonEmpty > 0 && khmerNameHits / nonEmpty >= 0.55) {
          detectedNameKhmerCol = c;
          break;
        }
      }
    }

    // Infer Name column ONLY if still -1 (for brand-new classes with 0 existing students)
    if (detectedNameCol === -1) {
      let bestTextCol = -1;
      let bestTextScore = 0;
      for (let c = 0; c < numCols; c++) {
        if (c === detectedGenderCol || c === detectedIdCol || c === detectedNameKhmerCol) continue;
        const hdr = grid[bestHeaderRow]?.[c] || '';
        if (isNoHeader(hdr) || isScoreOrOtherHeader(hdr) || isMetadataLabel(hdr)) continue;

        let textRows = 0;
        let metadataHits = 0;
        for (let r = dataStart; r < scanEnd; r++) {
          const val = grid[r][c];
          if (!val) continue;
          if (isMetadataLabel(val)) {
            metadataHits++;
            continue;
          }
          if (val.length >= 3 && /[a-zA-Z\u1780-\u17ff]{2,}/.test(val) && normalizeGender(val).gender === '') {
            textRows++;
          }
        }
        const colScore = textRows - metadataHits * 5;
        if (colScore > bestTextScore && textRows >= 2) {
          bestTextScore = colScore;
          bestTextCol = c;
        }
      }
      if (bestTextCol !== -1) {
        detectedNameCol = bestTextCol;
      }
    }
  }

  const effectiveNameCol = customMapping?.nameCol ?? detectedNameCol;
  const effectiveNameKhmerCol = customMapping?.nameKhmerCol ?? detectedNameKhmerCol;
  const effectiveIdCol = customMapping?.idCol ?? detectedIdCol;
  const effectiveGenderCol = customMapping?.genderCol ?? detectedGenderCol;
  const effectiveHeaderRow = customMapping?.headerRowIndex ?? bestHeaderRow;

  const colOptions: { index: number; label: string }[] = [];
  for (let c = 0; c < numCols; c++) {
    const headerText = grid[effectiveHeaderRow]?.[c] || '';
    const letter = XLSX.utils.encode_col(c);
    let sample = '';
    for (let r = effectiveHeaderRow + 1; r < Math.min(numRows, effectiveHeaderRow + 15); r++) {
      if (grid[r][c]) {
        sample = grid[r][c].slice(0, 18);
        break;
      }
    }
    const base = headerText ? `Col ${letter}: "${headerText}"` : `Col ${letter}`;
    colOptions.push({
      index: c,
      label: sample ? `${base} [e.g. ${sample}]` : base
    });
  }

  const sheetScore =
    bestRosterMatchCount * 20 +
    maxHeaderScore +
    (effectiveNameCol !== -1 ? 5 : 0) +
    (effectiveNameKhmerCol !== -1 ? 4 : 0) +
    (effectiveIdCol !== -1 ? 6 : 0) +
    (effectiveGenderCol !== -1 ? 6 : 0);

  return {
    mapping: {
      idCol: effectiveIdCol,
      nameCol: effectiveNameCol,
      nameKhmerCol: effectiveNameKhmerCol,
      genderCol: effectiveGenderCol,
      headerRowIndex: effectiveHeaderRow
    },
    colOptions,
    autoDetected: effectiveNameCol !== -1 && (effectiveIdCol !== -1 || effectiveGenderCol !== -1 || effectiveNameKhmerCol !== -1),
    rosterMatchCount: bestRosterMatchCount,
    sheetScore
  };
};

export const ExcelStudentImportModal: React.FC<ExcelStudentImportModalProps> = ({
  isOpen,
  onClose,
  currentClassId,
  currentClassName,
  classStudents,
  initialFile
}) => {
  const { dispatch } = useData();

  const [activeFile, setActiveFile] = useState<File | null>(initialFile || null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetMatchCounts, setSheetMatchCounts] = useState<Record<string, number>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [gridExtract, setGridExtract] = useState<GridExtract>({ grid: [], numRows: 0, numCols: 0 });

  // Column Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    idCol: -1,
    nameCol: -1,
    nameKhmerCol: -1,
    genderCol: -1,
    headerRowIndex: 0
  });
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  // Import Mode: when class already has students, default to updating existing students only (adding Sex & Student ID safely)
  const [importMode, setImportMode] = useState<ImportMode>(
    classStudents.length > 0 ? 'update-only' : 'add-and-update'
  );

  // Extracted data and row selections
  const [extractedRows, setExtractedRows] = useState<ExtractedStudentRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'update' | 'warning'>('all');
  const [isProcessing, setIsProcessing] = useState(false);

  // Available column headers for manual mapping
  const [availableCols, setAvailableCols] = useState<{ index: number; label: string }[]>([]);

  useEffect(() => {
    if (isOpen && initialFile) {
      setImportMode(classStudents.length > 0 ? 'update-only' : 'add-and-update');
      loadFile(initialFile);
    }
  }, [initialFile, isOpen]);

  // Read file and parse workbook, automatically picking the best student sheet
  const loadFile = async (file: File) => {
    setIsProcessing(true);
    setActiveFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
        cellNF: true,
        cellText: true
      });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);

      let bestSheet = wb.SheetNames[0] || '';
      let bestScore = -Infinity;
      const counts: Record<string, number> = {};

      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const extracted = extractTextGrid(ws);
        const analysis = analyzeWorksheet(extracted, classStudents);
        counts[name] = analysis.rosterMatchCount;
        if (analysis.sheetScore > bestScore) {
          bestScore = analysis.sheetScore;
          bestSheet = name;
        }
      }

      setSheetMatchCounts(counts);
      setSelectedSheet(bestSheet);
      processWorksheet(wb, bestSheet, undefined, classStudents.length > 0 ? 'update-only' : 'add-and-update');
    } catch (err) {
      console.error('Error reading student Excel file:', err);
      alert('Could not read Excel file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process selected worksheet
  const processWorksheet = (
    wb: XLSX.WorkBook,
    sheetName: string,
    customMapping?: Partial<ColumnMapping>,
    modeOverride?: ImportMode
  ) => {
    const activeMode = modeOverride ?? importMode;
    const ws = wb.Sheets[sheetName];
    const extracted = extractTextGrid(ws);
    setGridExtract(extracted);

    if (extracted.numRows === 0 || extracted.numCols === 0) {
      setExtractedRows([]);
      setAvailableCols([]);
      return;
    }

    const analysis = analyzeWorksheet(extracted, classStudents, customMapping);
    const { idCol, nameCol, nameKhmerCol, genderCol, headerRowIndex } = analysis.mapping;

    setMapping(analysis.mapping);
    setAutoDetected(analysis.autoDetected);
    setAvailableCols(analysis.colOptions);

    // Auto-open column mapper if any key field wasn't detected
    if (!customMapping && (idCol === -1 || nameCol === -1 || genderCol === -1)) {
      setShowMappingConfig(true);
    }

    const { grid, numRows } = extracted;
    const rows: ExtractedStudentRow[] = [];
    const seenIdsInFile = new Map<string, number>();
    const seenNamesInFile = new Map<string, number>();

    for (let r = headerRowIndex + 1; r < numRows; r++) {
      const rawId = idCol >= 0 ? (grid[r][idCol] || '').trim() : '';
      const rawName = nameCol >= 0 ? (grid[r][nameCol] || '').trim() : '';
      const rawNameKhmer = nameKhmerCol >= 0 ? (grid[r][nameKhmerCol] || '').trim() : '';
      const rawGender = genderCol >= 0 ? (grid[r][genderCol] || '').trim() : '';

      // Skip completely empty rows
      if (!rawId && !rawName && !rawNameKhmer && !rawGender) continue;

      // Skip metadata/form rows and header-repeat rows
      if (rawName && (isMetadataLabel(rawName) || isNameHeader(rawName))) {
        continue;
      }
      if (rawId && (isIdHeader(rawId) || isMetadataLabel(rawId))) {
        continue;
      }

      const warnings: string[] = [];
      let isValid = true;

      if (!rawName || rawName.trim().length === 0) {
        warnings.push('Missing Student Name (Required)');
        isValid = false;
      }

      const { gender: normalizedGender, isValid: genderValid, warning: genderWarning } = normalizeGender(rawGender);
      if (genderWarning) {
        warnings.push(genderWarning);
      }

      if (rawId) {
        const key = rawId.toLowerCase();
        if (seenIdsInFile.has(key)) {
          warnings.push(`Duplicate ID "${rawId}" in file (row ${seenIdsInFile.get(key)})`);
        } else {
          seenIdsInFile.set(key, r + 1);
        }
      }

      if (rawName) {
        const normN = normalizeText(rawName);
        if (seenNamesInFile.has(normN) && !rawId) {
          warnings.push(`Duplicate Name "${rawName}" in file`);
        } else {
          seenNamesInFile.set(normN, r + 1);
        }
      }

      const matchResult = matchStudentInRoster(rawName, rawId, classStudents);
      const isSelectedByDefault =
        isValid && (activeMode === 'update-only' ? matchResult.matchType !== 'new' : true);

      rows.push({
        rowIndex: r + 1,
        rawId,
        rawName,
        rawNameKhmer,
        rawGender,
        normalizedGender,
        isGenderValid: genderValid,
        matchedStudent: matchResult.matchedStudent,
        matchType: matchResult.matchType,
        matchReason: matchResult.matchReason,
        warnings,
        selected: isSelectedByDefault,
        isValid
      });
    }

    setExtractedRows(rows);
  };

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    if (workbook) {
      processWorksheet(workbook, sheet);
    }
  };

  const handleImportModeChange = (nextMode: ImportMode) => {
    setImportMode(nextMode);
    setExtractedRows(prev =>
      prev.map(r => ({
        ...r,
        selected: r.isValid && (nextMode === 'update-only' ? r.matchType !== 'new' : true)
      }))
    );
  };

  const handleCustomMappingChange = (field: keyof ColumnMapping, val: number) => {
    const updated = {
      ...mapping,
      [field]: val
    };
    setMapping(updated);
    if (workbook && selectedSheet) {
      processWorksheet(workbook, selectedSheet, updated);
    }
  };

  const toggleSelectRow = (index: number) => {
    setExtractedRows(prev =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setExtractedRows(prev =>
      prev.map(r => ({
        ...r,
        selected:
          r.isValid && (importMode === 'update-only' ? r.matchType !== 'new' : true)
            ? select
            : false
      }))
    );
  };

  const handleManualMatchChange = (rowIndexInExtracted: number, studentId: string) => {
    setExtractedRows(prev =>
      prev.map((r, i) => {
        if (i !== rowIndexInExtracted) return r;
        if (!studentId) {
          return {
            ...r,
            matchedStudent: undefined,
            matchType: 'new',
            matchReason: undefined,
            selected: r.isValid && importMode === 'add-and-update'
          };
        }
        const target = classStudents.find(s => s.id === studentId);
        if (!target) return r;
        return {
          ...r,
          matchedStudent: target,
          matchType: 'name',
          matchReason: `Manual Match: ${target.name}`,
          selected: r.isValid
        };
      })
    );
  };

  // Filtered preview rows
  const filteredRows = useMemo(() => {
    return extractedRows.filter(r => {
      if (statusFilter === 'new' && r.matchType !== 'new') return false;
      if (statusFilter === 'update' && r.matchType === 'new') return false;
      if (statusFilter === 'warning' && r.warnings.length === 0) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = r.rawName.toLowerCase().includes(term);
        const matchesKhmer = r.rawNameKhmer.toLowerCase().includes(term);
        const matchesId = r.rawId.toLowerCase().includes(term);
        if (!matchesName && !matchesKhmer && !matchesId) return false;
      }
      return true;
    });
  }, [extractedRows, statusFilter, searchTerm]);

  // Summary counts
  const summary = useMemo(() => {
    const total = extractedRows.length;
    const newCount = extractedRows.filter(r => r.matchType === 'new').length;
    const updateCount = extractedRows.filter(r => r.matchType !== 'new').length;
    const warningCount = extractedRows.filter(r => r.warnings.length > 0).length;
    const selectedCount = extractedRows.filter(r => r.selected).length;
    return { total, newCount, updateCount, warningCount, selectedCount };
  }, [extractedRows]);

  // Execute Import
  const handleConfirmImport = () => {
    const toImport = extractedRows.filter(r => r.selected && r.isValid);
    if (toImport.length === 0) {
      alert('No valid students selected for import.');
      return;
    }

    const maxRosterNum = classStudents.reduce(
      (max, s) => (s.rosterNumber && s.rosterNumber > max ? s.rosterNumber : max),
      classStudents.length
    );

    let nextRoster = maxRosterNum + 1;
    const preparedStudents: Student[] = [];

    for (const r of toImport) {
      if (r.matchedStudent) {
        preparedStudents.push({
          ...r.matchedStudent,
          name: r.matchedStudent.name,
          nameKhmer: r.rawNameKhmer ? r.rawNameKhmer.trim() : r.matchedStudent.nameKhmer,
          studentId: r.rawId ? r.rawId.trim() : r.matchedStudent.studentId,
          sex: r.normalizedGender ? r.normalizedGender : r.matchedStudent.sex
        });
      } else {
        preparedStudents.push({
          id: uuidv4(),
          classId: currentClassId,
          name: r.rawName.trim(),
          nameKhmer: r.rawNameKhmer ? r.rawNameKhmer.trim() : '',
          studentId: r.rawId ? r.rawId.trim() : '',
          sex: r.normalizedGender ? r.normalizedGender : '',
          rosterNumber: nextRoster++
        });
      }
    }

    dispatch({
      type: 'UPSERT_STUDENTS',
      payload: {
        classId: currentClassId,
        students: preparedStudents
      }
    });

    const newAdded = toImport.filter(r => r.matchType === 'new').length;
    const updated = toImport.filter(r => r.matchType !== 'new').length;

    alert(
      `Import Successful!\n\n` +
      `• Total Processed: ${toImport.length} students\n` +
      `• Existing Students Updated (ID & Sex): ${updated}\n` +
      `• New Students Added: ${newAdded}\n\n` +
      `Student ID and Gender have been saved permanently.`
    );

    onClose();
  };

  if (!isOpen) return null;

  const missingMappingLabels: string[] = [];
  if (mapping.nameCol === -1) missingMappingLabels.push('Student Name');
  if (mapping.idCol === -1) missingMappingLabels.push('Student ID');
  if (mapping.genderCol === -1) missingMappingLabels.push('Sex / Gender');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <FileSpreadsheet className="w-6 h-6 text-indigo-200" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                Import Students from Excel
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-100 border border-indigo-400/30">
                  Target: {currentClassName}
                </span>
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Automatically recognizes Student ID, Name, and Sex/Gender while preserving leading zeros and existing records.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* File Selector & Worksheet Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs transition-colors ${isProcessing ? 'opacity-60 pointer-events-none' : ''}`}>
                <Upload size={14} className="text-indigo-600" />
                <span>{isProcessing ? 'Processing File...' : activeFile ? 'Change File' : 'Choose Excel File'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xlsb,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) loadFile(f);
                  }}
                />
              </label>

              {activeFile && (
                <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
                  <span className="text-gray-400">•</span>
                  <span className="truncate max-w-[200px]" title={activeFile.name}>
                    {activeFile.name}
                  </span>
                </div>
              )}

              {sheetNames.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-gray-600">Worksheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={e => handleSheetChange(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-1 bg-white font-medium text-gray-800 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {sheetNames.map(s => {
                      const cnt = sheetMatchCounts[s] || 0;
                      return (
                        <option key={s} value={s}>
                          {s}{cnt > 0 ? ` (${cnt}/${classStudents.length} matched)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Column Mapping Toggle */}
            <div className="flex items-center gap-2">
              {autoDetected && missingMappingLabels.length === 0 && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Check size={12} /> All Columns Auto-Detected
                </span>
              )}
              {missingMappingLabels.length > 0 && extractedRows.length > 0 && (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1">
                  <AlertTriangle size={12} /> Select {missingMappingLabels.join(', ')}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowMappingConfig(prev => !prev)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  showMappingConfig
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>{showMappingConfig ? 'Hide Column Mapping' : 'Adjust Column Mapping'}</span>
                <ChevronDown size={13} className={`transition-transform ${showMappingConfig ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Safe Import Mode Selector when class already has students */}
          {classStudents.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-medium">
                <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                <span>
                  {importMode === 'update-only'
                    ? 'Safe Update Mode: Only existing students in this class will be updated with Student ID & Sex (no extra rows added).'
                    : 'Add & Update Mode: Matching students will be updated, and unmatched rows will be added as new students.'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleImportModeChange('update-only')}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition ${
                    importMode === 'update-only'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  Update Existing Only
                </button>
                <button
                  type="button"
                  onClick={() => handleImportModeChange('add-and-update')}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition ${
                    importMode === 'add-and-update'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  + Also Add New
                </button>
              </div>
            </div>
          )}

          {/* Manual Column Mapping Panel */}
          {showMappingConfig && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Column Mapping
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-gray-700">Header Row:</span>
                  <select
                    value={mapping.headerRowIndex}
                    onChange={e => handleCustomMappingChange('headerRowIndex', parseInt(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white font-medium text-gray-800"
                  >
                    {gridExtract.grid.slice(0, 25).map((row, idx) => {
                      const preview = row.filter(Boolean).slice(0, 4).join(' | ').slice(0, 45);
                      return (
                        <option key={idx} value={idx}>
                          Row {idx + 1}: {preview || '(Empty)'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Student Name (English) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={mapping.nameCol}
                    onChange={e => handleCustomMappingChange('nameCol', parseInt(e.target.value))}
                    className={`w-full border rounded-lg p-2 text-xs bg-white font-medium text-gray-800 ${
                      mapping.nameCol === -1 ? 'border-rose-400 bg-rose-50/40' : 'border-gray-300'
                    }`}
                  >
                    <option value={-1}>-- Select Column (Required) --</option>
                    {availableCols.map(c => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Name in Khmer <span className="text-gray-400 font-normal">(ឈ្មោះខ្មែរ)</span>
                  </label>
                  <select
                    value={mapping.nameKhmerCol}
                    onChange={e => handleCustomMappingChange('nameKhmerCol', parseInt(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white font-medium text-gray-800"
                  >
                    <option value={-1}>-- None / Not in File --</option>
                    {availableCols.map(c => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Student ID <span className="text-gray-400 font-normal">(Leading zeros kept)</span>
                  </label>
                  <select
                    value={mapping.idCol}
                    onChange={e => handleCustomMappingChange('idCol', parseInt(e.target.value))}
                    className={`w-full border rounded-lg p-2 text-xs bg-white font-medium text-gray-800 ${
                      mapping.idCol === -1 ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
                    }`}
                  >
                    <option value={-1}>-- None / Not in File --</option>
                    {availableCols.map(c => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Sex / Gender <span className="text-gray-400 font-normal">(M/F, Male/Female)</span>
                  </label>
                  <select
                    value={mapping.genderCol}
                    onChange={e => handleCustomMappingChange('genderCol', parseInt(e.target.value))}
                    className={`w-full border rounded-lg p-2 text-xs bg-white font-medium text-gray-800 ${
                      mapping.genderCol === -1 ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
                    }`}
                  >
                    <option value={-1}>-- None / Not in File --</option>
                    {availableCols.map(c => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Summary Pills */}
          {extractedRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-full border transition-all ${
                    statusFilter === 'all'
                      ? 'bg-gray-800 text-white border-gray-800 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  All Rows ({summary.total})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('update')}
                  className={`px-3 py-1.5 rounded-full border transition-all ${
                    statusFilter === 'update'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  ⟳ Matched Updates ({summary.updateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('new')}
                  className={`px-3 py-1.5 rounded-full border transition-all ${
                    statusFilter === 'new'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  + New / Unmatched ({summary.newCount})
                </button>
                {summary.warningCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('warning')}
                    className={`px-3 py-1.5 rounded-full border transition-all ${
                      statusFilter === 'warning'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    ⚠ Warnings ({summary.warningCount})
                  </button>
                )}
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Preview Table */}
          {extractedRows.length > 0 ? (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-gray-100/90 sticky top-0 z-10 border-b border-gray-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            summary.selectedCount > 0 &&
                            summary.selectedCount ===
                              extractedRows.filter(
                                r => r.isValid && (importMode === 'update-only' ? r.matchType !== 'new' : true)
                              ).length
                          }
                          onChange={e => toggleSelectAll(e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-2.5 w-12 text-center text-gray-500">Row</th>
                      <th className="p-2.5 min-w-[120px] font-bold text-gray-700">Student ID</th>
                      <th className="p-2.5 min-w-[170px] font-bold text-gray-700">Student Name</th>
                      <th className="p-2.5 min-w-[150px] font-bold text-gray-700">Name in Khmer</th>
                      <th className="p-2.5 min-w-[100px] font-bold text-gray-700 text-center">Gender</th>
                      <th className="p-2.5 min-w-[190px] font-bold text-gray-700">Action / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          !row.isValid
                            ? 'bg-rose-50/60 text-gray-400'
                            : row.selected
                            ? row.matchType === 'new'
                              ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                              : 'bg-blue-50/30 hover:bg-blue-50/60'
                            : 'bg-gray-50/50 hover:bg-gray-100/50 opacity-60'
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={!row.isValid}
                            onChange={() => toggleSelectRow(extractedRows.indexOf(row))}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>

                        <td className="p-2.5 text-center text-gray-400 font-mono text-[11px]">
                          {row.rowIndex}
                        </td>

                        <td className="p-2.5">
                          {row.rawId ? (
                            <span className="font-mono bg-gray-100 border border-gray-200 text-gray-900 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
                              {row.rawId}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">- None -</span>
                          )}
                        </td>

                        <td className="p-2.5 font-medium text-gray-900">
                          {row.rawName || (
                            <span className="text-rose-600 font-semibold italic">Missing Name</span>
                          )}
                        </td>

                        <td className="p-2.5 text-gray-700">
                          {row.rawNameKhmer || (
                            <span className="text-gray-400 italic text-[11px]">-</span>
                          )}
                        </td>

                        <td className="p-2.5 text-center">
                          {row.normalizedGender === 'Male' ? (
                            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-[11px] font-bold">
                              Male
                            </span>
                          ) : row.normalizedGender === 'Female' ? (
                            <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-800 border border-pink-200 px-2 py-0.5 rounded-full text-[11px] font-bold">
                              Female
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[11px] italic">
                              {row.rawGender ? row.rawGender : 'Unspecified'}
                            </span>
                          )}
                        </td>

                        <td className="p-2.5">
                          <div className="space-y-1">
                            {row.matchType === 'new' ? (
                              <div className="flex flex-col gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border w-fit ${
                                    row.selected
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : 'bg-gray-100 text-gray-600 border-gray-300'
                                  }`}
                                >
                                  <UserPlus size={12} /> {row.selected ? 'New Student' : 'Skipped (Unmatched)'}
                                </span>
                                {classStudents.length > 0 && row.isValid && (
                                  <select
                                    value=""
                                    onChange={e => handleManualMatchChange(extractedRows.indexOf(row), e.target.value)}
                                    className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700 max-w-[200px]"
                                  >
                                    <option value="">Link to existing student...</option>
                                    {classStudents
                                      .filter(s => !isMetadataLabel(s.name))
                                      .map(s => (
                                        <option key={s.id} value={s.id}>
                                          {s.rosterNumber ? `${s.rosterNumber}. ` : ''}{s.name}
                                        </option>
                                      ))}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded text-[11px] font-bold w-fit">
                                  <UserCheck size={12} /> Update Existing
                                </span>
                                <span className="text-[10px] text-gray-500 font-medium">
                                  {row.matchReason}
                                </span>
                              </div>
                            )}

                            {row.warnings.map((w, wIdx) => (
                              <div key={wIdx} className="flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                                <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-10 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-3">
              <Upload size={36} className="mx-auto text-gray-300" />
              <div className="text-sm font-semibold text-gray-700">No Excel rows loaded</div>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Please select an Excel file containing your student list with columns for <strong>Student ID</strong>, <strong>Name</strong>, and <strong>Sex/Gender</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 font-medium">
            {summary.selectedCount > 0 ? (
              <span>
                Ready to process <strong className="text-indigo-900 font-bold">{summary.selectedCount}</strong> student{summary.selectedCount > 1 ? 's' : ''} in{' '}
                <strong className="text-indigo-900 font-bold">{currentClassName}</strong>
              </span>
            ) : (
              <span className="text-gray-400">No students selected</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={summary.selectedCount === 0}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-indigo-700 hover:to-purple-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FileCheck size={14} />
              <span>Confirm Import ({summary.selectedCount})</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ExcelStudentImportModal;
