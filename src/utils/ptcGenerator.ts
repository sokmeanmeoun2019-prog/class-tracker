export type PerformanceTier = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'Unknown';
export type AttendanceTier = 'Good' | 'Warning' | 'Alert';
export type ParticipationTier = 'High' | 'Moderate' | 'Low';

export interface StudentStats {
  name: string;
  overallScore: number;
  grade: PerformanceTier;
  hwTotal: number;
  quizTotal: number;
  testTotal: number;
  participation: number;
  participationTier: ParticipationTier;
  attendanceRate: number;
  unexcusedAbsences: number;
  attendanceTier: AttendanceTier;
  examScore?: number | null;
  conduct?: number;
  studentId?: string;
  seedOffset?: number;
}

/**
 * Deterministic hash generator based on student identity and optional seed.
 * Guarantees variety across different students while remaining repeatable.
 */
function getHash(seedStr: string): number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickOption<T>(options: T[], hash: number, step: number = 0): T {
  if (!options || options.length === 0) return '' as any;
  const idx = Math.abs(hash + step) % options.length;
  return options[idx];
}

function getFirstName(fullName: string): string {
  if (!fullName) return 'The student';
  const clean = fullName.trim();
  const parts = clean.split(/\s+/);
  return parts[0] || 'The student';
}

interface StudentProfile {
  name: string;
  firstName: string;
  grade: PerformanceTier;
  overallScore: number;
  hwTotal: number;
  quizTotal: number;
  testTotal: number;
  participation: number;
  participationTier: ParticipationTier;
  attendanceRate: number;
  unexcusedAbsences: number;
  attendanceTier: AttendanceTier;
  examScore?: number | null;
  conduct?: number;
  strongestComponent: 'homework' | 'quizzes' | 'tests' | 'balanced' | 'none';
  weakestComponent: 'homework' | 'quizzes' | 'tests' | 'none';
  componentGap: number;
  hasHighParticipation: boolean;
  hasLowParticipation: boolean;
  hasAttendanceConcern: boolean;
  hasExcellentAttendance: boolean;
  hasExamScore: boolean;
  examLevel: 'excellent' | 'good' | 'needsReview' | 'none';
  hash: number;
}

/**
 * Analyzes granular score components to identify the student's unique academic archetype.
 */
function analyzeProfile(stats: StudentStats): StudentProfile {
  const firstName = getFirstName(stats.name);
  const offset = stats.seedOffset || 0;
  const hash = getHash(`${stats.name}_${stats.studentId || ''}_${stats.overallScore}_${offset}`);

  const hw = typeof stats.hwTotal === 'number' && !isNaN(stats.hwTotal) ? stats.hwTotal : 0;
  const quiz = typeof stats.quizTotal === 'number' && !isNaN(stats.quizTotal) ? stats.quizTotal : 0;
  const test = typeof stats.testTotal === 'number' && !isNaN(stats.testTotal) ? stats.testTotal : 0;

  const validComponents = [
    { type: 'homework' as const, val: hw },
    { type: 'quizzes' as const, val: quiz },
    { type: 'tests' as const, val: test }
  ].filter(c => c.val > 0);

  let strongestComponent: 'homework' | 'quizzes' | 'tests' | 'balanced' | 'none' = 'none';
  let weakestComponent: 'homework' | 'quizzes' | 'tests' | 'none' = 'none';
  let componentGap = 0;

  if (validComponents.length >= 2) {
    validComponents.sort((a, b) => b.val - a.val);
    const maxComp = validComponents[0];
    const minComp = validComponents[validComponents.length - 1];
    componentGap = Number((maxComp.val - minComp.val).toFixed(1));

    if (componentGap >= 10) {
      strongestComponent = maxComp.type;
      weakestComponent = minComp.type;
    } else {
      strongestComponent = 'balanced';
      weakestComponent = 'none';
    }
  } else if (validComponents.length === 1) {
    strongestComponent = validComponents[0].type;
  }

  const hasHighParticipation = stats.participationTier === 'High' || stats.participation >= 15;
  const hasLowParticipation = stats.participationTier === 'Low' || (stats.participation > 0 && stats.participation <= 3);

  const hasAttendanceConcern = stats.attendanceTier === 'Alert' || stats.attendanceTier === 'Warning' || stats.unexcusedAbsences >= 2;
  const hasExcellentAttendance = stats.attendanceTier === 'Good' && stats.unexcusedAbsences === 0 && stats.attendanceRate >= 95;

  const hasExamScore = stats.examScore !== undefined && stats.examScore !== null && !isNaN(stats.examScore);
  const examLevel: 'excellent' | 'good' | 'needsReview' | 'none' = hasExamScore
    ? (stats.examScore! >= 80 ? 'excellent' : stats.examScore! >= 60 ? 'good' : 'needsReview')
    : 'none';

  return {
    name: stats.name,
    firstName,
    grade: stats.grade,
    overallScore: stats.overallScore,
    hwTotal: hw,
    quizTotal: quiz,
    testTotal: test,
    participation: stats.participation,
    participationTier: stats.participationTier,
    attendanceRate: stats.attendanceRate,
    unexcusedAbsences: stats.unexcusedAbsences,
    attendanceTier: stats.attendanceTier,
    examScore: stats.examScore,
    conduct: stats.conduct,
    strongestComponent,
    weakestComponent,
    componentGap,
    hasHighParticipation,
    hasLowParticipation,
    hasAttendanceConcern,
    hasExcellentAttendance,
    hasExamScore,
    examLevel,
    hash
  };
}

