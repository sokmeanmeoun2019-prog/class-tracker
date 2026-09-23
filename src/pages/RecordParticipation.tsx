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

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
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
      activityName: isActivityActive ? activityName : undefined,
      participationType: 'Class Participation',
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
    <div className="flex flex-col h-full space-y-6">
      
      {/* Header Area */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Record Participation</h1>
        
        <div className="flex flex-wrap gap-6 items-center text-gray-700 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Class:</span>
            <select 
              value={state.currentClassId || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_CLASS', payload: e.target.value || null })}
              className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1"
            >
              {state.classes.filter(c => c.academicYearId === state.currentYearId).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold">Quarter:</span>
            <select 
              value={state.currentQuarter || ''}
              onChange={(e) => dispatch({ type: 'SET_CURRENT_QUARTER', payload: Number(e.target.value) as Quarter })}
              className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1"
            >
              <option value={1}>Quarter 1</option>
              <option value={2}>Quarter 2</option>
              <option value={3}>Quarter 3</option>
              <option value={4}>Quarter 4</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold">Date:</span>
            <span>{format(new Date(), 'MMMM d, yyyy')}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isActivityActive ? (
              <>
                <span className="font-semibold">Activity:</span>
                <span className="text-blue-600 font-medium">{activityName || 'Unnamed Activity'}</span>
                <button onClick={() => { setIsActivityActive(false); setActivityName(''); }} className="ml-2 text-sm text-red-600 hover:underline">
                  Finish Activity
                </button>
              </>
            ) : (
              <>
                <input 
                  type="text" 
                  placeholder="Optional Activity..." 
                  value={activityName}
                  onChange={e=>setActivityName(e.target.value)}
                  className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1 w-32 text-sm"
                />
                <button onClick={() => setIsActivityActive(true)} className="text-sm text-blue-600 font-medium hover:underline">
                  Start Activity
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-gray-100 border border-gray-200 p-4 rounded-lg flex flex-wrap gap-8 items-center text-lg font-medium text-gray-800">
        <div>Students: <span className="text-blue-600">{classStudents.length}</span></div>
        <div>Today's Participation: <span className="text-blue-600">{todaysRecords.length}</span></div>
        <div>Quarter Total: <span className="text-blue-600">{quarterTotal}</span></div>
      </div>

      {/* Vertical List Layout for Students */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="flex flex-col gap-3 max-w-4xl">
          {classStudents.map(student => {
            const count = getStudentQuarterTotal(state.records, student.id, state.currentQuarter!);
            const isJustClicked = lastClickedId === student.id;
            
            return (
              <div 
                key={student.id}
                onClick={() => handleRecord(student.id)}
                className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 cursor-pointer flex items-center justify-between select-none transition-all duration-150 ease-in-out ${
                  isJustClicked ? 'ring-2 ring-blue-500 bg-blue-50 transform scale-[1.01]' : 'hover:border-blue-300 hover:shadow-md'
                }`}
              >
                {/* Left: Student Name Revealed Vertically */}
                <div className="flex items-center gap-4 flex-1">
                  <h3 className="font-bold text-gray-900 text-lg sm:text-xl">
                    <span className="text-gray-400 mr-2">#{student.displayNum}</span> 
                    {student.name}
                  </h3>
                </div>
                
                {/* Right: Count and Actions */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => handleUndo(student.id, e)}
                      className="text-gray-400 hover:text-red-500 font-bold text-2xl px-2 leading-none rounded hover:bg-gray-100"
                      title="Subtract 1 participation"
                    >
                      −
                    </button>
                    
                    <div className="flex items-center gap-2 min-w-[100px] justify-end">
                      <span className="text-sm text-gray-500 font-bold uppercase tracking-wider">Count</span>
                      <div className="text-3xl font-black text-blue-600 relative">
                        {count}
                        {isJustClicked && (
                          <span className="absolute -top-6 -right-4 text-green-500 text-lg animate-ping opacity-75">
                            +1
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-l pl-4 flex items-center">
                    <button
                      onClick={(e) => handleDeleteStudent(student.id, student.name, e)}
                      className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                      title="Delete Student"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default RecordParticipation;
