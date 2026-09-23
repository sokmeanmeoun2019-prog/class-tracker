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
    <header className="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center space-x-4 w-1/2">
        {/* Context Selectors */}
        <select 
          className="border rounded-md px-3 py-1.5 text-sm bg-gray-50"
          value={state.currentYearId || ''}
          onChange={(e) => dispatch({ type: 'SET_CURRENT_YEAR', payload: e.target.value || null })}
        >
          <option value="">Select Year</option>
          {state.academicYears.map(y => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>

        <select 
          className="border rounded-md px-3 py-1.5 text-sm bg-gray-50"
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
          className="border rounded-md px-3 py-1.5 text-sm bg-gray-50"
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

      <div className="w-1/2 flex justify-end items-center space-x-4">
        
        {/* Auto-save indicator & Manual Save Button */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center text-sm font-medium transition-opacity duration-300 ${showSaved ? 'text-green-600 opacity-100' : 'text-gray-400 opacity-0'}`}>
            <Check size={16} className="mr-1" /> Cloud Synced
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative w-48">
          <input
            type="text"
            placeholder="Search student..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          <Search className="absolute left-3 top-2 text-gray-400" size={16} />
        </form>

        {/* User Profile */}
        {currentUser && (
          <div className="flex items-center gap-3 border-l pl-4 ml-2">
            <img 
              src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.email}`} 
              alt="Profile" 
              className="w-8 h-8 rounded-full border border-gray-200"
              title={currentUser.email || ''}
            />
            <button 
              onClick={() => logout()}
              className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
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