// ==========================================
// 1. STRENGTHS GENERATOR
// ==========================================
export function generateStrengths(stats: StudentStats): string[] {
  if (stats.grade === 'Unknown') {
    return ['Demonstrates willingness to learn when supported.'];
  }

  const p = analyzeProfile(stats);
  const candidates: string[] = [];

  // Academic / Assessment Strength Pool
  if (p.strongestComponent === 'tests' || p.testTotal >= 80) {
    const testOptions = [
      'Demonstrates a strong conceptual understanding of physics and applies it effectively during tests.',
      'Performs well on monthly tests, showing solid analytical thinking and calculation skills.',
      'Applies physics formulas accurately and shows clear problem-solving steps in assessments.',
      'Understands core physics principles thoroughly and demonstrates good test readiness.'
    ];
    candidates.push(pickOption(testOptions, p.hash, 1));
  } else if (p.strongestComponent === 'homework' || p.hwTotal >= 80) {
    const hwOptions = [
      'Demonstrates responsibility and consistently completes homework assignments with care.',
      'Submits thorough and well-organized homework exercises on time.',
      'Shows dedicated study habits through steady and reliable homework completion.',
      'Takes learning tasks seriously and demonstrates consistent effort outside of class.'
    ];
    candidates.push(pickOption(hwOptions, p.hash, 2));
  } else if (p.strongestComponent === 'quizzes' || p.quizTotal >= 80) {
    const quizOptions = [
      'Demonstrates quick comprehension and prepares thoroughly for regular quizzes.',
      'Shows strong recall and retention of key definitions, formulas, and SI units.',
      'Maintains good consistency and accuracy on weekly quiz checks.',
      'Reviews class concepts promptly and responds well in short assessments.'
    ];
    candidates.push(pickOption(quizOptions, p.hash, 3));
  } else if (p.overallScore >= 85 || p.grade === 'A') {
    const highOptions = [
      'Demonstrates exceptional mastery of physics concepts and consistently produces high-caliber work.',
      'Shows outstanding problem-solving ability, grasping complex physics principles with ease.',
      'Consistently maintains high academic standards across all units studied this term.',
      'Applies physical laws rigorously and solves multi-step problems with high accuracy.'
    ];
    candidates.push(pickOption(highOptions, p.hash, 4));
  } else if (p.overallScore >= 70 || p.grade === 'B' || p.grade === 'C') {
    const midOptions = [
      'Demonstrates a solid understanding of physics concepts and applies them well during exercises.',
      'Has made noticeable progress in understanding physics principles and solving problems.',
      'Shows consistent effort in class and grasps foundational concepts covered in lessons.',
      'Maintains steady academic performance and demonstrates reliable problem-solving steps.'
    ];
    candidates.push(pickOption(midOptions, p.hash, 5));
  } else {
    const devOptions = [
      'Shows genuine effort and willingness to learn foundational physics concepts.',
      'Responds positively to step-by-step guidance and teacher explanations.',
      'Demonstrates polite classroom cooperation and works steadily during guided practice.',
      'Has shown encouraging progress in understanding basic physical quantities.'
    ];
    candidates.push(pickOption(devOptions, p.hash, 6));
  }

  // Participation & Engagement Pool
  if (p.hasHighParticipation) {
    const partOptions = [
      'Shows consistent effort and contributes positively to classroom activities.',
      'Actively participates in class discussions and volunteers answers during lessons.',
      'Brings positive energy to the classroom and collaborates enthusiastically in group activities.',
      'Sets a constructive example for peers through active engagement and thoughtful questions.'
    ];
    candidates.push(pickOption(partOptions, p.hash, 7));
  } else if (p.participationTier === 'Moderate') {
    const modPartOptions = [
      'Engages cooperatively in class activities and listens attentively to explanations.',
      'Works cooperatively with others and shows respect during classroom discussions.',
      'Follows lessons with focus and participates constructively in group work.',
      'Demonstrates a positive learning attitude and a willingness to cooperate.'
    ];
    candidates.push(pickOption(modPartOptions, p.hash, 8));
  } else {
    const attentiveOptions = [
      'Maintains good focus during lessons and listens respectfully to explanations.',
      'Follows classroom rules and instructions cooperatively.',
      'Takes neat, organized notes and works quietly during independent exercises.',
      'Displays polite behavior and respects the classroom learning environment.'
    ];
    candidates.push(pickOption(attentiveOptions, p.hash, 9));
  }

  // Attendance, Exam, or Progress Pool
  if (p.hasExcellentAttendance) {
    const attOptions = [
      'Maintains excellent attendance and punctuality, establishing a solid foundation for learning.',
      'Demonstrates strong reliability through consistent daily attendance and punctuality.',
      'Shows commendable commitment through regular attendance, staying up to date with lessons.'
    ];
    candidates.push(pickOption(attOptions, p.hash, 10));
  } else if (p.examLevel === 'excellent') {
    const examOptions = [
      'Demonstrated strong knowledge retention and performed very well in the semester examination.',
      'Achieved a commendable score on the semester final exam, reflecting deep understanding.'
    ];
    candidates.push(pickOption(examOptions, p.hash, 11));
  } else if (p.conduct && p.conduct >= 9) {
    const conductOptions = [
      'Demonstrates exemplary classroom conduct and maturity in daily activities.',
      'Shows strong self-discipline, respect, and a constructive attitude toward learning.'
    ];
    candidates.push(pickOption(conductOptions, p.hash, 12));
  } else {
    const progressOptions = [
      'Demonstrates steady learning progress and a constructive attitude toward improvement.',
      'Shows patience and perseverance when working through challenging topics.',
      'Demonstrates responsibility in managing daily classroom materials and tasks.'
    ];
    candidates.push(pickOption(progressOptions, p.hash, 13));
  }

  // Deduplicate and return top 3 distinct points
  const uniqueStrengths = Array.from(new Set(candidates)).filter(Boolean);
  return uniqueStrengths.slice(0, 3);
}

