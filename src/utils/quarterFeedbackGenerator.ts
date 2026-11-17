import {
  AttendanceSettings,
  GradingSettings,
  ParticipationRecord,
  ParticipationType,
  Quarter,
  ScoreRecord,
  Student
} from '../types';
import {
  calculateClassRanks,
  calculateStudentGrades,
  getStudentAttendanceQuarter,
  getStudentQuarterTotal
} from './calculations';

export interface StudentQuarterAnalysis {
  student: Student & { displayNum: number };
  rawCp: number;
  effectiveCp: number;
  cpPct: number;
  conductVal?: number;
  conductPct: number;
  hasConductInClass: boolean;
  hasHwInClass: boolean;
  hasQuizInClass: boolean;
  hasTestInClass: boolean;
  hasStudentScoreFields: boolean;
  classHasScores: boolean;
  overallScore: number;
  letterGrade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  rank: number;
  classSize: number;
  hwTotal: number;
  quizTotal: number;
  testTotal: number;
  attendance: {
    present: number;
    excused: number;
    unexcused: number;
    total: number;
    rate: number;
  };
  topParticipationType?: ParticipationType;
  comment: string;
}

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const getFirstName = (fullName: string): string => {
  const clean = fullName.trim();
  if (!clean) return 'This student';
  const parts = clean.split(/\s+/);
  const token = parts[0] || 'This student';
  if (token === token.toUpperCase() && token.length > 1) {
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }
  return token;
};

