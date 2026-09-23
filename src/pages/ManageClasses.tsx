import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { v4 as uuidv4 } from 'uuid';
import { Trash2 } from 'lucide-react';

const ManageClasses = () => {
  const { state, dispatch } = useData();
  const [newYear, setNewYear] = useState('');
  const [newClass, setNewClass] = useState('');
  const [selectedYearId, setSelectedYearId] = useState('');
  
  const [editingClassId, setEditingClassId] = useState('');
  const [editingClassName, setEditingClassName] = useState('');

  const handleAddYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (newYear.trim()) {
      dispatch({
        type: 'ADD_YEAR',
        payload: { id: uuidv4(), name: newYear.trim() }
      });
      setNewYear('');
    }
  };

  const handleDeleteYear = (id: string, name: string) => {
    if (window.confirm(`WARNING: Deleting academic year "${name}" will permanently delete ALL classes, students, and records associated with it. Are you sure?`)) {
      dispatch({ type: 'DELETE_YEAR', payload: id });
    }
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (newClass.trim() && selectedYearId) {
      dispatch({
        type: 'ADD_CLASS',
        payload: { id: uuidv4(), name: newClass.trim(), academicYearId: selectedYearId }
      });
      setNewClass('');
    }
  };

  const handleDeleteClass = (id: string, name: string) => {
    if (window.confirm(`WARNING: Deleting class "${name}" will permanently delete ALL its students and participation records. Are you sure?`)) {
      dispatch({ type: 'DELETE_CLASS', payload: id });
    }
  };

  const handleUpdateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClassId && editingClassName.trim()) {
      const cls = state.classes.find(c => c.id === editingClassId);
      if (cls) {
        dispatch({
          type: 'SET_STATE',
          payload: {
            ...state,
            classes: state.classes.map(c => c.id === editingClassId ? { ...c, name: editingClassName.trim() } : c)
          }
        });
        setEditingClassId('');
        setEditingClassName('');
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Academic Years</h2>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <form onSubmit={handleAddYear} className="flex gap-4 mb-6">
            <input
              type="text"
              placeholder="e.g. 2026-2027"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="border rounded-md px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium">
              Add Year
            </button>
          </form>

          <ul className="divide-y border rounded-md">
            {state.academicYears.map(year => (
              <li key={year.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <span className="font-medium text-gray-800">{year.name}</span>
                <button 
                  onClick={() => handleDeleteYear(year.id, year.name)}
                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                  title="Delete Academic Year"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
            {state.academicYears.length === 0 && (
              <li className="p-4 text-gray-500 text-center">No academic years added yet.</li>
            )}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Classes</h2>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <form onSubmit={handleAddClass} className="flex gap-4 mb-6">
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className="border rounded-md px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Academic Year</option>
              {state.academicYears.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="e.g. Grade 9A"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              className="border rounded-md px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium">
              Add Class
            </button>
          </form>

          <ul className="divide-y border rounded-md">
            {state.classes.map(cls => {
              const year = state.academicYears.find(y => y.id === cls.academicYearId);
              return (
                <li key={cls.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-gray-50 gap-2">
                  {editingClassId === cls.id ? (
                    <form onSubmit={handleUpdateClass} className="flex gap-2 w-full">
                      <input 
                        type="text" 
                        value={editingClassName} 
                        onChange={e => setEditingClassName(e.target.value)} 
                        className="border rounded px-2 py-1 flex-1 text-sm font-medium"
                        autoFocus
                      />
                      <button type="submit" className="bg-green-600 text-white px-4 py-1.5 text-sm font-medium rounded hover:bg-green-700">Save</button>
                      <button type="button" onClick={() => setEditingClassId('')} className="bg-gray-300 text-gray-800 px-4 py-1.5 text-sm font-medium rounded hover:bg-gray-400">Cancel</button>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">{cls.name}</span>
                        <span className="text-sm text-gray-500">{year?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { setEditingClassId(cls.id); setEditingClassName(cls.name); }}
                          className="text-blue-500 hover:text-blue-700 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Edit Name
                        </button>
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button 
                          onClick={() => handleDeleteClass(cls.id, cls.name)}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                          title="Delete Class"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            {state.classes.length === 0 && (
              <li className="p-4 text-gray-500 text-center">No classes added yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ManageClasses;
