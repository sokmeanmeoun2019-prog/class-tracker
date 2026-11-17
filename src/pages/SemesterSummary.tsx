import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Download } from 'lucide-react';
import { useData } from '../store/DataContext';
import { Quarter, ScoreRecord } from '../types';
import {
  calculateClassRanks,
  calculateStudentGrades,
  getClassQuarterTotal,
  getClassRoster,
  getClassSemesterTotal,
  getClassYearTotal,
  getStudentQuarterTotal
} from '../utils/calculations';
import { exportToExcel } from '../utils/export';

const hasEnteredScoreFields = (score: ScoreRecord | undefined): boolean => {
  if (!score) return false;
  return (
    typeof score.conduct === 'number' ||
    typeof score.cpScore === 'number' ||
    typeof score.hw1 === 'number' ||
    typeof score.hw2 === 'number' ||
    typeof score.hw3 === 'number' ||
    typeof score.quiz1 === 'number' ||
    typeof score.quiz2 === 'number' ||
    typeof score.quiz3 === 'number' ||
    typeof score.test1 === 'number' ||
    typeof score.test2 === 'number'
  );
};

const getLetterGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 50) return 'E';
  return 'F';
};

const getGradeBadgeClass = (grade: string) => {
  if (grade === 'A') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (grade === 'B') return 'bg-blue-100 text-blue-800 border-blue-300';
  if (grade === 'C') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (grade === 'D') return 'bg-orange-100 text-orange-800 border-orange-300';
  return 'bg-rose-100 text-rose-800 border-rose-300';
};

