import { ParticipationRecord, Quarter, Student, ScoreRecord, GradingSettings, AttendanceRecord, AttendanceSettings, Quarter as QuarterType } from '../types';

export const getClassRoster = (students: Student[], classId: string) => {
  return students
    .filter(s => s.classId === classId)
    .sort((a, b) => {
      const numA = a.rosterNumber !== undefined ? a.rosterNumber : 9999;
      const numB = b.rosterNumber !== undefined ? b.rosterNumber : 9999;
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    })
    .map((s, index) => ({
      ...s,
      displayNum: s.rosterNumber !== undefined ? s.rosterNumber : index + 1
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


type GradeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type AchievementFocus = 'general' | 'test' | 'quiz' | 'hw';
type AttitudeFocus = 'general' | 'high_cp' | 'low_cp' | 'high_conduct' | 'low_conduct';
type ImprovementFocus = 'general' | 'test' | 'quiz' | 'hw' | 'cp';

interface TaggedComment<F extends string> {
  text: string;
  focus: F;
}

export interface PerformanceBreakdown {
  conductPct: number;
  cpPct: number;
  hwPct: number;
  quizPct: number;
  testPct: number;
  hasConduct: boolean;
  hasCp: boolean;
  hasHw: boolean;
  hasQuiz: boolean;
  hasTest: boolean;
}

const ACHIEVEMENT_DATA: Record<GradeKey, TaggedComment<AchievementFocus>[]> = {
  A: [
    { text: "Exceptional mastery of concepts", focus: "general" },
    { text: "Outstanding overall academic achievement", focus: "general" },
    { text: "Exceeds grade level expectations", focus: "general" },
    { text: "Ready for advanced challenges", focus: "general" },
    { text: "Outstanding performance on tests", focus: "test" },
    { text: "Consistently high exam scores", focus: "test" },
    { text: "Excellent quiz mastery", focus: "quiz" },
    { text: "Consistently accurate quiz results", focus: "quiz" },
    { text: "Thorough and accurate homework", focus: "hw" },
    { text: "Exemplary quality in assignments", focus: "hw" }
  ],
  B: [
    { text: "Very good overall understanding", focus: "general" },
    { text: "Solid grasp of concepts", focus: "general" },
    { text: "Commendable progress toward excellence", focus: "general" },
    { text: "Strong potential for growth", focus: "general" },
    { text: "Strong performance on tests", focus: "test" },
    { text: "Good results on exams", focus: "test" },
    { text: "Strong accuracy in quizzes", focus: "quiz" },
    { text: "Consistent quality in quizzes", focus: "quiz" },
    { text: "Reliable and neat homework", focus: "hw" },
    { text: "Good dedication in assignments", focus: "hw" }
  ],
  C: [
    { text: "Satisfactory understanding of lessons", focus: "general" },
    { text: "Steady academic progress", focus: "general" },
    { text: "Meets core course expectations", focus: "general" },
    { text: "Growing familiarity with concepts", focus: "general" },
    { text: "Fair understanding on tests", focus: "test" },
    { text: "Moderate success in exams", focus: "test" },
    { text: "Developing steady quiz skills", focus: "quiz" },
    { text: "Good progress on quizzes", focus: "quiz" },
    { text: "Consistent completion of homework", focus: "hw" },
    { text: "Steady effort in assignments", focus: "hw" }
  ],
  D: [
    { text: "Basic understanding of concepts", focus: "general" },
    { text: "Developing key physics skills", focus: "general" },
    { text: "Shows room for growth", focus: "general" },
    { text: "Progressing with steady guidance", focus: "general" },
    { text: "Developing understanding on tests", focus: "test" },
    { text: "Shows potential on exams", focus: "test" },
    { text: "Fair effort on quizzes", focus: "quiz" },
    { text: "Some success in quizzes", focus: "quiz" },
    { text: "Completes most homework tasks", focus: "hw" },
    { text: "Growing consistency in homework", focus: "hw" }
  ],
  E: [
    { text: "Building foundational physics skills", focus: "general" },
    { text: "Beginning to grasp basics", focus: "general" },
    { text: "Making gradual learning gains", focus: "general" },
    { text: "Developing core concept familiarity", focus: "general" },
    { text: "Developing basic test skills", focus: "test" },
    { text: "Growing readiness for exams", focus: "test" },
    { text: "Early progress on quizzes", focus: "quiz" },
    { text: "Building basic quiz accuracy", focus: "quiz" },
    { text: "Working through homework tasks", focus: "hw" },
    { text: "Steady effort builds confidence", focus: "hw" }
  ],
  F: [
    { text: "Building essential study skills", focus: "general" },
    { text: "Progressing with guided practice", focus: "general" },
    { text: "Learning with consistent guidance", focus: "general" },
    { text: "Working toward core goals", focus: "general" },
    { text: "Building basic exam readiness", focus: "test" },
    { text: "Practicing foundational test steps", focus: "test" },
    { text: "Developing basic quiz familiarity", focus: "quiz" },
    { text: "Practicing core quiz concepts", focus: "quiz" },
    { text: "Attempting regular homework tasks", focus: "hw" },
    { text: "Continuing effort in assignments", focus: "hw" }
  ]
};

const ATTITUDE_DATA: Record<GradeKey, TaggedComment<AttitudeFocus>[]> = {
  A: [
    { text: "Excellent attitude toward learning", focus: "general" },
    { text: "Highly motivated and responsible", focus: "general" },
    { text: "Strong commitment to learning", focus: "general" },
    { text: "Sets a positive example", focus: "general" },
    { text: "Active and enthusiastic learner", focus: "high_cp" },
    { text: "Active class participant", focus: "high_cp" },
    { text: "Respectful and cooperative peer", focus: "high_conduct" },
    { text: "Polite, attentive, and focused", focus: "high_conduct" },
    { text: "Share insights even more", focus: "low_cp" },
    { text: "Maintain strong daily focus", focus: "low_conduct" }
  ],
  B: [
    { text: "Positive attitude toward studies", focus: "general" },
    { text: "Responsible and attentive learner", focus: "general" },
    { text: "Good commitment to learning", focus: "general" },
    { text: "Willing and motivated student", focus: "general" },
    { text: "Actively engaged in class", focus: "high_cp" },
    { text: "Participates well in activities", focus: "high_cp" },
    { text: "Cooperative and polite", focus: "high_conduct" },
    { text: "Respectful and focused student", focus: "high_conduct" },
    { text: "Share ideas more often", focus: "low_cp" },
    { text: "Stay consistent and focused", focus: "low_conduct" }
  ],
  C: [
    { text: "Positive learning attitude", focus: "general" },
    { text: "Steady classroom effort", focus: "general" },
    { text: "Developing good study habits", focus: "general" },
    { text: "Willing to improve daily", focus: "general" },
    { text: "Actively involved in discussions", focus: "high_cp" },
    { text: "Contributes well in class", focus: "high_cp" },
    { text: "Respectful and cooperative behavior", focus: "high_conduct" },
    { text: "Polite during class activities", focus: "high_conduct" },
    { text: "Join discussions more actively", focus: "low_cp" },
    { text: "Maintain focus during lessons", focus: "low_conduct" }
  ],
  D: [
    { text: "Shows willingness to improve", focus: "general" },
    { text: "Building stronger study habits", focus: "general" },
    { text: "Eager when encouraged", focus: "general" },
    { text: "Takes pride with guidance", focus: "general" },
    { text: "Engaged in class discussions", focus: "high_cp" },
    { text: "Active during group work", focus: "high_cp" },
    { text: "Polite when following directions", focus: "high_conduct" },
    { text: "Respectful toward peers daily", focus: "high_conduct" },
    { text: "Participate more actively daily", focus: "low_cp" },
    { text: "Strengthen focus and attention", focus: "low_conduct" }
  ],
  E: [
    { text: "Building confidence in class", focus: "general" },
    { text: "Developing positive learning habits", focus: "general" },
    { text: "Shows effort with encouragement", focus: "general" },
    { text: "Growing motivation toward studies", focus: "general" },
    { text: "Participates during class activities", focus: "high_cp" },
    { text: "Polite during class lessons", focus: "high_conduct" },
    { text: "Cooperative with teacher guidance", focus: "high_conduct" },
    { text: "Build confidence sharing ideas", focus: "low_cp" },
    { text: "Ask questions when unsure", focus: "low_cp" },
    { text: "Improve focus during class", focus: "low_conduct" }
  ],
  F: [
    { text: "Show stronger study commitment", focus: "general" },
    { text: "Keep building daily motivation", focus: "general" },
    { text: "Take ownership of learning", focus: "general" },
    { text: "Seek encouragement and guidance", focus: "general" },
    { text: "Engages positively in discussions", focus: "high_cp" },
    { text: "Responds politely when guided", focus: "high_conduct" },
    { text: "Respectful toward classroom rules", focus: "high_conduct" },
    { text: "Participate more in class", focus: "low_cp" },
    { text: "Engage actively with support", focus: "low_cp" },
    { text: "Stay attentive during lessons", focus: "low_conduct" }
  ]
};

const AREAS_TO_IMPROVE_DATA: Record<GradeKey, TaggedComment<ImprovementFocus>[]> = {
  A: [
    { text: "Explore advanced physics challenges", focus: "general" },
    { text: "Deepen critical thinking skills", focus: "general" },
    { text: "Explain solutions more clearly", focus: "general" },
    { text: "Apply concepts to projects", focus: "general" },
    { text: "Double check exam steps", focus: "test" },
    { text: "Polish exam calculation speed", focus: "test" },
    { text: "Refine minor quiz details", focus: "quiz" },
    { text: "Maintain high quiz precision", focus: "quiz" },
    { text: "Keep detailed homework steps", focus: "hw" },
    { text: "Lead peer group discussions", focus: "cp" }
  ],
  B: [
    { text: "Apply formulas more accurately", focus: "general" },
    { text: "Practice challenging physics problems", focus: "general" },
    { text: "Check calculations carefully", focus: "general" },
    { text: "Deepen conceptual problem solving", focus: "general" },
    { text: "Strengthen test preparation", focus: "test" },
    { text: "Build exam problem accuracy", focus: "test" },
    { text: "Prepare earlier for quizzes", focus: "quiz" },
    { text: "Review quiz formulas carefully", focus: "quiz" },
    { text: "Show thorough homework steps", focus: "hw" },
    { text: "Participate more in discussions", focus: "cp" }
  ],
  C: [
    { text: "Strengthen key formula recall", focus: "general" },
    { text: "Verify units and calculations", focus: "general" },
    { text: "Review challenging lesson topics", focus: "general" },
    { text: "Build steady study routines", focus: "general" },
    { text: "Develop stronger test strategies", focus: "test" },
    { text: "Practice solving exam questions", focus: "test" },
    { text: "Boost quiz calculation accuracy", focus: "quiz" },
    { text: "Review notes before quizzes", focus: "quiz" },
    { text: "Build consistent homework habits", focus: "hw" },
    { text: "Share questions during lessons", focus: "cp" }
  ],
  D: [
    { text: "Strengthen core physics concepts", focus: "general" },
    { text: "Show clearer calculation steps", focus: "general" },
    { text: "Practice applying key formulas", focus: "general" },
    { text: "Develop regular review habits", focus: "general" },
    { text: "Focus on test review", focus: "test" },
    { text: "Build stronger exam readiness", focus: "test" },
    { text: "Study steadily for quizzes", focus: "quiz" },
    { text: "Practice core quiz exercises", focus: "quiz" },
    { text: "Complete homework on time", focus: "hw" },
    { text: "Ask clarifying class questions", focus: "cp" }
  ],
  E: [
    { text: "Practice fundamental physics skills", focus: "general" },
    { text: "Learn key SI units", focus: "general" },
    { text: "Build confidence through practice", focus: "general" },
    { text: "Review basic lesson notes", focus: "general" },
    { text: "Practice core test topics", focus: "test" },
    { text: "Review sample exam questions", focus: "test" },
    { text: "Prepare steadily for quizzes", focus: "quiz" },
    { text: "Practice basic quiz problems", focus: "quiz" },
    { text: "Complete daily homework tasks", focus: "hw" },
    { text: "Join guided class discussions", focus: "cp" }
  ],
  F: [
    { text: "Build basic concept foundations", focus: "general" },
    { text: "Seek extra teacher support", focus: "general" },
    { text: "Establish daily study habits", focus: "general" },
    { text: "Practice essential formulas daily", focus: "general" },
    { text: "Review core exam concepts", focus: "test" },
    { text: "Prepare early with guidance", focus: "test" },
    { text: "Review fundamental quiz topics", focus: "quiz" },
    { text: "Practice simple quiz steps", focus: "quiz" },
    { text: "Finish assigned homework regularly", focus: "hw" },
    { text: "Ask for help early", focus: "cp" }
  ]
};

const toTextMap = <F extends string>(
  source: Record<GradeKey, TaggedComment<F>[]>
): Record<GradeKey, string[]> => ({
  A: source.A.map(item => item.text),
  B: source.B.map(item => item.text),
  C: source.C.map(item => item.text),
  D: source.D.map(item => item.text),
  E: source.E.map(item => item.text),
  F: source.F.map(item => item.text),
});

export const ACHIEVEMENT_COMMENTS: Record<GradeKey, string[]> = toTextMap(ACHIEVEMENT_DATA);
export const ATTITUDE_COMMENTS: Record<GradeKey, string[]> = toTextMap(ATTITUDE_DATA);
export const AREAS_TO_IMPROVE_COMMENTS: Record<GradeKey, string[]> = toTextMap(AREAS_TO_IMPROVE_DATA);

const resolveGradeKey = (scoreOrGrade: number | string): GradeKey => {
  if (typeof scoreOrGrade === 'string') {
    const upper = scoreOrGrade.trim().toUpperCase();
    if (upper.startsWith('A')) return 'A';
    if (upper.startsWith('B')) return 'B';
    if (upper.startsWith('C')) return 'C';
    if (upper.startsWith('D')) return 'D';
    if (upper.startsWith('E')) return 'E';
    if (upper.startsWith('F')) return 'F';
  }
  const score = Number(scoreOrGrade);
  if (isNaN(score)) return 'C';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 50) return 'E';
  return 'F';
};

export const getAchievementSuggestions = (scoreOrGrade: number | string): string[] =>
  ACHIEVEMENT_COMMENTS[resolveGradeKey(scoreOrGrade)];

export const getAttitudeSuggestions = (scoreOrGrade: number | string): string[] =>
  ATTITUDE_COMMENTS[resolveGradeKey(scoreOrGrade)];

export const getAreasToImproveSuggestions = (scoreOrGrade: number | string): string[] =>
  AREAS_TO_IMPROVE_COMMENTS[resolveGradeKey(scoreOrGrade)];

const hashStudentSeed = (studentId: string, quarter: number): number => {
  let hash = quarter * 131;
  for (let i = 0; i < studentId.length; i++) {
    hash = ((hash * 31) + studentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickFromFocusSet = <F extends string>(
  pool: TaggedComment<F>[],
  focuses: F[],
  hash: number,
  salt: number
): TaggedComment<F> => {
  const matches = pool.filter(item => focuses.includes(item.focus));
  if (matches.length > 0) {
    return matches[(hash + salt) % matches.length];
  }
  return pool[(hash + salt) % pool.length];
};

export const generateAcademicFeedback = (
  studentId: string,
  quarter: number,
  score: number,
  performance?: PerformanceBreakdown
) => {
  const gradeKey = resolveGradeKey(score);
  const achPool = ACHIEVEMENT_DATA[gradeKey];
  const attPool = ATTITUDE_DATA[gradeKey];
  const impPool = AREAS_TO_IMPROVE_DATA[gradeKey];

  const hash = hashStudentSeed(studentId, quarter);

  if (!performance) {
    return {
      autoAchievement: achPool[hash % achPool.length].text,
      autoAttitude: attPool[(hash + 1) % attPool.length].text,
      autoImprovement: impPool[(hash + 2) % impPool.length].text
    };
  }

  const academicItems: { key: 'hw' | 'quiz' | 'test'; pct: number }[] = [];
  if (performance.hasHw) academicItems.push({ key: 'hw', pct: performance.hwPct });
  if (performance.hasQuiz) academicItems.push({ key: 'quiz', pct: performance.quizPct });
  if (performance.hasTest) academicItems.push({ key: 'test', pct: performance.testPct });

  const sortedDesc = [...academicItems].sort((a, b) => b.pct - a.pct);
  const sortedAsc = [...academicItems].sort((a, b) => a.pct - b.pct);

  // 1. Select Achievement based on overall grade & standout strength (or key struggle on F)
  let achFocuses: AchievementFocus[] = ['general'];
  if (sortedDesc.length > 0) {
    const strongest = sortedDesc[0];
    const weakest = sortedAsc[0];
    const gap = strongest.pct - weakest.pct;

    if (gradeKey === 'F') {
      achFocuses = strongest.pct >= 0.40 ? [strongest.key, 'general'] : ['general'];
    } else if (gap >= 0.12) {
      achFocuses = [strongest.key];
    } else if (gap >= 0.04) {
      achFocuses = [strongest.key, 'general'];
    } else {
      achFocuses = ['general', strongest.key];
    }
  }
  const pickedAch = pickFromFocusSet(achPool, achFocuses, hash, 0);

  // 2. Select Attitude based on Conduct & Class Participation
  let attFocuses: AttitudeFocus[] = ['general'];
  if (performance.hasConduct || performance.hasCp) {
    const lowCp = performance.hasCp && performance.cpPct < 0.70;
    const lowConduct = performance.hasConduct && performance.conductPct < 0.75;
    const highCp = performance.hasCp && performance.cpPct >= 0.80;
    const highConduct = performance.hasConduct && performance.conductPct >= 0.85;

    if (lowCp && lowConduct) {
      attFocuses = ['low_cp', 'low_conduct'];
    } else if (lowCp) {
      attFocuses = ['low_cp'];
    } else if (lowConduct) {
      attFocuses = ['low_conduct'];
    } else if (highCp && highConduct) {
      attFocuses = ['high_cp', 'high_conduct', 'general'];
    } else if (highCp) {
      attFocuses = ['high_cp', 'general'];
    } else if (highConduct) {
      attFocuses = ['high_conduct', 'general'];
    }
  }
  const pickedAtt = pickFromFocusSet(attPool, attFocuses, hash, 3);

  // 3. Select Areas to Improve based on weakest area without repeating Attitude's CP prompt
  const attitudeAddressedCp = pickedAtt.focus === 'low_cp';
  let impFocuses: ImprovementFocus[] = ['general'];

  if (sortedAsc.length > 0) {
    const weakestAcad = sortedAsc[0];
    const strongestAcad = sortedDesc[0];
    const acadGap = strongestAcad.pct - weakestAcad.pct;

    if (gradeKey === 'A') {
      if (weakestAcad.pct < 0.92) {
        impFocuses = [weakestAcad.key, 'general'];
      } else if (performance.hasCp && performance.cpPct < 0.85 && !attitudeAddressedCp) {
        impFocuses = ['cp', 'general'];
      } else {
        impFocuses = ['general'];
      }
    } else if (performance.hasCp && performance.cpPct < 0.65 && performance.cpPct + 0.15 < weakestAcad.pct && !attitudeAddressedCp) {
      impFocuses = ['cp'];
    } else if (acadGap >= 0.05 || weakestAcad.pct < 0.75) {
      const tiedWeakKeys = sortedAsc
        .filter(item => item.pct <= weakestAcad.pct + 0.03)
        .map(item => item.key);
      impFocuses = tiedWeakKeys.length === 1 ? [weakestAcad.key] : [...tiedWeakKeys, 'general'];
    } else {
      impFocuses = ['general'];
    }
  } else if (performance.hasCp && performance.cpPct < 0.70 && !attitudeAddressedCp) {
    impFocuses = ['cp'];
  }

  const pickedImp = pickFromFocusSet(impPool, impFocuses, hash, 7);

  return {
    autoAchievement: pickedAch.text,
    autoAttitude: pickedAtt.text,
    autoImprovement: pickedImp.text
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

  const hasConduct = classScores.length > 0
    ? classScores.some(s => typeof s.conduct === 'number')
    : (score?.conduct !== undefined);
  const hasCp = classScores.length > 0
    ? classScores.some(s => typeof s.cpScore === 'number') || rawCp > 0
    : (score?.cpScore !== undefined || rawCp > 0);
  const hasHw = classScores.length > 0
    ? classScores.some(s => typeof s.hw1 === 'number' || typeof s.hw2 === 'number' || typeof s.hw3 === 'number')
    : (score?.hw1 !== undefined || score?.hw2 !== undefined || score?.hw3 !== undefined);
  const hasQuiz = classScores.length > 0
    ? classScores.some(s => typeof s.quiz1 === 'number' || typeof s.quiz2 === 'number' || typeof s.quiz3 === 'number')
    : (score?.quiz1 !== undefined || score?.quiz2 !== undefined || score?.quiz3 !== undefined);
  const hasTest = classScores.length > 0
    ? classScores.some(s => typeof s.test1 === 'number' || typeof s.test2 === 'number')
    : (score?.test1 !== undefined || score?.test2 !== undefined);

  const autoFeedback = generateAcademicFeedback(studentId, quarter, overallScore, {
    conductPct,
    cpPct,
    hwPct,
    quizPct,
    testPct,
    hasConduct,
    hasCp,
    hasHw,
    hasQuiz,
    hasTest
  });

  return {
    hwTotal: Number((hwPct * 100).toFixed(2)),
    quizTotal: Number((quizPct * 100).toFixed(2)),
    testTotal: Number((testPct * 100).toFixed(2)),
    overallScore,
    letterGrade,
    ...autoFeedback
  };
};

export const getStudentAttendanceQuarter = (
  records: AttendanceRecord[], 
  studentId: string, 
  quarter: QuarterType
) => {
  const quarterRecords = records.filter(r => r.studentId === studentId && r.quarter === quarter);
  
  const present = quarterRecords.filter(r => r.status === 'Present').length;
  const excused = quarterRecords.filter(r => r.status === 'Excused').length;
  const unexcused = quarterRecords.filter(r => r.status === 'Unexcused').length;
  const total = quarterRecords.length;

  const rate = total > 0 ? ((present + excused) / total) * 100 : 0;
  
  return { present, excused, unexcused, total, rate: Number(rate.toFixed(2)) };
};

export const getStudentAttendanceSemester = (
  records: AttendanceRecord[], 
  studentId: string, 
  semester: 1 | 2
) => {
  const quarters = semester === 1 ? [1, 2] : [3, 4];
  const semesterRecords = records.filter(r => r.studentId === studentId && quarters.includes(r.quarter));
  
  const present = semesterRecords.filter(r => r.status === 'Present').length;
  const excused = semesterRecords.filter(r => r.status === 'Excused').length;
  const unexcused = semesterRecords.filter(r => r.status === 'Unexcused').length;
  const total = semesterRecords.length;

  const rate = total > 0 ? ((present + excused) / total) * 100 : 0;
  
  return { present, excused, unexcused, total, rate: Number(rate.toFixed(2)) };
};

export const getClassAttendanceQuarter = (
  records: AttendanceRecord[],
  classId: string,
  quarter: QuarterType
) => {
  const quarterRecords = records.filter(r => r.classId === classId && r.quarter === quarter);
  
  const present = quarterRecords.filter(r => r.status === 'Present').length;
  const excused = quarterRecords.filter(r => r.status === 'Excused').length;
  const unexcused = quarterRecords.filter(r => r.status === 'Unexcused').length;
  
  // A 'class' happens when at least one student is recorded on a unique date
  const uniqueDates = new Set(quarterRecords.map(r => r.date)).size;
  
  return { present, excused, unexcused, totalClasses: uniqueDates };
};

export const getAttendanceAlertStatus = (unexcused: number, settings: AttendanceSettings): 'Normal' | 'Warning' | 'Alert' => {
  if (unexcused >= settings.alertThreshold) return 'Alert';
  if (unexcused >= settings.warningThreshold) return 'Warning';
  return 'Normal';
};

export const getStudentSemesterOverall = (
  studentId: string,
  classId: string,
  semester: 1 | 2,
  scores: ScoreRecord[],
  records: ParticipationRecord[],
  settings: GradingSettings,
  className: string
) => {
  const quarters = semester === 1 ? [1, 2] : [3, 4];
  const qScores = quarters.map(q => {
    const s = scores.find(s => s.studentId === studentId && s.quarter === q);
    const rawCp = getStudentQuarterTotal(records, studentId, q as Quarter);
    const classScores = scores.filter(s => s.classId === classId && s.quarter === q);
    return calculateStudentGrades(s, rawCp, settings, studentId, q, className, classScores);
  });

  const validScores = qScores.filter(q => q.overallScore > 0);
  if (validScores.length === 0) return { overallScore: 0, hwTotal: 0, quizTotal: 0, testTotal: 0, letterGrade: 'Unknown' as 'Unknown', autoAchievement: '', autoAttitude: '' };

  const sum = validScores.reduce((acc, curr) => acc + curr.overallScore, 0);
  const hwSum = validScores.reduce((acc, curr) => acc + curr.hwTotal, 0);
  const quizSum = validScores.reduce((acc, curr) => acc + curr.quizTotal, 0);
  const testSum = validScores.reduce((acc, curr) => acc + curr.testTotal, 0);

  const overallScore = Number((sum / validScores.length).toFixed(2));
  
  let letterGrade = 'F';
  if (overallScore >= 90) letterGrade = 'A';
  else if (overallScore >= 80) letterGrade = 'B';
  else if (overallScore >= 70) letterGrade = 'C';
  else if (overallScore >= 60) letterGrade = 'D';
  else if (overallScore >= 50) letterGrade = 'E';

  // Use the achievement and attitude of the latest quarter
  const latest = validScores[validScores.length - 1];

  return {
    overallScore,
    hwTotal: Number((hwSum / validScores.length).toFixed(2)),
    quizTotal: Number((quizSum / validScores.length).toFixed(2)),
    testTotal: Number((testSum / validScores.length).toFixed(2)),
    letterGrade: letterGrade as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
    autoAchievement: latest.autoAchievement,
    autoAttitude: latest.autoAttitude
  };
};

export const getParticipationTier = (total: number, classAverage: number): 'High' | 'Moderate' | 'Low' => {
  if (total >= classAverage * 1.2) return 'High';
  if (total >= classAverage * 0.8) return 'Moderate';
  return 'Low';
};
