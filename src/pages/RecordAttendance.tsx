import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
import { Quarter, AttendanceStatus, AttendanceRecord } from '../types';
import { getClassRoster } from '../utils/calculations';
import { format } from 'date-fns';
import { Check, Info, X } from 'lucide-react';

const RecordAttendance = () => {
  const { state, dispatch } = useData();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Local state for the current session's attendance before saving
  // We initialize everything to 'Present' by default
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  const classStudents = state.currentClassId ? getClassRoster(state.students, state.currentClassId) : [];

  // Initialize all students to "Present" when class changes
  React.useEffect(() => {
    if (classStudents.length > 0) {
      const initialMap: Record<string, AttendanceStatus> = {};
      
      // If we already have saved records for this date, load them, otherwise default to Present
      const existingRecords = state.attendanceRecords.filter(
        r => r.classId === state.currentClassId && r.date === selectedDate && r.quarter === state.currentQuarter
      );
      
      classStudents.forEach(s => {
        const existing = existingRecords.find(r => r.studentId === s.id);
        initialMap[s.id] = existing ? existing.status : 'Present';
      });
      setAttendanceMap(initialMap);
    }
  }, [state.currentClassId, selectedDate, state.currentQuarter, classStudents.length, state.attendanceRecords]);

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter to start recording attendance.
      </div>
    );
  }

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendance = () => {
    const { currentClassId, currentQuarter } = state;
    if (!currentClassId || !currentQuarter) return;

    classStudents.forEach(student => {
      const status = attendanceMap[student.id];
      const existingRecord = state.attendanceRecords.find(
        r => r.classId === currentClassId && r.studentId === student.id && r.date === selectedDate && r.quarter === currentQuarter
      );

      if (existingRecord) {
        // Update existing record
        if (existingRecord.status !== status) {
          dispatch({
            type: 'UPDATE_ATTENDANCE_RECORD',
            payload: { ...existingRecord, status }
          });
        }
      } else {
        // Create new record
        const newRecord: AttendanceRecord = {
          id: uuidv4(),
          classId: currentClassId,
          studentId: student.id,
          quarter: currentQuarter,
          date: selectedDate,
          status
        };
        dispatch({ type: 'UPDATE_ATTENDANCE_RECORD', payload: newRecord });
      }
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header Area */}
      <div>
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 mb-6 drop-shadow-sm flex justify-between items-center">
          <span>Record Attendance</span>
          {savedSuccess && (
            <span className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm">
              <Check size={16} /> Saved!
            </span>
          )}
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
            <span className="font-semibold text-sm uppercase tracking-wider text-indigo-900/60">Quarter:</span>
            <select 
              value={state.currentQuarter || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_QUARTER', payload: Number(e.target.value) as Quarter })}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-1 cursor-pointer"
            >
              <option value={1}>Quarter 1</option>
              <option value={2}>Quarter 2</option>
              <option value={3}>Quarter 3</option>
              <option value={4}>Quarter 4</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm uppercase tracking-wider text-indigo-900/60">Date:</span>
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-bold text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-1 cursor-pointer"
            />
          </div>

          <div className="ml-auto">
             <button 
                onClick={handleSaveAttendance}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-6 py-2 rounded-full shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <Check size={18} />
                Save Attendance
              </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-4 flex items-center gap-3 text-sm text-blue-800 shadow-sm">
        <Info className="text-blue-500 shrink-0" size={20} />
        <p><strong>Quick Mode:</strong> All students are marked <strong>Present</strong> by default. Only tap the absent students to switch them to <strong>Excused</strong> or <strong>Unexcused</strong>, then hit Save.</p>
      </div>

      {/* Strict Vertical List Layout for Students */}
      <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
        <div className="flex flex-col gap-3 max-w-4xl mx-auto">
          {classStudents.map(student => {
            const status = attendanceMap[student.id] || 'Present';
            
            // Vibrant badges
            const colors = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-fuchsia-500'];
            const badgeColor = colors[student.displayNum % colors.length];

            return (
              <div 
                key={student.id}
                className={`relative bg-white/90 backdrop-blur-md rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-white/40 p-4 flex items-center justify-between select-none transition-all duration-200 ease-out overflow-hidden`}
              >
                <div className={`absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-10 blur-2xl ${badgeColor}`}></div>

                <div className="flex items-center gap-4 z-10 flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 ${badgeColor}`}>
                    {student.displayNum}
                  </div>
                  <h3 className="font-bold text-gray-800 text-lg sm:text-xl line-clamp-1 pr-2">
                    {student.name}
                  </h3>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-3 z-10 flex-wrap justify-end">
                  {/* Present Toggle */}
                  <button 
                    onClick={() => handleStatusChange(student.id, 'Present')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-sm border ${
                      status === 'Present' 
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20' 
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {status === 'Present' && <Check size={16} />}
                    Present
                  </button>

                  {/* Excused Toggle */}
                  <button 
                    onClick={() => handleStatusChange(student.id, 'Excused')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-sm border ${
                      status === 'Excused' 
                        ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20' 
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Excused
                  </button>

                  {/* Unexcused Toggle */}
                  <button 
                    onClick={() => handleStatusChange(student.id, 'Unexcused')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-sm border ${
                      status === 'Unexcused' 
                        ? 'bg-rose-500 text-white border-rose-600 shadow-rose-500/20' 
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {status === 'Unexcused' && <X size={16} />}
                    Unexcused
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RecordAttendance;
