import { useState } from 'react';
import { useData } from '../store/DataContext';
import { 
  getClassRoster, 
  getStudentQuarterTotal, 
  calculateStudentGrades,
  calculateClassRanks,
  getAchievementSuggestions,
  getAttitudeSuggestions,
  getAreasToImproveSuggestions
} from '../utils/calculations';
import { exportScoreList } from '../utils/export';
import { Download, Printer, Search, CheckCircle, Upload, Sparkles, RotateCcw, Check, ChevronDown } from 'lucide-react';
import { Quarter, ScoreRecord, Student } from '../types';
import { ExcelScoreImportModal } from '../components/ExcelScoreImportModal';

interface CommentCellProps {
  studentId: string;
  field: 'achievement' | 'attitude' | 'areasToImprove';
  label: string;
  value: string | undefined;
  autoValue: string;
  letterGrade: string;
  overallScore: number;
  suggestions: string[];
  minWidth?: string;
  openUpward?: boolean;
  onScoreChange: (studentId: string, field: keyof ScoreRecord, value: string | number | undefined) => void;
}

const CommentCell = ({
  studentId,
  field,
  label,
  value,
  autoValue,
  letterGrade,
  overallScore,
  suggestions,
  minWidth = "min-w-[280px]",
  openUpward = false,
  onScoreChange
}: CommentCellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const isCustom = value !== undefined && value !== '';
  const displayVal = isCustom ? value : autoValue;

  return (
    <div className={`relative flex items-center gap-1 ${minWidth}`}>
      <input 
        type="text" 
        list={`${field}-list-${studentId}`}
        className={`w-full p-1 border-none bg-transparent hover:bg-gray-100 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded text-xs ${isCustom ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
        value={displayVal}
        onChange={(e) => onScoreChange(studentId, field, e.target.value)}
        title={isCustom ? `Manual override active (click dropdown to choose suggestions)` : `Auto-generated ${label} feedback for Grade ${letterGrade}`}
      />

      <datalist id={`${field}-list-${studentId}`}>
        {suggestions.map((s, idx) => (
          <option key={idx} value={s} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded shrink-0 transition-colors print:hidden ${
          isOpen
            ? 'bg-indigo-100 text-indigo-700'
            : isCustom
              ? 'text-blue-600 hover:bg-blue-50'
              : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
        }`}
        title={`Select from ${suggestions.length} ${label} options for Grade ${letterGrade}`}
      >
        <Sparkles size={13} />
        <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className={`absolute ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 z-50 w-[310px] bg-white border border-gray-200 rounded-lg shadow-xl p-2.5 text-left`}>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  letterGrade.startsWith('A') ? 'bg-emerald-100 text-emerald-800' :
                  letterGrade.startsWith('B') ? 'bg-blue-100 text-blue-800' :
                  letterGrade.startsWith('C') ? 'bg-amber-100 text-amber-800' :
                  letterGrade.startsWith('D') ? 'bg-orange-100 text-orange-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  Grade {letterGrade}
                </span>
                <span className="text-xs font-semibold text-gray-700">{label} ({overallScore}%)</span>
              </div>
              {isCustom && (
                <button
                  type="button"
                  onClick={() => {
                    onScoreChange(studentId, field, '');
                    setIsOpen(false);
                  }}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium hover:underline"
                  title="Revert to auto-selected suggestion"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              )}
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto pr-0.5">
              {suggestions.map((suggestion, idx) => {
                const isSelected = displayVal === suggestion;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onScoreChange(studentId, field, suggestion);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-all border flex items-center gap-2 ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-medium shadow-sm'
                        : 'bg-gray-50/70 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <span className="shrink-0 text-indigo-500">
                      {isSelected ? <Check size={13} className="stroke-[2.5]" /> : <span className="inline-block w-3.5 text-center text-gray-400 font-mono text-[10px]">{idx + 1}</span>}
                    </span>
                    <span className="leading-snug">{suggestion}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="mt-2 pt-1.5 border-t border-gray-100 text-[10px] text-gray-500 flex justify-between items-center">
              <span>{suggestions.length} options • Click to apply or type in cell</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const ScoreList = () => {
  const { state, dispatch } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSex, setFilterSex] = useState<'All' | 'Male' | 'Female'>('All');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [lockedImportTarget, setLockedImportTarget] = useState<{
    classId: string;
    className: string;
    quarter: Quarter;
  } | null>(null);

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter from the header to view the Score List.
      </div>
    );
  }

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = getClassRoster(state.students, state.currentClassId);
  const settings = state.gradingSettings;

  let displayStudents = classStudents;
  if (searchTerm) {
    displayStudents = displayStudents.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  if (filterSex !== 'All') {
    displayStudents = displayStudents.filter(s => s.sex === filterSex);
  }

  // Calculate dashboard stats
  let totalOverall = 0;
  let highest = -1;
  let lowest = 999;
  let completedCount = 0;

  const classScores = state.scores.filter(
    s => (!s.classId || s.classId === state.currentClassId) && Number(s.quarter) === Number(state.currentQuarter)
  );

  // Precompute student grades and class rank across the full class roster for this quarter
  const classGradeMap = new Map(
    classStudents.map(student => {
      const score = classScores.find(s => s.studentId === student.id);
      const rawCp = getStudentQuarterTotal(state.records, student.id, state.currentQuarter!);
      const cappedRawCp = Math.min(rawCp, settings.maxScores.cp);
      const calculated = calculateStudentGrades(score, rawCp, settings, student.id, state.currentQuarter!, currentClass?.name || '', classScores);
      return [student.id, { score, rawCp, cappedRawCp, calculated }] as const;
    })
  );

  const classRankMap = calculateClassRanks(
    classStudents.map(student => ({
      studentId: student.id,
      overallScore: classGradeMap.get(student.id)!.calculated.overallScore
    }))
  );

  displayStudents.forEach(student => {
    const { score, calculated } = classGradeMap.get(student.id)!;

    if (calculated.overallScore > highest) highest = calculated.overallScore;
    if (calculated.overallScore < lowest) lowest = calculated.overallScore;
    totalOverall += calculated.overallScore;
    
    // Simple completion check: if they have at least one test score or attitude filled
    if (score?.test1 !== undefined || score?.attitude) completedCount++;
  });

  const average = displayStudents.length > 0 ? (totalOverall / displayStudents.length).toFixed(2) : 0;
  if (highest === -1) highest = 0;
  if (lowest === 999) lowest = 0;

  const handleExport = async () => {
    await exportScoreList(state.students, state.scores, state.records, currentClass!, state.currentQuarter!, settings);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleScoreChange = (studentId: string, field: keyof ScoreRecord, value: string | number | undefined) => {
    setSaveStatus('saving');
    
    const existing = state.scores.find(
      s =>
        s.studentId === studentId &&
        (!s.classId || s.classId === state.currentClassId) &&
        Number(s.quarter) === Number(state.currentQuarter)
    );
    const updatedScore: ScoreRecord = existing ? { ...existing, classId: state.currentClassId! } : {
      id: `${studentId}-${state.currentQuarter}`,
      studentId,
      classId: state.currentClassId!,
      quarter: state.currentQuarter!
    };

    // If it's a number field, parse it
    if (typeof value === 'string' && value === '') {
       delete (updatedScore as any)[field];
    } else if (['conduct', 'cpScore', 'hw1', 'hw2', 'hw3', 'quiz1', 'quiz2', 'quiz3', 'test1', 'test2'].includes(field)) {
      (updatedScore as any)[field] = Number(value);
    } else {
      (updatedScore as any)[field] = value;
    }

    dispatch({ type: 'UPDATE_SCORE', payload: updatedScore });
    
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  const handleSexChange = (student: Student, sex: 'Male' | 'Female') => {
    dispatch({ type: 'UPDATE_STUDENT', payload: { ...student, sex } });
  };

  // Cell rendering helpers
  const renderNumberInput = (studentId: string, score: ScoreRecord | undefined, field: keyof ScoreRecord, max: number) => {
    const val = score?.[field];
    return (
      <input 
        type="number" 
        min="0" max={max}
        className="w-16 p-1 text-center border-none bg-transparent hover:bg-gray-100 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
        value={val === undefined ? '' : val}
        onChange={(e) => {
          const stringVal = e.target.value;
          if (stringVal !== '') {
            const numericVal = Number(stringVal);
            if (numericVal > max || numericVal < 0) {
              alert(`Invalid score! You cannot input more than ${max} points.`);
              return;
            }
          }
          handleScoreChange(studentId, field, stringVal);
        }}
        placeholder="-"
      />
    );
  };

  return (
    <div className="space-y-4 print:space-y-2 flex flex-col h-full">
      <div className="flex justify-between items-center print:hidden mb-2">
        <div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-800 to-purple-600 drop-shadow-sm">
            Score List - {currentClass?.name} <span className="text-indigo-400 font-bold">(Q{state.currentQuarter})</span>
          </h2>
          <div className="text-sm text-gray-500 flex items-center gap-2 mt-2">
            {saveStatus === 'saving' ? (
              <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">Saving...</span>
            ) : (
              <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1 font-medium"><CheckCircle size={14}/> All changes saved</span>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          <button 
            onClick={() => {
              if (!state.currentClassId || !currentClass || !state.currentQuarter) return;
              setLockedImportTarget({
                classId: currentClass.id,
                className: currentClass.name,
                quarter: state.currentQuarter
              });
              setImportModalOpen(true);
            }} 
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-full font-semibold hover:from-indigo-700 hover:to-purple-700 shadow-md transition-all active:scale-95 text-sm"
            title="Upload and automatically extract scores from an Excel file for this class"
          >
            <Upload size={16} /> Upload Excel Scores
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-full font-semibold hover:bg-gray-50 shadow-sm transition-all active:scale-95 text-sm">
            <Printer size={16} /> Print
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2 rounded-full font-semibold hover:from-emerald-600 hover:to-teal-600 shadow-md transition-all active:scale-95 text-sm">
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">Academic Score List</h1>
        <p>Class: {currentClass?.name} | Quarter: {state.currentQuarter} | Year: {state.academicYears.find(y => y.id === state.currentYearId)?.name}</p>
      </div>

      <div className="grid grid-cols-4 md:grid-cols-5 gap-3 print:hidden">
        <div className="bg-white p-3 rounded shadow-sm border text-center">
          <div className="text-xs text-gray-500">Students</div>
          <div className="text-lg font-bold">{classStudents.length}</div>
        </div>
        <div className="bg-white p-3 rounded shadow-sm border text-center">
          <div className="text-xs text-gray-500">Class Average</div>
          <div className="text-lg font-bold text-blue-600">{average}</div>
        </div>
        <div className="bg-white p-3 rounded shadow-sm border text-center">
          <div className="text-xs text-gray-500">Highest Score</div>
          <div className="text-lg font-bold text-green-600">{highest}</div>
        </div>
        <div className="bg-white p-3 rounded shadow-sm border text-center">
          <div className="text-xs text-gray-500">Lowest Score</div>
          <div className="text-lg font-bold text-red-600">{lowest}</div>
        </div>
        <div className="bg-white p-3 rounded shadow-sm border text-center hidden md:block">
          <div className="text-xs text-gray-500">Completed</div>
          <div className="text-lg font-bold">{completedCount} / {classStudents.length}</div>
        </div>
      </div>

      <div className="flex gap-4 items-center bg-white p-2 rounded shadow-sm border print:hidden">
        <div className="relative">
          <Search className="absolute left-2 top-2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search student..." 
            className="pl-8 pr-3 py-1.5 border rounded text-sm w-48"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600">Sex:</label>
          <select value={filterSex} onChange={e => setFilterSex(e.target.value as any)} className="border rounded px-2 py-1.5">
            <option value="All">All</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
      </div>

      {/* Spreadsheet Table Container */}
      <div className="bg-white rounded shadow-sm border flex-1 overflow-hidden flex flex-col relative print:border-none print:shadow-none print:block print:overflow-visible">
        <div className="overflow-auto flex-1 h-[600px] print:h-auto print:overflow-visible">
          <table id="score-table-view" className="w-full text-left border-collapse whitespace-nowrap text-sm print:text-xs">
            <thead className="bg-gray-100 sticky top-0 z-20 print:static shadow-sm">
              <tr className="border-b border-gray-300">
                <th className="p-2 border-r bg-gray-100 sticky left-0 z-30 min-w-[40px] text-center print:static">No.</th>
                <th className="p-2 border-r bg-gray-100 sticky left-[40px] z-30 min-w-[180px] print:static">Name</th>
                <th className="p-2 border-r bg-gray-100 text-center min-w-[80px]">Sex</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.conduct}`}>Conduct<br/><span className="text-xs text-gray-500 font-normal">/{settings.maxScores.conduct}</span></th>
                <th className="p-2 border-r text-center bg-blue-50" title="Class Participation (Auto-filled but editable)">C.P<br/><span className="text-xs text-gray-500 font-normal">/{settings.maxScores.cp}</span></th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.hw}`}>HW1</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.hw}`}>HW2</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.hw}`}>HW3</th>
                <th className="p-2 border-r text-center bg-gray-50 font-bold">HW Total</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.quiz}`}>Qz1</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.quiz}`}>Qz2</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.quiz}`}>Qz3</th>
                <th className="p-2 border-r text-center bg-gray-50 font-bold">Qz Total</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.test}`}>Test1</th>
                <th className="p-2 border-r text-center" title={`Max ${settings.maxScores.test}`}>Test2</th>
                <th className="p-2 border-r text-center bg-gray-50 font-bold">Test Total</th>
                <th className="p-2 border-r text-center bg-indigo-50 font-bold text-indigo-900">Overall</th>
                <th className="p-2 border-r text-center bg-indigo-50 font-bold text-indigo-900">Grade</th>
                <th className="p-2 border-r text-center bg-indigo-50 font-bold text-indigo-900">Rank</th>
                <th className="p-2 border-r min-w-[300px]">Achievement</th>
                <th className="p-2 border-r min-w-[280px]">Attitude</th>
                <th className="p-2 min-w-[300px]">Areas to Improve</th>
              </tr>
            </thead>
            <tbody>
              {displayStudents.map((student, index) => {
                const { score, rawCp, cappedRawCp, calculated } = classGradeMap.get(student.id)!;
                const rank = classRankMap[student.id];
                
                return (
                  <tr 
                    key={student.id} 
                    className={`border-b border-gray-300 transition-colors ${
                      index % 2 === 0 ? 'bg-white hover:bg-amber-50/60' : 'bg-[#f2f2f2] hover:bg-amber-100/60'
                    } group print:break-inside-avoid`}
                  >
                    {/* Sticky Columns matching alternating row background */}
                    <td className={`p-2 border-r ${index % 2 === 0 ? 'bg-white' : 'bg-[#f2f2f2]'} group-hover:bg-amber-100/60 sticky left-0 z-10 text-center text-gray-500 print:static`}>
                      {student.displayNum}
                    </td>
                    <td className={`p-2 border-r ${index % 2 === 0 ? 'bg-white' : 'bg-[#f2f2f2]'} group-hover:bg-amber-100/60 sticky left-[40px] z-10 font-medium print:static`}>
                      {student.name}
                    </td>
                    
                    {/* Sex */}
                    <td className="p-1 border-r text-center">
                      <select 
                        className="w-full p-1 border-none bg-transparent hover:bg-gray-100 rounded text-sm text-center"
                        value={student.sex || ''}
                        onChange={(e) => handleSexChange(student, e.target.value as any)}
                      >
                        <option value=""></option>
                        <option value="Male">M</option>
                        <option value="Female">F</option>
                      </select>
                    </td>

                    {/* Numeric Scores */}
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'conduct', settings.maxScores.conduct)}</td>
                    
                    {/* C.P (Special styling because it falls back to raw tracker score) */}
                    <td className="p-1 border-r text-center bg-blue-50/30">
                      <input 
                        type="number" 
                        min="0" max={settings.maxScores.cp}
                        className={`w-16 p-1 text-center border-none bg-transparent hover:bg-blue-100 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded ${score?.cpScore !== undefined ? 'font-bold text-blue-800' : 'text-gray-500'}`}
                        value={score?.cpScore !== undefined ? score.cpScore : cappedRawCp}
                        onChange={(e) => {
                          const stringVal = e.target.value;
                          if (stringVal !== '') {
                            const numericVal = Number(stringVal);
                            if (numericVal > settings.maxScores.cp || numericVal < 0) {
                              alert(`Invalid score! You cannot input more than ${settings.maxScores.cp} points.`);
                              return;
                            }
                          }
                          handleScoreChange(student.id, 'cpScore', stringVal);
                        }}
                        title={score?.cpScore !== undefined ? "Manual Override Active" : `Auto-capped (Raw count: ${rawCp})`}
                      />
                    </td>

                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'hw1', settings.maxScores.hw)}</td>
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'hw2', settings.maxScores.hw)}</td>
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'hw3', settings.maxScores.hw)}</td>
                    <td className="p-2 border-r text-center bg-gray-50/50 font-medium text-gray-600">{calculated.hwTotal}</td>

                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'quiz1', settings.maxScores.quiz)}</td>
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'quiz2', settings.maxScores.quiz)}</td>
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'quiz3', settings.maxScores.quiz)}</td>
                    <td className="p-2 border-r text-center bg-gray-50/50 font-medium text-gray-600">{calculated.quizTotal}</td>

                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'test1', settings.maxScores.test)}</td>
                    <td className="p-1 border-r text-center">{renderNumberInput(student.id, score, 'test2', settings.maxScores.test)}</td>
                    <td className="p-2 border-r text-center bg-gray-50/50 font-medium text-gray-600">{calculated.testTotal}</td>

                    <td className="p-2 border-r text-center bg-indigo-50/50 font-bold text-indigo-700 text-lg">{calculated.overallScore}</td>
                    <td className="p-2 border-r text-center bg-indigo-50/50 font-bold text-lg">
                      <span className={`inline-block px-3 py-1 rounded-full text-white shadow-sm ${
                        ['A+', 'A', 'A-'].includes(calculated.letterGrade) ? 'bg-emerald-500' :
                        ['B+', 'B', 'B-'].includes(calculated.letterGrade) ? 'bg-blue-500' :
                        ['C+', 'C', 'C-'].includes(calculated.letterGrade) ? 'bg-amber-500' :
                        ['D+', 'D', 'D-'].includes(calculated.letterGrade) ? 'bg-orange-500' :
                        'bg-rose-500'
                      }`}>
                        {calculated.letterGrade}
                      </span>
                    </td>
                    <td className="p-2 border-r text-center bg-indigo-50/50 font-bold text-indigo-900">
                      <span
                        className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-sm font-bold ${
                          rank === 1
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : rank === 2
                              ? 'bg-slate-200 text-slate-800 border border-slate-300'
                              : rank === 3
                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                : 'bg-white text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {rank}
                      </span>
                    </td>

                    {/* Auto-Generated Feedback */}
                    <td className="p-1 border-r">
                      <CommentCell
                        studentId={student.id}
                        field="achievement"
                        label="Achievement"
                        value={score?.achievement}
                        autoValue={calculated.autoAchievement}
                        letterGrade={calculated.letterGrade}
                        overallScore={calculated.overallScore}
                        suggestions={getAchievementSuggestions(calculated.letterGrade)}
                        minWidth="min-w-[280px]"
                        openUpward={index >= 10 && index >= displayStudents.length - 5}
                        onScoreChange={handleScoreChange}
                      />
                    </td>
                    <td className="p-1 border-r">
                      <CommentCell
                        studentId={student.id}
                        field="attitude"
                        label="Attitude"
                        value={score?.attitude}
                        autoValue={calculated.autoAttitude}
                        letterGrade={calculated.letterGrade}
                        overallScore={calculated.overallScore}
                        suggestions={getAttitudeSuggestions(calculated.letterGrade)}
                        minWidth="min-w-[260px]"
                        openUpward={index >= 10 && index >= displayStudents.length - 5}
                        onScoreChange={handleScoreChange}
                      />
                    </td>
                    <td className="p-1">
                      <CommentCell
                        studentId={student.id}
                        field="areasToImprove"
                        label="Areas to Improve"
                        value={score?.areasToImprove}
                        autoValue={calculated.autoImprovement}
                        letterGrade={calculated.letterGrade}
                        overallScore={calculated.overallScore}
                        suggestions={getAreasToImproveSuggestions(calculated.letterGrade)}
                        minWidth="min-w-[280px]"
                        openUpward={index >= 10 && index >= displayStudents.length - 5}
                        onScoreChange={handleScoreChange}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excel Score Import Modal (strictly locked to the class & quarter where Upload was clicked) */}
      <ExcelScoreImportModal
        key={
          lockedImportTarget
            ? `${lockedImportTarget.classId}-${lockedImportTarget.quarter}`
            : `${state.currentClassId}-${state.currentQuarter}`
        }
        isOpen={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setLockedImportTarget(null);
        }}
        currentClassId={lockedImportTarget?.classId || state.currentClassId!}
        currentClassName={
          lockedImportTarget?.className ||
          state.classes.find(c => c.id === (lockedImportTarget?.classId || state.currentClassId))?.name ||
          'Class'
        }
        currentQuarter={lockedImportTarget?.quarter || state.currentQuarter!}
        classStudents={getClassRoster(state.students, lockedImportTarget?.classId || state.currentClassId!)}
      />
    </div>
  );
};

export default ScoreList;
