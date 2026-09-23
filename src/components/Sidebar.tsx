import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckCircle, Users, BookOpen, BarChart3, Clock, Settings, GraduationCap, Trash2, ClipboardList } from 'lucide-react';

const Sidebar = () => {
  const links = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/record', label: 'Record Participation', icon: <CheckCircle size={20} /> },
    { to: '/scores', label: 'Score List', icon: <ClipboardList size={20} /> },
    { to: '/classes', label: 'Classes & Years', icon: <BookOpen size={20} /> },
    { to: '/students', label: 'Students', icon: <Users size={20} /> },
    { to: '/quarter-summary', label: 'Quarter Summary', icon: <BarChart3 size={20} /> },
    { to: '/semester-summary', label: 'Semester Summary', icon: <GraduationCap size={20} /> },
    { to: '/history', label: 'History', icon: <Clock size={20} /> },
    { to: '/trash', label: 'Recently Deleted', icon: <Trash2 size={20} /> },
    { to: '/settings', label: 'Export / Backup', icon: <Settings size={20} /> },
  ];

  return (
    <div className="w-64 bg-white border-r h-full flex flex-col shrink-0">
      <div className="h-16 flex items-center px-4 border-b">
        <h1 className="text-lg font-black text-blue-600 leading-tight">
          Teacher Sokmean<br/>
          <span className="text-sm font-semibold text-gray-500">Class Tracker</span>
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              <span className="mr-3">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;
