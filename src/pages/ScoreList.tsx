import { useState } from 'react';
import { useData } from '../store/DataContext';
import { getClassRoster, getStudentQuarterTotal, calculateStudentGrades } from '../utils/calculations';
import { exportScoreList } from '../utils/export';
import { Download, Printer, Search, CheckCircle } from 'lucide-react';
import { ScoreRecord, Student } from '../types';

const ScoreList = () => {
  const { state, dispatch } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSex, setFilterSex] = useState<'All' | 'Male' | 'Female'>('All');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

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

  const classScores = state.scores.filter(s => s.classId === state.currentClassId && s.quarter === state.currentQuarter);
  
  displayStudents.forEach(student => {
    const score = state.scores.find(s => s.studentId === student.id && s.quarter === state.currentQuarter);
    const rawCp = getStudentQuarterTotal(state.records, student.id, state.currentQuarter!);
    const calculated = calculateStudentGrades(score, rawCp, settings, student.id, state.currentQuarter!, currentClass?.name || '', classScores);

    if (calculated.overallScore > highest) highest = calculated.overallScore;
    if (calculated.overallScore < lowest) lowest = calculated.overallScore;
    totalOverall += calculated.overallScore;
    
    // Simple completion check: if they have at least one test score or attitude filled
    if (score?.test1 !== undefined || score?.attitude) completedCount++;
  });

  const average = displayStudents.length > 0 ? (totalOverall / displayStudents.length).toFixed(2) : 0;
  if (highest === -1) highest = 0;
  if (lowest === 999) lowest = 0;

  const handleExport = () => {
    exportScoreList(state.students, state.scores, state.records, currentClass!, state.currentQuarter!, settings);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleScoreChange = (studentId: string, field: keyof ScoreRecord, value: string | number | undefined) => {
    setSaveStatus('saving');
    
    const existing = state.scores.find(s => s.studentId === studentId && s.quarter === state.currentQuarter);
    const updatedScore: ScoreRecord = existing ? { ...existing } : {
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


  const renderAutoTextInput = (studentId: string, score: ScoreRecord | undefined, field: keyof ScoreRecord, autoVal: string) => {
    const val = score?.[field] as string | undefined;
    return (
      <input 
        type="text" 
        className={`w-48 p-1 border-none bg-transparent hover:bg-gray-100 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded text-sm ${val !== undefined ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
        value={val !== undefined ? val : autoVal}
        onChange={(e) => handleScoreChange(studentId, field, e.target.value)}
        title={val !== undefined ? "Manual override active" : "Auto-generated feedback based on Overall Score"}
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
        
        <div className="flex gap-3">
          <button onClick={handlePrint} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-full font-semibold hover:bg-gray-50 shadow-sm transition-all active:scale-95">
            <Printer size={16} /> Print
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2 rounded-full font-semibold hover:from-emerald-600 hover:to-teal-600 shadow-md transition-all active:scale-95">
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
          <table className="w-full text-left border-collapse whitespace-nowrap text-sm print:text-xs">
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
                <th className="p-2 border-r">Achievement</th>
                <th className="p-2 border-r">Attitude</th>
                <th className="p-2">Areas to Improve</th>
              </tr>
            </thead>
            <tbody>
              {displayStudents.map((student) => {
                const score = state.scores.find(s => s.studentId === student.id && s.quarter === state.currentQuarter);
                const rawCp = getStudentQuarterTotal(state.records, student.id, state.currentQuarter!);
                const cappedRawCp = Math.min(rawCp, settings.maxScores.cp);
                const calculated = calculateStudentGrades(score, rawCp, settings, student.id, state.currentQuarter!, currentClass?.name || '', classScores);
                
                return (
                  <tr key={student.id} className="border-b border-gray-200 hover:bg-yellow-50 group print:break-inside-avoid">
                    {/* Sticky Columns */}
                    <td className="p-2 border-r bg-white group-hover:bg-yellow-50 sticky left-0 z-10 text-center text-gray-500 print:static">
                      {student.displayNum}
                    </td>
                    <td className="p-2 border-r bg-white group-hover:bg-yellow-50 sticky left-[40px] z-10 font-medium print:static">
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

                    {/* Auto-Generated Feedback */}
                    <td className="p-1 border-r">{renderAutoTextInput(student.id, score, 'achievement', calculated.autoAchievement)}</td>
                    <td className="p-1 border-r">{renderAutoTextInput(student.id, score, 'attitude', calculated.autoAttitude)}</td>
                    <td className="p-1">{renderAutoTextInput(student.id, score, 'areasToImprove', calculated.autoImprovement)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ScoreList;
