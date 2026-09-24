import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../store/DataContext';
import { SemesterExamRecord, SemesterExamInfo } from '../types';
import { getClassRoster } from '../utils/calculations';
import { Printer, Download, Save, Search, Settings as SettingsIcon, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

const SemesterExam = () => {
  const { state, dispatch } = useData();
  const [semester, setSemester] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const currentYear = state.academicYears.find(y => y.id === state.currentYearId);
  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = state.currentClassId ? getClassRoster(state.students, state.currentClassId) : [];

  const examInfoId = `${state.currentClassId}-${semester}`;
  const examInfo = state.examInfos?.find(e => e.id === examInfoId) || {
    id: examInfoId,
    classId: state.currentClassId || '',
    semester,
    examDate: new Date().toISOString().split('T')[0],
    examTime: '02:00 - 02:50 PM',
    subject: '',
    teacherName: '',
    roomNumber: ''
  };

  const handleInfoChange = (field: keyof SemesterExamInfo, value: string) => {
    dispatch({
      type: 'UPDATE_EXAM_INFO',
      payload: { ...examInfo, [field]: value }
    });
  };

  const handleScoreChange = (studentId: string, field: 'score' | 'seatNumber', value: string) => {
    setIsSaving(true);
    const recordId = `${studentId}-${semester}`;
    const existing = state.examRecords?.find(r => r.id === recordId);
    
    let parsedScore: number | null = null;
    if (field === 'score' && value !== '') {
      parsedScore = parseInt(value, 10);
      if (isNaN(parsedScore)) return;
      if (parsedScore < 0) parsedScore = 0;
      if (parsedScore > 100) parsedScore = 100;
    }

    const payload: SemesterExamRecord = existing ? {
      ...existing,
      [field]: field === 'score' ? (value === '' ? null : parsedScore) : value
    } : {
      id: recordId,
      studentId,
      classId: state.currentClassId!,
      semester,
      score: null,
      seatNumber: '',
      [field]: field === 'score' ? (value === '' ? null : parsedScore) : value
    };

    dispatch({ type: 'UPDATE_EXAM_RECORD', payload });
    
    setTimeout(() => setIsSaving(false), 500);
  };

  const filteredStudents = classStudents.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.studentId && s.studentId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const stats = useMemo(() => {
    let entered = 0;
    let sum = 0;
    let high = -1;
    let low = 101;
    let ranges = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '0-49': 0 };

    classStudents.forEach(s => {
      const recordId = `${s.id}-${semester}`;
      const r = state.examRecords?.find(x => x.id === recordId);
      if (r && r.score !== null && r.score !== undefined) {
        entered++;
        sum += r.score;
        if (r.score > high) high = r.score;
        if (r.score < low) low = r.score;

        if (r.score >= 90) ranges['90-100']++;
        else if (r.score >= 80) ranges['80-89']++;
        else if (r.score >= 70) ranges['70-79']++;
        else if (r.score >= 60) ranges['60-69']++;
        else if (r.score >= 50) ranges['50-59']++;
        else ranges['0-49']++;
      }
    });

    return {
      total: classStudents.length,
      entered,
      missing: classStudents.length - entered,
      high: high === -1 ? '-' : high,
      low: low === 101 ? '-' : low,
      avg: entered > 0 ? (sum / entered).toFixed(2) : '-',
      ranges
    };
  }, [classStudents, state.examRecords, semester]);

  const handleExportExcel = () => {
    if (!currentClass) return;
    const exportData = classStudents.map((s, index) => {
      const record = state.examRecords?.find(r => r.id === `${s.id}-${semester}`);
      return {
        'Nº': index + 1,
        'Seat Nº': record?.seatNumber || '',
        'Name': s.name,
        'Name in Khmer': '',
        'ID': s.studentId || '',
        'Gender': s.sex || '',
        'Group': '',
        'Grade': currentClass.name,
        'Room Nº': examInfo.roomNumber || '',
        'Score 100%': record?.score !== null && record?.score !== undefined ? record.score : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Sem ${semester} Exam`);
    XLSX.writeFile(wb, `Semester_${semester}_Exam_${currentClass.name}.xlsx`);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handlePrint = () => {
    window.print();
  };

  if (!state.currentClassId) {
    return <div className="p-8 text-center text-gray-500">Please select a Class to view the Semester Exam.</div>;
  }

  return (
    <div className="flex flex-col space-y-6 pb-12 print:pb-0">
      <div className="print:hidden">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 mb-6 drop-shadow-sm flex items-center justify-between">
          <span>Semester Exam</span>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm">
              <Download size={16} /> Excel
            </button>
            <button onClick={handleExportPDF} className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm">
              <Download size={16} /> PDF
            </button>
            <button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm">
              <Printer size={16} /> Print
            </button>
          </div>
        </h1>

        <div className="flex flex-wrap gap-6 items-center text-gray-700 bg-white/60 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/50 mb-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm uppercase tracking-wider text-indigo-900/60">Class:</span>
            <select 
              value={state.currentClassId || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_CLASS', payload: e.target.value || null })}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-1 cursor-pointer"
            >
              {state.classes.filter(c => c.academicYearId === state.currentYearId).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm uppercase tracking-wider text-indigo-900/60">Semester:</span>
            <select 
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-1 cursor-pointer"
            >
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </div>

          <div className="flex-1"></div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 border-b-2 border-indigo-100 bg-transparent focus:border-indigo-500 focus:outline-none text-sm w-48 font-medium transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-gray-400">
            {isSaving ? (
              <><RefreshCw size={12} className="animate-spin text-indigo-500" /> Saving...</>
            ) : (
              <><Save size={12} className="text-emerald-500" /> Saved</>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:hidden">
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Exam Date</label>
            <input type="date" value={examInfo.examDate} onChange={e => handleInfoChange('examDate', e.target.value)} className="w-full border-b border-gray-200 focus:border-indigo-500 outline-none py-1 font-semibold text-gray-800" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Time</label>
            <input type="text" value={examInfo.examTime} onChange={e => handleInfoChange('examTime', e.target.value)} className="w-full border-b border-gray-200 focus:border-indigo-500 outline-none py-1 font-semibold text-gray-800" placeholder="e.g. 02:00 - 02:50 PM" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Subject</label>
            <input type="text" value={examInfo.subject} onChange={e => handleInfoChange('subject', e.target.value)} className="w-full border-b border-gray-200 focus:border-indigo-500 outline-none py-1 font-semibold text-gray-800" placeholder="Subject Name" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Teacher's Name</label>
            <input type="text" value={examInfo.teacherName} onChange={e => handleInfoChange('teacherName', e.target.value)} className="w-full border-b border-gray-200 focus:border-indigo-500 outline-none py-1 font-semibold text-gray-800" placeholder="Teacher Name" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Room Nº</label>
            <input type="text" value={examInfo.roomNumber} onChange={e => handleInfoChange('roomNumber', e.target.value)} className="w-full border-b border-gray-200 focus:border-indigo-500 outline-none py-1 font-semibold text-gray-800" placeholder="Room Number" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <p className="text-sm font-bold text-gray-500 uppercase">Exam Summary</p>
          <div className="flex justify-between items-end mt-2">
            <div>
              <p className="text-xs text-gray-400 font-semibold">Average Score</p>
              <p className="text-3xl font-black text-indigo-600">{stats.avg}</p>
            </div>
            <div className="text-right text-xs font-semibold text-gray-500 space-y-0.5">
              <p>Total: {stats.total}</p>
              <p className="text-emerald-600">Entered: {stats.entered}</p>
              <p className="text-rose-500">Missing: {stats.missing}</p>
            </div>
          </div>
          <div className="mt-3 text-xs flex justify-between font-semibold text-gray-400">
            <span>High: {stats.high}</span>
            <span>Low: {stats.low}</span>
          </div>
        </div>
      </div>

      <div className="hidden print:block mb-8 text-center">
        <h2 className="text-xl font-bold uppercase tracking-wide mb-6">
          Score List for {semester === 1 ? 'First' : 'Second'} Semester Final Exam
        </h2>
        <div className="flex justify-between text-left text-sm font-semibold max-w-4xl mx-auto">
          <div className="space-y-1">
            <p><span className="inline-block w-24">Exam Date:</span> {examInfo.examDate}</p>
            <p><span className="inline-block w-24">Time:</span> {examInfo.examTime}</p>
            <p><span className="inline-block w-24">Subject:</span> {examInfo.subject}</p>
          </div>
          <div className="space-y-1">
            <p><span className="inline-block w-32">Grade:</span> {currentClass?.name}</p>
            <p><span className="inline-block w-32">Teacher's Name:</span> {examInfo.teacherName}</p>
            <p><span className="inline-block w-32">Room Nº:</span> {examInfo.roomNumber}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 print:shadow-none print:border-none print:rounded-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-indigo-50/50 text-indigo-900 text-xs uppercase tracking-wider font-bold border-b-2 border-indigo-100 print:bg-transparent print:border-b-2 print:border-black print:text-black">
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">Nº</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300 w-24">Seat Nº</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300 min-w-[150px]">Name</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300 min-w-[150px]">Name in Khmer</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">ID</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">Gender</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">Group</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">Grade</th>
                <th className="p-3 border-r border-indigo-50 print:border-gray-300">Room Nº</th>
                <th className="p-3 w-28 bg-indigo-100/50 text-indigo-800 print:bg-transparent print:text-black text-center">Score 100%</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredStudents.map((s, index) => {
                const globalIndex = classStudents.findIndex(st => st.id === s.id) + 1;
                const recordId = `${s.id}-${semester}`;
                const r = state.examRecords?.find(x => x.id === recordId);

                return (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors print:border-gray-300">
                    <td className="p-3 font-medium text-gray-500 border-r border-gray-50 print:border-gray-300 print:text-black">{globalIndex}</td>
                    <td className="p-2 border-r border-gray-50 print:border-gray-300">
                      <input 
                        type="text" 
                        value={r?.seatNumber || ''} 
                        onChange={(e) => handleScoreChange(s.id, 'seatNumber', e.target.value)}
                        className="w-full bg-transparent border border-transparent focus:border-indigo-300 focus:bg-white rounded px-2 py-1 outline-none text-center font-semibold text-gray-700 print:border-none print:p-0 print:text-black"
                      />
                    </td>
                    <td className="p-3 font-bold text-gray-800 border-r border-gray-50 print:border-gray-300 print:text-black">{s.name}</td>
                    <td className="p-3 text-gray-400 border-r border-gray-50 print:border-gray-300 print:text-black"></td>
                    <td className="p-3 text-gray-500 font-medium border-r border-gray-50 print:border-gray-300 print:text-black">{s.studentId}</td>
                    <td className="p-3 text-gray-600 border-r border-gray-50 print:border-gray-300 print:text-black">{s.sex}</td>
                    <td className="p-3 text-gray-400 border-r border-gray-50 print:border-gray-300 print:text-black"></td>
                    <td className="p-3 text-gray-600 border-r border-gray-50 print:border-gray-300 print:text-black">{currentClass?.name}</td>
                    <td className="p-3 text-gray-500 text-center border-r border-gray-50 print:border-gray-300 print:text-black">{examInfo.roomNumber}</td>
                    <td className="p-2 bg-indigo-50/30 print:bg-transparent">
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={r?.score !== null && r?.score !== undefined ? r.score : ''}
                        onChange={(e) => handleScoreChange(s.id, 'score', e.target.value)}
                        className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 outline-none text-center font-bold text-indigo-700 print:border-none print:bg-transparent print:p-0 print:text-black"
                        placeholder="-"
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500">No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
};

export default SemesterExam;
