import React, { useState, useEffect } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
import { Upload } from 'lucide-react';
import { Student } from '../types';
import { getClassRoster } from '../utils/calculations';
import { ExcelStudentImportModal } from '../components/ExcelStudentImportModal';

const ManageStudents = () => {
  const { state, dispatch } = useData();
  const [selectedClassId, setSelectedClassId] = useState(state.currentClassId || '');
  
  useEffect(() => {
    if (state.currentClassId && state.currentClassId !== selectedClassId) {
      setSelectedClassId(state.currentClassId);
    }
  }, [state.currentClassId]);

  const [name, setName] = useState('');
  const [studentIdStr, setStudentIdStr] = useState('');
  const [sex, setSex] = useState<'Male' | 'Female' | ''>('');

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Excel Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const currentClass = state.classes.find(c => c.id === selectedClassId);
  const classStudents = getClassRoster(state.students, selectedClassId);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedClassId]);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Delete ${selectedIds.length} selected row(s)? (Moved safely to Recently Deleted)`)) {
      selectedIds.forEach(id => {
        dispatch({ type: 'DELETE_STUDENT', payload: id });
      });
      setSelectedIds([]);
    }
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) return alert("Select a class first");
    
    dispatch({
      type: 'ADD_STUDENT',
      payload: {
        id: uuidv4(),
        classId: selectedClassId,
        name: name.trim(),
        studentId: studentIdStr.trim() || "",
        sex: sex || '',
        rosterNumber: classStudents.length + 1
      }
    });
    setName('');
    setStudentIdStr('');
    setSex('');
  };

  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent && selectedClassId) {
      const original = classStudents.find(s => s.id === editingStudent.id);
      const oldNum = original?.displayNum || 1;
      const newNum = editingStudent.rosterNumber || oldNum;

      // Update name/ID/sex first
      dispatch({ type: 'UPDATE_STUDENT', payload: editingStudent });

      // If number changed, dispatch reorder
      if (newNum !== oldNum) {
        dispatch({ 
          type: 'REORDER_STUDENT', 
          payload: { 
            studentId: editingStudent.id, 
            classId: selectedClassId, 
            newNumber: newNum 
          } 
        });
      }
      
      setEditingStudent(null);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClassId) {
      alert("Please select a class first before uploading an Excel student roster.");
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setIsImportModalOpen(true);
    e.target.value = ''; // Reset file input so re-selecting the same file works
  };

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-800 to-purple-600 drop-shadow-sm">
        Manage Students
      </h2>
      
      <div className="glass-card p-6 rounded-3xl space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Select Class to Manage</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedClassId(nextId);
              if (nextId) {
                dispatch({ type: 'SET_CURRENT_CLASS', payload: nextId });
              }
            }}
            className="border-2 border-indigo-100 rounded-xl px-4 py-3 w-full max-w-md focus:outline-none focus:border-indigo-500 bg-white/50 shadow-sm font-medium text-gray-800"
          >
            <option value="">Select a class...</option>
            {state.classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedClassId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="col-span-1 space-y-6">
            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-bold text-indigo-900 mb-6">Add Single Student</h3>
              <form onSubmit={handleAddStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Name *</label>
                  <input type="text" required value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name" className="w-full border-2 border-indigo-50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white/50 shadow-inner" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Sex / Gender</label>
                  <select
                    value={sex}
                    onChange={e => setSex(e.target.value as any)}
                    className="w-full border-2 border-indigo-50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white font-medium text-gray-800 shadow-inner"
                  >
                    <option value="">Select Gender (Optional)</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Student ID (Optional)</label>
                  <input type="text" value={studentIdStr} onChange={e=>setStudentIdStr(e.target.value)} placeholder="e.g. 00123" className="w-full border-2 border-indigo-50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white/50 shadow-inner font-mono text-sm" />
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold px-4 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-md active:scale-95 transition-all">
                  Add Student
                </button>
              </form>
            </div>

            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-bold text-indigo-900 mb-2">Import via Excel</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload an Excel roster with <strong>Student ID</strong>, <strong>Name</strong>, and <strong>Sex/Gender</strong>.
              </p>
              <label className="flex items-center justify-center w-full p-6 border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group">
                <div className="flex flex-col items-center">
                  <Upload className="text-indigo-300 group-hover:text-indigo-500 mb-3 transition-colors" size={32} />
                  <span className="text-sm font-bold text-indigo-900">Click to upload Excel</span>
                  <span className="text-[11px] text-gray-400 mt-1">Supports .xlsx, .xls, .csv with preview</span>
                </div>
                <input 
                  type="file" 
                  accept=".xlsx,.xlsm,.xlsb,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" 
                  className="hidden" 
                  onChange={handleFileSelected} 
                />
              </label>
            </div>
          </div>

          <div className="col-span-1 xl:col-span-2">
             <div className="bg-white p-6 rounded-lg shadow-sm border h-full">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h3 className="text-lg font-medium">Class Roster ({classStudents.length} Students)</h3>
                <div className="flex items-center gap-2">
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className="text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 px-3 py-1 rounded-full transition-colors"
                    >
                      Delete Selected ({selectedIds.length})
                    </button>
                  )}
                  <span className="text-xs text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                    {currentClass?.name}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={classStudents.length > 0 && selectedIds.length === classStudents.length}
                          onChange={e =>
                            setSelectedIds(e.target.checked ? classStudents.map(s => s.id) : [])
                          }
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          title="Select all rows"
                        />
                      </th>
                      <th className="p-3 text-sm font-semibold text-gray-600 w-16 text-center">No.</th>
                      <th className="p-3 text-sm font-semibold text-gray-600">Name</th>
                      <th className="p-3 text-sm font-semibold text-gray-600 w-24 text-center">Sex</th>
                      <th className="p-3 text-sm font-semibold text-gray-600">Student ID</th>
                      <th className="p-3 text-sm font-semibold text-gray-600 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map((s, index) => (
                      <tr 
                        key={s.id} 
                        className={`border-b border-gray-200 transition-colors ${
                          index % 2 === 0 ? 'bg-white hover:bg-gray-100/70' : 'bg-[#f2f2f2] hover:bg-gray-200/60'
                        }`}
                      >
                        {editingStudent?.id === s.id ? (
                          <td colSpan={6} className="p-3 bg-amber-50/50">
                            <form onSubmit={handleUpdateStudent} className="flex flex-wrap gap-2 items-center">
                              <input 
                                type="number" 
                                min="1" 
                                value={editingStudent.rosterNumber || s.displayNum} 
                                onChange={e=>setEditingStudent({...editingStudent, rosterNumber: parseInt(e.target.value) || 1})} 
                                className="border rounded px-2 w-16 text-sm py-1.5 text-center font-bold text-indigo-600 bg-white" 
                                title="Edit Roster Number"
                              />
                              <input 
                                type="text" 
                                value={editingStudent.name} 
                                onChange={e=>setEditingStudent({...editingStudent, name: e.target.value})} 
                                className="border rounded px-2 flex-1 min-w-[140px] text-sm py-1.5 bg-white font-medium" 
                                placeholder="Name"
                              />
                              <select
                                value={editingStudent.sex || ''}
                                onChange={e=>setEditingStudent({...editingStudent, sex: e.target.value as any})}
                                className="border rounded px-2 w-28 text-sm py-1.5 bg-white font-medium"
                              >
                                <option value="">Sex: -</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                              </select>
                              <input 
                                type="text" 
                                value={editingStudent.studentId || ''} 
                                onChange={e=>setEditingStudent({...editingStudent, studentId: e.target.value})} 
                                className="border rounded px-2 w-32 text-sm py-1.5 bg-white font-mono" 
                                placeholder="Student ID" 
                              />
                              <button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-xs">Save</button>
                              <button type="button" onClick={() => setEditingStudent(null)} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-300">Cancel</button>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(s.id)}
                                onChange={e =>
                                  setSelectedIds(prev =>
                                    e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                                  )
                                }
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-center text-gray-500 font-medium">{s.displayNum}</td>
                            <td className="p-3 font-medium text-gray-800">{s.name}</td>
                            <td className="p-3 text-center">
                              {s.sex === 'Male' ? (
                                <span className="inline-block bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-bold">
                                  Male
                                </span>
                              ) : s.sex === 'Female' ? (
                                <span className="inline-block bg-pink-100 text-pink-800 border border-pink-200 px-2 py-0.5 rounded-full text-xs font-bold">
                                  Female
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs italic">-</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs">
                              {s.studentId ? (
                                <span className="bg-gray-100 border border-gray-200 text-gray-800 px-2 py-0.5 rounded font-bold tracking-wide">
                                  {s.studentId}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-3">
                                <button 
                                  onClick={() => setEditingStudent(s)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => {
                                    if(window.confirm(`Delete ${s.name}?`)) {
                                      dispatch({ type: 'DELETE_STUDENT', payload: s.id });
                                    }
                                  }}
                                  className="text-red-500 hover:text-red-700 text-xs font-bold"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {classStudents.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-500">
                          No students found for this class. Upload an Excel roster or add students manually.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
             </div>
          </div>
        </div>
      )}

      {/* Excel Student Import Modal with Preview */}
      <ExcelStudentImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setUploadFile(null);
        }}
        currentClassId={selectedClassId}
        currentClassName={currentClass?.name || 'Class'}
        classStudents={classStudents}
        initialFile={uploadFile}
      />
    </div>
  );
};

export default ManageStudents;
