import { ParticipationRecord, Quarter, Student } from '../types';

export const getClassRoster = (students: Student[], classId: string) => {
  return students
    .filter(s => s.classId === classId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s, index) => ({
      ...s,
      displayNum: index + 1
    }));
};

export const getStudentQuarterTotal = (records: ParticipationRecord[], studentId: string, quarter: Quarter): number => {
  return records.filter(r => r.studentId === studentId && r.quarter === quarter).length;
};

export const getStudentSemesterTotal = (records: ParticipationRecord[], studentId: string, semester: 1 | 2): number => {
  const quarters = semester === 1 ? [1, 2] : [3, 4];
  return records.filter(r => r.studentId === studentId && quarters.includes(r.quarter)).length;
};

export const getStudentYearTotal = (records: ParticipationRecord[], studentId: string): number => {
  return records.filter(r => r.studentId === studentId).length;
};

export const getClassQuarterTotal = (records: ParticipationRecord[], classId: string, quarter: Quarter): number => {
  return records.filter(r => r.classId === classId && r.quarter === quarter).length;
};

export const getClassSemesterTotal = (records: ParticipationRecord[], classId: string, semester: 1 | 2): number => {
  const quarters = semester === 1 ? [1, 2] : [3, 4];
  return records.filter(r => r.classId === classId && quarters.includes(r.quarter)).length;
};

export const getClassYearTotal = (records: ParticipationRecord[], classId: string): number => {
  return records.filter(r => r.classId === classId).length;
};

export const getAverageParticipation = (classQuarterTotal: number, numStudents: number): number => {
  if (numStudents === 0) return 0;
  return Number((classQuarterTotal / numStudents).toFixed(2));
};

export const rankStudents = (records: ParticipationRecord[], students: Student[], quarter: Quarter) => {
  const stats = students.map(student => ({
    student,
    total: getStudentQuarterTotal(records, student.id, quarter)
  }));
  
  return stats.sort((a, b) => b.total - a.total).map((stat, index) => ({
    ...stat,
    rank: index + 1
  }));
};

import { ScoreRecord, GradingSettings } from '../types';

export const generateAcademicFeedback = (studentId: string, quarter: number, score: number) => {
  let tier = 0; // 0 = A, 1 = B, 2 = C, 3 = D, 4 = F
  if (score >= 90) tier = 0;
  else if (score >= 80) tier = 1;
  else if (score >= 70) tier = 2;
  else if (score >= 60) tier = 3;
  else tier = 4;

  const achievements = [
    ["Exceptional mastery.", "Outstanding work.", "Brilliant performance.", "Top-tier results.", "Exceeds expectations."],
    ["Strong grasp of concepts.", "Very good results.", "Commendable effort.", "Solid understanding.", "Great work."],
    ["Satisfactory progress.", "Meets basic standards.", "Fair understanding.", "Adequate performance.", "Steady effort."],
    ["Needs some review.", "Struggling with core ideas.", "Inconsistent results.", "Below expectations.", "Room for growth."],
    ["Requires urgent help.", "Major conceptual gaps.", "Poor performance.", "Did not meet goals.", "Needs intense focus."]
  ];

  const attitudes = [
    ["Highly engaged.", "Eager to learn.", "Positive role model.", "Enthusiastic participant.", "Self-driven."],
    ["Attentive and focused.", "Works well with others.", "Consistently participates.", "Diligent student.", "Proactive."],
    ["Generally attentive.", "Respectful in class.", "Follows instructions.", "Good conduct.", "Polite and quiet."],
    ["Easily distracted.", "Quiet in discussions.", "Could be more engaged.", "Needs encouragement.", "Sometimes unfocused."],
    ["Lacks engagement.", "Seems disconnected.", "Needs to focus more.", "Often unprepared.", "Disrupts occasionally."]
  ];

  const improvements = [
    ["Peer mentoring.", "Tackle advanced physics.", "Lead group projects.", "Explore beyond syllabus.", "Maintain excellence."],
    ["Double-check calculations.", "Speak up more.", "Focus on tricky concepts.", "Ask deeper questions.", "Take more initiative."],
    ["Review past tests.", "Practice more problems.", "Focus during lectures.", "Ask when confused.", "Improve study habits."],
    ["Complete missing homework.", "Attend extra tutoring.", "Focus on basic formulas.", "Participate more.", "Ask for help."],
    ["Meet after class.", "Redo failed assignments.", "Ask for help immediately.", "Consistent daily review.", "Stay on task."]
  ];

  // Simple hash to ensure consistency per student but variety across students
  const hash = studentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + quarter;
  
  const achArr = achievements[tier];
  const attArr = attitudes[tier];
  const impArr = improvements[tier];

  return {
    autoAchievement: achArr[hash % achArr.length],
    autoAttitude: attArr[(hash + 1) % attArr.length],
    autoImprovement: impArr[(hash + 2) % impArr.length]
  };
};