// ==========================================
// 2. AREAS TO IMPROVE GENERATOR
// ==========================================
export function generateAreasToImprove(stats: StudentStats): string[] {
  if (stats.grade === 'Unknown') {
    return ['Review class materials regularly to build confidence.'];
  }

  const p = analyzeProfile(stats);
  const candidates: string[] = [];

  // Primary Academic Bottleneck
  if (p.weakestComponent === 'tests' || (p.testTotal < 72 && p.testTotal > 0)) {
    const testWeakOptions = [
      'Should spend more time reviewing formulas and practicing numerical problems.',
      'Needs to improve calculation accuracy and show clearer working steps in assessments.',
      'Would benefit from more consistent preparation and structured review before monthly tests.',
      'Should practice breaking down complex word problems into clear formula steps.'
    ];
    candidates.push(pickOption(testWeakOptions, p.hash, 1));
  } else if (p.weakestComponent === 'homework' || (p.hwTotal < 72 && p.hwTotal > 0)) {
    const hwWeakOptions = [
      'Needs to establish a more consistent routine for completing and submitting homework.',
      'Should complete all homework assignments thoroughly with full working steps shown.',
      'Would benefit from using homework as a daily opportunity to reinforce lesson concepts.',
      'Should allocate dedicated study time each evening to finish assignments carefully.'
    ];
    candidates.push(pickOption(hwWeakOptions, p.hash, 2));
  } else if (p.weakestComponent === 'quizzes' || (p.quizTotal < 72 && p.quizTotal > 0)) {
    const quizWeakOptions = [
      'Should review class notes regularly each day instead of waiting until right before a quiz.',
      'Needs to review fundamental definitions, physical quantities, and SI units more consistently.',
      'Would benefit from short daily self-quizzes to strengthen memory of core formulas.',
      'Should pay closer attention to details and units during weekly quiz evaluations.'
    ];
    candidates.push(pickOption(quizWeakOptions, p.hash, 3));
  } else if (p.overallScore >= 88 || p.grade === 'A') {
    const highGrowthOptions = [
      'Continue challenging problem-solving skills with advanced and competition-level physics problems.',
      'Focus on deepening critical-thinking skills and explaining concepts clearly to others.',
      'Continue exploring real-world applications and multi-step theoretical problems.',
      'Work on extending analytical reasoning beyond standard textbook exercises.'
    ];
    candidates.push(pickOption(highGrowthOptions, p.hash, 4));
  } else if (p.overallScore >= 75 || p.grade === 'B') {
    const bGrowthOptions = [
      'Improve calculation accuracy and problem-solving speed in multi-step physics problems.',
      'Pay closer attention to details and unit conversions when applying mathematical formulas.',
      'Practice more challenging exercises to strengthen depth of conceptual understanding.',
      'Develop greater confidence when solving unfamiliar or non-routine problems.'
    ];
    candidates.push(pickOption(bGrowthOptions, p.hash, 5));
  } else if (p.overallScore >= 60 || p.grade === 'C' || p.grade === 'D') {
    const midGrowthOptions = [
      'Strengthen understanding of core physics concepts and review lesson summaries regularly.',
      'Practice applying formulas and writing out clear, step-by-step calculation steps.',
      'Review previous quiz and test mistakes to avoid repeating similar errors.',
      'Allocate more time for structured review before each chapter assessment.'
    ];
    candidates.push(pickOption(midGrowthOptions, p.hash, 6));
  } else {
    const struggleOptions = [
      'Rebuild understanding of fundamental physics concepts through guided practice.',
      'Focus on mastering basic formulas, physical quantities, and SI units.',
      'Seek teacher support and clarification promptly whenever encountering difficulties.',
      'Develop a regular daily study routine to reinforce basic lesson ideas.'
    ];
    candidates.push(pickOption(struggleOptions, p.hash, 7));
  }

  // Participation or Study Habit Bottleneck
  if (p.hasLowParticipation) {
    const partWeakOptions = [
      'Should develop greater confidence in asking questions and sharing ideas during lessons.',
      'Encouraged to participate more actively in classroom problem-solving and discussions.',
      'Would benefit from volunteering answers and discussing questions openly in class.',
      'Make a greater effort to stay engaged and actively involved in classroom activities.'
    ];
    candidates.push(pickOption(partWeakOptions, p.hash, 8));
  } else if (p.hasAttendanceConcern) {
    const attWeakOptions = [
      'Needs to improve attendance and punctuality to prevent learning gaps in sequential lessons.',
      'Must take personal initiative to catch up on missed notes and assignments promptly after absences.',
      'Maintain regular attendance to ensure steady progress throughout the semester.'
    ];
    candidates.push(pickOption(attWeakOptions, p.hash, 9));
  } else {
    const habitsOptions = [
      'Should develop greater confidence in explaining physics concepts in their own words.',
      'Work on time management during assessments to ensure all questions are answered.',
      'Practice double-checking calculation steps to eliminate minor mathematical slips.',
      'Maintain steady learning consistency throughout the entire quarter.'
    ];
    candidates.push(pickOption(habitsOptions, p.hash, 10));
  }

  // Practical Technique Growth Area
  const techniqueOptions = [
    'Practice drawing clear diagrams and labeling known variables before calculating.',
    'Focus on showing units at each calculation step and stating final units clearly.',
    'Review challenging topics early rather than postponing revision until test week.',
    'Create concise formula summary sheets for regular revision at home.'
  ];
  candidates.push(pickOption(techniqueOptions, p.hash, 11));

  // Deduplicate and return top 2-3 distinct points
  const uniqueAreas = Array.from(new Set(candidates)).filter(Boolean);
  return uniqueAreas.slice(0, 3);
}

