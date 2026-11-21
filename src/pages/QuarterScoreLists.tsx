import { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { Quarter, QuarterSheetInfo, ScoreRecord, Student } from '../types';
import { getClassRoster, getStudentQuarterTotal } from '../utils/calculations';
import { exportQuarterScoreSheet } from '../utils/export';
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
  const [showIdCol, setShowIdCol] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

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
        (s.studentId || '').toLowerCase().includes(term) ||
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
    field: 'nameKhmer' | 'sex' | 'group' | 'studentId',
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
      subject: sheetInfo.subject || '',
      includeStudentId: showIdCol
    });
  };

  const handlePrintOrPdf = () => {
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
            >
              <Download size={16} /> Export Excel
            </button>
            <button
              type="button"
              onClick={handlePrintOrPdf}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
            >
              <Download size={16} /> Export PDF
            </button>
            <button
              type="button"
              onClick={handlePrintOrPdf}
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
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showIdCol}
                onChange={e => setShowIdCol(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Show Student ID Column
            </label>

            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search student / ID / group..."
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
            {/* Left: School Crest & Registrar Branding */}
            <div className="flex flex-col items-center text-center leading-tight pl-2">
              <svg
                viewBox="0 0 120 72"
                className="w-20 h-12 text-black mb-0.5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Graduation Cap */}
                <polygon points="60,6 92,16 60,26 28,16" fill="currentColor" />
                <path d="M40 20V29C40 33 49 36 60 36C71 36 80 33 80 29V20" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.85" />
                <line x1="28" y1="16" x2="22" y2="30" stroke="currentColor" strokeWidth="2" />
                <circle cx="22" cy="31" r="2" fill="currentColor" />
                {/* Stylized Wings / Open Book */}
                <path d="M18 24L52 44H68L102 24" stroke="currentColor" strokeWidth="2.5" />
                <path d="M26 36C36 42 46 47 60 47C74 47 84 42 94 36" stroke="currentColor" strokeWidth="2.2" />
                <path d="M36 46L60 55L84 46" stroke="currentColor" strokeWidth="2" />
                <text
                  x="60"
                  y="68"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="12"
                  fontWeight="800"
                  letterSpacing="1"
                >
                  WESTERN
                </text>
              </svg>
              <div className="text-xs font-bold tracking-tight">សាលាវ៉េស្ទើនអន្តរជាតិ</div>
              <div className="text-[9px] font-bold tracking-wider uppercase">
                WESTERN INTERNATIONAL SCHOOL
              </div>
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
          <table className="w-full border-collapse border-[1.5px] border-black text-[11px]">
            <thead>
              <tr className="bg-gray-100/80 print:bg-gray-100">
                <th rowSpan={2} className="border border-black px-1.5 py-1 text-center font-bold w-8">
                  N°
                </th>
                <th rowSpan={2} className="border border-black px-2 py-1 text-center font-bold min-w-[145px]">
                  Name
                </th>
                <th rowSpan={2} className="border border-black px-2 py-1 text-center font-bold min-w-[120px]">
                  ឈ្មោះ
                </th>
                {showIdCol && (
                  <th rowSpan={2} className="border border-black px-1.5 py-1 text-center font-bold w-20">
                    ID
                  </th>
                )}
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
                    className={`hover:bg-amber-50/50 print:hover:bg-transparent ${
                      idx % 2 === 1 ? 'bg-gray-50/40 print:bg-transparent' : 'bg-white'
                    }`}
                  >
                    <td className="border border-black px-1 py-0.5 text-center font-medium">
                      {student.displayNum}
                    </td>

                    <td className="border border-black px-2 py-0.5 font-medium text-left">
                      <div className="leading-tight">{student.name}</div>
                      {!showIdCol && student.studentId && (
                        <div className="text-[9px] text-gray-400 font-mono print:hidden">
                          ID: {student.studentId}
                        </div>
                      )}
                    </td>

                    <td className="border border-black px-1 py-0.5">
                      <input
                        type="text"
                        value={student.nameKhmer || ''}
                        onChange={e => handleStudentFieldChange(student, 'nameKhmer', e.target.value)}
                        className="w-full bg-transparent outline-none focus:bg-blue-50/60 px-1 py-0.5 text-[11px] print:p-0"
                        placeholder="-"
                      />
                    </td>

                    {showIdCol && (
                      <td className="border border-black px-1 py-0.5 text-center font-mono">
                        <input
                          type="text"
                          value={student.studentId || ''}
                          onChange={e => handleStudentFieldChange(student, 'studentId', e.target.value)}
                          className="w-full bg-transparent outline-none focus:bg-blue-50/60 text-center text-[10px] py-0.5 print:p-0"
                          placeholder="-"
                        />
                      </td>
                    )}

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
                        value={student.group || ''}
                        onChange={e => handleStudentFieldChange(student, 'group', e.target.value)}
                        className="w-full bg-transparent outline-none focus:bg-blue-50/60 text-center py-0.5 print:p-0"
                        placeholder=""
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
                    colSpan={showIdCol ? 23 : 22}
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
