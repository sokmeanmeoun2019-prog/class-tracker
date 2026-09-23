import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { getClassQuarterTotal, getAverageParticipation, getClassRoster, getStudentQuarterTotal } from '../utils/calculations';
import { exportQuarterSummary } from '../utils/export';
import { Download, ArrowUpDown, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

const QuarterSummary = () => {
  const { state } = useData();
  const [sortBy, setSortBy] = useState<'roster' | 'rank'>('roster');
  const [showFeedback, setShowFeedback] = useState(false);

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter from the header to view the summary.
      </div>
    );
  }

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = getClassRoster(state.students, state.currentClassId);
  
  const totalParticipations = getClassQuarterTotal(state.records, state.currentClassId, state.currentQuarter);
  const average = getAverageParticipation(totalParticipations, classStudents.length);
  
  // Calculate totals for all students
  const studentStats = classStudents.map(student => ({
    student,
    total: getStudentQuarterTotal(state.records, student.id, state.currentQuarter!)
  }));

  // Determine most/least for the summary cards
  const sortedByTotal = [...studentStats].sort((a, b) => b.total - a.total);
  const most = sortedByTotal.length > 0 ? sortedByTotal[0].total : 0;
  const least = sortedByTotal.length > 0 ? sortedByTotal[sortedByTotal.length - 1].total : 0;

  // Determine what list to render based on toggle
  const displayList = sortBy === 'roster' 
    ? [...studentStats].sort((a, b) => a.student.displayNum - b.student.displayNum)
    : sortedByTotal;

  const handleExport = () => {
    if (currentClass) {
      exportQuarterSummary(classStudents, state.records, currentClass, state.currentQuarter!);
    }
  };

  const generateFeedback = (total: number, classAvg: number, max: number) => {
    if (total === 0) {
      return "You haven't participated this quarter. I strongly encourage you to share your thoughts in class—your perspective is valuable! Start by asking one question next week.";
    }
    if (total < classAvg * 0.5) {
      return "I know physics can be challenging, and you are doing a good job listening. However, I'd love to hear your voice more often! Start small—try asking just one question about a topic you find confusing, or share an observation during an experiment.";
    }
    if (total >= classAvg * 0.5 && total <= classAvg * 1.2) {
      return "Solid and consistent effort this quarter. You are following along well with the physics concepts. To take the next step, try volunteering to solve a problem on the board or sharing your hypothesis before we start an experiment.";
    }
    if (total > classAvg * 1.2 && total < max * 0.9) {
      return "Great job participating! Your contributions make our physics lessons more dynamic. Keep sharing your ideas, and don't be afraid to ask 'what if' questions to deepen your understanding of the material.";
    }
    return "Outstanding engagement this quarter! You consistently bring excellent insights to our physics discussions. As a leader in the classroom, try challenging yourself by helping peers understand complex concepts or guiding group experiments.";
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">
          {currentClass?.name} — Quarter {state.currentQuarter} Dashboard
        </h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowFeedback(!showFeedback)} 
            className={`flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors ${showFeedback ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            <MessageSquare size={18} /> {showFeedback ? 'Hide Feedback Analysis' : 'Analyze Class & Give Feedback'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
          <div className="text-sm text-gray-500">Total Students</div>
          <div className="text-2xl font-bold mt-1">{classStudents.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
          <div className="text-sm text-gray-500">Total Participations</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{totalParticipations}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
          <div className="text-sm text-gray-500">Average / Student</div>
          <div className="text-2xl font-bold mt-1">{average}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
          <div className="text-sm text-gray-500">Most / Least</div>
          <div className="text-2xl font-bold mt-1">{most} / {least}</div>
        </div>
      </div>

      {showFeedback && (
        <div className="bg-white rounded-lg shadow-md border-2 border-indigo-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4">
          <div className="p-5 border-b bg-indigo-50 flex items-start gap-4">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 className="font-bold text-indigo-900 text-lg">Constructive Feedback Report</h3>
              <p className="text-sm text-indigo-700 mt-1">
                Generated based on each student's quarter participation compared to the class average (<strong>{average}</strong>). 
                Use these comments for report cards or one-on-one reviews.
              </p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {displayList.map((stat) => (
              <div key={stat.student.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-gray-900 text-lg">
                    <span className="text-gray-400 font-normal mr-2">#{stat.student.displayNum}</span>
                    {stat.student.name}
                  </h4>
                  <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full border border-indigo-200">
                    Score: {stat.total}
                  </span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                  <span className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold tracking-wider text-gray-400 uppercase">Constructive Comment</span>
                  <p className="text-gray-700 italic leading-relaxed">
                    "{generateFeedback(stat.total, average, most)}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700">Student Quarter Results</h3>
          <button 
            onClick={() => setSortBy(prev => prev === 'roster' ? 'rank' : 'roster')}
            className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <ArrowUpDown size={14} />
            {sortBy === 'roster' ? 'Show Highest Participation' : 'Revert to Roster Order'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-sm text-gray-500">
                <th className="p-4 font-semibold w-24">No.</th>
                <th className="p-4 font-semibold">Student Name</th>
                <th className="p-4 font-semibold text-right">Participations</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((stat, idx) => (
                <tr key={stat.student.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 text-gray-500 font-medium">
                    #{stat.student.displayNum}
                    {sortBy === 'rank' && (
                      <span className="ml-2 text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded">Rank {idx + 1}</span>
                    )}
                  </td>
                  <td className="p-4 font-medium text-blue-600 hover:underline">
                    <Link to={`/student/${stat.student.id}`}>{stat.student.name}</Link>
                  </td>
                  <td className="p-4 text-right font-bold text-gray-700 text-lg">{stat.total}</td>
                </tr>
              ))}
              {displayList.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-500">No students in this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QuarterSummary;
