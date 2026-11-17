import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { getClassQuarterTotal, getAverageParticipation, getClassRoster, getStudentQuarterTotal } from '../utils/calculations';
import { generateQuarterClassFeedback } from '../utils/quarterFeedbackGenerator';
import { exportQuarterSummary } from '../utils/export';
import { Download, ArrowUpDown, MessageSquare, RefreshCw, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const QuarterSummary = () => {
  const { state } = useData();
  const [sortBy, setSortBy] = useState<'roster' | 'rank'>('roster');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSeed, setFeedbackSeed] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = useMemo(
    () => (state.currentClassId ? getClassRoster(state.students, state.currentClassId) : []),
    [state.students, state.currentClassId]
  );

  const feedbackReport = useMemo(() => {
    if (!state.currentClassId || !state.currentQuarter) {
      return {
        analyses: [],
        classHasScores: false,
        classScoreAvg: 0,
        classPartAvg: 0,
        mostParticipation: 0,
        leastParticipation: 0
      };
    }
    return generateQuarterClassFeedback({
      roster: classStudents,
      scores: state.scores,
      records: state.records,
      attendanceRecords: state.attendanceRecords,
      gradingSettings: state.gradingSettings,
      attendanceSettings: state.attendanceSettings,
      classId: state.currentClassId,
      className: currentClass?.name || '',
      quarter: state.currentQuarter,
      seedOffset: feedbackSeed
    });
  }, [
    classStudents,
    state.scores,
    state.records,
    state.attendanceRecords,
    state.gradingSettings,
    state.attendanceSettings,
    state.currentClassId,
    currentClass?.name,
    state.currentQuarter,
    feedbackSeed
  ]);

  if (!state.currentClassId || !state.currentQuarter) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class and Quarter from the header to view the summary.
      </div>
    );
  }

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

  const analysisByStudentId = new Map(
    feedbackReport.analyses.map(item => [item.student.id, item] as const)
  );

  const feedbackDisplayList = sortBy === 'roster'
    ? [...feedbackReport.analyses].sort((a, b) => a.student.displayNum - b.student.displayNum)
    : [...feedbackReport.analyses].sort((a, b) =>
        feedbackReport.classHasScores ? b.overallScore - a.overallScore : b.rawCp - a.rawCp
      );

  const handleExport = async () => {
    if (currentClass) {
      await exportQuarterSummary(classStudents, state.records, currentClass, state.currentQuarter!);
    }
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleCopyAllFeedback = async () => {
    const lines = feedbackDisplayList.map(item => {
      const scoreSummary = item.hasStudentScoreFields
        ? `Overall: ${item.overallScore}% (Grade ${item.letterGrade}, Rank #${item.rank})`
        : `Participations: ${item.rawCp}`;
      return `#${item.student.displayNum} ${item.student.name} [${scoreSummary}]\n${item.comment}`;
    });
    await handleCopyText(lines.join('\n\n'), '__ALL__');
  };

  const getGradeBadgeStyle = (grade: string) => {
    if (grade === 'A') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (grade === 'B') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (grade === 'C') return 'bg-amber-100 text-amber-800 border-amber-300';
    if (grade === 'D') return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-rose-100 text-rose-800 border-rose-300';
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
          <div className="p-5 border-b bg-indigo-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="bg-indigo-600 text-white p-2 rounded-lg shrink-0">
                <MessageSquare size={24} />
              </div>
              <div>
                <h3 className="font-bold text-indigo-900 text-lg">Constructive Feedback Report</h3>
                <p className="text-sm text-indigo-700 mt-1">
                  {feedbackReport.classHasScores ? (
                    <>
                      Tailored to each student&apos;s actual Quarter {state.currentQuarter} scores (Class Score Avg:{' '}
                      <strong>{feedbackReport.classScoreAvg}%</strong>, Participation Avg:{' '}
                      <strong>{average}</strong>), conduct, and attendance. Every student receives distinct feedback.
                    </>
                  ) : (
                    <>
                      Generated from each student&apos;s Quarter {state.currentQuarter} participation (Class Avg:{' '}
                      <strong>{average}</strong>) and attendance records. Every student receives distinct feedback.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFeedbackSeed(prev => prev + 1)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                title="Generate alternative wording aligned with each student's actual results"
              >
                <RefreshCw size={14} /> Refresh Wording
              </button>
              <button
                type="button"
                onClick={handleCopyAllFeedback}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {copiedId === '__ALL__' ? <Check size={14} /> : <Copy size={14} />}
                {copiedId === '__ALL__' ? 'Copied All' : 'Copy All'}
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {feedbackDisplayList.map((item) => (
              <div key={item.student.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-wrap justify-between items-start gap-3 mb-2.5">
                  <div>
                    <h4 className="font-bold text-gray-900 text-lg flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400 font-normal">#{item.student.displayNum}</span>
                      <Link to={`/student/${item.student.id}`} className="hover:text-indigo-700 hover:underline">
                        {item.student.name}
                      </Link>
                      {item.student.nameKhmer && (
                        <span className="text-sm font-normal text-gray-500">({item.student.nameKhmer})</span>
                      )}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                      {item.hasConductInClass && item.conductVal !== undefined && (
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                          Conduct: <strong>{item.conductVal}/{state.gradingSettings.maxScores.conduct}</strong>
                        </span>
                      )}
                      {(item.classHasScores || item.rawCp > 0) && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                          CP: <strong>{item.effectiveCp}/{state.gradingSettings.maxScores.cp}</strong>
                          {item.rawCp !== item.effectiveCp ? ` (Logs: ${item.rawCp})` : ''}
                        </span>
                      )}
                      {item.hasHwInClass && item.hasStudentScoreFields && (
                        <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                          HW: <strong>{item.hwTotal}%</strong>
                        </span>
                      )}
                      {item.hasQuizInClass && item.hasStudentScoreFields && (
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
                          Quiz: <strong>{item.quizTotal}%</strong>
                        </span>
                      )}
                      {item.hasTestInClass && item.hasStudentScoreFields && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          Test: <strong>{item.testTotal}%</strong>
                        </span>
                      )}
                      {item.attendance.total > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            item.attendance.unexcused >= state.attendanceSettings.alertThreshold
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : item.attendance.unexcused >= state.attendanceSettings.warningThreshold
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          Attendance: <strong>{item.attendance.rate}%</strong>
                          {item.attendance.unexcused > 0 ? ` (${item.attendance.unexcused} unexcused)` : ''}
                        </span>
                      )}
                      {!item.classHasScores && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          Participations: <strong>{item.rawCp}</strong>
                          {item.topParticipationType ? ` • Top: ${item.topParticipationType}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.hasStudentScoreFields ? (
                      <>
                        <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">
                          Rank #{item.rank}
                        </span>
                        <span
                          className={`text-sm font-bold px-3 py-1 rounded-full border ${getGradeBadgeStyle(
                            item.letterGrade
                          )}`}
                        >
                          Overall: {item.overallScore}% ({item.letterGrade})
                        </span>
                      </>
                    ) : (
                      <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full border border-indigo-200">
                        Participations: {item.rawCp}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyText(item.comment, item.student.id)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                      title="Copy feedback comment"
                    >
                      {copiedId === item.student.id ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative mt-3">
                  <span className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Constructive Feedback
                  </span>
                  <p className="text-gray-700 leading-relaxed">
                    &ldquo;{item.comment}&rdquo;
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
                {feedbackReport.classHasScores && (
                  <>
                    <th className="p-4 font-semibold text-right">Overall Score</th>
                    <th className="p-4 font-semibold text-center">Grade</th>
                  </>
                )}
                <th className="p-4 font-semibold text-right">Participations</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((stat, idx) => {
                const analysis = analysisByStudentId.get(stat.student.id);
                return (
                  <tr 
                    key={stat.student.id} 
                    className={`border-b border-gray-200 transition-colors ${
                      idx % 2 === 0 ? 'bg-white hover:bg-gray-100/70' : 'bg-[#f2f2f2] hover:bg-gray-200/60'
                    }`}
                  >
                    <td className="p-4 text-gray-500 font-medium">
                      #{stat.student.displayNum}
                      {sortBy === 'rank' && (
                        <span className="ml-2 text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded">Rank {idx + 1}</span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-blue-600 hover:underline">
                      <Link to={`/student/${stat.student.id}`}>{stat.student.name}</Link>
                    </td>
                    {feedbackReport.classHasScores && (
                      <>
                        <td className="p-4 text-right font-semibold text-indigo-700">
                          {analysis?.hasStudentScoreFields ? `${analysis.overallScore}%` : '—'}
                        </td>
                        <td className="p-4 text-center">
                          {analysis?.hasStudentScoreFields ? (
                            <span
                              className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${getGradeBadgeStyle(
                                analysis.letterGrade
                              )}`}
                            >
                              {analysis.letterGrade}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="p-4 text-right font-bold text-gray-700 text-lg">{stat.total}</td>
                  </tr>
                );
              })}
              {displayList.length === 0 && (
                <tr>
                  <td colSpan={feedbackReport.classHasScores ? 5 : 3} className="p-4 text-center text-gray-500">
                    No students in this class.
                  </td>
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