export const calculateStudentGrades = (
  score: ScoreRecord | undefined, 
  rawCp: number, 
  settings: GradingSettings,
  studentId: string = '',
  quarter: number = 1,
  className: string = '',
  classScores: ScoreRecord[] = []
) => {
  const safeNum = (val: number | undefined) => (typeof val === 'number' && !isNaN(val)) ? val : 0;
  
  const conduct = safeNum(score?.conduct);
  
  // Cap the raw CP from the tracker at the maximum allowed CP score (e.g., 10)
  const effectiveRawCp = Math.min(rawCp, settings.maxScores.cp);
  const cp = score?.cpScore !== undefined ? safeNum(score.cpScore) : effectiveRawCp;
  
  const hwTotal = safeNum(score?.hw1) + safeNum(score?.hw2) + safeNum(score?.hw3);
  const quizTotal = safeNum(score?.quiz1) + safeNum(score?.quiz2) + safeNum(score?.quiz3);
  const testTotal = safeNum(score?.test1) + safeNum(score?.test2);

  // Dynamic counts based on actual inputs in the class
  const hasHw3 = classScores.some(s => typeof s.hw3 === 'number');
  const hasQuiz3 = classScores.some(s => typeof s.quiz3 === 'number');
  const hasTest2 = classScores.some(s => typeof s.test2 === 'number');

  // Fallback to class name if no scores exist yet
  const isLowerGrade = className.match(/\b(7|8|9|10|11)\b/i) || className.toLowerCase().match(/grade (7|8|9|10|11)/);

  const hwCount = classScores.length > 0 ? (hasHw3 ? 3 : 2) : (isLowerGrade ? 2 : 3);
  const quizCount = classScores.length > 0 ? (hasQuiz3 ? 3 : 2) : (isLowerGrade ? 2 : 3);
  const testCount = classScores.length > 0 ? (hasTest2 ? 2 : 1) : (isLowerGrade ? 1 : 2);

  // Percentages based on max score
  const conductPct = settings.maxScores.conduct > 0 ? (conduct / settings.maxScores.conduct) : 0;
  const cpPct = settings.maxScores.cp > 0 ? (cp / settings.maxScores.cp) : 0;
  
  const hwMax = settings.maxScores.hw * hwCount;
  const hwPct = hwMax > 0 ? (hwTotal / hwMax) : 0;
  
  const quizMax = settings.maxScores.quiz * quizCount;
  const quizPct = quizMax > 0 ? (quizTotal / quizMax) : 0;
  
  const testMax = settings.maxScores.test * testCount;
  const testPct = testMax > 0 ? (testTotal / testMax) : 0;

  // Weighted overall score out of 100
  const overall = (
    (conductPct * settings.weights.conduct) +
    (cpPct * settings.weights.cp) +
    (hwPct * settings.weights.hw) +
    (quizPct * settings.weights.quiz) +
    (testPct * settings.weights.test)
  );

  const overallScore = Number(overall.toFixed(2));
  
  let letterGrade = 'F';
  if (overallScore >= 90) letterGrade = 'A';
  else if (overallScore >= 80) letterGrade = 'B';
  else if (overallScore >= 70) letterGrade = 'C';
  else if (overallScore >= 60) letterGrade = 'D';
  else if (overallScore >= 50) letterGrade = 'E';

  const autoFeedback = generateAcademicFeedback(studentId, quarter, overallScore);

  return {
    hwTotal,
    quizTotal,
    testTotal,
    overallScore,
    letterGrade,
    ...autoFeedback
  };
};
