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
    <div className="space-y-8 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 mb-6 drop-shadow-sm">
          Classes & Years
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 ml-2">Academic Years</h2>
          <div className="glass-card p-6 rounded-3xl border border-white/50">
            <form onSubmit={handleAddYear} className="flex gap-4 mb-6">
              <input
                type="text"
                placeholder="e.g. 2026-2027"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                className="border-b-2 border-indigo-200 bg-white/50 rounded-xl px-4 py-2.5 flex-1 focus:outline-none focus:border-indigo-500 font-bold text-indigo-900 shadow-inner"
                required
              />
              <button type="submit" className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl hover:bg-indigo-700 font-bold shadow-md hover:scale-105 transition-all">
                Add Year
              </button>
            </form>

            <ul className="space-y-3">
              {state.academicYears.map(year => (
                <li key={year.id} className="bg-white/70 p-4 rounded-2xl flex justify-between items-center shadow-sm border border-white/40 hover:bg-white/90 transition-colors">
                  <span className="font-bold text-gray-800 text-lg">{year.name}</span>
                  <button 
                    onClick={() => handleDeleteYear(year.id, year.name)}
                    className="text-rose-400 hover:text-white hover:bg-rose-500 p-2 rounded-xl transition-all shadow-sm"
                    title="Delete Academic Year"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
              {state.academicYears.length === 0 && (
                <li className="p-8 text-indigo-900/50 text-center font-bold bg-white/30 rounded-2xl border border-dashed border-indigo-200">No academic years added yet.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 ml-2">Classes</h2>
          <div className="glass-card p-6 rounded-3xl border border-white/50">
            <form onSubmit={handleAddClass} className="flex flex-col gap-4 mb-6">
              <div className="flex gap-4">
                <select
                  value={selectedYearId}
                  onChange={(e) => setSelectedYearId(e.target.value)}
                  className="border-b-2 border-indigo-200 bg-white/50 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 font-bold text-indigo-900 shadow-inner cursor-pointer"
                  required
                >
                  <option value="">Select Year</option>
                  {state.academicYears.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="e.g. Grade 9A"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  className="border-b-2 border-indigo-200 bg-white/50 rounded-xl px-4 py-2.5 flex-1 focus:outline-none focus:border-indigo-500 font-bold text-indigo-900 shadow-inner"
                  required
                />
              </div>
              <button type="submit" className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl hover:bg-emerald-600 font-bold shadow-md hover:scale-105 transition-all w-full">
                Add Class
              </button>
            </form>

            <ul className="space-y-3">
              {state.classes.map(cls => {
                const year = state.academicYears.find(y => y.id === cls.academicYearId);
                return (
                  <li key={cls.id} className="bg-white/70 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm border border-white/40 hover:bg-white/90 transition-colors gap-3">
                    {editingClassId === cls.id ? (
                      <form onSubmit={handleUpdateClass} className="flex gap-2 w-full">
                        <input 
                          type="text" 
                          value={editingClassName} 
                          onChange={e => setEditingClassName(e.target.value)} 
                          className="border-2 border-indigo-300 rounded-xl px-3 py-1.5 flex-1 font-bold text-indigo-900"
                          autoFocus
                        />
                        <button type="submit" className="bg-emerald-500 text-white px-4 py-1.5 font-bold rounded-xl hover:bg-emerald-600 shadow-sm">Save</button>
                        <button type="button" onClick={() => setEditingClassId('')} className="bg-gray-200 text-gray-700 px-4 py-1.5 font-bold rounded-xl hover:bg-gray-300">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-lg">{cls.name}</span>
                          <span className="text-sm font-bold text-indigo-500/70">{year?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => { setEditingClassId(cls.id); setEditingClassName(cls.name); }}
                            className="bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white text-sm font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteClass(cls.id, cls.name)}
                            className="text-rose-400 hover:text-white hover:bg-rose-500 p-1.5 rounded-xl transition-all shadow-sm"
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
                <li className="p-8 text-indigo-900/50 text-center font-bold bg-white/30 rounded-2xl border border-dashed border-indigo-200">No classes added yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageClasses;
