import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckCircle, Users, BookOpen, BarChart3, Clock, Settings, GraduationCap, Trash2, ClipboardList } from 'lucide-react';

const Sidebar = ({ onNavClick }: { onNavClick?: () => void }) => {
  const links = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/record-attendance', label: 'Record Attendance', icon: <ClipboardList size={20} /> },
    { to: '/attendance', label: 'Attendance List', icon: <Users size={20} /> },
    { to: '/record', label: 'Record Participation', icon: <CheckCircle size={20} /> },
    { to: '/scores', label: 'Score List', icon: <ClipboardList size={20} /> },
    { to: '/ptc', label: 'PTC', icon: <Users size={20} /> },
    { to: '/semester-exam', label: 'Semester Exam', icon: <BookOpen size={20} /> },
    { to: '/classes', label: 'Classes & Years', icon: <BookOpen size={20} /> },
    { to: '/students', label: 'Students', icon: <Users size={20} /> },
    { to: '/quarter-summary', label: 'Quarter Summary', icon: <BarChart3 size={20} /> },
    { to: '/semester-summary', label: 'Semester Summary', icon: <GraduationCap size={20} /> },
    { to: '/history', label: 'History', icon: <Clock size={20} /> },
    { to: '/trash', label: 'Recently Deleted', icon: <Trash2 size={20} /> },
    { to: '/settings', label: 'Export / Backup', icon: <Settings size={20} /> },
  ];

  return (
    <div className="w-64 bg-gradient-to-b from-indigo-900 to-purple-900 text-white h-full flex flex-col shrink-0 shadow-2xl z-10 relative">
      <div className="h-16 flex items-center px-4 border-b border-white/10 bg-black/10">
        <h1 className="text-lg font-black text-white leading-tight flex items-center gap-2">
          <div className="bg-gradient-to-tr from-pink-500 to-orange-400 p-1.5 rounded-lg">
            <GraduationCap size={20} className="text-white" />
          </div>
          <div>
            Teacher Sokmean<br/>
            <span className="text-xs font-semibold text-indigo-200">Class Tracker</span>
          </div>
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        <nav className="space-y-1 px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavClick}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#f472b6]'
                    : 'text-indigo-200 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className={`mr-3 ${link.label === 'Record Participation' ? 'text-pink-400' : ''}`}>{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;
