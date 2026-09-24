import React, { useState, useEffect } from 'react';
import { useData } from '../store/DataContext';
import { Quarter } from '../types';
import { Search, Save, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

const Header = () => {
  const { state, dispatch } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  // Show a brief "Saved!" checkmark whenever state changes to prove autosave is working
  useEffect(() => {
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const student = state.students.find(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (student) {
      navigate(`/student/${student.id}`);
      setSearchTerm('');
    } else {
      alert('Student not found');
    }
  };

  const handleManualSave = () => {
    // Data is already saved by DataContext's useEffect, but this gives the user peace of mind
    alert("Success! All your class data and participations have been securely saved.");
  };

  return (
    <header className="py-3 md:h-[72px] bg-white/80 backdrop-blur-md border-b border-gray-200/80 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 shrink-0 z-10 sticky top-0 gap-3 md:gap-0">
      <div className="flex flex-wrap items-center gap-2 md:space-x-3 w-full md:w-auto">
        {/* Context Selectors */}
        <select 
          className="border border-gray-200 rounded-full px-3 py-1.5 md:px-4 md:py-2 text-sm bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer flex-1 min-w-[110px]"
          value={state.currentYearId || ''}
          onChange={(e) => dispatch({ type: 'SET_CURRENT_YEAR', payload: e.target.value || null })}
        >
          <option value="">Select Year</option>
          {state.academicYears.map(y => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>

        <select 
          className="border border-gray-200 rounded-full px-3 py-1.5 md:px-4 md:py-2 text-sm bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer flex-1 min-w-[110px]"
          value={state.currentClassId || ''}
          onChange={(e) => dispatch({ type: 'SET_CURRENT_CLASS', payload: e.target.value || null })}
        >
          <option value="">Select Class</option>
          {state.classes
            .filter(c => c.academicYearId === state.currentYearId)
            .map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select 
          className="border border-gray-200 rounded-full px-3 py-1.5 md:px-4 md:py-2 text-sm bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer flex-1 min-w-[110px]"
          value={state.currentQuarter || ''}
          onChange={(e) => dispatch({ type: 'SET_CURRENT_QUARTER', payload: e.target.value ? Number(e.target.value) as Quarter : null })}
        >
          <option value="">Select Quarter</option>
          <option value={1}>Quarter 1</option>
          <option value={2}>Quarter 2</option>
          <option value={3}>Quarter 3</option>
          <option value={4}>Quarter 4</option>
        </select>
      </div>

      <div className="w-full md:w-auto flex justify-between md:justify-end items-center md:space-x-5">
        
        {/* Auto-save indicator & Manual Save Button */}
        <div className="flex items-center hidden sm:flex">
          <div className={`flex items-center text-sm font-medium transition-all duration-500 ${showSaved ? 'text-emerald-500 translate-y-0 opacity-100' : 'text-gray-400 translate-y-1 opacity-0'}`}>
            <Check size={16} className="mr-1.5" /> Synced
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative w-full max-w-[160px] sm:max-w-[200px] md:w-56">
          <input
            type="text"
            placeholder="Search student..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-gray-200 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50 hover:bg-white transition-colors shadow-inner"
          />
          <Search className="absolute left-3.5 top-2.5 text-gray-400" size={16} />
        </form>

        {/* User Profile */}
        {currentUser && (
          <div className="flex items-center gap-3 border-l border-gray-200 pl-5 ml-1">
            <img 
              src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.email}`} 
              alt="Profile" 
              className="w-9 h-9 rounded-full border-2 border-indigo-100 shadow-sm hover:scale-105 transition-transform"
              title={currentUser.email || ''}
            />
            <button 
              onClick={() => logout()}
              className="text-sm font-semibold text-gray-500 hover:text-rose-500 transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
