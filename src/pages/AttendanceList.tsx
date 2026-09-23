import React from 'react';
import { useData } from '../store/DataContext';
import { getClassRoster, getStudentAttendanceQuarter, getAttendanceAlertStatus, getClassAttendanceQuarter } from '../utils/calculations';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Quarter } from '../types';

const AttendanceList = () => {
  const { state, dispatch } = useData();
  const classStudents = state.currentClassId ? getClassRoster(state.students, state.currentClassId) : [];

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter to view the attendance summary.
      </div>
    );
  }

  const classSummary = getClassAttendanceQuarter(state.attendanceRecords, state.currentClassId, state.currentQuarter);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 drop-shadow-sm">
          Attendance Summary
        </h1>
        
        <div className="flex flex-wrap gap-4 items-center bg-white/60 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm border border-white/50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm uppercase text-indigo-900/60">Class:</span>
            <select 
              value={state.currentClassId || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_CLASS', payload: e.target.value || null })}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent cursor-pointer"
            >
              {state.classes.filter(c => c.academicYearId === state.currentYearId).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm uppercase text-indigo-900/60">Quarter:</span>
            <select 
              value={state.currentQuarter || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_QUARTER', payload: Number(e.target.value) as Quarter })}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent cursor-pointer"
            >
              <option value={1}>Quarter 1</option>
              <option value={2}>Quarter 2</option>
              <option value={3}>Quarter 3</option>
              <option value={4}>Quarter 4</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-gray-500 uppercase">Total Classes</p>
          <p className="text-2xl font-black text-gray-800">{classSummary.totalClasses}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-emerald-600 uppercase">Present</p>
          <p className="text-2xl font-black text-emerald-600">{classSummary.present}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-amber-600 uppercase">Excused</p>
          <p className="text-2xl font-black text-amber-600">{classSummary.excused}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-rose-600 uppercase">Unexcused</p>
          <p className="text-2xl font-black text-rose-600">{classSummary.unexcused}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-indigo-600 uppercase">Total Students</p>
          <p className="text-2xl font-black text-indigo-900">{classStudents.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto glass-card rounded-2xl shadow-sm border border-white/50">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-indigo-50/50">
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100">No.</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100">Name</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100 text-center">Present</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100 text-center">Excused</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100 text-center">Unexcused</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100 text-center">Rate</th>
              <th className="p-4 font-bold text-indigo-900 border-b border-indigo-100">Status</th>
            </tr>
          </thead>
          <tbody>
            {classStudents.map(student => {
              const att = getStudentAttendanceQuarter(state.attendanceRecords, student.id, state.currentQuarter!);
              const alertStatus = getAttendanceAlertStatus(att.unexcused, state.attendanceSettings);
              
              return (
                <tr key={student.id} className="border-b border-gray-100 hover:bg-white/40 transition-colors">
                  <td className="p-4 font-semibold text-gray-500">{student.displayNum}</td>
                  <td className="p-4 font-bold text-gray-800">{student.name}</td>
                  <td className="p-4 font-bold text-emerald-600 text-center bg-emerald-50/30">{att.present}</td>
                  <td className="p-4 font-bold text-amber-600 text-center bg-amber-50/30">{att.excused}</td>
                  <td className="p-4 font-bold text-rose-600 text-center bg-rose-50/30">{att.unexcused}</td>
                  <td className="p-4 font-bold text-indigo-600 text-center">{att.rate}%</td>
                  <td className="p-4">
                    {alertStatus === 'Alert' && (
                      <div className="flex items-center gap-2 text-rose-600 font-bold bg-rose-50 px-3 py-1 rounded-lg w-max border border-rose-200">
                        <AlertCircle size={16} /> Alert ({att.unexcused})
                      </div>
                    )}
                    {alertStatus === 'Warning' && (
                      <div className="flex items-center gap-2 text-amber-600 font-bold bg-amber-50 px-3 py-1 rounded-lg w-max border border-amber-200">
                        <AlertTriangle size={16} /> Warning ({att.unexcused})
                      </div>
                    )}
                    {alertStatus === 'Normal' && (
                      <span className="text-gray-400 font-medium text-sm">Normal</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {classStudents.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">No students found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceList;
