import { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { Quarter, QuarterSheetInfo, ScoreRecord, Student } from '../types';
import { getClassRoster, getStudentQuarterTotal } from '../utils/calculations';
import { exportAllQuartersScoreSheet, exportQuarterScoreSheet } from '../utils/export';
import { exportQuarterScoreSheetPdf } from '../utils/pdfExport';
import { Download, Printer, RefreshCw, Save, Search } from 'lucide-react';

type NumericScoreField =
  | 'conduct'
  | 'cpScore'
  | 'hw1'
  | 'hw2'
  | 'hw3'
  | 'hw4'
  | 'hw5'
  | 'hw6'
  | 'quiz1'
  | 'quiz2'
  | 'quiz3'
  | 'quiz4'
  | 'quiz5'
  | 'quiz6'
  | 'test1'
  | 'test2'
  | 'test3';

const HW_SLOTS: NumericScoreField[] = ['hw1', 'hw2', 'hw3', 'hw4', 'hw5', 'hw6'];
const QUIZ_SLOTS: NumericScoreField[] = ['quiz1', 'quiz2', 'quiz3', 'quiz4', 'quiz5', 'quiz6'];
const TEST_SLOTS: NumericScoreField[] = ['test1', 'test2', 'test3'];

const QuarterScoreLists = () => {
  const { state, dispatch } = useData();
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(state.currentQuarter || 1);
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Keep active tab aligned when the user switches Quarter from the top Header
  useEffect(() => {
    if (state.currentQuarter && state.currentQuarter !== selectedQuarter) {
      setSelectedQuarter(state.currentQuarter);
    }
  }, [state.currentQuarter]);

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const settings = state.gradingSettings;

  const classStudents = useMemo(
    () => (state.currentClassId ? getClassRoster(state.students, state.currentClassId) : []),
    [state.students, state.currentClassId]
  );

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return classStudents;
    return classStudents.filter(
      s =>
        s.name.toLowerCase().includes(term) ||
        (s.nameKhmer || '').toLowerCase().includes(term) ||
        (s.group || '').toLowerCase().includes(term)
    );
  }, [classStudents, searchTerm]);

  const classQuarterScores = useMemo(
    () =>
      state.scores.filter(
        s =>
          (!s.classId || s.classId === state.currentClassId) &&
          Number(s.quarter) === Number(selectedQuarter)
      ),
    [state.scores, state.currentClassId, selectedQuarter]
  );

  const sheetInfoId = `${state.currentClassId || ''}-${selectedQuarter}`;
  const sheetInfo: QuarterSheetInfo = useMemo(() => {
    const existing = state.quarterSheetInfos?.find(i => i.id === sheetInfoId);
    if (existing) return existing;
    // Inherit teacherName or subject from another quarter in the same class if available
    const fallbackSameClass = state.quarterSheetInfos?.find(
      i => i.classId === state.currentClassId && (i.teacherName || i.subject)
    );
    return {
      id: sheetInfoId,
      classId: state.currentClassId || '',
      quarter: selectedQuarter,
      teacherName: fallbackSameClass?.teacherName || '',
      subject: fallbackSameClass?.subject || ''
    };
  }, [state.quarterSheetInfos, sheetInfoId, state.currentClassId, selectedQuarter]);

  const handleQuarterSelect = (q: Quarter) => {
    setSelectedQuarter(q);
    dispatch({ type: 'SET_CURRENT_QUARTER', payload: q });
  };

  const triggerSaveIndicator = () => {
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 450);
  };

  const handleInfoChange = (field: 'teacherName' | 'subject', value: string) => {
    if (!state.currentClassId) return;
    triggerSaveIndicator();
    dispatch({
      type: 'UPDATE_QUARTER_SHEET_INFO',
      payload: {
        ...sheetInfo,
        id: sheetInfoId,
        classId: state.currentClassId,
        quarter: selectedQuarter,
        [field]: value
      }
    });
  };

  const handleStudentFieldChange = (
    student: Student,
    field: 'nameKhmer' | 'sex' | 'group',
    value: string
  ) => {
    triggerSaveIndicator();
    const cleanStudent: Student & { displayNum?: number } = { ...student };
    delete cleanStudent.displayNum;
    dispatch({
      type: 'UPDATE_STUDENT',
      payload: {
        ...cleanStudent,
        [field]: value
      }
    });
  };

  const handleScoreChange = (
    studentId: string,
    field: NumericScoreField,
    rawVal: string,
    maxScore: number
  ) => {
    if (!state.currentClassId) return;

    let parsed: number | undefined;
    if (rawVal.trim() !== '') {
      const num = Number(rawVal);
      if (isNaN(num)) return;
      if (num < 0 || num > maxScore) {
        alert(`Invalid score! Score must be between 0 and ${maxScore}.`);
        return;
      }
      parsed = num;
    }

    triggerSaveIndicator();

    const existing = state.scores.find(
      s =>
        s.studentId === studentId &&
        (!s.classId || s.classId === state.currentClassId) &&
        Number(s.quarter) === Number(selectedQuarter)
    );

    const updatedRecord: ScoreRecord = existing
      ? {
          ...existing,
          classId: state.currentClassId,
          quarter: selectedQuarter,
          [field]: parsed
        }
      : {
          id: `${studentId}-${selectedQuarter}`,
          studentId,
          classId: state.currentClassId,
          quarter: selectedQuarter,
          [field]: parsed
        };

    dispatch({ type: 'UPDATE_SCORE', payload: updatedRecord });
  };

  const handleExportExcel = async () => {
    if (!currentClass) return;
    await exportQuarterScoreSheet({
      students: classStudents,
      scores: state.scores,
      records: state.records,
      classObj: currentClass,
      quarter: selectedQuarter,
      settings,
      teacherName: sheetInfo.teacherName || '',
      subject: sheetInfo.subject || ''
    });
  };

  const handleExportAllQuarters = async () => {
    if (!currentClass) return;
    await exportAllQuartersScoreSheet({
      students: classStudents,
      scores: state.scores,
      records: state.records,
      classObj: currentClass,
      settings,
      quarterSheetInfos: state.quarterSheetInfos || []
    });
  };

  const handleExportPdf = async () => {
    if (!currentClass || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportQuarterScoreSheetPdf({
        students: classStudents,
        scores: state.scores,
        records: state.records,
        classObj: currentClass,
        quarter: selectedQuarter,
        settings,
        teacherName: sheetInfo.teacherName || '',
        subject: sheetInfo.subject || ''
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!state.currentClassId || !currentClass) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class from the header to view the Quarter Score Lists.
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 pb-12 print:pb-0">
      {/* Print orientation & spinner suppression rules */}
      <style>{`
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 7mm;
          }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Screen Toolbar */}
      <div className="print:hidden space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Quarter Score Lists — {currentClass.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Official score sheet with automatic student sync across Quarters 1–4.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
              title={`Export Quarter ${selectedQuarter} score sheet to Excel`}
            >
              <Download size={16} /> Export Excel (Q{selectedQuarter})
            </button>
            <button
              type="button"
              onClick={handleExportAllQuarters}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
              title="Export Quarters 1–4 into one Excel workbook"
            >
              <Download size={16} /> Export All (Q1–Q4)
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
              title={`Download Quarter ${selectedQuarter} score sheet as PDF`}
            >
              <Download size={16} /> {isExportingPdf ? 'Generating PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        {/* Quarter Tabs + Search + Options Bar */}
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {([1, 2, 3, 4] as Quarter[]).map(q => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuarterSelect(q)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  selectedQuarter === q
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Quarter {q}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search student / group..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 min-w-[70px] justify-end">
              {saveStatus === 'saving' ? (
                <>
                  <RefreshCw size={12} className="animate-spin text-indigo-600" /> Saving...
                </>
              ) : (
                <>
                  <Save size={12} className="text-emerald-600" /> Saved
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Printable Official WIS Score Sheet */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4 sm:p-6 print:p-0 print:border-none print:shadow-none print:rounded-none overflow-x-auto print:overflow-visible">
        <div className="min-w-[960px] print:min-w-0 w-full text-black">
          {/* Sheet Top Header matching WIS Reference */}
          <div className="flex justify-between items-start gap-6 mb-3">
            {/* Left: Official Western International School Crest & Registrar Branding */}
            <div className="flex flex-col items-center text-center leading-tight pl-2">
              <svg
                viewBox="0 0 200 180"
                className="w-24 h-[86px] mb-0.5"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Western International School Logo"
              >
                <defs>
                  <clipPath id="wis-flag-w">
                    <path d="M54 76 L72 76 L82 117 L93 76 L108 76 L119 117 L129 76 L147 76 L130 140 L110 140 L100 104 L90 140 L70 140 Z" />
                  </clipPath>
                </defs>

                {/* Stylized Flag W */}
                <g clipPath="url(#wis-flag-w)">
                  <rect x="50" y="74" width="102" height="68" fill="#FFFFFF" />
                  <rect x="50" y="76" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="86" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="96" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="106" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="116" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="126" width="102" height="5" fill="#D92027" />
                  <rect x="50" y="135" width="102" height="5" fill="#D92027" />
                  {/* Blue Canton */}
                  <rect x="50" y="74" width="49" height="40" fill="#172A58" />
                  {/* White Stars in Canton */}
                  <g fill="#FFFFFF">
                    <circle cx="60" cy="83" r="1.5" />
                    <circle cx="70" cy="83" r="1.5" />
                    <circle cx="80" cy="83" r="1.5" />
                    <circle cx="90" cy="83" r="1.5" />
                    <circle cx="65" cy="90" r="1.5" />
                    <circle cx="75" cy="90" r="1.5" />
                    <circle cx="85" cy="90" r="1.5" />
                    <circle cx="60" cy="97" r="1.5" />
                    <circle cx="70" cy="97" r="1.5" />
                    <circle cx="80" cy="97" r="1.5" />
                    <circle cx="90" cy="97" r="1.5" />
                    <circle cx="65" cy="104" r="1.5" />
                    <circle cx="75" cy="104" r="1.5" />
                    <circle cx="85" cy="104" r="1.5" />
                    <circle cx="70" cy="110" r="1.5" />
                    <circle cx="80" cy="110" r="1.5" />
                    <circle cx="90" cy="110" r="1.5" />
                  </g>
                </g>

                {/* Graduation Cap */}
                <path
                  d="M49 52 L48 73 C48 77 72 86 100 86 C128 86 152 77 152 73 L151 52 Z"
                  fill="#0F1115"
                />
                <path
                  d="M100 13 L172 39 C177 41 177 44 172 46 L100 72 L28 46 C23 44 23 41 28 39 Z"
                  fill="#0F1115"
                />
                <polygon points="100,19 161,41.5 100,65 39,41.5" fill="#475055" />
                <circle cx="102" cy="40" r="3.2" fill="#181A1E" />
                <path
                  d="M102 40 L155 47 C162 48 165 53 165 62"
                  stroke="#D92027"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
                <rect x="160" y="61" width="10" height="3.2" rx="1.4" fill="#F2D024" />
                <path
                  d="M161 64 L156 95 L159.5 95 L163 67 L163 95 L166.5 95 L166 67 L169.5 95 L173 95 L168 64 Z"
                  fill="#D92027"
                />

                {/* Navy Scalloped Banner */}
                <path
                  d="M48 140 L152 140 C152 145 155 147 160 147 L160 158 L40 158 L40 147 C45 147 48 145 48 140 Z"
                  fill="#172A58"
                />
                <text
                  x="100"
                  y="153.5"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily="Georgia, 'Times New Roman', serif"
                  fontSize="14.5"
                  fontWeight="700"
                  letterSpacing="1"
                >
                  WESTERN
                </text>
                <text
                  x="100"
                  y="171"
                  textAnchor="middle"
                  fill="#172A58"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontSize="9.6"
                  fontWeight="800"
                  letterSpacing="0.4"
                >
                  INTERNATIONAL SCHOOL
                </text>
              </svg>
              <div className="text-xs font-bold tracking-tight">សាលាវ៉េស្ទើនអន្តរជាតិ</div>
              <div className="text-[11px] font-bold mt-0.5">Registrar&apos;s Office</div>
              <div className="text-[10px] font-bold">STD</div>
            </div>

            {/* Right: Solid Black Title Banner + Teacher / Subject / Grade / Quarter */}
            <div className="w-[390px] sm:w-[440px] shrink-0 pt-2">
              <div className="bg-black text-white font-bold text-center py-1 px-4 text-sm tracking-wide">
                តារាងសម្រង់ពិន្ទុ / Score List
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold w-28 shrink-0">Teacher Name</span>
                  <input
                    type="text"
                    value={sheetInfo.teacherName || ''}
                    onChange={e => handleInfoChange('teacherName', e.target.value)}
                    placeholder="Enter Teacher Name..."
                    className="flex-1 bg-transparent border-b border-dotted border-gray-400 focus:border-black outline-none font-bold text-gray-900 px-1 py-0.5 print:border-none print:placeholder-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold w-28 shrink-0">Subject</span>
                  <input
                    type="text"
                    value={sheetInfo.subject || ''}
                    onChange={e => handleInfoChange('subject', e.target.value)}
                    placeholder="Enter Subject..."
                    className="flex-1 bg-transparent border-b border-dotted border-gray-400 focus:border-black outline-none font-bold text-gray-900 px-1 py-0.5 print:border-none print:placeholder-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="font-semibold w-28 shrink-0">Grade</span>
                  <span className="font-bold w-24 text-center">{currentClass.name}</span>
                  <span className="font-semibold ml-2">For :</span>
                  <span className="font-bold ml-2">Quarter {selectedQuarter}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Official Score Grid Table */}
          <table className="w-full table-fixed border-collapse border-[1.5px] border-black text-[11px]">
            <thead>
              <tr className="bg-[#f3f4f6] print:bg-[#f3f4f6]">
                <th rowSpan={2} className="border border-black px-1 py-1 text-center font-bold w-8">
                  N°
                </th>
                <th rowSpan={2} className="border border-black px-2 py-1 text-center font-bold w-[185px]">
                  Name
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-2 py-1 text-center font-bold w-[150px]"
                  style={{ fontFamily: "'Khmer OS Battambang', 'Khmer OS Siemreap', 'Leelawadee UI', 'Noto Sans Khmer', sans-serif" }}
                >
                  ឈ្មោះ
                </th>
                <th rowSpan={2} className="border border-black px-0.5 py-1 text-center font-bold w-8 align-bottom">
                  <div className="flex flex-col items-center justify-end gap-1">
                    <span style={{ writingMode: 'vertical-rl' }} className="leading-none text-[10px]">
                      Sex
                    </span>
                    <span className="text-[9px] leading-none">ភេទ</span>
                  </div>
                </th>
                <th rowSpan={2} className="border border-black px-0.5 py-1 text-center font-bold w-8 align-bottom">
                  <div className="flex flex-col items-center justify-end gap-1">
                    <span style={{ writingMode: 'vertical-rl' }} className="leading-none text-[10px]">
                      Group
                    </span>
                    <span className="text-[9px] leading-none">ក្រុម</span>
                  </div>
                </th>
                <th rowSpan={2} className="border border-black px-0.5 py-1 text-center font-bold w-8">
                  <span style={{ writingMode: 'vertical-rl' }} className="leading-none inline-block">
                    Conduct
                  </span>
                </th>
                <th rowSpan={2} className="border border-black px-0.5 py-1 text-center font-bold w-8">
                  <span style={{ writingMode: 'vertical-rl' }} className="leading-none inline-block">
                    C.P.
                  </span>
                </th>
                <th colSpan={6} className="border border-black px-2 py-1 text-center font-bold">
                  កិច្ចការផ្ទះ / Homework
                </th>
                <th colSpan={6} className="border border-black px-2 py-1 text-center font-bold">
                  តេស្តខ្លី / Quizzes
                </th>
                <th colSpan={3} className="border border-black px-1.5 py-1 text-center font-bold leading-tight">
                  Monthly Test
                  <br />
                  តេស្តប្រចាំខែ
                </th>
              </tr>
              <tr className="bg-gray-100/80 print:bg-gray-100">
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <th key={`hw-hdr-${num}`} className="border border-black py-0.5 text-center font-bold w-9">
                    {num}
                  </th>
                ))}
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <th key={`qz-hdr-${num}`} className="border border-black py-0.5 text-center font-bold w-9">
                    {num}
                  </th>
                ))}
                {[1, 2, 3].map(num => (
                  <th key={`mt-hdr-${num}`} className="border border-black py-0.5 text-center font-bold w-10">
                    {num}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => {
                const score = classQuarterScores.find(s => s.studentId === student.id);
                const rawCp = getStudentQuarterTotal(state.records, student.id, selectedQuarter);
                const cappedRawCp = Math.min(rawCp, settings.maxScores.cp);
                const cpValue =
                  score?.cpScore !== undefined
                    ? score.cpScore
                    : rawCp > 0
                    ? cappedRawCp
                    : '';
                const sexValue = student.sex || '';

                return (
                  <tr
                    key={student.id}
                    className={`h-7 transition-colors ${
                      idx % 2 === 0
                        ? 'bg-white hover:bg-gray-100/70 print:bg-white'
                        : 'bg-[#f2f2f2] hover:bg-gray-200/60 print:bg-[#f2f2f2]'
                    } print:hover:bg-inherit`}
                  >
                    <td className="border border-black px-1 py-0.5 text-center font-medium align-middle">
                      {student.displayNum}
                    </td>

                    <td className="border border-black px-2 py-0.5 font-medium text-left align-middle whitespace-nowrap overflow-hidden text-ellipsis">
                      {student.name}
                    </td>

                    <td className="border border-black px-1.5 py-0.5 align-middle">
                      <input
                        type="text"
                        value={student.nameKhmer || ''}
                        onChange={e => handleStudentFieldChange(student, 'nameKhmer', e.target.value)}
                        style={{ fontFamily: "'Khmer OS Battambang', 'Khmer OS Siemreap', 'Leelawadee UI', 'Noto Sans Khmer', sans-serif" }}
                        className="w-full bg-transparent outline-none focus:bg-blue-50/60 px-0.5 py-0 text-[11px] leading-tight text-left print:p-0"
                        placeholder="-"
                      />
                    </td>

                    <td className="border border-black px-0.5 py-0.5 text-center">
                      <select
                        value={sexValue}
                        onChange={e => handleStudentFieldChange(student, 'sex', e.target.value)}
                        className="w-full bg-transparent outline-none text-center font-medium appearance-none cursor-pointer focus:bg-blue-50/60"
                        aria-label={`Sex for ${student.name}`}
                      >
                        <option value="">-</option>
                        <option value="Male">M</option>
                        <option value="Female">F</option>
                      </select>
                    </td>

                    <td className="border border-black px-0.5 py-0.5 text-center">
                      <input
                        type="text"
                        value={student.group && student.group.trim() !== '' ? student.group : 'III'}
                        onChange={e => handleStudentFieldChange(student, 'group', e.target.value)}
                        className="w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0"
                        placeholder="III"
                        aria-label={`Group for ${student.name}`}
                      />
                    </td>

                    {/* Conduct */}
                    <td className="border border-black px-0.5 py-0.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={settings.maxScores.conduct}
                        value={score?.conduct ?? ''}
                        onChange={e =>
                          handleScoreChange(
                            student.id,
                            'conduct',
                            e.target.value,
                            settings.maxScores.conduct
                          )
                        }
                        className="no-spinner w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0"
                        aria-label={`Conduct for ${student.name}`}
                      />
                    </td>

                    {/* C.P. */}
                    <td className="border border-black px-0.5 py-0.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={settings.maxScores.cp}
                        value={cpValue}
                        onChange={e =>
                          handleScoreChange(
                            student.id,
                            'cpScore',
                            e.target.value,
                            settings.maxScores.cp
                          )
                        }
                        className={`no-spinner w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0 ${
                          score?.cpScore === undefined && rawCp > 0 ? 'text-gray-600 print:text-black' : ''
                        }`}
                        title={
                          score?.cpScore !== undefined
                            ? 'Edited C.P. score'
                            : `Auto-filled from Participation Tracker (${rawCp})`
                        }
                        aria-label={`CP for ${student.name}`}
                      />
                    </td>

                    {/* Homework 1-6 */}
                    {HW_SLOTS.map(slot => (
                      <td key={slot} className="border border-black px-0.5 py-0.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={settings.maxScores.hw}
                          value={score?.[slot] ?? ''}
                          onChange={e =>
                            handleScoreChange(
                              student.id,
                              slot,
                              e.target.value,
                              settings.maxScores.hw
                            )
                          }
                          className="no-spinner w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0"
                          aria-label={`${slot} for ${student.name}`}
                        />
                      </td>
                    ))}

                    {/* Quizzes 1-6 */}
                    {QUIZ_SLOTS.map(slot => (
                      <td key={slot} className="border border-black px-0.5 py-0.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={settings.maxScores.quiz}
                          value={score?.[slot] ?? ''}
                          onChange={e =>
                            handleScoreChange(
                              student.id,
                              slot,
                              e.target.value,
                              settings.maxScores.quiz
                            )
                          }
                          className="no-spinner w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0"
                          aria-label={`${slot} for ${student.name}`}
                        />
                      </td>
                    ))}

                    {/* Monthly Test 1-3 */}
                    {TEST_SLOTS.map(slot => (
                      <td key={slot} className="border border-black px-0.5 py-0.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={settings.maxScores.test}
                          value={score?.[slot] ?? ''}
                          onChange={e =>
                            handleScoreChange(
                              student.id,
                              slot,
                              e.target.value,
                              settings.maxScores.test
                            )
                          }
                          className="no-spinner w-full bg-transparent outline-none focus:bg-blue-50/60 text-center font-medium py-0.5 print:p-0"
                          aria-label={`${slot} for ${student.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td
                    colSpan={22}
                    className="border border-black p-6 text-center text-gray-500"
                  >
                    No students found in {currentClass.name}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QuarterScoreLists;
