import React, { useState, useMemo } from 'react';
import { useData } from '../store/DataContext';
import { getClassRoster, getStudentSemesterOverall, getStudentAttendanceSemester, getStudentSemesterTotal, getAverageParticipation, getParticipationTier, getAttendanceAlertStatus } from '../utils/calculations';
import { generatePTCFeedback, generateStrengths, generateAreasToImprove } from '../utils/ptcGenerator';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const PTCDashboard = () => {
  const { state, dispatch } = useData();
  const navigate = useNavigate();
  const [semester, setSemester] = useState<1 | 2>(1);

  const currentYear = state.academicYears.find(y => y.id === state.currentYearId);
  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = state.currentClassId ? getClassRoster(state.students, state.currentClassId) : [];

  const classData = useMemo(() => {
    if (!state.currentClassId) return [];
    
    // Class averages for tier thresholds
    let totalPart = 0;
    
    const rawData = classStudents.map(student => {
      const overall = getStudentSemesterOverall(
        student.id, 
        state.currentClassId!, 
        semester, 
        state.scores, 
        state.records, 
        state.gradingSettings, 
        currentClass?.name || ''
      );
      
      const attendance = getStudentAttendanceSemester(state.attendanceRecords, student.id, semester);
      const participation = getStudentSemesterTotal(state.records, student.id, semester);
      
      totalPart += participation;
      
      return {
        student,
        overall,
        attendance,
        participation
      };
    });

    const classAveragePart = getAverageParticipation(totalPart, classStudents.length);

    return rawData.map(d => {
      const attAlert = getAttendanceAlertStatus(d.attendance.unexcused, state.attendanceSettings);
      const attTier = (attAlert === 'Normal' ? 'Good' : (attAlert === 'Warning' ? 'Warning' : 'Alert')) as 'Good' | 'Warning' | 'Alert';
      const partTier = getParticipationTier(d.participation, classAveragePart);

      const studentStats = {
        name: d.student.name,
        overallScore: d.overall.overallScore,
        grade: d.overall.letterGrade,
        hwTotal: d.overall.hwTotal,
        quizTotal: d.overall.quizTotal,
        testTotal: d.overall.testTotal,
        participation: d.participation,
        participationTier: partTier,
        attendanceRate: d.attendance.rate,
        unexcusedAbsences: d.attendance.unexcused,
        attendanceTier: attTier
      };

      const existingRecord = state.ptcRecords.find(p => p.studentId === d.student.id && p.semester === semester);
      const strengths = existingRecord ? existingRecord.strengths : generateStrengths(studentStats);
      const areasToImprove = existingRecord ? existingRecord.areasToImprove : generateAreasToImprove(studentStats);
      const teacherComment = existingRecord ? existingRecord.teacherComment : generatePTCFeedback(studentStats);

      return {
        ...d,
        attTier,
        partTier,
        strengths,
        areasToImprove,
        teacherComment
      };
    });
  }, [state, semester, classStudents, currentClass]);

  const stats = useMemo(() => {
    if (classData.length === 0) return null;
    
    let sumScore = 0;
    let high = -1;
    let low = 101;
    let totalUnexcused = 0;
    let totalAttRate = 0;
    let totalPart = 0;
    
    const gradeCount = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

    classData.forEach(d => {
      if (d.overall.overallScore > 0) {
        sumScore += d.overall.overallScore;
        high = Math.max(high, d.overall.overallScore);
        low = Math.min(low, d.overall.overallScore);
      }
      
      if (d.overall.letterGrade && d.overall.letterGrade !== 'Unknown') {
        gradeCount[d.overall.letterGrade as keyof typeof gradeCount]++;
      }
      
      totalUnexcused += d.attendance.unexcused;
      totalAttRate += d.attendance.rate;
      totalPart += d.participation;
    });

    const avgScore = sumScore / classData.length;
    
    return {
      total: classData.length,
      avgScore: avgScore.toFixed(2),
      high: high === -1 ? 0 : high,
      low: low === 101 ? 0 : low,
      avgAtt: (totalAttRate / classData.length).toFixed(2),
      avgPart: (totalPart / classData.length).toFixed(2),
      totalUnexcused,
      gradeCount
    };
  }, [classData]);

  const gradeChartData = stats ? [
    { name: 'A', count: stats.gradeCount.A },
    { name: 'B', count: stats.gradeCount.B },
    { name: 'C', count: stats.gradeCount.C },
    { name: 'D', count: stats.gradeCount.D },
    { name: 'E', count: stats.gradeCount.E },
    { name: 'F', count: stats.gradeCount.F },
  ] : [];

  const performanceChartData = classData.map(d => ({
    name: d.student.name,
    score: d.overall.overallScore,
    grade: d.overall.letterGrade
  }));

  const handleExportExcel = () => {
    if (classData.length === 0) return;
    const exportData = classData.map((d, index) => ({
      'No.': index + 1,
      'Student Name': d.student.name,
      'Sex': d.student.sex || '',
      'Semester Average': d.overall.overallScore,
      'Grade': d.overall.letterGrade,
      'Attendance': d.attTier,
      'Participation': d.partTier,
      'Strengths': d.strengths.join(', '),
      'Areas to Improve': d.areasToImprove.join(', '),
      'Constructive Feedback': d.teacherComment
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PTC Summary");
    XLSX.writeFile(wb, `PTC_Summary_${currentClass?.name}_Sem${semester}.xlsx`);
  };

  if (!state.currentClassId) {
    return <div className="p-8 text-center text-gray-500">Please select a Class to view the PTC Dashboard.</div>;
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="print:hidden">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 mb-6 drop-shadow-sm flex items-center justify-between">
          <span>Parent-Teacher Conference</span>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-transform hover:scale-105 active:scale-95">
              <Download size={16} /> Excel
            </button>
            <button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-transform hover:scale-105 active:scale-95">
              <Printer size={16} /> Print
            </button>
          </div>
        </h1>
        
        <div className="flex flex-wrap gap-6 items-center text-gray-700 bg-white/60 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/50">
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
        </div>
      </div>

      <div className="hidden print:block mb-6">
        <h1 className="text-3xl font-bold mb-2">PTC Semester Summary</h1>
        <p className="text-gray-600 font-semibold">Academic Year: {currentYear?.name} | Class: {currentClass?.name} | Semester: {semester}</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-bold uppercase">Class Average</p>
            <p className="text-3xl font-black text-indigo-600">{stats.avgScore}</p>
            <p className="text-xs text-gray-400 mt-1">High: {stats.high} | Low: {stats.low}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-bold uppercase">Average Attendance</p>
            <p className="text-3xl font-black text-blue-600">{stats.avgAtt}%</p>
            <p className="text-xs text-rose-500 mt-1 font-semibold">{stats.totalUnexcused} total unexcused absences</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-bold uppercase">Average Participation</p>
            <p className="text-3xl font-black text-pink-600">{stats.avgPart}</p>
            <p className="text-xs text-gray-400 mt-1">Total points per student</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-bold uppercase">Top Grades</p>
            <p className="text-3xl font-black text-emerald-600">{stats.gradeCount.A + stats.gradeCount.B}</p>
            <p className="text-xs text-gray-400 mt-1">Students with A or B</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Student Performance – Semester {semester}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceChartData}>
                  <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [`${value} (Grade: ${props.payload?.grade || ''})`, 'Score']}
                  />
                  <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Grade Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeChartData}>
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {gradeChartData.map((entry, index) => {
                       const colors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', E: '#ef4444', F: '#991b1b' };
                       return <Cell key={`cell-${index}`} fill={colors[entry.name as keyof typeof colors]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider font-semibold border-b border-gray-100">
                <th className="p-4 whitespace-nowrap">No.</th>
                <th className="p-4 whitespace-nowrap">Student Name</th>
                <th className="p-4 whitespace-nowrap text-center">Average</th>
                <th className="p-4 whitespace-nowrap text-center">Grade</th>
                <th className="p-4 whitespace-nowrap">Strengths</th>
                <th className="p-4 whitespace-nowrap">Areas to Improve</th>
                <th className="p-4 whitespace-nowrap w-1/3">Constructive Feedback</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {classData.map((d, i) => (
                <tr 
                  key={d.student.id} 
                  onClick={() => navigate(`/ptc/${d.student.id}?semester=${semester}`)}
                  className="border-b border-gray-50 hover:bg-indigo-50/50 cursor-pointer transition-colors"
                >
                  <td className="p-4 font-medium text-gray-500">{i + 1}</td>
                  <td className="p-4 font-bold text-gray-800">{d.student.name}</td>
                  <td className="p-4 text-center font-bold">{d.overall.overallScore}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold
                      ${d.overall.letterGrade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                        d.overall.letterGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                        d.overall.letterGrade === 'C' ? 'bg-amber-100 text-amber-700' :
                        d.overall.letterGrade === 'D' ? 'bg-orange-100 text-orange-700' :
                        d.overall.letterGrade === 'E' ? 'bg-rose-100 text-rose-700' :
                        'bg-red-900 text-red-100'}
                    `}>
                      {d.overall.letterGrade}
                    </span>
                  </td>
                  <td className="p-4 text-gray-700 text-xs">
                    <ul className="list-disc pl-4 space-y-1">
                      {d.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </td>
                  <td className="p-4 text-gray-700 text-xs">
                    <ul className="list-disc pl-4 space-y-1">
                      {d.areasToImprove.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </td>
                  <td className="p-4 text-gray-600 text-xs text-justify line-clamp-3">
                    {d.teacherComment}
                  </td>
                </tr>
              ))}
              {classData.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PTCDashboard;
