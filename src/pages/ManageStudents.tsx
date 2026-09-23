import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
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
        studentId: studentIdStr.trim() || ""
      }
    });
    setName('');
    setStudentIdStr('');
  };

  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent) {
      dispatch({ type: 'UPDATE_STUDENT', payload: editingStudent });
      setEditingStudent(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClassId) return alert("Select a class first");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelStudents(file);
      const newStudents = data.map((row: any) => ({
        id: uuidv4(),
        classId: selectedClassId,
        name: row['Name'] || row['Student Name'] || 'Unknown',
        studentId: row['Student ID'] || row['ID'] || ""
      }));
      dispatch({ type: 'IMPORT_STUDENTS', payload: newStudents });
      alert(`Imported ${newStudents.length} students successfully.`);
    } catch (error) {
      console.error(error);
      alert('Failed to parse Excel file. Ensure it has a "Name" column.');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Manage Students</h2>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Class to Manage</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="border rounded-md px-4 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-medium mb-4">Add Single Student</h3>
              <form onSubmit={handleAddStudent} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Name</label>
                  <input type="text" required value={name} onChange={e=>setName(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Student ID (Optional)</label>
                  <input type="text" value={studentIdStr} onChange={e=>setStudentIdStr(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add Student</button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-medium mb-4">Import via Excel/CSV</h3>
              <p className="text-sm text-gray-500 mb-4">Upload a file with a <strong>Name</strong> column.</p>
              <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <div className="flex flex-col items-center">
                  <Upload className="text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">Click to upload Excel</span>
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
                      <th className="p-3 text-sm font-semibold text-gray-600 w-16">No.</th>
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
                              <span className="text-gray-500 font-medium w-8 text-center">{s.displayNum}</span>
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
