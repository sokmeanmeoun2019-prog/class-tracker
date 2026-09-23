
import { useParams, Link } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { getStudentQuarterTotal, getStudentSemesterTotal, getStudentYearTotal, getClassRoster, calculateStudentGrades } from '../utils/calculations';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowLeft } from 'lucide-react';

const StudentProfile = () => {
  const { id } = useParams();
  const { state } = useData();

  const student = state.students.find(s => s.id === id);
  if (!student) {
    return <div className="p-8 text-center text-red-500">Student not found</div>;
  }

  const currentClass = state.classes.find(c => c.id === student.classId);
  const yearName = state.academicYears.find(y => y.id === currentClass?.academicYearId)?.name;
  
  // Get dynamically assigned display number
  const roster = getClassRoster(state.students, student.classId);
  const rosterStudent = roster.find(s => s.id === student.id);
  const displayNum = rosterStudent?.displayNum || '-';

  const q1 = getStudentQuarterTotal(state.records, student.id, 1);
  const q2 = getStudentQuarterTotal(state.records, student.id, 2);
  const q3 = getStudentQuarterTotal(state.records, student.id, 3);
  const q4 = getStudentQuarterTotal(state.records, student.id, 4);

  const sem1 = getStudentSemesterTotal(state.records, student.id, 1);
  const sem2 = getStudentSemesterTotal(state.records, student.id, 2);
  const yearTotal = getStudentYearTotal(state.records, student.id);

  const chartData = [
    { name: 'Q1', participations: q1 },
    { name: 'Q2', participations: q2 },
    { name: 'Q3', participations: q3 },
    { name: 'Q4', participations: q4 },
  ];

  const renderQuarterScore = (q: 1|2|3|4, rawCp: number) => {
    const score = state.scores.find(s => s.studentId === student.id && s.quarter === q);
    if (!score) return <div className="text-gray-400 italic text-sm mt-2">No scores recorded for Q{q}</div>;
    const calc = calculateStudentGrades(score, rawCp, state.gradingSettings, student.id, q);
    const cappedRawCp = Math.min(rawCp, state.gradingSettings.maxScores.cp);
    
    return (
      <div className="text-sm mt-3 space-y-1">
        <div className="grid grid-cols-2 gap-2 text-gray-700">
          <div>Conduct: <strong>{score.conduct ?? '-'}</strong></div>
          <div>C.P: <strong>{score.cpScore ?? cappedRawCp}</strong></div>
          <div>HW Total: <strong>{calc.hwTotal}</strong></div>
          <div>Quiz Total: <strong>{calc.quizTotal}</strong></div>
          <div>Test Total: <strong>{calc.testTotal}</strong></div>
          <div className="text-indigo-700">Overall: <strong>{calc.overallScore} ({calc.letterGrade})</strong></div>
        </div>
        
        {score.achievement || calc.autoAchievement ? <div className="pt-2"><span className="text-gray-500">Achievement:</span> <strong>{score.achievement ?? calc.autoAchievement}</strong></div> : null}
        {score.attitude || calc.autoAttitude ? <div><span className="text-gray-500">Attitude:</span> <strong>{score.attitude ?? calc.autoAttitude}</strong></div> : null}
        
        {score.areasToImprove || calc.autoImprovement ? <div className="pt-1 text-red-600">Needs to improve: {score.areasToImprove ?? calc.autoImprovement}</div> : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Link to="/students" className="inline-flex items-center text-blue-600 hover:underline">
        <ArrowLeft size={16} className="mr-1" /> Back
      </Link>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">{student.name}</h2>
          <p className="text-gray-500 mt-1">
            Student No: {displayNum} {student.sex ? ` | ${student.sex}` : ''} {student.studentId ? ` | ID: ${student.studentId}` : ''}
          </p>
          <p className="text-gray-500">{currentClass?.name} ({yearName})</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500 uppercase tracking-wide">Year Participation Total</div>
          <div className="text-4xl font-black text-blue-600">{yearTotal}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border h-80">
          <h3 className="text-lg font-bold mb-4">Participation Trend</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={{fill: '#f3f4f6'}} />
              <Bar dataKey="participations" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-bold mb-4 border-b pb-2">Participation Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between font-medium"><span className="text-gray-600">Quarter 1</span><span>{q1}</span></div>
            <div className="flex justify-between font-medium"><span className="text-gray-600">Quarter 2</span><span>{q2}</span></div>
            <div className="flex justify-between font-bold text-blue-600 border-t pt-2 border-b pb-2"><span >Semester 1 Total</span><span>{sem1}</span></div>
            
            <div className="flex justify-between font-medium pt-2"><span className="text-gray-600">Quarter 3</span><span>{q3}</span></div>
            <div className="flex justify-between font-medium"><span className="text-gray-600">Quarter 4</span><span>{q4}</span></div>
            <div className="flex justify-between font-bold text-green-600 border-t pt-2"><span >Semester 2 Total</span><span>{sem2}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-xl font-bold mb-6 border-b pb-2">Academic Performance (Score List)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-bold text-lg text-gray-800 border-b pb-2">Quarter 1</h4>
            {renderQuarterScore(1, q1)}
          </div>
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-bold text-lg text-gray-800 border-b pb-2">Quarter 2</h4>
            {renderQuarterScore(2, q2)}
          </div>
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-bold text-lg text-gray-800 border-b pb-2">Quarter 3</h4>
            {renderQuarterScore(3, q3)}
          </div>
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-bold text-lg text-gray-800 border-b pb-2">Quarter 4</h4>
            {renderQuarterScore(4, q4)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;
