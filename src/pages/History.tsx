import React, { useState } from 'react';
import { useData } from '../store/DataContext';

const History = () => {
  const { state, dispatch } = useData();
  const [filterClass, setFilterClass] = useState(state.currentClassId || '');
  const [filterQuarter, setFilterQuarter] = useState<number | ''>(state.currentQuarter || '');
  const [filterDate, setFilterDate] = useState('');

  let records = [...state.records].reverse(); // newest first

  if (filterClass) records = records.filter(r => r.classId === filterClass);
  if (filterQuarter) records = records.filter(r => r.quarter === Number(filterQuarter));
  if (filterDate) records = records.filter(r => r.date === filterDate);

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this participation record?')) {
      dispatch({ type: 'REMOVE_RECORD', payload: id });
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <h2 className="text-2xl font-bold text-gray-800">Participation History</h2>
      
      <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Filter Class</label>
          <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} className="border rounded px-3 py-1.5 text-sm w-48">
            <option value="">All Classes</option>
            {state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Filter Quarter</label>
          <select value={filterQuarter} onChange={e=>setFilterQuarter(e.target.value ? Number(e.target.value) : '')} className="border rounded px-3 py-1.5 text-sm w-32">
            <option value="">All</option>
            <option value={1}>Q1</option>
            <option value={2}>Q2</option>
            <option value={3}>Q3</option>
            <option value={4}>Q4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Filter Date</label>
          <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
        </div>
        <button onClick={() => { setFilterClass(''); setFilterQuarter(''); setFilterDate(''); }} className="text-sm text-blue-600 hover:underline pb-1.5">
          Clear Filters
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
              <tr className="border-b text-sm text-gray-500">
                <th className="p-3 font-semibold">Date & Time</th>
                <th className="p-3 font-semibold">Class</th>
                <th className="p-3 font-semibold">Student</th>
                <th className="p-3 font-semibold">Qtr</th>
                <th className="p-3 font-semibold">Activity</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const s = state.students.find(x => x.id === r.studentId);
                const c = state.classes.find(x => x.id === r.classId);
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50 text-sm">
                    <td className="p-3 whitespace-nowrap">{r.date} {r.time}</td>
                    <td className="p-3">{c?.name || 'Unknown'}</td>
                    <td className="p-3 font-medium">{s?.name || 'Unknown'}</td>
                    <td className="p-3">Q{r.quarter}</td>
                    <td className="p-3 text-gray-600">{r.activityName || '-'}</td>
                    <td className="p-3 text-gray-600">{r.participationType}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 font-medium">Delete</button>
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default History;
