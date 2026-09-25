import React, { useState, useEffect } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
import { ParticipationRecord, Quarter } from '../types';
import { getStudentQuarterTotal, getClassQuarterTotal, getClassRoster } from '../utils/calculations';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';

const RecordParticipation = () => {
  const { state, dispatch } = useData();
  const [activityName, setActivityName] = useState('');
  const [isActivityActive, setIsActivityActive] = useState(false);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const classStudents = state.currentClassId ? getClassRoster(state.students, state.currentClassId) : [];

  useEffect(() => {
    if (lastClickedId) {
      const timer = setTimeout(() => setLastClickedId(null), 300);
      return () => clearTimeout(timer);
    }
  }, [lastClickedId]);

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter to start recording.
      </div>
    );
  }

  const handleRecord = (studentId: string) => {
    const now = new Date();
    const record: ParticipationRecord = {
      id: uuidv4(),
      classId: state.currentClassId!,
      studentId,
      quarter: state.currentQuarter!,
      date: format(now, 'yyyy-MM-dd'),
      time: format(now, 'HH:mm:ss'),
      participationType: 'Class Participation',
      ...(isActivityActive && activityName ? { activityName } : {})
    };
    
    dispatch({ type: 'ADD_RECORD', payload: record });
    setLastClickedId(studentId);
  };

  const handleUndo = (studentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const studentRecords = state.records.filter(r => r.studentId === studentId && r.quarter === state.currentQuarter);
    if (studentRecords.length > 0) {
      const lastRecord = studentRecords[studentRecords.length - 1];
      dispatch({ type: 'REMOVE_RECORD', payload: lastRecord.id });
    }
  };

  const handleDeleteStudent = (studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to completely remove ${studentName} from this class?`)) {
      dispatch({ type: 'DELETE_STUDENT', payload: studentId });
    }
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysRecords = state.records.filter(r => r.classId === state.currentClassId && r.date === todayStr);
  const quarterTotal = getClassQuarterTotal(state.records, state.currentClassId!, state.currentQuarter!);

  return (
    <div className="flex flex-col h-full space-y-3 sm:space-y-6">
      
      {/* Header Area */}
      <div>
        <h1 className="text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-800 to-purple-600 mb-2 sm:mb-6 drop-shadow-sm">
          Record Participation
        </h1>
        
        <div className="flex flex-wrap gap-2 sm:gap-6 items-center text-gray-700 bg-white/60 backdrop-blur-md p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-white/50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[10px] sm:text-sm uppercase tracking-wider text-indigo-900/60">Class:</span>
            <select 
              value={state.currentClassId || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_CLASS', payload: e.target.value || null })}
              className="font-bold text-xs sm:text-base text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-0 sm:pb-1 cursor-pointer"
            >
              {state.classes.filter(c => c.academicYearId === state.currentYearId).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[10px] sm:text-sm uppercase tracking-wider text-indigo-900/60">Quarter:</span>
            <select 
              value={state.currentQuarter || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_QUARTER', payload: Number(e.target.value) as Quarter })}
              className="font-bold text-xs sm:text-base text-indigo-900 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-0 sm:pb-1 cursor-pointer"
            >
              <option value={1}>Quarter 1</option>
              <option value={2}>Quarter 2</option>
              <option value={3}>Quarter 3</option>
              <option value={4}>Quarter 4</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[10px] sm:text-sm uppercase tracking-wider text-indigo-900/60">Date:</span>
            <span className="font-bold text-xs sm:text-base text-indigo-900 border-b-2 border-transparent pb-0 sm:pb-1">{format(new Date(), 'MMM d')}</span>
          </div>

          <div className="ml-auto flex items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0">
            {isActivityActive ? (
              <div className="bg-indigo-50/80 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full flex items-center border border-indigo-100 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center">
                  <span className="font-semibold text-[10px] sm:text-sm text-indigo-900/60 mr-1 sm:mr-2">Activity:</span>
                  <span className="text-indigo-700 font-bold mr-2 sm:mr-3 text-xs sm:text-base truncate max-w-[120px] sm:max-w-none">{activityName || 'Unnamed'}</span>
                </div>
                <button onClick={() => { setIsActivityActive(false); setActivityName(''); }} className="text-[10px] sm:text-xs font-bold text-rose-500 hover:text-rose-700 uppercase tracking-wider">
                  Finish
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input 
                  type="text" 
                  placeholder="Activity Name..." 
                  value={activityName}
                  onChange={e=>setActivityName(e.target.value)}
                  className="border-b-2 border-gray-200 focus:outline-none focus:border-indigo-500 bg-transparent pb-0.5 sm:pb-1 w-full sm:w-40 text-xs sm:text-sm font-medium flex-1"
                />
                <button onClick={() => setIsActivityActive(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-3 py-1 sm:px-4 sm:py-1.5 rounded-full shadow-md transition-transform hover:scale-105 active:scale-95 shrink-0">
                  Start
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="glass-card rounded-xl sm:rounded-2xl p-1.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left">
          <span className="text-[9px] sm:text-sm font-bold text-gray-400 uppercase tracking-wider mb-0.5 sm:mb-0">Total</span>
          <span className="text-base sm:text-2xl font-black text-indigo-900">{classStudents.length}</span>
        </div>
        <div className="glass-card rounded-xl sm:rounded-2xl p-1.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left">
          <span className="text-[9px] sm:text-sm font-bold text-gray-400 uppercase tracking-wider mb-0.5 sm:mb-0">Today</span>
          <span className="text-base sm:text-2xl font-black text-emerald-500">{todaysRecords.length}</span>
        </div>
        <div className="glass-card rounded-xl sm:rounded-2xl p-1.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left">
          <span className="text-[9px] sm:text-sm font-bold text-gray-400 uppercase tracking-wider mb-0.5 sm:mb-0">Qtr Total</span>
          <span className="text-base sm:text-2xl font-black text-indigo-600">{quarterTotal}</span>
        </div>
      </div>

      {/* Strict Vertical List Layout for Students */}
      <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
        <div className="flex flex-col gap-3 max-w-4xl mx-auto">
          {classStudents.map(student => {
            const count = getStudentQuarterTotal(state.records, student.id, state.currentQuarter!);
            const isJustClicked = lastClickedId === student.id;
            
            // Generate a color based on the display number to make it vibrant and unique
            const colors = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-fuchsia-500'];
            const badgeColor = colors[student.displayNum % colors.length];

            return (
              <div 
                key={student.id}
                onClick={() => handleRecord(student.id)}
                className={`group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-white/40 p-4 cursor-pointer flex items-center justify-between select-none transition-all duration-200 ease-out active:scale-95 overflow-hidden ${
                  isJustClicked ? 'ring-2 ring-indigo-300 bg-indigo-50/90' : 'hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-0.5'
                }`}
              >
                {/* Decorative Background Blob */}
                <div className={`absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-10 blur-2xl ${badgeColor}`}></div>

                <div className="flex items-center gap-3 sm:gap-4 z-10 flex-1 min-w-0">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-md shrink-0 ${badgeColor}`}>
                    {student.displayNum}
                  </div>
                  <h3 className="font-bold text-gray-800 text-base sm:text-xl pr-1 sm:pr-2 leading-tight break-words">
                    {student.name}
                  </h3>
                </div>
                
                <div className="flex items-center gap-3 z-10">
                  <button 
                    onClick={(e) => handleUndo(student.id, e)}
                    className="text-gray-400 hover:text-rose-500 bg-gray-50 hover:bg-rose-50 w-10 h-10 rounded-full flex items-center justify-center font-bold text-2xl transition-colors border border-gray-100 shadow-sm shrink-0"
                    title="Subtract point"
                  >
                    −
                  </button>
                  
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Score</span>
                    <div className="text-3xl font-black text-indigo-900 relative leading-none">
                      {count}
                      {isJustClicked && (
                        <span className="absolute -top-6 -right-4 text-emerald-500 font-black text-xl animate-float-up opacity-0 drop-shadow-md">
                          +1
                        </span>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRecord(student.id); }}
                    className="text-gray-400 hover:text-emerald-500 bg-gray-50 hover:bg-emerald-50 w-10 h-10 rounded-full flex items-center justify-center font-bold text-2xl transition-colors border border-gray-100 shadow-sm shrink-0"
                    title="Add point"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={(e) => handleDeleteStudent(student.id, student.name, e)}
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-rose-300 hover:text-rose-600 p-1 rounded-full hover:bg-rose-50 transition-all z-20"
                  title="Delete Student"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default RecordParticipation;
