import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { getStudentSemesterOverall, getStudentAttendanceSemester, getStudentSemesterTotal, getAverageParticipation, getParticipationTier, getAttendanceAlertStatus } from '../utils/calculations';
import { generatePTCFeedback, generateStrengths, generateAreasToImprove } from '../utils/ptcGenerator';
import { PTCRecord } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Printer, RefreshCw, Save, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const PTCStudentReport = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useData();
  const semesterStr = searchParams.get('semester');
  const currentSemester = semesterStr === '2' ? 2 : 1;

  const student = state.students.find(s => s.id === id);
  const currentClass = state.classes.find(c => c.id === student?.classId);
  const currentYear = state.academicYears.find(y => y.id === currentClass?.academicYearId);

  const classStudents = currentClass ? state.students.filter(s => s.classId === currentClass.id) : [];

  // Calculate stats for S1 and S2
  const s1Stats = useMemo(() => {
    if (!student || !currentClass) return null;
    let totalPart = 0;
    classStudents.forEach(s => totalPart += getStudentSemesterTotal(state.records, s.id, 1));
    const avgPart = getAverageParticipation(totalPart, classStudents.length);
    const overall = getStudentSemesterOverall(student.id, currentClass.id, 1, state.scores, state.records, state.gradingSettings, currentClass.name);
    const attendance = getStudentAttendanceSemester(state.attendanceRecords, student.id, 1);
    const participation = getStudentSemesterTotal(state.records, student.id, 1);
    
    const attAlert = getAttendanceAlertStatus(attendance.unexcused, state.attendanceSettings);
    const attTier = (attAlert === 'Normal' ? 'Good' : (attAlert === 'Warning' ? 'Warning' : 'Alert')) as 'Good' | 'Warning' | 'Alert';
    const partTier = getParticipationTier(participation, avgPart);
    
    return { overall, attendance, participation, attTier, partTier };
  }, [student, currentClass, classStudents, state]);

  const s2Stats = useMemo(() => {
    if (!student || !currentClass) return null;
    let totalPart = 0;
    classStudents.forEach(s => totalPart += getStudentSemesterTotal(state.records, s.id, 2));
    const avgPart = getAverageParticipation(totalPart, classStudents.length);
    const overall = getStudentSemesterOverall(student.id, currentClass.id, 2, state.scores, state.records, state.gradingSettings, currentClass.name);
    const attendance = getStudentAttendanceSemester(state.attendanceRecords, student.id, 2);
    const participation = getStudentSemesterTotal(state.records, student.id, 2);
    
    const attAlert = getAttendanceAlertStatus(attendance.unexcused, state.attendanceSettings);
    const attTier = (attAlert === 'Normal' ? 'Good' : (attAlert === 'Warning' ? 'Warning' : 'Alert')) as 'Good' | 'Warning' | 'Alert';
    const partTier = getParticipationTier(participation, avgPart);
    
    return { overall, attendance, participation, attTier, partTier };
  }, [student, currentClass, classStudents, state]);

  const stats = currentSemester === 1 ? s1Stats : s2Stats;

  // Local state for the report
  const [comment, setComment] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [areasToImprove, setAreasToImprove] = useState<string[]>([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load or generate initial record
  useEffect(() => {
    if (!student || !stats || !currentClass) return;

    const existingRecord = state.ptcRecords.find(p => p.studentId === student.id && p.semester === currentSemester);
    if (existingRecord) {
      setComment(existingRecord.teacherComment);
      setStrengths(existingRecord.strengths);
      setAreasToImprove(existingRecord.areasToImprove);
    } else {
      handleRegenerate();
    }
  }, [student?.id, currentSemester]); // Only run when student or semester changes

  const handleRegenerate = () => {
    if (!student || !stats) return;
    
    const examRecord = state.examRecords?.find(r => r.id === `${student.id}-${currentSemester}`);

    const studentStats = {
      name: student.name,
      overallScore: stats.overall.overallScore,
      grade: stats.overall.letterGrade,
      hwTotal: stats.overall.hwTotal,
      quizTotal: stats.overall.quizTotal,
      testTotal: stats.overall.testTotal,
      participation: stats.participation,
      participationTier: stats.partTier,
      attendanceRate: stats.attendance.rate,
      unexcusedAbsences: stats.attendance.unexcused,
      attendanceTier: stats.attTier,
      examScore: examRecord?.score
    };

    const newComment = generatePTCFeedback(studentStats);
    const newStrengths = generateStrengths(studentStats);
    const newAreas = generateAreasToImprove(studentStats);
    
    setComment(newComment);
    setStrengths(newStrengths);
    setAreasToImprove(newAreas);
  };

  const handleSave = () => {
    if (!student || !currentClass) return;
    const existingRecord = state.ptcRecords.find(p => p.studentId === student.id && p.semester === currentSemester);
    
    const record: PTCRecord = {
      id: existingRecord ? existingRecord.id : uuidv4(),
      studentId: student.id,
      classId: currentClass.id,
      semester: currentSemester,
      teacherComment: comment,
      strengths,
      areasToImprove,
      lastUpdated: new Date().toISOString()
    };

    dispatch({ type: 'UPDATE_PTC_RECORD', payload: record });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  if (!student || !stats) {
    return <div className="p-8 text-center">Student not found or no data available.</div>;
  }

  // Comparison Chart Data
  const comparisonData = s1Stats && s2Stats ? [
    { name: 'Semester 1', score: s1Stats.overall.overallScore },
    { name: 'Semester 2', score: s2Stats.overall.overallScore },
  ] : [];

  return (
    <div className="flex flex-col h-full bg-gray-50/50 print:bg-white pb-10">
      {/* Non-printable Header Actions */}
      <div className="print:hidden mb-6 flex justify-between items-center">
        <button 
          onClick={() => navigate('/ptc')}
          className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-2"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>
        <button 
          onClick={() => window.print()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-transform hover:scale-105 active:scale-95"
        >
          <Printer size={18} /> Print PTC Report
        </button>
      </div>

      {/* Printable Report Container */}
      <div className="max-w-4xl mx-auto w-full bg-white print:shadow-none shadow-sm border border-gray-200 print:border-none p-8 sm:p-12 rounded-xl">
        
        {/* Header */}
        <div className="text-center mb-10 pb-6 border-b-2 border-gray-200">
          <h1 className="text-3xl font-black text-gray-900 mb-2 uppercase tracking-wide">Parent-Teacher Conference Report</h1>
          <p className="text-lg text-gray-600 font-semibold">{currentYear?.name} • Semester {currentSemester}</p>
        </div>

        <div className="grid grid-cols-2 mb-10 gap-8">
          <div>
            <p className="text-sm text-gray-500 uppercase font-bold tracking-wider mb-1">Student Name</p>
            <p className="text-2xl font-black text-gray-900">{student.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 uppercase font-bold tracking-wider mb-1">Class</p>
            <p className="text-2xl font-black text-indigo-600">{currentClass?.name}</p>
          </div>
        </div>

        {/* Performance Quick Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Academic</p>
            <div className="flex items-end justify-center gap-2">
              <span className={`text-4xl font-black ${
                stats.overall.letterGrade === 'A' ? 'text-emerald-600' :
                stats.overall.letterGrade === 'B' ? 'text-blue-600' :
                stats.overall.letterGrade === 'C' ? 'text-amber-500' :
                stats.overall.letterGrade === 'D' ? 'text-orange-500' : 'text-red-600'
              }`}>{stats.overall.letterGrade}</span>
              <span className="text-xl text-gray-600 font-bold mb-1">({stats.overall.overallScore}%)</span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center flex flex-col justify-center">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Attendance</p>
            <div className="flex justify-center gap-4 text-sm font-bold text-gray-700">
              <span className="text-emerald-600">P: {stats.attendance.present}</span>
              <span className="text-amber-500">E: {stats.attendance.excused}</span>
              <span className="text-rose-600">U: {stats.attendance.unexcused}</span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center flex flex-col justify-center">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Participation</p>
            <p className="text-2xl font-black text-pink-600">{stats.participation} <span className="text-sm text-gray-500 font-bold">points</span></p>
          </div>
        </div>

        {/* Semester Comparison (Only if viewing S2 and S1 data exists) */}
        {currentSemester === 2 && s1Stats && s2Stats && (
          <div className="mb-10">
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">Semester Comparison</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={80} tick={{fontWeight: 'bold', fill: '#4b5563'}} />
                    <Tooltip formatter={(val: number) => [`${val}%`, 'Score']} />
                    <Bar dataKey="score" fill="#6366f1" radius={[0, 4, 4, 0]} label={{ position: 'right', fontWeight: 'bold' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-gray-700 font-semibold mb-2">
                  Change in Score: {' '}
                  <span className={`font-black ${s2Stats.overall.overallScore >= s1Stats.overall.overallScore ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {(s2Stats.overall.overallScore - s1Stats.overall.overallScore).toFixed(2)}%
                  </span>
                </p>
                {s2Stats.overall.overallScore > s1Stats.overall.overallScore ? (
                  <p className="text-sm text-gray-600">The student has shown improvement this semester, reflecting increased understanding and effort. We encourage them to maintain this positive trajectory.</p>
                ) : (
                  <p className="text-sm text-gray-600">The student's performance has dipped slightly compared to last semester. We will work closely with them to identify areas of difficulty and provide additional support.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Strengths & Areas to Improve */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">Strengths</h3>
            <ul className="list-disc pl-5 space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="text-emerald-700 font-medium">{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">Areas to Improve</h3>
            <ul className="list-disc pl-5 space-y-2">
              {areasToImprove.map((s, i) => (
                <li key={i} className="text-rose-600 font-medium">{s}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Teacher Comment Section */}
        <div className="mb-16">
          <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-4">
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wider">Teacher's Comment</h3>
            
            <div className="print:hidden flex gap-2">
              <button 
                onClick={() => document.getElementById('comment-box')?.focus()}
                className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
              >
                Edit Comment
              </button>
              <button 
                onClick={handleRegenerate}
                className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={14} /> Regenerate
              </button>
              <button 
                onClick={handleSave}
                className={`text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors ${
                  savedSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {savedSuccess ? <Check size={14} /> : <Save size={14} />} 
                {savedSuccess ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
          
          <textarea
            id="comment-box"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 print:border-none print:resize-none print:p-0 print:h-auto font-medium text-gray-800 leading-relaxed text-justify resize-y"
            placeholder="Constructive feedback will appear here..."
          />
        </div>

        {/* Signatures (Only visible on Print) */}
        <div className="hidden print:flex justify-between mt-24 pt-8">
          <div className="w-1/3 text-center border-t border-gray-400 pt-2 font-bold text-gray-800">
            Teacher Signature
          </div>
          <div className="w-1/3 text-center border-t border-gray-400 pt-2 font-bold text-gray-800">
            Parent / Guardian Signature
          </div>
          <div className="w-1/4 text-center border-t border-gray-400 pt-2 font-bold text-gray-800">
            Date
          </div>
        </div>

      </div>
    </div>
  );
};

export default PTCStudentReport;