const SemesterSummary = () => {
  const { state } = useData();
  const [sortBy, setSortBy] = useState<'roster' | 'rank'>('roster');

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classStudents = useMemo(
    () => (state.currentClassId ? getClassRoster(state.students, state.currentClassId) : []),
    [state.students, state.currentClassId]
  );

  const summary = useMemo(() => {
    if (!state.currentClassId || !currentClass) {
      return {
        rows: [],
        qAvg: { 1: null, 2: null, 3: null, 4: null } as Record<Quarter, number | null>,
        sem1Avg: null as number | null,
        sem2Avg: null as number | null,
        yearAvg: null as number | null,
        sem1ExamAvg: null as number | null,
        sem2ExamAvg: null as number | null,
        sem1ExamCount: 0,
        sem2ExamCount: 0
      };
    }

    const quarters: Quarter[] = [1, 2, 3, 4];
    const scoresByQuarter: Record<Quarter, ScoreRecord[]> = {
      1: [],
      2: [],
      3: [],
      4: []
    };

    quarters.forEach(q => {
      scoresByQuarter[q] = state.scores.filter(
        s => (!s.classId || s.classId === state.currentClassId) && Number(s.quarter) === q
      );
    });

    const studentRows = classStudents.map(student => {
      const qScores: Record<Quarter, number | null> = { 1: null, 2: null, 3: null, 4: null };

      quarters.forEach(q => {
        const classScoresQ = scoresByQuarter[q];
        const score = classScoresQ.find(s => s.studentId === student.id);
        if (hasEnteredScoreFields(score)) {
          const rawCp = getStudentQuarterTotal(state.records, student.id, q);
          const calc = calculateStudentGrades(
            score,
            rawCp,
            state.gradingSettings,
            student.id,
            q,
            currentClass.name,
            classScoresQ
          );
          qScores[q] = calc.overallScore;
        }
      });

      const s1Valid = [qScores[1], qScores[2]].filter((v): v is number => v !== null);
      const s2Valid = [qScores[3], qScores[4]].filter((v): v is number => v !== null);
      const yearValid = [...s1Valid, ...s2Valid];

      const sem1Overall =
        s1Valid.length > 0
          ? Number((s1Valid.reduce((a, b) => a + b, 0) / s1Valid.length).toFixed(2))
          : null;
      const sem2Overall =
        s2Valid.length > 0
          ? Number((s2Valid.reduce((a, b) => a + b, 0) / s2Valid.length).toFixed(2))
          : null;
      const yearOverall =
        yearValid.length > 0
          ? Number((yearValid.reduce((a, b) => a + b, 0) / yearValid.length).toFixed(2))
          : null;

      const exam1 = state.examRecords?.find(r => r.id === `${student.id}-1`)?.score ?? null;
      const exam2 = state.examRecords?.find(r => r.id === `${student.id}-2`)?.score ?? null;

      const yearGrade = yearOverall !== null ? getLetterGrade(yearOverall) : null;
      const sem1Grade = sem1Overall !== null ? getLetterGrade(sem1Overall) : null;
      const sem2Grade = sem2Overall !== null ? getLetterGrade(sem2Overall) : null;

      const partTotal =
        getStudentQuarterTotal(state.records, student.id, 1) +
        getStudentQuarterTotal(state.records, student.id, 2) +
        getStudentQuarterTotal(state.records, student.id, 3) +
        getStudentQuarterTotal(state.records, student.id, 4);

      return {
        student,
        qScores,
        sem1Overall,
        sem2Overall,
        yearOverall,
        sem1Grade,
        sem2Grade,
        yearGrade,
        exam1,
        exam2,
        partTotal
      };
    });

    const scoredForRank = studentRows
      .filter(r => r.yearOverall !== null)
      .map(r => ({ studentId: r.student.id, overallScore: r.yearOverall! }));
    const rankMap = calculateClassRanks(scoredForRank);

    const rowsWithRank = studentRows.map(r => ({
      ...r,
      rank: r.yearOverall !== null ? rankMap[r.student.id] : null
    }));

    const avgNullable = (vals: (number | null)[]): number | null => {
      const valid = vals.filter((v): v is number => v !== null);
      if (valid.length === 0) return null;
      return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
    };

    const qAvg: Record<Quarter, number | null> = {
      1: avgNullable(rowsWithRank.map(r => r.qScores[1])),
      2: avgNullable(rowsWithRank.map(r => r.qScores[2])),
      3: avgNullable(rowsWithRank.map(r => r.qScores[3])),
      4: avgNullable(rowsWithRank.map(r => r.qScores[4]))
    };

    const sem1Avg = avgNullable(rowsWithRank.map(r => r.sem1Overall));
    const sem2Avg = avgNullable(rowsWithRank.map(r => r.sem2Overall));
    const yearAvg = avgNullable(rowsWithRank.map(r => r.yearOverall));

    const sem1Exams = rowsWithRank.map(r => r.exam1).filter((v): v is number => v !== null);
    const sem2Exams = rowsWithRank.map(r => r.exam2).filter((v): v is number => v !== null);
    const sem1ExamAvg = avgNullable(sem1Exams);
    const sem2ExamAvg = avgNullable(sem2Exams);

    return {
      rows: rowsWithRank,
      qAvg,
      sem1Avg,
      sem2Avg,
      yearAvg,
      sem1ExamAvg,
      sem2ExamAvg,
      sem1ExamCount: sem1Exams.length,
      sem2ExamCount: sem2Exams.length
    };
  }, [
    state.currentClassId,
    currentClass,
    classStudents,
    state.scores,
    state.records,
    state.gradingSettings,
    state.examRecords
  ]);

  const displayRows = useMemo(() => {
    if (sortBy === 'roster') {
      return [...summary.rows].sort((a, b) => a.student.displayNum - b.student.displayNum);
    }
    return [...summary.rows].sort((a, b) => {
      if (a.yearOverall !== null && b.yearOverall !== null) {
        return b.yearOverall - a.yearOverall;
      }
      if (a.yearOverall !== null) return -1;
      if (b.yearOverall !== null) return 1;
      return b.partTotal - a.partTotal;
    });
  }, [summary.rows, sortBy]);

  if (!state.currentClassId) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class from the header to view the semester summary.
      </div>
    );
  }

  const q1 = getClassQuarterTotal(state.records, state.currentClassId, 1);
  const q2 = getClassQuarterTotal(state.records, state.currentClassId, 2);
  const q3 = getClassQuarterTotal(state.records, state.currentClassId, 3);
  const q4 = getClassQuarterTotal(state.records, state.currentClassId, 4);

  const sem1 = getClassSemesterTotal(state.records, state.currentClassId, 1);
  const sem2 = getClassSemesterTotal(state.records, state.currentClassId, 2);
  const yearTotal = getClassYearTotal(state.records, state.currentClassId);

  const handleExport = async () => {
    if (!currentClass) return;
    const exportRows = displayRows.map(r => ({
      'No.': r.student.displayNum,
      'Name': r.student.name,
      'Name in Khmer': r.student.nameKhmer || '',
      'Student ID': r.student.studentId || '',
      'Q1 (%)': r.qScores[1] ?? '',
      'Q2 (%)': r.qScores[2] ?? '',
      'Sem 1 Overall (%)': r.sem1Overall ?? '',
      'Sem 1 Exam': r.exam1 ?? '',
      'Q3 (%)': r.qScores[3] ?? '',
      'Q4 (%)': r.qScores[4] ?? '',
      'Sem 2 Overall (%)': r.sem2Overall ?? '',
      'Sem 2 Exam': r.exam2 ?? '',
      'Year Overall (%)': r.yearOverall ?? '',
      'Grade': r.yearGrade ?? '',
      'Rank': r.rank ?? '',
      'Year Participations': r.partTotal
    }));
    const cleanClassName = currentClass.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^Class_?/i, '');
    await exportToExcel(exportRows, `Class_${cleanClassName}_Semester_Summary`);
  };

  const s1ExamRecorded = state.examInfos?.find(i => i.id === `${currentClass?.id}-1`);
  const s2ExamRecorded = state.examInfos?.find(i => i.id === `${currentClass?.id}-2`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-800">
          {currentClass?.name} — Academic Year Summary
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium transition-colors"
        >
          <Download size={18} /> Export Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Semester 1 Card */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
            <h3 className="text-lg font-bold">Semester 1</h3>
            {summary.sem1Avg !== null && (
              <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                Avg: {summary.sem1Avg}% ({getLetterGrade(summary.sem1Avg)})
              </span>
            )}
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 1</span>
              <div className="text-right">
                <span className="font-bold text-xl text-blue-700">
                  {summary.qAvg[1] !== null ? `${summary.qAvg[1]}%` : '—'}
                </span>
                <span className="ml-2 text-xs text-gray-400">({q1} part.)</span>
              </div>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 2</span>
              <div className="text-right">
                <span className="font-bold text-xl text-blue-700">
                  {summary.qAvg[2] !== null ? `${summary.qAvg[2]}%` : '—'}
                </span>
                <span className="ml-2 text-xs text-gray-400">({q2} part.)</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1 border-b pb-2">
              <span className="text-gray-900 font-bold">Semester 1 Overall Average</span>
              <div className="text-right">
                <span className="font-bold text-2xl text-blue-600">
                  {summary.sem1Avg !== null ? `${summary.sem1Avg}%` : '—'}
                </span>
                <div className="text-xs text-gray-500">Total Participation: {sem1}</div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-500 font-bold text-sm">Semester 1 Final Exam</span>
              <span className="font-bold text-gray-700 text-sm">
                {summary.sem1ExamAvg !== null
                  ? `Avg: ${summary.sem1ExamAvg}% (${summary.sem1ExamCount}/${classStudents.length})`
                  : s1ExamRecorded
                  ? 'Exam Recorded'
                  : 'Not yet entered'}
              </span>
            </div>
          </div>
        </div>

        {/* Semester 2 Card */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-green-600 text-white p-4 flex justify-between items-center">
            <h3 className="text-lg font-bold">Semester 2</h3>
            {summary.sem2Avg !== null && (
              <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                Avg: {summary.sem2Avg}% ({getLetterGrade(summary.sem2Avg)})
              </span>
            )}
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 3</span>
              <div className="text-right">
                <span className="font-bold text-xl text-green-700">
                  {summary.qAvg[3] !== null ? `${summary.qAvg[3]}%` : '—'}
                </span>
                <span className="ml-2 text-xs text-gray-400">({q3} part.)</span>
              </div>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 4</span>
              <div className="text-right">
                <span className="font-bold text-xl text-green-700">
                  {summary.qAvg[4] !== null ? `${summary.qAvg[4]}%` : '—'}
                </span>
                <span className="ml-2 text-xs text-gray-400">({q4} part.)</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1 border-b pb-2">
              <span className="text-gray-900 font-bold">Semester 2 Overall Average</span>
              <div className="text-right">
                <span className="font-bold text-2xl text-green-600">
                  {summary.sem2Avg !== null ? `${summary.sem2Avg}%` : '—'}
                </span>
                <div className="text-xs text-gray-500">Total Participation: {sem2}</div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-500 font-bold text-sm">Semester 2 Final Exam</span>
              <span className="font-bold text-gray-700 text-sm">
                {summary.sem2ExamAvg !== null
                  ? `Avg: ${summary.sem2ExamAvg}% (${summary.sem2ExamCount}/${classStudents.length})`
                  : s2ExamRecorded
                  ? 'Exam Recorded'
                  : 'Not yet entered'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Academic Year Banner */}
      <div className="bg-gray-800 text-white p-6 rounded-lg shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
        <div>
          <h3 className="text-xl font-bold">Academic Year Overall Performance</h3>
          <p className="text-gray-400 text-sm">
            Combined overall score average and participation for {currentClass?.name}
          </p>
        </div>
        <div className="flex sm:justify-end items-center gap-8">
          <div className="text-left sm:text-right">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Class Overall Avg
            </div>
            <div className="text-4xl font-black text-emerald-400">
              {summary.yearAvg !== null ? `${summary.yearAvg}%` : '—'}
            </div>
          </div>
          <div className="text-left sm:text-right border-l border-gray-700 pl-8">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Total Participations
            </div>
            <div className="text-4xl font-black">{yearTotal}</div>
          </div>
        </div>
      </div>

      {/* Student-by-Student Overall Scores Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">
              Student Semester &amp; Year Overall Scores
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Overall percentages are pulled from each quarter&apos;s Score List and Semester Exams.
            </p>
          </div>
          <button
            onClick={() => setSortBy(prev => (prev === 'roster' ? 'rank' : 'roster'))}
            className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <ArrowUpDown size={14} />
            {sortBy === 'roster' ? 'Sort by Overall Rank' : 'Revert to Roster Order'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b bg-gray-50/70 text-xs uppercase text-gray-500">
                <th className="p-3 font-semibold w-16">No.</th>
                <th className="p-3 font-semibold min-w-[180px]">Student Name</th>
                <th className="p-3 font-semibold text-center">Q1</th>
                <th className="p-3 font-semibold text-center">Q2</th>
                <th className="p-3 font-semibold text-center bg-blue-50/70 text-blue-800">Sem 1 Avg</th>
                <th className="p-3 font-semibold text-center">S1 Exam</th>
                <th className="p-3 font-semibold text-center">Q3</th>
                <th className="p-3 font-semibold text-center">Q4</th>
                <th className="p-3 font-semibold text-center bg-green-50/70 text-green-800">Sem 2 Avg</th>
                <th className="p-3 font-semibold text-center">S2 Exam</th>
                <th className="p-3 font-semibold text-center bg-indigo-50 text-indigo-800">Year Overall</th>
                <th className="p-3 font-semibold text-center">Grade</th>
                <th className="p-3 font-semibold text-center">Rank</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.student.id}
                  className={`border-b border-gray-200 transition-colors ${
                    idx % 2 === 0 ? 'bg-white hover:bg-gray-100/70' : 'bg-[#f2f2f2] hover:bg-gray-200/60'
                  }`}
                >
                  <td className="p-3 text-gray-500 font-medium">#{row.student.displayNum}</td>
                  <td className="p-3 font-medium">
                    <Link to={`/student/${row.student.id}`} className="text-blue-600 hover:underline">
                      {row.student.name}
                    </Link>
                    {row.student.nameKhmer && (
                      <div className="text-xs text-gray-500">{row.student.nameKhmer}</div>
                    )}
                  </td>
                  <td className="p-3 text-center">{row.qScores[1] !== null ? `${row.qScores[1]}%` : '—'}</td>
                  <td className="p-3 text-center">{row.qScores[2] !== null ? `${row.qScores[2]}%` : '—'}</td>
                  <td className="p-3 text-center font-semibold bg-blue-50/40 text-blue-700">
                    {row.sem1Overall !== null ? `${row.sem1Overall}%` : '—'}
                  </td>
                  <td className="p-3 text-center">{row.exam1 !== null ? `${row.exam1}` : '—'}</td>
                  <td className="p-3 text-center">{row.qScores[3] !== null ? `${row.qScores[3]}%` : '—'}</td>
                  <td className="p-3 text-center">{row.qScores[4] !== null ? `${row.qScores[4]}%` : '—'}</td>
                  <td className="p-3 text-center font-semibold bg-green-50/40 text-green-700">
                    {row.sem2Overall !== null ? `${row.sem2Overall}%` : '—'}
                  </td>
                  <td className="p-3 text-center">{row.exam2 !== null ? `${row.exam2}` : '—'}</td>
                  <td className="p-3 text-center font-bold bg-indigo-50/60 text-indigo-800">
                    {row.yearOverall !== null ? `${row.yearOverall}%` : '—'}
                  </td>
                  <td className="p-3 text-center">
                    {row.yearGrade ? (
                      <span
                        className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${getGradeBadgeClass(
                          row.yearGrade
                        )}`}
                      >
                        {row.yearGrade}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-semibold text-gray-700">
                    {row.rank !== null ? `#${row.rank}` : '—'}
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-6 text-center text-gray-500">
                    No students found in this class.
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

export default SemesterSummary;