// ==========================================
// 3. CONSTRUCTIVE FEEDBACK GENERATOR
// ==========================================
export function generatePTCFeedback(stats: StudentStats): string {
  if (stats.grade === 'Unknown') {
    return 'Please ensure grades are calculated to generate a complete summary.';
  }

  const p = analyzeProfile(stats);
  const name = p.name;
  const firstName = p.firstName;

  // ----------------------------------------------------
  // PARAGRAPH 1: ACADEMIC STANDING & INDIVIDUAL STRENGTHS
  // ----------------------------------------------------
  let opening = '';

  if (p.strongestComponent === 'homework' && p.componentGap >= 12) {
    const hwDominantOpenings = [
      `${name} has demonstrated admirable dedication this semester, showing great consistency in completing homework assignments and contributing positively to class activities. With an overall average of ${stats.overallScore}% (Grade ${stats.grade}), ${firstName} has established dependable study habits outside the classroom.`,
      `${name} consistently takes homework and daily learning tasks seriously, submitting thorough assignments and demonstrating commendable responsibility. Their current average of ${stats.overallScore}% (Grade ${stats.grade}) reflects steady commitment to classroom expectations.`,
      `Throughout this semester, ${name} has stood out for their conscientious approach to homework and class preparation. Holding an overall average of ${stats.overallScore}% (Grade ${stats.grade}), ${firstName} demonstrates strong discipline in completing assigned exercises.`
    ];
    opening = pickOption(hwDominantOpenings, p.hash, 1);
  } else if (p.strongestComponent === 'tests' && p.componentGap >= 12) {
    const testDominantOpenings = [
      `${name} exhibits a sharp analytical mind and an impressive natural grasp of physics principles, performing particularly well on monthly tests and assessments. Holding an overall average of ${stats.overallScore}% (Grade ${stats.grade}), their exam scores demonstrate solid problem-solving ability.`,
      `${name} shows strong test-taking capabilities and understands core physics concepts well when evaluated in assessments. With a current average of ${stats.overallScore}% (Grade ${stats.grade}), ${firstName} applies formulas effectively during examinations.`,
      `${name} demonstrates solid comprehension and analytical ability during test situations, solving calculation problems with good accuracy. Their overall standing of ${stats.overallScore}% (Grade ${stats.grade}) highlights clear academic potential.`
    ];
    opening = pickOption(testDominantOpenings, p.hash, 2);
  } else if (p.overallScore >= 88 || p.grade === 'A') {
    const highOpenings = [
      `${name} has performed exceptionally well throughout this semester, achieving an outstanding overall average of ${stats.overallScore}% (Grade ${stats.grade}). They consistently demonstrate intellectual curiosity, rigorous problem-solving skills, and active participation in all physics lessons.`,
      `${name} continues to excel in physics, earning a top-tier average of ${stats.overallScore}% (Grade ${stats.grade}). ${firstName} approaches every lesson with enthusiasm, applies complex formulas with precision, and sets a wonderful example for their peers.`,
      `It has been a pleasure teaching ${name} this semester. With an impressive overall average of ${stats.overallScore}% (Grade ${stats.grade}), they demonstrate strong conceptual mastery, diligent homework completion, and sharp analytical thinking.`
    ];
    opening = pickOption(highOpenings, p.hash, 3);
  } else if (p.overallScore >= 78 || p.grade === 'B') {
    const solidOpenings = [
      `${name} has made commendable progress this semester, achieving a strong overall average of ${stats.overallScore}% (Grade ${stats.grade}). They demonstrate solid understanding of physics topics, complete work reliably, and participate positively during class activities.`,
      `${name} shows a positive attitude toward learning and has achieved a very good overall standing of ${stats.overallScore}% (Grade ${stats.grade}). ${firstName} consistently puts in honest effort and demonstrates good problem-solving ability across the syllabus.`,
      `With a respectable overall average of ${stats.overallScore}% (Grade ${stats.grade}), ${name} has shown steady academic commitment this semester. They follow lessons attentively and apply key formulas with growing confidence.`
    ];
    opening = pickOption(solidOpenings, p.hash, 4);
  } else if (p.overallScore >= 65 || p.grade === 'C') {
    const midOpenings = [
      `${name} has shown a positive attitude and steady effort in physics classes this semester, currently earning an overall average of ${stats.overallScore}% (Grade ${stats.grade}). They demonstrate a satisfactory grasp of foundational concepts and work cooperatively in lessons.`,
      `${name} is making steady progress, holding an overall average of ${stats.overallScore}% (Grade ${stats.grade}). ${firstName} understands the basic principles covered in class and shows a genuine willingness to learn and improve.`,
      `With an overall average of ${stats.overallScore}% (Grade ${stats.grade}), ${name} has demonstrated consistent participation and satisfactory effort. They have laid a good foundation and are capable of reaching higher levels of achievement.`
    ];
    opening = pickOption(midOpenings, p.hash, 5);
  } else {
    const devOpenings = [
      `${name} has shown a cooperative attitude and genuine effort during physics lessons this semester. With a current average of ${stats.overallScore}% (Grade ${stats.grade}), they have shown willingness to learn foundational concepts when provided with step-by-step guidance.`,
      `${name} approaches class with a respectful demeanor and shows potential in physics. Holding a current average of ${stats.overallScore}% (Grade ${stats.grade}), ${firstName} works steadily when given encouragement and structured support.`,
      `While ${name} currently holds an overall average of ${stats.overallScore}% (Grade ${stats.grade}), they have demonstrated flashes of real capability and a sincere desire to understand challenging topics.`
    ];
    opening = pickOption(devOpenings, p.hash, 6);
  }

  // Contextual Semester Examination Note (if available)
  let examNote = '';
  if (p.hasExamScore) {
    if (p.examLevel === 'excellent') {
      const examGoodOptions = [
        ` In the semester final examination, ${firstName} achieved ${p.examScore}%, validating their strong grasp of the semester's core learning objectives.`,
        ` Their impressive semester exam score of ${p.examScore}% clearly reflects thorough preparation and deep understanding of the course content.`
      ];
      examNote = pickOption(examGoodOptions, p.hash, 7);
    } else if (p.examLevel === 'good') {
      const examMidOptions = [
        ` Their semester examination result of ${p.examScore}% demonstrates a reasonable grasp of the fundamentals, though structured revision on challenging chapters will help solidify their results.`,
        ` In the semester final examination, ${firstName} scored ${p.examScore}%, indicating a solid base to build upon with further practice.`
      ];
      examNote = pickOption(examMidOptions, p.hash, 8);
    } else {
      const examLowOptions = [
        ` The semester examination result of ${p.examScore}% indicates that several key topics require structured review and additional practice to ensure mastery.`,
        ` In the final examination, ${firstName} achieved ${p.examScore}%, which highlights specific chapters that will benefit from extra teacher support and revision.`
      ];
      examNote = pickOption(examLowOptions, p.hash, 9);
    }
  }

  const paragraph1 = `${opening}${examNote}`;

  // ----------------------------------------------------
  // PARAGRAPH 2: TARGETED DEVELOPMENT & PRACTICAL ADVICE
  // ----------------------------------------------------
  let advice = '';

  if (p.weakestComponent === 'homework' && p.componentGap >= 12) {
    const hwAdviceOptions = [
      `To unlock their full academic potential, ${firstName} would benefit greatly from establishing a more disciplined routine for homework completion. Submitting assignments consistently will reinforce daily classroom instruction, solidify understanding of formulas, and prevent last-minute test stress.`,
      `While ${firstName} grasps physics concepts well, inconsistent homework submission currently holds back their overall grade. Setting aside dedicated, quiet study time each evening to finish all assigned exercises will significantly strengthen their academic standing.`,
      `A key focus for ${firstName} should be consistent homework completion. Treating homework as a vital practice opportunity rather than an optional task will ensure their solid test abilities are fully mirrored in their final grade.`
    ];
    advice = pickOption(hwAdviceOptions, p.hash, 10);
  } else if (p.weakestComponent === 'tests' && p.componentGap >= 12) {
    const testAdviceOptions = [
      `While ${firstName} works diligently on daily tasks, their assessment scores suggest that translating understanding into test performance is the primary area for development. Spending dedicated time practicing multi-step calculations under timed conditions, double-checking formula rearrangements, and reviewing past test questions will build greater confidence on test days.`,
      `To translate their reliable daily effort into higher exam scores, ${firstName} should focus on active test preparation. Practicing numerical problems without looking at solutions, paying close attention to unit conversions, and showing clear working steps will help improve their test results.`,
      `Although ${firstName} participates well in daily lessons, major tests have proven challenging. Setting up regular revision sessions before assessments and asking questions about confusing problem types will help them achieve the scores they are capable of.`
    ];
    advice = pickOption(testAdviceOptions, p.hash, 11);
  } else if (p.hasLowParticipation) {
    const partAdviceOptions = [
      `To take the next step in their learning journey, ${firstName} is warmly encouraged to participate more actively during lessons. Asking questions when encountering challenging topics and sharing their thought process during group exercises will help clarify misunderstandings and deepen conceptual mastery.`,
      `We would love to see ${firstName} contribute more actively in class discussions. Raising their hand to answer questions or asking for clarification during lectures will build self-confidence and strengthen their engagement with physics.`,
      `Developing greater confidence in verbal participation is an important goal for ${firstName}. Speaking up during problem-solving sessions will help the teacher identify their immediate questions and provide timely feedback.`
    ];
    advice = pickOption(partAdviceOptions, p.hash, 12);
  } else if (p.hasAttendanceConcern) {
    const attAdviceOptions = [
      `Maintaining consistent attendance is vital for ${firstName}'s ongoing learning continuity. Reducing unexcused absences and taking prompt initiative to catch up on missed lesson notes will prevent knowledge gaps from accumulating.`,
      `Because physics concepts build cumulatively from week to week, regular attendance is essential for ${firstName}'s success. Ensuring fewer absences and completing all make-up work promptly will support steady academic improvement.`
    ];
    advice = pickOption(attAdviceOptions, p.hash, 13);
  } else if (p.overallScore >= 88 || p.grade === 'A') {
    const highAdviceOptions = [
      `To continue their positive trajectory, ${firstName} should challenge themselves with more advanced physics problems and explore real-world applications of physical laws. Developing deeper analytical explanations and mentoring peers will further reinforce their mastery.`,
      `Looking ahead, ${firstName} is encouraged to tackle competition-level exercises and deepen their critical-thinking skills. Continuing to ask probing 'why' and 'what if' questions will foster a truly advanced scientific perspective.`,
      `To maintain their exceptional performance, ${firstName} should continue challenging themselves with non-routine physics problems and refining their ability to communicate complex solutions clearly.`
    ];
    advice = pickOption(highAdviceOptions, p.hash, 14);
  } else if (p.overallScore >= 75 || p.grade === 'B') {
    const solidAdviceOptions = [
      `To transition from strong results to true academic excellence, ${firstName} should focus on calculation accuracy and problem-solving speed. Taking time to review challenging formulas and double-checking calculation steps will eliminate small oversights.`,
      `${firstName} can achieve even higher results by practicing more complex multi-step problems and refining their formula application. Deepening their understanding of underlying physical principles will build greater independence.`,
      `To continue building on their good foundation, ${firstName} should review quiz feedback carefully and practice explaining problem solutions in detail before major tests.`
    ];
    advice = pickOption(solidAdviceOptions, p.hash, 15);
  } else if (p.overallScore >= 60 || p.grade === 'C' || p.grade === 'D') {
    const midAdviceOptions = [
      `With more consistent preparation and regular review of formulas and units, ${firstName} can make significant strides forward. Dedicating 20 minutes each day to practicing problem sets and asking questions when stuck will build solid confidence.`,
      `To strengthen their results, ${firstName} should focus on reviewing fundamental formulas and practicing calculation steps carefully. Consistent test preparation and completing all assignments on time will lead to noticeable improvement.`,
      `${firstName} has good potential to achieve higher marks. Focusing on understanding the basic concepts before moving on to complex exercises and seeking help whenever needed will help them succeed.`
    ];
    advice = pickOption(midAdviceOptions, p.hash, 16);
  } else {
    const devAdviceOptions = [
      `With structured daily review of 15 to 20 minutes focusing on fundamental formulas, definitions, and SI units, ${firstName} can build a much stronger foundation. Seeking support from the teacher as soon as a topic feels confusing will help them make steady, confident strides forward.`,
      `To make meaningful progress, ${firstName} should focus on mastering the basic physics concepts and completing all daily homework assignments. Regular practice and close communication with the teacher will provide the support needed to succeed.`,
      `Significant improvement is achievable if ${firstName} commits to consistent class attendance, regular homework completion, and seeking guidance whenever difficulties arise.`
    ];
    advice = pickOption(devAdviceOptions, p.hash, 17);
  }

  const paragraph2 = advice;

  // ----------------------------------------------------
  // PARAGRAPH 3: ENCOURAGING PARTNERSHIP CLOSING
  // ----------------------------------------------------
  const closingOptions = [
    `With regular practice and greater attention to detail, ${firstName} is well-positioned to achieve even stronger results. I appreciate your continued support at home and look forward to partnering with you to foster their ongoing success.`,
    `Maintaining their positive learning attitude while refining their preparation for assessments will help ${firstName} achieve higher confidence. With dedicated effort and close teamwork between home and school, I am confident they will continue to make meaningful progress.`,
    `By combining their existing strengths with consistent daily study habits, ${firstName} can achieve great progress in physics. Thank you for your continued encouragement and partnership in their education.`,
    `Keep building on this semester's progress and do not hesitate to reach out for guidance whenever challenges arise. ${firstName} is a valued member of our classroom, and we look forward to supporting their ongoing growth.`,
    `With sustained effort and collaborative encouragement from both home and school, ${firstName} is fully capable of reaching their academic goals. Thank you for your ongoing support.`
  ];

  const paragraph3 = pickOption(closingOptions, p.hash, 18);

  return `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;
}