const hasEnteredFields = (score: ScoreRecord | undefined): boolean => {
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

interface ScoreFeedbackInputs {
  firstName: string;
  overallScore: number;
  letterGrade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  rank: number;
  classSize: number;
  classScoreAvg: number;
  hasConduct: boolean;
  conductVal?: number;
  conductMax: number;
  conductPct: number;
  cpVal: number;
  cpMax: number;
  cpPct: number;
  hasHw: boolean;
  hwTotal: number;
  hasQuiz: boolean;
  quizTotal: number;
  hasTest: boolean;
  testTotal: number;
  attendance: {
    present: number;
    excused: number;
    unexcused: number;
    total: number;
    rate: number;
  };
  attendanceSettings: AttendanceSettings;
}

const buildOpeningOptions = (d: ScoreFeedbackInputs): string[] => {
  const scoreStr = `${d.overallScore}%`;
  const isAboveAvg = d.classScoreAvg > 0 && d.overallScore >= d.classScoreAvg + 5;
  const isNearAvg = d.classScoreAvg > 0 && Math.abs(d.overallScore - d.classScoreAvg) < 5;

  switch (d.letterGrade) {
    case 'A':
      return [
        `${d.firstName} achieved an outstanding ${scoreStr} (Grade A) this quarter, demonstrating thorough mastery of the course material.`,
        `With an impressive overall result of ${scoreStr} (Grade A), ${d.firstName} consistently met and exceeded quarter expectations.`,
        `${d.firstName} delivered exceptional academic work this quarter, finishing with ${scoreStr} (Grade A).`,
        `An excellent quarter overall for ${d.firstName}, who earned ${scoreStr} (Grade A) through steady focus and high-quality work.`,
        `${d.firstName} performed at a top level throughout the quarter, earning ${scoreStr} (Grade A).`,
        `Finishing the quarter with ${scoreStr} (Grade A), ${d.firstName} showed strong command of key skills and concepts.`
      ];
    case 'B':
      return [
        `${d.firstName} earned a strong ${scoreStr} (Grade B) this quarter, showing solid understanding across coursework.`,
        `With a commendable quarter score of ${scoreStr} (Grade B), ${d.firstName} demonstrated dependable effort and steady grasp of concepts.`,
        `${d.firstName} had a very good quarter, achieving ${scoreStr} (Grade B) and staying well positioned for top marks.`,
        `Finishing with ${scoreStr} (Grade B), ${d.firstName} showed consistent capability and clear readiness to push toward an A.`,
        `${d.firstName} produced reliable results this quarter, attaining ${scoreStr} (Grade B)${isAboveAvg ? ' above the class average' : ''}.`,
        `A very solid performance from ${d.firstName}, who reached ${scoreStr} (Grade B) through regular engagement with the lessons.`
      ];
    case 'C':
      return [
        `${d.firstName} completed the quarter with ${scoreStr} (Grade C), showing a satisfactory foundation in core topics.`,
        `Finishing at ${scoreStr} (Grade C), ${d.firstName} demonstrated steady progress${isNearAvg ? ' in line with the class pace' : ''} with clear room to grow.`,
        `${d.firstName} achieved ${scoreStr} (Grade C) this quarter, meeting basic requirements while building more consistent habits.`,
        `With an overall score of ${scoreStr} (Grade C), ${d.firstName} showed a workable grasp of lessons that can rise further with focused review.`,
        `${d.firstName} earned ${scoreStr} (Grade C) for the quarter, reflecting moderate understanding and potential for stronger results.`,
        `At ${scoreStr} (Grade C), ${d.firstName} kept up with key class expectations and has a good opportunity to move into the B range.`
      ];
    case 'D':
      return [
        `${d.firstName} finished the quarter with ${scoreStr} (Grade D), showing a basic understanding alongside noticeable gaps in key areas.`,
        `With ${scoreStr} (Grade D), ${d.firstName} demonstrated partial familiarity with quarter material but needs steadier follow-through.`,
        `${d.firstName} earned ${scoreStr} (Grade D) this quarter, indicating that foundational concepts require closer reinforcement.`,
        `At ${scoreStr} (Grade D), ${d.firstName} showed moments of understanding, though overall results remained below the target benchmark.`,
        `${d.firstName} completed the quarter at ${scoreStr} (Grade D), highlighting a need for more structured study and task completion.`,
        `Finishing with ${scoreStr} (Grade D), ${d.firstName} will benefit from regular check-ins and stronger daily review habits.`
      ];
    case 'E':
      return [
        `${d.firstName} concluded the quarter with ${scoreStr} (Grade E), showing developing effort while still working to master essential skills.`,
        `At ${scoreStr} (Grade E), ${d.firstName} experienced difficulty across several graded tasks and needs targeted support to build momentum.`,
        `${d.firstName} earned ${scoreStr} (Grade E) this quarter, signaling that core concepts and study routines need steady reinforcement.`,
        `With an overall score of ${scoreStr} (Grade E), ${d.firstName} is encouraged to focus on foundational understanding step by step.`,
        `${d.firstName} finished at ${scoreStr} (Grade E), and strengthening daily preparation will help turn effort into higher scores.`,
        `Reaching ${scoreStr} (Grade E) this quarter shows there are important fundamentals ${d.firstName} should revisit with guided practice.`
      ];
    case 'F':
    default:
      return [
        `${d.firstName} ended the quarter with ${scoreStr} (Grade F), indicating substantial challenges across assessments and coursework.`,
        `With a quarter total of ${scoreStr} (Grade F), ${d.firstName} needs immediate, structured support to rebuild core foundations.`,
        `${d.firstName} achieved ${scoreStr} (Grade F) this quarter and would benefit greatly from closer guidance and regular task completion.`,
        `Finishing at ${scoreStr} (Grade F), ${d.firstName} experienced consistent difficulty this term, making steady support a top priority.`,
        `At ${scoreStr} (Grade F), ${d.firstName} has clear room to recover by focusing on basic lesson concepts and completing missing work.`,
        `${d.firstName} recorded ${scoreStr} (Grade F) for the quarter; with consistent attendance, guided help, and small daily goals, progress is achievable.`
      ];
  }
};

const buildStrengthOptions = (d: ScoreFeedbackInputs): string[] => {
  const academicParts: { key: 'tests' | 'quizzes' | 'homework'; pct: number; label: string }[] = [];
  if (d.hasTest) academicParts.push({ key: 'tests', pct: d.testTotal, label: `monthly tests (${d.testTotal}%)` });
  if (d.hasQuiz) academicParts.push({ key: 'quizzes', pct: d.quizTotal, label: `quizzes (${d.quizTotal}%)` });
  if (d.hasHw) academicParts.push({ key: 'homework', pct: d.hwTotal, label: `homework (${d.hwTotal}%)` });

  const sortedAcad = [...academicParts].sort((a, b) => b.pct - a.pct);
  const topAcad = sortedAcad[0];
  const lowAcad = sortedAcad[sortedAcad.length - 1];
  const acadBalanced =
    sortedAcad.length >= 2 && topAcad && lowAcad && topAcad.pct - lowAcad.pct < 8 && lowAcad.pct >= 75;

  const highConduct = d.hasConduct && d.conductPct >= 0.85;
  const highCp = d.cpPct >= 0.80;
  const strongAttendance = d.attendance.total > 0 && d.attendance.rate >= 95 && d.attendance.unexcused === 0;

  // For lower grades (E/F), highlight genuine bright spots without inventing academic praise
  if ((d.letterGrade === 'E' || d.letterGrade === 'F') && (!topAcad || topAcad.pct < 65)) {
    if (highConduct && strongAttendance) {
      return [
        `Positive classroom conduct (${d.conductVal}/${d.conductMax}) and dependable attendance (${d.attendance.rate}%) provide a strong base to build on.`,
        `${d.firstName} maintained respectful behavior (${d.conductVal}/${d.conductMax}) and reliable attendance, showing readiness when guided.`,
        `Consistent attendance and polite conduct (${d.conductVal}/${d.conductMax}) stand out as encouraging strengths to carry into next quarter.`,
        `${d.firstName} demonstrated respectful conduct in class, giving us a supportive starting point for academic recovery.`,
        `Good classroom attitude (${d.conductVal}/${d.conductMax}) and steady presence in lessons show willingness to stay engaged.`,
        `${d.firstName}'s positive behavior and regular attendance help create a productive foundation for stronger test and assignment results.`
      ];
    }
    if (highConduct) {
      return [
        `Conduct in class was a clear positive (${d.conductVal}/${d.conductMax}), showing respect toward lessons and peers.`,
        `${d.firstName} maintained cooperative conduct (${d.conductVal}/${d.conductMax}), which gives a solid base for improving academic tasks.`,
        `Polite behavior during class (${d.conductVal}/${d.conductMax}) is a meaningful strength that will support closer teacher guidance.`,
        `${d.firstName} showed respectful classroom conduct throughout the quarter even while finding graded work challenging.`,
        `Dependable conduct (${d.conductVal}/${d.conductMax}) reflects a positive attitude toward classroom expectations.`,
        `Maintaining good conduct (${d.conductVal}/${d.conductMax}) puts ${d.firstName} in a good position to benefit from extra support.`
      ];
    }
    if (highCp) {
      return [
        `Active class participation (${d.cpVal}/${d.cpMax}) shows strong engagement during lessons despite lower test or written marks.`,
        `${d.firstName} contributed actively in class (${d.cpVal}/${d.cpMax}), demonstrating curiosity and willingness to stay involved.`,
        `Strong participation (${d.cpVal}/${d.cpMax}) is a valuable strength that can now be channeled into written practice.`,
        `${d.firstName} stayed verbally engaged in class (${d.cpVal}/${d.cpMax}), which shows real interest in understanding the lessons.`,
        `Consistent participation (${d.cpVal}/${d.cpMax}) highlights ${d.firstName}'s engagement during class activities.`,
        `Good classroom involvement (${d.cpVal}/${d.cpMax}) shows ${d.firstName} connects with lessons and can translate that into stronger written scores.`
      ];
    }
    if (topAcad && topAcad.pct >= 45) {
      return [
        `${d.firstName}'s strongest academic effort appeared in ${topAcad.label}, showing greater comfort there than in other areas.`,
        `Performance in ${topAcad.label} was a relative bright spot this quarter and offers a model for how to approach other tasks.`,
        `${d.firstName} showed comparatively better traction in ${topAcad.label}, demonstrating potential when work is approached steadily.`,
        `Among graded areas, ${topAcad.label} stood out as ${d.firstName}'s most promising starting point.`,
        `${d.firstName} had better results in ${topAcad.label}, which can serve as a stepping stone for raising overall scores.`,
        `The progress visible in ${topAcad.label} shows that ${d.firstName} can build confidence when skills are practiced step by step.`
      ];
    }
    return [
      `Continuing to show up and engage with guided class activities will be key to turning current effort into steady progress.`,
      `${d.firstName} can use small, manageable wins in daily classwork to rebuild confidence across the quarter.`,
      `With consistent support and encouragement, ${d.firstName} has the opportunity to strengthen core skills early next term.`,
      `Staying connected during lessons and attempting every task will help ${d.firstName} gain firmer footing going forward.`,
      `${d.firstName} showed potential to respond well when tasks are broken down into clear, manageable steps.`,
      `Building one reliable habit at a time will help ${d.firstName} turn daily classroom effort into stronger assessment scores.`
    ];
  }

  if (acadBalanced && topAcad) {
    return [
      `Performance was remarkably balanced across coursework and assessments (Homework ${d.hwTotal}%, Quizzes ${d.quizTotal}%, Tests ${d.testTotal}%).`,
      `${d.firstName} maintained consistent quality across homework (${d.hwTotal}%), quizzes (${d.quizTotal}%), and tests (${d.testTotal}%)${highCp ? `, backed by strong participation (${d.cpVal}/${d.cpMax})` : ''}.`,
      `Steady results across assignments and exams highlight disciplined preparation throughout the entire quarter.`,
      `${d.firstName} demonstrated even consistency across every academic category without major dips in performance.`,
      `Both daily coursework and formal assessments were handled reliably${highConduct ? `, alongside exemplary conduct (${d.conductVal}/${d.conductMax})` : ''}.`,
      `Well-rounded results across homework, quizzes, and tests show dependable study habits from week to week.`
    ];
  }

  if (topAcad && topAcad.key === 'tests' && topAcad.pct >= 70) {
    return [
      `Monthly tests were a standout strength (${d.testTotal}%), reflecting solid comprehension under exam conditions.`,
      `${d.firstName} excelled on formal assessments (${d.testTotal}%), applying concepts accurately on longer tests.`,
      `Strong exam performance (${d.testTotal}%) shows ${d.firstName} retains and synthesizes core material effectively.`,
      `Assessment readiness stood out this quarter, with ${d.testTotal}% on monthly tests leading ${d.firstName}'s results.`,
      `${d.firstName} demonstrated impressive accuracy on monthly tests (${d.testTotal}%)${highCp ? ` as well as active class participation (${d.cpVal}/${d.cpMax})` : ''}.`,
      `High scores on tests (${d.testTotal}%) highlight strong analytical thinking and solid preparation for major evaluations.`
    ];
  }

  if (topAcad && topAcad.key === 'homework' && topAcad.pct >= 70) {
    return [
      `Homework completion was a clear strength (${d.hwTotal}%), showing responsibility and steady effort outside class.`,
      `${d.firstName} excelled on homework tasks (${d.hwTotal}%), submitting thorough and dependable assignments.`,
      `Strong homework results (${d.hwTotal}%) reflect reliable daily organization and care with practice tasks.`,
      `Consistent dedication to assignments (${d.hwTotal}%)${highConduct ? ` paired with respectful conduct (${d.conductVal}/${d.conductMax})` : ''} anchored ${d.firstName}'s performance.`,
      `${d.firstName} performed particularly well on homework (${d.hwTotal}%), demonstrating persistence on independent tasks.`,
      `Diligent homework habits (${d.hwTotal}%) gave ${d.firstName} a strong foundation across the quarter.`
    ];
  }

  if (topAcad && topAcad.key === 'quizzes' && topAcad.pct >= 70) {
    return [
      `Quizzes were a particular strength (${d.quizTotal}%), showing quick recall and attentive lesson review.`,
      `${d.firstName} scored well on regular quizzes (${d.quizTotal}%), keeping up effectively with ongoing topics.`,
      `Strong quiz performance (${d.quizTotal}%) demonstrates timely preparation and firm grasp of shorter units.`,
      `${d.firstName} showed reliable accuracy on quizzes (${d.quizTotal}%)${highCp ? ` alongside solid class participation (${d.cpVal}/${d.cpMax})` : ''}.`,
      `Consistent quiz marks (${d.quizTotal}%) confirm that ${d.firstName} stays engaged with material as it is taught.`,
      `Preparation for weekly checks paid off in ${d.firstName}'s strong quiz average (${d.quizTotal}%).`
    ];
  }

  if (highCp) {
    return [
      `Class participation stood out (${d.cpVal}/${d.cpMax}), bringing valuable energy and engagement to daily lessons.`,
      `${d.firstName} participated enthusiastically in class (${d.cpVal}/${d.cpMax})${highConduct ? ` and upheld respectful conduct (${d.conductVal}/${d.conductMax})` : ''}.`,
      `Consistent involvement in discussions (${d.cpVal}/${d.cpMax}) shows strong curiosity and readiness to contribute.`,
      `${d.firstName}'s active voice during lessons (${d.cpVal}/${d.cpMax}) helped make classroom activities more dynamic.`,
      `Strong classroom engagement (${d.cpVal}/${d.cpMax}) is a notable strength that supports deeper learning.`,
      `${d.firstName} regularly stepped up during class activities (${d.cpVal}/${d.cpMax}), demonstrating genuine involvement.`
    ];
  }

  if (highConduct) {
    return [
      `Respectful conduct (${d.conductVal}/${d.conductMax}) set a positive tone and showed cooperation in every lesson.`,
      `${d.firstName} maintained admirable classroom behavior (${d.conductVal}/${d.conductMax}), listening attentively and following expectations.`,
      `Positive conduct (${d.conductVal}/${d.conductMax})${strongAttendance ? ` and strong attendance (${d.attendance.rate}%)` : ''} provided steady support for learning.`,
      `${d.firstName} was cooperative and respectful throughout the quarter (${d.conductVal}/${d.conductMax}).`,
      `Consistent classroom conduct (${d.conductVal}/${d.conductMax}) reflects maturity and readiness to collaborate with peers.`,
      `${d.firstName}'s attentive attitude (${d.conductVal}/${d.conductMax}) helped create a supportive classroom environment.`
    ];
  }

  return [
    `${d.firstName} showed moments of steady focus across the quarter${topAcad ? `, especially in ${topAcad.label}` : ''}.`,
    `Effort across classroom tasks showed helpful progress${strongAttendance ? ` backed by reliable attendance (${d.attendance.rate}%)` : ''}.`,
    `${d.firstName} demonstrated growing familiarity with routine expectations and key lesson activities.`,
    `Keeping consistent attention on classwork gave ${d.firstName} useful experience to refine going forward.`,
    `${d.firstName} responded constructively to class activities and can build further on this base next quarter.`,
    `Continued engagement with daily tasks helped ${d.firstName} sustain momentum through the term.`
  ];
};

const buildImprovementOptions = (d: ScoreFeedbackInputs): string[] => {
  const attendanceConcern =
    d.attendance.total > 0 &&
    (d.attendance.unexcused >= d.attendanceSettings.warningThreshold || d.attendance.rate < 85);

  if (attendanceConcern) {
    return [
      `Prioritizing consistent attendance (${d.attendance.rate}% rate, ${d.attendance.unexcused} unexcused absence${d.attendance.unexcused === 1 ? '' : 's'}) will ensure ${d.firstName} does not miss essential explanations and practice.`,
      `Improving regular class attendance (${d.attendance.unexcused} unexcused) is the most immediate step to help ${d.firstName} keep pace and boost scores.`,
      `Being present consistently for lessons (${d.attendance.rate}% attendance) will give ${d.firstName} stronger continuity and confidence on assessments.`,
      `Reducing missed classes (${d.attendance.unexcused} unexcused) and catching up promptly on notes will directly strengthen future results.`,
      `Steady daily attendance should be a top goal next quarter so ${d.firstName} stays connected with core instruction before quizzes and tests.`,
      `Focusing on arriving consistently and reviewing missed material right away will help close current learning gaps.`
    ];
  }

  const academicAreas: { key: 'hw' | 'quiz' | 'test'; pct: number }[] = [];
  if (d.hasHw) academicAreas.push({ key: 'hw', pct: d.hwTotal });
  if (d.hasQuiz) academicAreas.push({ key: 'quiz', pct: d.quizTotal });
  if (d.hasTest) academicAreas.push({ key: 'test', pct: d.testTotal });
  academicAreas.sort((a, b) => a.pct - b.pct);
  const weakest = academicAreas[0];

  const conductLow = d.hasConduct && d.conductPct < 0.75;
  const cpLow = d.cpPct < 0.70;

  if (conductLow && (!weakest || d.conductPct * 100 <= weakest.pct)) {
    return [
      `Strengthening daily classroom focus and readiness (${d.conductVal}/${d.conductMax} conduct) will directly improve learning retention and marks.`,
      `Paying closer attention to classroom routines and staying on task throughout lessons (${d.conductVal}/${d.conductMax}) is a key area for growth.`,
      `${d.firstName} is encouraged to bring calmer focus and consistent preparation to each lesson to raise conduct (${d.conductVal}/${d.conductMax}) and achievement together.`,
      `Maintaining consistent self-discipline during class time will help ${d.firstName} get much more out of teacher explanations.`,
      `Focusing on respectful listening and organized class habits will positively lift both conduct (${d.conductVal}/${d.conductMax}) and overall performance.`,
      `Improving daily classroom focus and minimizing distractions will support steadier results next quarter.`
    ];
  }

  // If Grade A and everything is genuinely strong (>= 85%)
  if (d.letterGrade === 'A' && (!weakest || weakest.pct >= 85) && !cpLow) {
    return [
      `Going forward, ${d.firstName} can challenge themselves with deeper analysis questions and mentor peers during collaborative activities.`,
      `To grow even further, ${d.firstName} is encouraged to explore extension problems and refine small details on high-level tasks.`,
      `Maintaining this strong consistency while tackling more complex critical-thinking challenges will keep ${d.firstName} excelling.`,
      `${d.firstName} is ready to take on independent stretch goals and share leadership in class discussions next quarter.`,
      `Continuing to double-check subtle details while pushing into advanced applications will sharpen ${d.firstName}'s mastery even more.`,
      `Setting personal stretch targets and explaining reasoning clearly to classmates will elevate ${d.firstName}'s work to the next level.`
    ];
  }

  // If CP is noticeably lagging behind solid academic grades or clearly lowest
  if (cpLow && (!weakest || d.cpPct * 100 + 8 < weakest.pct || (d.letterGrade === 'A' && weakest.pct >= 88))) {
    return [
      `Sharing ideas and asking clarifying questions more frequently in class (${d.cpVal}/${d.cpMax} participation) will deepen ${d.firstName}'s confidence and understanding.`,
      `${d.firstName} clearly understands more than they voice aloud; speaking up more often in discussions (${d.cpVal}/${d.cpMax}) is a great next step.`,
      `Contributing at least one response or question each week will raise class participation (${d.cpVal}/${d.cpMax}) to match ${d.firstName}'s potential.`,
      `Engaging more actively during group and whole-class discussions (${d.cpVal}/${d.cpMax}) will help reinforce concepts in real time.`,
      `${d.firstName} is encouraged to volunteer thoughts more regularly in lessons so participation (${d.cpVal}/${d.cpMax}) reflects strong preparation.`,
      `Taking small steps to join class discussions more consistently will strengthen both confidence and overall standing.`
    ];
  }

  if (weakest && weakest.key === 'test') {
    return [
      `To lift overall results, ${d.firstName} should focus on monthly test preparation (${d.testTotal}%) through timed practice and reviewing cumulative topics earlier.`,
      `Strengthening exam review strategies for monthly tests (${d.testTotal}%)—especially practicing multi-step questions ahead of time—will make the biggest difference.`,
      `Connecting daily lesson notes directly to sample test questions will help raise ${d.firstName}'s test scores (${d.testTotal}%) closer to their other strengths.`,
      `${d.firstName} will benefit from reviewing earlier units well before test week so monthly exam results (${d.testTotal}%) match daily effort.`,
      `Checking test questions carefully and pacing review sessions across the week will boost confidence and marks on tests (${d.testTotal}%).`,
      `Targeted practice on core exam concepts before monthly tests (${d.testTotal}%) is the clearest path toward a higher grade next quarter.`
    ];
  }

  if (weakest && weakest.key === 'quiz') {
    return [
      `Brief, regular review of class notes before each quiz will help raise ${d.firstName}'s quiz scores (${d.quizTotal}%) quickly.`,
      `To move higher, ${d.firstName} should revisit tricky concepts right after each lesson and double-check past quiz feedback (${d.quizTotal}%).`,
      `Consistent short study sessions during the week will sharpen accuracy on quizzes (${d.quizTotal}%) and reinforce longer-term memory.`,
      `${d.firstName} is encouraged to prepare a few days ahead for quizzes (${d.quizTotal}%) and clarify confusing points before quiz day.`,
      `Reviewing key vocabulary and worked examples before short assessments will bring quiz marks (${d.quizTotal}%) in line with strengths.`,
      `Building a habit of quick weekly recaps will turn minor quiz slips (${d.quizTotal}%) into reliable points next quarter.`
    ];
  }

  if (weakest && weakest.key === 'hw') {
    return [
      `Prioritizing timely, complete homework submissions (${d.hwTotal}%) is the fastest way for ${d.firstName} to strengthen understanding and raise their grade.`,
      `${d.firstName} should focus on completing every homework assignment thoroughly (${d.hwTotal}%), using class examples as a guide.`,
      `Setting aside a consistent daily routine for homework (${d.hwTotal}%) will prevent missing points and reinforce classroom lessons.`,
      `Checking assignment instructions carefully and submitting homework on time (${d.hwTotal}%) will create a much steadier grade foundation.`,
      `Consistent practice through completed homework (${d.hwTotal}%) will pay off directly on quizzes and tests next term.`,
      `${d.firstName} is encouraged to seek clarification early on difficult homework items so all tasks (${d.hwTotal}%) are completed accurately.`
    ];
  }

  if (d.letterGrade === 'E' || d.letterGrade === 'F') {
    return [
      `Seeking extra teacher support early, keeping a steady study schedule, and completing foundational practice tasks will help ${d.firstName} build stronger results.`,
      `Focusing on core lesson basics, asking questions right away when stuck, and finishing daily tasks step by step will help ${d.firstName} recover momentum.`,
      `Regular review of essential notes paired with guided practice after class is strongly recommended to rebuild confidence next quarter.`,
      `${d.firstName} is encouraged to break study time into short daily blocks and check in frequently for support on challenging topics.`,
      `Staying on top of basic assignments and attending review opportunities will help ${d.firstName} turn effort into steady progress.`,
      `Rebuilding core concepts with patient, consistent practice and asking for help early will set up a much stronger next quarter.`
    ];
  }

  return [
    `Establishing a steady weekly revision routine and double-checking work for detail will help ${d.firstName} push into the next tier.`,
    `Reviewing challenging topics consistently and asking clarifying questions in class will help ${d.firstName} maintain upward progress.`,
    `${d.firstName} should keep reinforcing study habits and reviewing feedback carefully to improve accuracy across all tasks.`,
    `Continued attention to detail and early preparation before assessments will support even stronger results next quarter.`,
    `Building steady weekly study habits across all subjects of coursework will help ${d.firstName} reach higher consistency.`,
    `Balancing daily review with active reflection on past feedback will keep ${d.firstName} progressing smoothly.`
  ];
};

interface ParticipationOnlyInputs {
  firstName: string;
  count: number;
  classAvg: number;
  maxCount: number;
  topType?: ParticipationType;
  attendance: {
    present: number;
    excused: number;
    unexcused: number;
    total: number;
    rate: number;
  };
  attendanceSettings: AttendanceSettings;
}

const buildParticipationOnlyComment = (
  d: ParticipationOnlyInputs,
  variantIndex: number
): string => {
  const typeNote = d.topType ? `, most often through ${d.topType.toLowerCase()}` : '';
  const attConcern =
    d.attendance.total > 0 &&
    (d.attendance.unexcused >= d.attendanceSettings.warningThreshold || d.attendance.rate < 85);

  let openings: string[];
  let actions: string[];

  if (d.count === 0) {
    openings = [
      `${d.firstName} has not logged class participation yet this quarter (0 entries).`,
      `No participation entries were recorded for ${d.firstName} so far this quarter (0 entries).`,
      `${d.firstName} had 0 recorded participations this quarter while observing lessons.`,
      `So far this quarter, ${d.firstName} has 0 participation logs on record.`,
      `${d.firstName} remained quiet in logged class discussions this quarter (0 participations).`,
      `Recorded participation for ${d.firstName} stands at 0 this quarter.`
    ];
    actions = [
      `Setting a small goal to ask one question or share one response each week will help build confidence in class.`,
      `Starting with brief contributions in partner or small-group activities is a supportive way to get involved.`,
      `Sharing even one observation or question per lesson will make ${d.firstName}'s voice a helpful part of class discussions.`,
      `Connecting during class check-ins and trying one response next week will kick-start active engagement.`,
      `${d.firstName} is encouraged to contribute thoughts step by step so classroom understanding grows visibly.`,
      `Asking a clarifying question whenever a lesson topic feels tricky is a great first step into participation.`
    ];
  } else if (d.classAvg > 0 && d.count < Math.max(1, d.classAvg * 0.6)) {
    openings = [
      `${d.firstName} logged ${d.count} participation${d.count === 1 ? '' : 's'} this quarter${typeNote}, below the class average of ${d.classAvg}.`,
      `With ${d.count} recorded participation${d.count === 1 ? '' : 's'}${typeNote}, ${d.firstName} participated less frequently than the class average (${d.classAvg}).`,
      `${d.firstName} contributed ${d.count} time${d.count === 1 ? '' : 's'} this quarter${typeNote}, showing an initial start compared to the ${d.classAvg} average.`,
      `Recording ${d.count} participation${d.count === 1 ? '' : 's'} this quarter${typeNote}, ${d.firstName} is beginning to share ideas in class.`,
      `${d.firstName} made ${d.count} contribution${d.count === 1 ? '' : 's'} during the quarter${typeNote} (class average: ${d.classAvg}).`,
      `At ${d.count} participation${d.count === 1 ? '' : 's'} this quarter${typeNote}, ${d.firstName} has room to speak up more often.`
    ];
    actions = [
      `Aiming for one extra contribution each week will bring ${d.firstName} closer to the class pace and deepen understanding.`,
      `Joining group discussions or answering quick review prompts more regularly will strengthen classroom confidence.`,
      `Building a routine of sharing one idea or question every couple of lessons will steadily raise engagement.`,
      `${d.firstName} is encouraged to voice observations during activities to reinforce concepts in real time.`,
      `Taking more frequent opportunities to ask questions will help clarify lessons early and boost participation.`,
      `Stepping forward during warm-up reviews is a practical way to increase engagement next quarter.`
    ];
  } else if (d.maxCount > 0 && d.count >= Math.max(2, d.maxCount * 0.85) && d.count > d.classAvg * 1.15) {
    openings = [
      `${d.firstName} led the way in class engagement with ${d.count} participations this quarter${typeNote} (class average: ${d.classAvg}).`,
      `With an impressive ${d.count} participations${typeNote}, ${d.firstName} was one of the most active voices in the classroom.`,
      `${d.firstName} showed outstanding participation this quarter, contributing ${d.count} times${typeNote}.`,
      `Logging ${d.count} participations${typeNote}, ${d.firstName} consistently energized class lessons well above the ${d.classAvg} average.`,
      `${d.firstName} demonstrated exceptional classroom involvement with ${d.count} contributions this quarter${typeNote}.`,
      `Finishing near the top of the class at ${d.count} participations${typeNote}, ${d.firstName} brought steady focus to discussions.`
    ];
    actions = [
      `Continuing to ask thoughtful deeper questions while encouraging quieter peers in group work will make ${d.firstName} an even stronger classroom leader.`,
      `Using this strong engagement to guide collaborative tasks and sharpen written accuracy will keep momentum high.`,
      `Channeling this active curiosity into challenging extension problems will help sustain excellence next quarter.`,
      `Helping teammates explain concepts during group activities is a great next challenge for ${d.firstName}.`,
      `Balancing frequent contributions with careful listening to classmates will further enrich class discussions.`,
      `Carrying this same energy into formal assessments and projects will support strong overall success.`
    ];
  } else {
    openings = [
      `${d.firstName} maintained solid class participation with ${d.count} contribution${d.count === 1 ? '' : 's'} this quarter${typeNote} (class average: ${d.classAvg}).`,
      `With ${d.count} participation${d.count === 1 ? '' : 's'} recorded${typeNote}, ${d.firstName} stayed steadily engaged alongside peers.`,
      `${d.firstName} participated reliably this quarter, logging ${d.count} contribution${d.count === 1 ? '' : 's'}${typeNote}.`,
      `Recording ${d.count} participation${d.count === 1 ? '' : 's'}${typeNote}, ${d.firstName} kept up nicely with classroom discussions.`,
      `${d.firstName} showed dependable classroom involvement at ${d.count} participation${d.count === 1 ? '' : 's'} this quarter${typeNote}.`,
      `At ${d.count} participation${d.count === 1 ? '' : 's'}${typeNote}, ${d.firstName} demonstrated steady engagement throughout the quarter.`
    ];
    actions = [
      `Taking on occasional leadership roles in discussions or offering explanations at the board will lift engagement even higher.`,
      `Challenging themselves to share reasoning step by step in class will deepen understanding next quarter.`,
      `Keeping up this steady involvement while asking follow-up questions on harder topics will drive further growth.`,
      `Volunteering to summarize key ideas or assist in group activities is a great next goal for ${d.firstName}.`,
      `Staying consistent from week to week and pairing discussion with careful review will pay off on tests and tasks.`,
      `Aiming to contribute across varied activity types will make participation even more well-rounded.`
    ];
  }

  const attNotes = attConcern
    ? [
        ` Improving attendance consistency (${d.attendance.rate}% rate, ${d.attendance.unexcused} unexcused) will also support stronger continuity.`,
        ` Regular class attendance (${d.attendance.unexcused} unexcused absence${d.attendance.unexcused === 1 ? '' : 's'}) should remain a priority going forward.`
      ]
    : [''];

  const openIdx = variantIndex % openings.length;
  const actIdx = Math.floor(variantIndex / openings.length) % actions.length;
  const attIdx = Math.floor(variantIndex / (openings.length * actions.length)) % attNotes.length;

  return `${openings[openIdx]} ${actions[actIdx]}${attNotes[attIdx]}`.trim();
};

const composeScoreFeedback = (d: ScoreFeedbackInputs, variantIndex: number): string => {
  const openings = buildOpeningOptions(d);
  const strengths = buildStrengthOptions(d);
  const improvements = buildImprovementOptions(d);

  const openIdx = variantIndex % openings.length;
  const strIdx = Math.floor(variantIndex / openings.length) % strengths.length;
  const impIdx = Math.floor(variantIndex / (openings.length * strengths.length)) % improvements.length;

  return `${openings[openIdx]} ${strengths[strIdx]} ${improvements[impIdx]}`;
};

export const generateQuarterClassFeedback = (params: {
  roster: (Student & { displayNum: number })[];
  scores: ScoreRecord[];
  records: ParticipationRecord[];
  attendanceRecords: Parameters<typeof getStudentAttendanceQuarter>[0];
  gradingSettings: GradingSettings;
  attendanceSettings: AttendanceSettings;
  classId: string;
  className: string;
  quarter: Quarter;
  seedOffset?: number;
}): {
  analyses: StudentQuarterAnalysis[];
  classHasScores: boolean;
  classScoreAvg: number;
  classPartAvg: number;
  mostParticipation: number;
  leastParticipation: number;
} => {
  const {
    roster,
    scores,
    records,
    attendanceRecords,
    gradingSettings,
    attendanceSettings,
    classId,
    className,
    quarter,
    seedOffset = 0
  } = params;

  const classScores = scores.filter(
    s => (!s.classId || s.classId === classId) && Number(s.quarter) === Number(quarter)
  );

  const hasConductInClass = classScores.some(s => typeof s.conduct === 'number');
  const hasHwInClass = classScores.some(
    s => typeof s.hw1 === 'number' || typeof s.hw2 === 'number' || typeof s.hw3 === 'number'
  );
  const hasQuizInClass = classScores.some(
    s => typeof s.quiz1 === 'number' || typeof s.quiz2 === 'number' || typeof s.quiz3 === 'number'
  );
  const hasTestInClass = classScores.some(
    s => typeof s.test1 === 'number' || typeof s.test2 === 'number'
  );
  const classHasScores = classScores.some(s => hasEnteredFields(s));

  const rawEntries = roster.map(student => {
    const score = classScores.find(s => s.studentId === student.id);
    const rawCp = getStudentQuarterTotal(records, student.id, quarter);
    const cappedRawCp = Math.min(rawCp, gradingSettings.maxScores.cp);
    const effectiveCp = score?.cpScore !== undefined ? Number(score.cpScore) || 0 : cappedRawCp;
    const cpPct = gradingSettings.maxScores.cp > 0 ? effectiveCp / gradingSettings.maxScores.cp : 0;

    const hasConductVal = typeof score?.conduct === 'number';
    const conductVal = hasConductVal ? score!.conduct : undefined;
    const conductPct =
      hasConductVal && gradingSettings.maxScores.conduct > 0
        ? (score!.conduct! / gradingSettings.maxScores.conduct)
        : 0;

    const calculated = calculateStudentGrades(
      score,
      rawCp,
      gradingSettings,
      student.id,
      quarter,
      className,
      classScores
    );

    const attendance = getStudentAttendanceQuarter(attendanceRecords, student.id, quarter);

    // Find most frequent logged participation type for this student in this quarter
    const studentPartRecords = records.filter(r => r.studentId === student.id && r.quarter === quarter);
    let topParticipationType: ParticipationType | undefined;
    if (studentPartRecords.length > 0) {
      const counts = new Map<ParticipationType, number>();
      studentPartRecords.forEach(r => {
        counts.set(r.participationType, (counts.get(r.participationType) || 0) + 1);
      });
      topParticipationType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    return {
      student,
      score,
      hasStudentScoreFields: hasEnteredFields(score),
      rawCp,
      effectiveCp,
      cpPct,
      conductVal,
      conductPct,
      calculated,
      attendance,
      topParticipationType
    };
  });

  const rankMap = calculateClassRanks(
    rawEntries.map(e => ({
      studentId: e.student.id,
      overallScore: e.calculated.overallScore
    }))
  );

  const scoredEntries = rawEntries.filter(e => e.hasStudentScoreFields);
  const classScoreAvg =
    scoredEntries.length > 0
      ? Number(
          (
            scoredEntries.reduce((sum, e) => sum + e.calculated.overallScore, 0) /
            scoredEntries.length
          ).toFixed(2)
        )
      : 0;

  const totalPart = rawEntries.reduce((sum, e) => sum + e.rawCp, 0);
  const classPartAvg = roster.length > 0 ? Number((totalPart / roster.length).toFixed(2)) : 0;
  const partCounts = rawEntries.map(e => e.rawCp);
  const mostParticipation = partCounts.length > 0 ? Math.max(...partCounts) : 0;
  const leastParticipation = partCounts.length > 0 ? Math.min(...partCounts) : 0;

  // Track used comments across the entire class so no two students receive the exact same text
  const usedComments = new Set<string>();

  const analyses: StudentQuarterAnalysis[] = rawEntries.map((entry, idx) => {
    const firstName = getFirstName(entry.student.name);
    const rank = rankMap[entry.student.id] || idx + 1;
    const baseSeed = hashString(
      `${entry.student.id}_${entry.student.name}_Q${quarter}_${entry.calculated.overallScore}_${entry.rawCp}_${seedOffset}`
    );

    let comment = '';

    if (classHasScores) {
      if (!entry.hasStudentScoreFields && entry.rawCp === 0) {
        const noDataTemplates = [
          `No scores or participation logs have been entered yet for ${firstName} in Quarter ${quarter}. Please record assessments or coursework in the Score List to generate performance feedback.`,
          `${firstName} does not have any quarter scores or participation records entered yet for Quarter ${quarter}. Once initial assignments or tests are recorded, feedback will align with those results.`,
          `Quarter ${quarter} scores are not yet recorded for ${firstName}. Updating homework, quiz, test, or participation entries will allow an accurate progress summary.`,
          `No graded entries are on file yet for ${firstName} this quarter. Please ensure assessments or missing tasks are logged to evaluate current standing.`,
          `${firstName} currently has no recorded scores or participation counts for Quarter ${quarter}. Add initial scores in the Score List to review individualized feedback.`,
          `Awaiting initial Quarter ${quarter} score entries for ${firstName}; once coursework or exam marks are added, tailored constructive feedback will update automatically.`
        ];
        for (let attempt = 0; attempt < noDataTemplates.length; attempt++) {
          const candidate = noDataTemplates[(baseSeed + idx + attempt) % noDataTemplates.length];
          if (!usedComments.has(candidate) || attempt === noDataTemplates.length - 1) {
            comment = candidate;
            break;
          }
        }
      } else if (!entry.hasStudentScoreFields && entry.rawCp > 0) {
        const pInputs: ParticipationOnlyInputs = {
          firstName,
          count: entry.rawCp,
          classAvg: classPartAvg,
          maxCount: mostParticipation,
          topType: entry.topParticipationType,
          attendance: entry.attendance,
          attendanceSettings
        };
        const maxAttempts = 72;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const candidate = `${buildParticipationOnlyComment(pInputs, baseSeed + idx * 5 + attempt)} Academic score fields in the Score List have not been entered yet for ${firstName}.`;
          if (!usedComments.has(candidate) || attempt === maxAttempts - 1) {
            comment = candidate;
            break;
          }
        }
      } else {
        const inputs: ScoreFeedbackInputs = {
          firstName,
          overallScore: entry.calculated.overallScore,
          letterGrade: entry.calculated.letterGrade as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
          rank,
          classSize: roster.length,
          classScoreAvg,
          hasConduct: hasConductInClass && entry.conductVal !== undefined,
          conductVal: entry.conductVal,
          conductMax: gradingSettings.maxScores.conduct,
          conductPct: entry.conductPct,
          cpVal: entry.effectiveCp,
          cpMax: gradingSettings.maxScores.cp,
          cpPct: entry.cpPct,
          hasHw: hasHwInClass,
          hwTotal: entry.calculated.hwTotal,
          hasQuiz: hasQuizInClass,
          quizTotal: entry.calculated.quizTotal,
          hasTest: hasTestInClass,
          testTotal: entry.calculated.testTotal,
          attendance: entry.attendance,
          attendanceSettings
        };

        const maxAttempts = 216;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const candidate = composeScoreFeedback(inputs, baseSeed + idx * 7 + attempt);
          if (!usedComments.has(candidate) || attempt === maxAttempts - 1) {
            comment = candidate;
            break;
          }
        }
      }
    } else {
      const pInputs: ParticipationOnlyInputs = {
        firstName,
        count: entry.rawCp,
        classAvg: classPartAvg,
        maxCount: mostParticipation,
        topType: entry.topParticipationType,
        attendance: entry.attendance,
        attendanceSettings
      };

      const maxAttempts = 72;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = buildParticipationOnlyComment(pInputs, baseSeed + idx * 5 + attempt);
        if (!usedComments.has(candidate) || attempt === maxAttempts - 1) {
          comment = candidate;
          break;
        }
      }
    }

    usedComments.add(comment);

    return {
      student: entry.student,
      rawCp: entry.rawCp,
      effectiveCp: entry.effectiveCp,
      cpPct: entry.cpPct,
      conductVal: entry.conductVal,
      conductPct: entry.conductPct,
      hasConductInClass,
      hasHwInClass,
      hasQuizInClass,
      hasTestInClass,
      hasStudentScoreFields: entry.hasStudentScoreFields,
      classHasScores,
      overallScore: entry.calculated.overallScore,
      letterGrade: entry.calculated.letterGrade as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
      rank,
      classSize: roster.length,
      hwTotal: entry.calculated.hwTotal,
      quizTotal: entry.calculated.quizTotal,
      testTotal: entry.calculated.testTotal,
      attendance: entry.attendance,
      topParticipationType: entry.topParticipationType,
      comment
    };
  });

  return {
    analyses,
    classHasScores,
    classScoreAvg,
    classPartAvg,
    mostParticipation,
    leastParticipation
  };
};
