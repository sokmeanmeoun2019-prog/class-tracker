import { useData } from '../store/DataContext';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { state } = useData();

  const totalClasses = state.classes.length;
  const totalStudents = state.students.length;
  const totalRecords = state.records.length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-800 to-purple-600 drop-shadow-sm mb-2">
          Welcome back!
        </h2>
        <p className="text-gray-500 font-medium">Here's what's happening across your classes today.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">Total Classes</h3>
          <p className="text-5xl font-black text-blue-600 mt-3">{totalClasses}</p>
        </div>
        
        <div className="glass-card p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">Total Students</h3>
          <p className="text-5xl font-black text-emerald-600 mt-3">{totalStudents}</p>
        </div>
        
        <div className="glass-card p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">Total Participations</h3>
          <p className="text-5xl font-black text-purple-600 mt-3">{totalRecords}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <h3 className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Total Present</h3>
          <p className="text-3xl font-black text-emerald-500 mt-2">{state.attendanceRecords.filter(r => r.status === 'Present').length}</p>
        </div>
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <h3 className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Total Excused</h3>
          <p className="text-3xl font-black text-amber-500 mt-2">{state.attendanceRecords.filter(r => r.status === 'Excused').length}</p>
        </div>
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <h3 className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Total Unexcused</h3>
          <p className="text-3xl font-black text-rose-500 mt-2">{state.attendanceRecords.filter(r => r.status === 'Unexcused').length}</p>
        </div>
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <h3 className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Attendance Alerts</h3>
          <p className="text-3xl font-black text-rose-700 mt-2">
            {
              state.students.filter(student => {
                const unexcused = state.attendanceRecords.filter(r => r.studentId === student.id && r.status === 'Unexcused' && r.quarter === state.currentQuarter).length;
                return unexcused >= (state.attendanceSettings?.alertThreshold || 6);
              }).length
            }
          </p>
        </div>
      </div>

      {!state.currentClassId || !state.currentQuarter ? (
        <div className="bg-gradient-to-r from-amber-100 to-amber-50 border border-amber-200 p-6 rounded-3xl shadow-sm">
          <p className="text-amber-800 text-lg">
            👋 Please select an <strong>Academic Year</strong>, <strong>Class</strong>, and <strong>Quarter</strong> in the top header to begin recording.
          </p>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl shadow-xl text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <h3 className="text-2xl font-bold text-white mb-6 relative z-10">Ready to start class?</h3>
          <Link 
            to="/record" 
            className="inline-block bg-white text-indigo-700 px-8 py-4 rounded-full font-black hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all z-10 relative"
          >
            Go to Record Participation
          </Link>
        </div>
      )}
      
      <div className="glass-card p-8 rounded-3xl">
         <h3 className="text-xl font-bold text-gray-800 mb-5">Quick Guide</h3>
         <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
           <li className="flex gap-3 items-start"><span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">1</span> <div>Go to <strong className="text-indigo-900">Classes & Years</strong> to setup your Academic Years and Classes.</div></li>
           <li className="flex gap-3 items-start"><span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">2</span> <div>Go to <strong className="text-indigo-900">Students</strong> to add or import your students.</div></li>
           <li className="flex gap-3 items-start"><span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">3</span> <div>Select your Class and Quarter in the top header.</div></li>
           <li className="flex gap-3 items-start"><span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">4</span> <div>Go to <strong className="text-indigo-900">Record Participation</strong> during your lesson to easily add marks.</div></li>
         </ol>
      </div>
    </div>
  );
};

export default Dashboard;
