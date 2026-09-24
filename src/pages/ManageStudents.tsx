import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { parseExcelStudents } from '../utils/export';
import { Upload } from 'lucide-react';
import { Student } from '../types';
import { getClassRoster } from '../utils/calculations';

const ManageStudents = () => {
  const { state, dispatch } = useData();
  const [selectedClassId, setSelectedClassId] = useState('');
  
  const [name, setName] = useState('');
  const [studentIdStr, setStudentIdStr] = useState('');

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const classStudents = getClassRoster(state.students, selectedClassId);

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
        rosterNumber: classStudents.length + 1
      }
    });
    setName('');
    setStudentIdStr('');
  };

  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent && selectedClassId) {
      const original = classStudents.find(s => s.id === editingStudent.id);
      const oldNum = original?.displayNum || 1;
      const newNum = editingStudent.rosterNumber || oldNum;

      // Update name/ID first
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClassId) return alert("Select a class first");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      let nameColIndex = -1;
      let idColIndex = -1;
      let dataStartIndex = 0;

      // 1. Try to find the header row
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i];
        if (!row) continue;
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').trim().toLowerCase();
          if (cell === 'name' || cell === 'student name' || cell === 'student' || cell === 'full name') {
            nameColIndex = j;
            dataStartIndex = i + 1;
          }
          if (cell === 'id' || cell === 'student id') {
            idColIndex = j;
          }
        }
        if (nameColIndex !== -1) break;
      }

      // 2. If no header row found, guess the columns (Assume Col 1 is Name, Col 0 is No.)
      if (nameColIndex === -1) {
        if (rawRows.length > 0 && rawRows[0].length >= 2) {
          nameColIndex = 1; // Best guess: second column is Name
          dataStartIndex = 0;
        } else if (rawRows.length > 0 && rawRows[0].length === 1) {
          nameColIndex = 0; // Best guess: only one column, must be Name
          dataStartIndex = 0;
        } else {
          alert("Could not detect any student names in this Excel file. Please ensure there is a column with names.");
          e.target.value = '';
          return;
        }
      }

      // 3. Extract students
      const newStudents: any[] = [];
      for (let i = dataStartIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[nameColIndex]) continue; // Skip empty rows
        
        const nameVal = String(row[nameColIndex]).trim();
        if (nameVal.length === 0 || nameVal.toLowerCase() === 'name') continue; // Skip empty or accidental headers

        const studentIdVal = idColIndex !== -1 && row[idColIndex] ? String(row[idColIndex]).trim() : "";
        
        newStudents.push({
          id: uuidv4(),
          classId: selectedClassId,
          name: nameVal,
          studentId: studentIdVal,
          rosterNumber: newStudents.length + 1 // Assign 1 to N on import
        });
      }

      if (newStudents.length === 0) {
        alert("No valid students found in the file. Please check your Excel format.");
        e.target.value = '';
        return;
      }
      
      const existingStudents = state.students.filter(s => s.classId === selectedClassId);
      if (existingStudents.length > 0) {
        const confirmMsg = `WARNING: Importing this file will DELETE the ${existingStudents.length} existing students in this class and wipe all of their scores/records.\n\nAre you sure you want to replace the class roster?`;
        if (!window.confirm(confirmMsg)) {
           // Clear file input
           e.target.value = '';
           return;
        }
      }

      dispatch({ type: 'IMPORT_STUDENTS', payload: newStudents });
      alert(`Successfully replaced class roster with ${newStudents.length} new students.`);
      e.target.value = ''; // clear input
    } catch (error) {
      console.error(error);
      alert('Failed to parse Excel file. Ensure it has a "Name" column.');
    }
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
            onChange={(e) => setSelectedClassId(e.target.value)}
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
              <form onSubmit={handleAddStudent} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                  <input type="text" required value={name} onChange={e=>setName(e.target.value)} className="w-full border-2 border-indigo-50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white/50 shadow-inner" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Student ID (Optional)</label>
                  <input type="text" value={studentIdStr} onChange={e=>setStudentIdStr(e.target.value)} className="w-full border-2 border-indigo-50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white/50 shadow-inner" />
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold px-4 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-md active:scale-95 transition-all">
                  Add Student
                </button>
              </form>
            </div>

            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-bold text-indigo-900 mb-2">Import via Excel</h3>
              <p className="text-sm text-gray-500 mb-6">Upload a file with a <strong>Name</strong> column.</p>
              <label className="flex items-center justify-center w-full p-6 border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group">
                <div className="flex flex-col items-center">
                  <Upload className="text-indigo-300 group-hover:text-indigo-500 mb-3 transition-colors" size={32} />
                  <span className="text-sm font-bold text-indigo-900">Click to upload Excel</span>
                </div>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>

          <div className="col-span-1 xl:col-span-2">
             <div className="bg-white p-6 rounded-lg shadow-sm border h-full">
              <h3 className="text-lg font-medium mb-4">Class Roster ({classStudents.length} Students)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-sm font-semibold text-gray-600 w-24">No.</th>
                      <th className="p-3 text-sm font-semibold text-gray-600">Name</th>
                      <th className="p-3 text-sm font-semibold text-gray-600">Student ID</th>
                      <th className="p-3 text-sm font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(s => (
                      <tr key={s.id} className="border-b hover:bg-gray-50">
                        {editingStudent?.id === s.id ? (
                          <td colSpan={4} className="p-3">
                            <form onSubmit={handleUpdateStudent} className="flex gap-2 items-center">
                              <input 
                                type="number" 
                                min="1" 
                                value={editingStudent.rosterNumber || s.displayNum} 
                                onChange={e=>setEditingStudent({...editingStudent, rosterNumber: parseInt(e.target.value) || 1})} 
                                className="border rounded px-2 w-16 text-sm py-1 text-center font-bold text-indigo-600" 
                                title="Edit Roster Number"
                              />
                              <input type="text" value={editingStudent.name} onChange={e=>setEditingStudent({...editingStudent, name: e.target.value})} className="border rounded px-2 flex-1 text-sm py-1" />
                              <input type="text" value={editingStudent.studentId || ''} onChange={e=>setEditingStudent({...editingStudent, studentId: e.target.value})} className="border rounded px-2 w-32 text-sm py-1" placeholder="ID (Optional)" />
                              <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Save</button>
                              <button type="button" onClick={() => setEditingStudent(null)} className="bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm hover:bg-gray-400">Cancel</button>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="p-3 text-gray-500 font-medium">{s.displayNum}</td>
                            <td className="p-3 font-medium text-gray-800">{s.name}</td>
                            <td className="p-3 text-gray-500">{s.studentId || '-'}</td>
                            <td className="p-3 flex gap-3">
                              <button 
                                onClick={() => setEditingStudent(s)}
                                className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => {
                                  if(window.confirm(`Delete ${s.name}?`)) {
                                    dispatch({ type: 'DELETE_STUDENT', payload: s.id });
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {classStudents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-500">No students found for this class.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
