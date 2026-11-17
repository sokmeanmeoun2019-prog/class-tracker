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

const fmtPct = (val: number): string => {
  const rounded = Number(val.toFixed(1));
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
};

const formatStudentDisplayName = (fullName: string): string => {
  const clean = fullName.trim();
  if (!clean) return 'there';
  return clean
    .split(/\s+/)
    .map(token =>
      token === token.toUpperCase() && token.length > 1
        ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
        : token
    )
    .join(' ');
};

const getNextQuarterPhrase = (quarter: Quarter): string => {
  if (quarter === 1) return 'Quarter 2';
  if (quarter === 2) return 'Quarter 3';
  if (quarter === 3) return 'Quarter 4';
  return 'next term';
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
  fullName: string;
  quarter: Quarter;
  nextQuarter: string;
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

const buildHumanOpenings = (d: ScoreFeedbackInputs): string[] => {
  const scoreStr = fmtPct(d.overallScore);
  const aboveAvg = d.classScoreAvg > 0 && d.overallScore >= d.classScoreAvg + 5;
  const qLabel = `Quarter ${d.quarter}`;

  switch (d.letterGrade) {
    case 'A':
      return [
        `You wrapped up ${qLabel} with an impressive ${scoreStr} (Grade A), and it shows how much care you put into your studies every week.`,
        `Finishing ${qLabel} at ${scoreStr} (Grade A) is something to be genuinely proud of, especially knowing the effort it took to stay consistent.`,
        `You had a fantastic ${qLabel} overall, earning ${scoreStr} and finishing with a solid Grade A${aboveAvg ? ' well ahead of the class pace' : ''}.`,
        `Your hard work really paid off in ${qLabel}, bringing your overall average up to ${scoreStr} (Grade A).`,
        `Closing out ${qLabel} with ${scoreStr} (Grade A) reflects real discipline and genuine curiosity in what we covered.`,
        `Well done on earning ${scoreStr} (Grade A) in ${qLabel}—you approached your work with confidence and strong follow-through.`,
        `I am really proud of how you performed in ${qLabel}, finishing with ${scoreStr} (Grade A) across your coursework and exams.`
      ];
    case 'B':
      return [
        `You finished ${qLabel} with a strong ${scoreStr} (Grade B), showing good understanding across the lessons we covered.`,
        `Reaching ${scoreStr} (Grade B) in ${qLabel} is a solid result, and you are right on the doorstep of top marks.`,
        `You had a very dependable ${qLabel}, finishing with ${scoreStr} (Grade B)${aboveAvg ? ' above the class average' : ''} and plenty to feel good about.`,
        `With an overall score of ${scoreStr} (Grade B) in ${qLabel}, it is clear that you stayed engaged and kept up steadily with class expectations.`,
        `You put together a good ${qLabel} and earned ${scoreStr} (Grade B), giving yourself a strong base to build on.`,
        `Closing ${qLabel} at ${scoreStr} (Grade B) shows real ability—just a few small adjustments can easily push you into the A range.`,
        `Nice work across ${qLabel} to finish at ${scoreStr} (Grade B); your steady effort kept your results healthy throughout the term.`
      ];
    case 'C':
      return [
        `You closed ${qLabel} at ${scoreStr} (Grade C), showing that you understand the core ideas even though a few topics still felt tricky.`,
        `Finishing ${qLabel} with ${scoreStr} (Grade C) shows steady progress, and with a few sharper habits your scores can climb much higher.`,
        `You worked through ${qLabel} and earned ${scoreStr} (Grade C), keeping up with the main lessons while leaving clear room to grow.`,
        `At ${scoreStr} (Grade C) for ${qLabel}, you have a workable foundation in place and a real chance to move up into the B group next term.`,
        `You reached ${scoreStr} (Grade C) in ${qLabel}, showing decent grasp of the basics alongside some ups and downs on graded work.`,
        `Completing ${qLabel} with ${scoreStr} (Grade C) shows you are hanging in there with the material, and tightening up a couple of routines will pay off fast.`,
        `Your ${qLabel} score of ${scoreStr} (Grade C) reflects honest effort and shows you are capable of much stronger marks once everything clicks together.`
      ];
    case 'D':
      return [
        `You finished ${qLabel} at ${scoreStr} (Grade D), which tells me some parts of the class made sense to you while other pieces still need more practice.`,
        `Closing ${qLabel} with ${scoreStr} (Grade D) shows that you tried to keep up, though a few gaps held back your final result.`,
        `Your ${qLabel} total came to ${scoreStr} (Grade D), meaning you caught some of the key ideas but need steadier study habits to raise your mark.`,
        `At ${scoreStr} (Grade D) for ${qLabel}, there were moments where you showed good potential, even though your scores ended lower than we want.`,
        `You wrapped up ${qLabel} with ${scoreStr} (Grade D); don't get discouraged by that grade, because targeted daily practice can lift it quickly.`,
        `With ${scoreStr} (Grade D) in ${qLabel}, it is clear the material challenged you at times, yet there is plenty we can fix step by step.`,
        `Finishing ${qLabel} at ${scoreStr} (Grade D) is a signal to tighten up your weekly routine so your understanding shows up clearly on paper.`
      ];
    case 'E':
      return [
        `You finished ${qLabel} with ${scoreStr} (Grade E), and while this quarter felt difficult, I want you to know that improvement is very achievable.`,
        `Ending ${qLabel} at ${scoreStr} (Grade E) shows that several lessons felt overwhelming, especially when quizzes and tests came around.`,
        `With ${scoreStr} (Grade E) in ${qLabel}, this was a challenging term, and building stronger daily habits now will make things feel much lighter.`,
        `You closed ${qLabel} at ${scoreStr} (Grade E); I know you are capable of more than this score shows once we get the basics feeling comfortable.`,
        `At ${scoreStr} (Grade E) for ${qLabel}, it took real effort just to stay with the class, and now is a good moment to reset how you review each week.`,
        `Your ${qLabel} result of ${scoreStr} (Grade E) tells us we need to slow down and shore up the fundamentals together rather than rushing ahead.`,
        `Seeing ${scoreStr} (Grade E) at the end of ${qLabel} can feel frustrating, so let's treat it as a clear starting point for rebuilding step by step.`
      ];
    case 'F':
    default:
      return [
        `You finished ${qLabel} with ${scoreStr} (Grade F), which reflects a tough quarter across graded work, though it does not mean you cannot turn things around.`,
        `Ending ${qLabel} at ${scoreStr} (Grade F) shows how hard this term felt for you, and I want us to work closely together so things go better from here.`,
        `With ${scoreStr} (Grade F) in ${qLabel}, it was a rocky term on paper, and getting extra help early will make a big difference in how confident you feel.`,
        `At ${scoreStr} (Grade F) for ${qLabel}, several graded tasks pulled your score down quickly, so our focus now is rebuilding one skill at a time.`,
        `Closing ${qLabel} at ${scoreStr} (Grade F) was not the result either of us hoped for, yet small consistent steps can change that story fast.`,
        `Your ${qLabel} score ended at ${scoreStr} (Grade F); please don't give up on yourself, because regular review and early questions can lift this significantly.`,
        `I know ${scoreStr} (Grade F) in ${qLabel} is discouraging to see, so let's use it as a clear wake-up call to get back on track with steady support.`
      ];
  }
};

const buildHumanStrengths = (d: ScoreFeedbackInputs): string[] => {
  const parts: { key: 'tests' | 'quizzes' | 'homework'; pct: number; text: string }[] = [];
  if (d.hasTest) parts.push({ key: 'tests', pct: d.testTotal, text: fmtPct(d.testTotal) });
  if (d.hasQuiz) parts.push({ key: 'quizzes', pct: d.quizTotal, text: fmtPct(d.quizTotal) });
  if (d.hasHw) parts.push({ key: 'homework', pct: d.hwTotal, text: fmtPct(d.hwTotal) });

  const sorted = [...parts].sort((a, b) => b.pct - a.pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const isEvenlyStrong =
    sorted.length >= 2 && best && worst && best.pct - worst.pct < 8 && worst.pct >= 75;

  const goodConduct = d.hasConduct && d.conductPct >= 0.8;
  const greatConduct = d.hasConduct && d.conductPct >= 0.9;
  const goodCp = d.cpPct >= 0.8;
  const decentCp = d.cpPct >= 0.6;
  const goodAttendance =
    d.attendance.total > 0 && d.attendance.rate >= 95 && d.attendance.unexcused === 0;

  const conductMention = goodConduct ? `${d.conductVal}/${d.conductMax} in conduct` : '';
  const cpMention = goodCp ? `${d.cpVal}/${d.cpMax} in participation` : '';

  // E / F: Highlight what genuinely went well without sugarcoating academic struggles
  if ((d.letterGrade === 'E' || d.letterGrade === 'F') && (!best || best.pct < 68)) {
    if (best && best.key === 'homework' && best.pct >= 50) {
      return [
        `At the same time, I appreciate that you kept putting effort into your homework (${best.text})${goodConduct ? ` and showed respectful classroom conduct (${conductMention})` : ''}, proving you do care when working through assignments.`,
        `One thing that genuinely stood out in your favor was your homework (${best.text})${goodConduct ? ` alongside polite behavior in class (${conductMention})` : ''}, which shows you are willing to try on your own time.`,
        `Even with tough exam scores, you stayed more steady on homework (${best.text})${goodAttendance ? ` and showed up reliably to class` : ''}, and that willingness to put in daily work gives us something real to build on.`,
        `Your homework score of ${best.text} shows you can handle material much better when you are not under test pressure${goodConduct ? `, and your ${conductMention} made you pleasant to teach every day` : ''}.`,
        `I noticed you did not give up on your assignments—scoring ${best.text} on homework${goodCp ? ` and ${cpMention}` : ''} shows there is real effort behind the scenes.`,
        `Compared to your timed exams, homework (${best.text}) was where you held things together best${goodConduct ? `, paired with steady conduct (${conductMention})` : ''}, showing that practice outside class actually helps you.`
      ];
    }
    if (goodConduct && goodCp) {
      return [
        `What really kept me encouraged about your quarter was how respectful and involved you stayed in class (${conductMention} and ${cpMention}), even when written work felt hard.`,
        `You brought a polite attitude (${conductMention}) and real classroom energy (${cpMention}) every week, which tells me you want to learn and just need better tools for tests.`,
        `Despite low written scores, your daily conduct (${conductMention}) and willingness to speak up (${cpMention}) stood out in the best way.`,
        `Your attitude in the room—earning ${conductMention} and participating actively (${cpMention})—shows maturity and keeps the door wide open for faster progress.`,
        `I really value the way you carried yourself in class (${conductMention}) and stayed part of discussions (${cpMention}), even while struggling on paper.`,
        `Staying cooperative (${conductMention}) and engaged during lessons (${cpMention}) is a big plus, because students who stay tuned in always bounce back faster once we fix study habits.`
      ];
    }
    if (goodConduct) {
      return [
        `One genuine bright spot was your classroom conduct (${conductMention})—you were respectful, patient, and cooperative whenever I worked with you.`,
        `Even when lessons felt tough, your good behavior (${conductMention})${goodAttendance ? ` and reliable attendance` : ''} made a positive impression and showed real respect for learning.`,
        `I appreciate how polite and attentive you were in class (${conductMention}); having that calm attitude makes it much easier for us to work through difficult topics together.`,
        `Your conduct mark (${conductMention}) speaks well of your character and shows you are willing to listen and accept guidance when things get hard.`,
        `Thank you for bringing respectful conduct (${conductMention}) to the room every day—good behavior like yours is always the best starting block for turning grades around.`,
        `Keeping solid conduct (${conductMention})${decentCp ? ` while staying present in class activities` : ''} shows you care about doing the right thing even during a hard quarter.`
      ];
    }
    if (goodCp) {
      return [
        `I really appreciated how actively you participated in class (${cpMention})—you stayed curious and engaged even when tests and quizzes didn't go your way.`,
        `Speaking up and staying involved in lessons (${cpMention}) showed me that you understand more verbally than your exam scores gave you credit for.`,
        `Your class participation (${cpMention}) was a clear strength, proving you are listening and thinking during discussions even if written exams felt tricky.`,
        `Even with low test results, you never tuned out—earning ${cpMention} shows genuine involvement when topics are discussed live.`,
        `Staying vocal and involved in class (${cpMention}) is something to be proud of, because it means your brain is engaged and ready once we sharpen written review.`,
        `You consistently jumped into class activities (${cpMention}), which tells me you have the interest needed to raise your written scores too.`
      ];
    }
    if (best && best.pct >= 40) {
      return [
        `Looking closely at your numbers, ${best.key === 'tests' ? 'monthly tests' : best.key} (${best.text}) went noticeably better than your other categories, giving you a clue about what study approach works best for you.`,
        `Compared to the rest of your marks, your ${best.key === 'tests' ? 'test' : best.key} score (${best.text}) showed moments where concepts did make sense.`,
        `Your strongest showing came on ${best.key === 'tests' ? 'tests' : best.key} at ${best.text}, proving you are capable of getting points on the board when you lock in.`,
        `Even in a hard quarter, earning ${best.text} in ${best.key === 'tests' ? 'tests' : best.key} gives us proof that things click when you have enough practice.`,
        `There were signs of progress in ${best.key === 'tests' ? 'tests' : best.key} (${best.text}), which is an encouraging sign we can expand into other areas.`,
        `Your effort in ${best.key === 'tests' ? 'tests' : best.key} (${best.text}) held up better than the rest of your grades and is worth building upon.`
      ];
    }
    return [
      `Seeing you continue coming to class${goodAttendance ? ' regularly' : ''} and sticking with the term shows quiet persistence even when assignments feel uphill.`,
      `Every quarter is a chance to reset, and staying connected with classroom routines instead of giving up is already half the battle.`,
      `Even when grades drop, showing up ready to try one task at a time gives us everything we need to start rebuilding together.`,
      `I know you can respond well once expectations feel manageable and we break lessons down into smaller daily chunks.`,
      `Keeping an open mind and letting yourself accept extra help early will help your effort finally turn into passing marks.`,
      `Staying present in the classroom and attempting each step bit by bit is how real turnarounds begin.`
    ];
  }

  if (isEvenlyStrong && best) {
    return [
      `What impressed me most was how steady you were everywhere—homework (${fmtPct(d.hwTotal)}), quizzes (${fmtPct(d.quizTotal)}), and monthly tests (${fmtPct(d.testTotal)}) all stayed consistently solid without any big drops.`,
      `You avoided cramming and kept all your categories balanced—scoring ${fmtPct(d.hwTotal)} on homework, ${fmtPct(d.quizTotal)} on quizzes, and ${fmtPct(d.testTotal)} on tests${greatConduct ? ` with great conduct (${conductMention})` : ''}.`,
      `Your consistency across daily assignments, short quizzes, and major tests showed genuine reliability week after week${goodCp ? `, backed up by active class participation (${cpMention})` : ''}.`,
      `I loved seeing steady marks across homework, quizzes, and tests alike—it shows you stay on top of lessons as they happen rather than waiting until the last minute.`,
      `From daily homework (${fmtPct(d.hwTotal)}) right through to monthly tests (${fmtPct(d.testTotal)}), your work had a calm, dependable rhythm all quarter long.`,
      `Keeping every academic area above ${fmtPct(worst.pct)} while maintaining ${goodConduct ? conductMention : 'a positive attitude'} shows strong self-discipline.`
    ];
  }

  if (best && best.key === 'tests' && best.pct >= 70) {
    return [
      `You really shone on monthly tests (${best.text}), handling longer exam questions calmly and showing solid command of what we studied.`,
      `Your performance on monthly tests (${best.text}) stood out right away—you clearly know how to pull ideas together under exam conditions.`,
      `Tests were definitely your strongest moment (${best.text}), showing that you can focus well and apply what you learned when it counts most.`,
      `Scoring ${best.text} on monthly tests proves you truly understand the deeper concepts${goodCp ? ` and your ${cpMention} added great energy to class too` : ''}.`,
      `I was especially pleased with your monthly test results (${best.text}), which showed careful thinking and solid retention.`,
      `When major exams came around, you stepped up and delivered ${best.text}${goodConduct ? ` alongside respectful conduct (${conductMention})` : ''}.`
    ];
  }

  if (best && best.key === 'homework' && best.pct >= 70) {
    return [
      `Your homework (${best.text}) was a real highlight this quarter—you took assignments seriously, turned work in reliably, and showed strong independence.`,
      `Scoring ${best.text} on homework shows terrific responsibility outside the classroom and proves you put genuine thought into practice tasks.`,
      `I really appreciate the care you put into homework (${best.text})${goodConduct ? ` and your respectful conduct in class (${conductMention})` : ''}; reliable daily work makes a huge difference.`,
      `You led with your homework average (${best.text}), showing neat, dependable effort on regular assignments week after week.`,
      `Your dedication on homework (${best.text}) kept your grade anchored all term and shows you know how to follow through on tasks.`,
      `Consistency on assignments (${best.text})${goodAttendance ? ' along with dependable attendance' : ''} reflects strong daily habits that any student would be proud of.`
    ];
  }

  if (best && best.key === 'quizzes' && best.pct >= 70) {
    return [
      `You did a great job staying sharp for quizzes (${best.text}), showing that you review lessons quickly while ideas are still fresh.`,
      `Quizzes were where you really stood out (${best.text}), proving you keep up well with week-to-week vocabulary and problem steps.`,
      `Your strong quiz marks (${best.text}) show attentive listening during class and prompt preparation before short check-ins.`,
      `Hitting ${best.text} across quizzes showed great focus on day-to-day lessons${goodCp ? `, matching your active involvement in discussions (${cpMention})` : ''}.`,
      `I liked how quickly you grasped weekly topics on quizzes (${best.text})—that kind of timely review really pays off.`,
      `Staying ready for short quizzes (${best.text})${goodConduct ? ` with cooperative conduct (${conductMention})` : ''} kept your momentum positive throughout the quarter.`
    ];
  }

  if (goodCp) {
    return [
      `Your energy in class participation (${cpMention}) really stood out—you asked thoughtful questions and helped keep discussions lively.`,
      `I always enjoyed hearing your voice in class (${cpMention})${goodConduct ? ` and seeing your respectful attitude (${conductMention})` : ''}; active involvement like yours makes every lesson better.`,
      `Scoring ${cpMention} shows how engaged and curious you stay during live activities and group work.`,
      `You consistently stepped forward during lessons (${cpMention}), bringing confidence and positive focus to classroom discussions.`,
      `Your strong participation (${cpMention})${goodAttendance ? ' backed by reliable attendance' : ''} shows you are genuinely tuned in during class.`,
      `Contributing regularly (${cpMention}) gave you a strong classroom presence and showed you are never afraid to engage with new ideas.`
    ];
  }

  if (goodConduct) {
    return [
      `Your conduct in class (${conductMention}) was consistently mature and respectful, making the classroom a better place for everyone around you.`,
      `I appreciated your calm, polite behavior (${conductMention}) all quarter long—you listened well and set a positive example for peers.`,
      `With ${conductMention}${goodAttendance ? ` and reliable attendance (${fmtPct(d.attendance.rate)})` : ''}, your daily classroom habits gave you a great foundation.`,
      `You were cooperative, attentive, and respectful every week (${conductMention}), which goes a long way toward steady learning.`,
      `Showing ${conductMention} proved you take classroom expectations seriously and know how to stay respectful during group and solo work.`,
      `Your thoughtful attitude (${conductMention})${best ? ` along with ${best.text} in ${best.key === 'tests' ? 'tests' : best.key}` : ''} showed solid character throughout the quarter.`
    ];
  }

  return [
    `There were clear moments this quarter where your focus paid off${best ? `, especially seeing ${best.text} in ${best.key === 'tests' ? 'tests' : best.key}` : ''}.`,
    `You kept working through class tasks steadily${goodAttendance ? ` and maintained dependable attendance (${fmtPct(d.attendance.rate)})` : ''}, giving yourself solid ground to improve from.`,
    `Your steady presence and willingness to stay engaged with routine work showed good effort even during busy weeks.`,
    `Staying attentive during guided practice helped you pick up key routines that will serve you well going forward.`,
    `You showed good moments of focus and persistence when tasks were clear, proving you can step up when you lock into a routine.`,
    `Your continued effort through classroom exercises gave you useful experience to build sharper accuracy from.`
  ];
};

const buildHumanImprovements = (d: ScoreFeedbackInputs): string[] => {
  const attendanceIssue =
    d.attendance.total > 0 &&
    (d.attendance.unexcused >= d.attendanceSettings.warningThreshold || d.attendance.rate < 85);

  if (attendanceIssue) {
    return [
      `The biggest hurdle holding your score back was attendance (${fmtPct(d.attendance.rate)} with ${d.attendance.unexcused} unexcused absence${d.attendance.unexcused === 1 ? '' : 's'})—missing explanations in person makes tests and quizzes feel twice as hard, so making class attendance a top habit and catching up on missed notes right away will help immediately.`,
      `Being out for several classes (${d.attendance.unexcused} unexcused) made it tough to keep pace when topics moved forward; showing up regularly and asking a classmate or me for missed examples the very next day will noticeably lift your grades.`,
      `Right now, strengthening attendance (${fmtPct(d.attendance.rate)}) is your quickest win—when you are in your seat consistently, lessons click much faster and quiz days stop feeling like surprises.`,
      `Work on reducing unexcused absences (${d.attendance.unexcused}) first, because regular presence in the room will give you the confidence and background needed for stronger homework and exam scores.`,
      `Missing lessons interrupted your momentum (${fmtPct(d.attendance.rate)} attendance), so prioritizing consistent arrival and reviewing missed classwork promptly will make a clear difference next term.`,
      `Making steady daily attendance a priority—and checking in right after any missed day—will keep small gaps from piling up before monthly tests.`
    ];
  }

  const academicAreas: { key: 'hw' | 'quiz' | 'test'; pct: number; label: string }[] = [];
  if (d.hasHw) academicAreas.push({ key: 'hw', pct: d.hwTotal, label: fmtPct(d.hwTotal) });
  if (d.hasQuiz) academicAreas.push({ key: 'quiz', pct: d.quizTotal, label: fmtPct(d.quizTotal) });
  if (d.hasTest) academicAreas.push({ key: 'test', pct: d.testTotal, label: fmtPct(d.testTotal) });
  academicAreas.sort((a, b) => a.pct - b.pct);
  const weakest = academicAreas[0];
  const secondWeakest = academicAreas[1];

  const lowConduct = d.hasConduct && d.conductPct < 0.75;
  const lowCp = d.cpPct < 0.70;

  if (lowConduct && (!weakest || d.conductPct * 100 <= weakest.pct)) {
    return [
      `Where you can make the biggest jump is classroom focus—bringing calmer listening habits and staying tuned in from start to finish (currently ${d.conductVal}/${d.conductMax} conduct) will help you catch important details the first time they are taught.`,
      `Pay closer attention to staying settled and focused during lessons (${d.conductVal}/${d.conductMax} conduct); cutting down distractions during explanation time makes homework and tests much easier later on.`,
      `Working on daily self-discipline and classroom readiness (${d.conductVal}/${d.conductMax} conduct) will immediately improve how much you take away from each lesson.`,
      `Try coming into class organized and staying locked onto the task at hand—improving conduct from ${d.conductVal}/${d.conductMax} goes hand in hand with higher test marks.`,
      `Limiting side chatter and staying attentive throughout group and teacher explanations will lift both your conduct (${d.conductVal}/${d.conductMax}) and overall confidence.`,
      `Giving every lesson your full attention from bell to bell is the simplest change you can make right now to get stronger results.`
    ];
  }

  // Grade A with strong marks everywhere -> genuine extension challenge
  if (d.letterGrade === 'A' && (!weakest || weakest.pct >= 85) && !lowCp) {
    return [
      `Since you already have the core material well under control, your next step is pushing yourself with harder extension questions and helping classmates talk through tricky concepts during group tasks.`,
      `Because your fundamentals are so strong, try taking on deeper challenge problems and double-checking tiny details on exams so you keep sharpening your edge.`,
      `Now that you have mastered the main expectations, don't settle—ask bigger "why" questions, explore tougher problems beyond the basics, and keep encouraging quieter teammates around you.`,
      `As someone setting the pace in class, challenge yourself next quarter to explain your reasoning clearly out loud and look closely at multi-step questions where small details count.`,
      `To keep growing at this level, look for ways to stretch your thinking on open-ended problems and act as a steady leader during collaborative work.`,
      `Keep guarding against small rushing mistakes on high-scoring work, and push yourself on complex critical-thinking questions whenever you finish early.`
    ];
  }

  // Quiet student whose CP lags behind solid written grades
  if (lowCp && (!weakest || d.cpPct * 100 + 8 < weakest.pct || (d.letterGrade === 'A' && weakest.pct >= 88))) {
    return [
      `One easy area to grow is speaking up more during lessons—your participation (${d.cpVal}/${d.cpMax}) doesn't yet show how much you actually understand on paper, so try sharing one answer or question each week.`,
      `You clearly follow the material well, so don't hold back during class discussions! Raising your hand more often (currently ${d.cpVal}/${d.cpMax} CP) will build confidence and add great insights to the room.`,
      `Challenge yourself to voice at least one thought or question every few lessons—lifting your participation from ${d.cpVal}/${d.cpMax} will round out an already strong profile.`,
      `Sometimes quiet students think their answer isn't ready yet, but sharing even partial ideas during class (${d.cpVal}/${d.cpMax} CP) helps sharpen your thinking fast.`,
      `Bringing more of your strong written thinking into live discussions (${d.cpVal}/${d.cpMax} CP) is a simple, rewarding goal that will also boost leadership skills.`,
      `Try jumping into partner or whole-class sharing a little more often (${d.cpVal}/${d.cpMax} CP)—your classmates benefit from hearing your perspective too.`
    ];
  }

  if (weakest && weakest.key === 'test') {
    const alsoWeakQuiz = secondWeakest && secondWeakest.key === 'quiz' && secondWeakest.pct < 65;
    return [
      `The main score holding you back was monthly tests (${weakest.label})${alsoWeakQuiz ? ` alongside quizzes (${secondWeakest.label})` : ''}; instead of cramming right before test day, try breaking your review into short twenty-minute blocks across the week before exams and practicing problems without looking at examples first.`,
      `Your biggest opportunity for a grade jump is monthly test prep (${weakest.label})—reworking missed homework and quiz questions a few days early will make longer test questions feel familiar instead of overwhelming.`,
      `Notice how much better your other work is compared to tests (${weakest.label}); slowing down to read every exam question twice and writing out each step clearly will save lots of unnecessary lost points.`,
      `Test time (${weakest.label}) is where you can gain the most ground${alsoWeakQuiz ? `, along with weekly quizzes (${secondWeakest.label})` : ''}, so start building small summary sheets after each unit and testing yourself ahead of time.`,
      `To bring your monthly test score (${weakest.label}) closer to your daily work, spend time practicing mixed review questions several days before exams and always review where points were lost on past tests.`,
      `Working on exam pacing and checking your answers calmly before turning in monthly tests (${weakest.label}) will immediately unlock points you are already capable of earning.`
    ];
  }

  if (weakest && weakest.key === 'quiz') {
    const alsoWeakTest = secondWeakest && secondWeakest.key === 'test' && secondWeakest.pct < 65;
    return [
      `Where points slipped away most was on quizzes (${weakest.label})${alsoWeakTest ? ` and monthly tests (${secondWeakest.label})` : ''}, usually when small gaps build up between classes; spending ten minutes reviewing your notes right after each lesson—and asking quickly whenever something feels blurry—will make quiz days feel way less stressful.`,
      `Quizzes (${weakest.label}) dragged your average down more than anything else, so try doing a quick five-minute recap twice a week instead of waiting until quiz morning to look back at your notebook.`,
      `Look closely at missed questions from quizzes (${weakest.label}) and correct them the day you get them back—fixing minor misunderstandings early keeps them from showing up again on bigger tests${alsoWeakTest ? ` (currently ${secondWeakest.label})` : ''}.`,
      `Your quiz average (${weakest.label}) is the clearest place to tighten up; jotting down one summary point after each class and drilling key rules before quizzes will turn those marks right around.`,
      `Focusing on short, regular note reviews before quiz days (${weakest.label}) will sharpen accuracy quickly and reinforce concepts before longer exams arrive.`,
      `Try quizzing yourself briefly two nights before short assessments (${weakest.label}) and speaking up immediately in class whenever a step doesn't quite click.`
    ];
  }

  if (weakest && weakest.key === 'hw') {
    return [
      `The quickest way to boost your overall mark is getting all your homework turned in carefully and on time (currently ${weakest.label}); missing or rushed assignments leave easy points on the table and take away valuable practice before tests.`,
      `Homework (${weakest.label}) pulled your score down unnecessarily—setting aside a fixed twenty-minute block at home each day to finish and double-check assignments will pay off twice over in better grades and stronger understanding.`,
      `Right now, your biggest gain sits right in homework (${weakest.label}); using class examples while working through problems—and asking for clarification before due dates if you get stuck—will lift your average fast.`,
      `Focus first on completing every assignment completely (${weakest.label}) rather than leaving blanks; daily homework practice is the bridge that makes quizzes and tests much easier.`,
      `Building a simple checklist for homework (${weakest.label}) and checking each answer before submitting will recover easy points and sharpen your mastery of weekly lessons.`,
      `When assignments (${weakest.label}) are skipped or hurried, both your daily average and test readiness feel the impact—making homework completion non-negotiable will change your whole quarter.`
    ];
  }

  if (d.letterGrade === 'E' || d.letterGrade === 'F') {
    return [
      `The best thing you can do right now is stop trying to figure everything out alone—come check in with me during extra help, start with core basic examples step by step, and focus on completing one small study task every day.`,
      `Rather than feeling buried by everything at once, pick one foundational topic a week to review with guided examples, ask questions the moment you feel lost, and make sure every daily assignment gets attempted.`,
      `Consistent short practice sessions—fifteen focused minutes a day reviewing notes and redoing class examples—along with asking for support early will steadily rebuild both your confidence and your scores.`,
      `Let's focus on daily habits first: keep organized notes in class, finish basic practice tasks before moving on, and never hesitate to speak up when an explanation goes too fast.`,
      `Getting back to solid footing starts with showing up prepared, asking clarifying questions early instead of waiting until exam week, and tackling basic exercises patiently.`,
      `Working closely with guidance on core concepts and completing steady practice work each week will help clear up confusion before assessments arrive.`
    ];
  }

  return [
    `To take the next step forward, build a steady weekly habit of reviewing notes for ten to fifteen minutes and checking over small mistakes on returned work.`,
    `Setting aside regular review time each week and asking follow-up questions whenever a detail feels uncertain will help lift your consistency across every task.`,
    `Slowing down slightly to double-check your work for small careless errors and preparing a few days ahead of assessments will keep your scores climbing.`,
    `Focusing on steady weekly revision rather than last-minute review will turn good understanding into even stronger marks.`,
    `Keep refining your study routine by organizing key ideas after each lesson and revisiting tough examples until they feel natural.`,
    `Checking feedback carefully on returned work and applying those tips right away will give you a noticeable boost next time.`
  ];
};

const buildHumanClosings = (d: ScoreFeedbackInputs): string[] => {
  const nq = d.nextQuarter;
  switch (d.letterGrade) {
    case 'A':
      return [
        `Keep bringing this same curiosity and high standard into ${nq}—you are doing wonderful work.`,
        `I am excited to see what you take on in ${nq}; keep trusting your habits and staying humble and curious.`,
        `Carry this awesome momentum right into ${nq}, and keep setting such a strong example in our classroom.`,
        `You have earned every bit of this success—keep enjoying the challenge as we head into ${nq}.`,
        `Looking ahead to ${nq}, stay proud of how hard you work and keep pushing your thinking even further.`,
        `Keep shining in ${nq}—your consistency and positive attitude are a real joy to have in class.`
      ];
    case 'B':
      return [
        `An A is well within your reach in ${nq}—keep up your momentum and trust that small refinements will take you right there.`,
        `You are very close to the top tier; bring that same steady drive into ${nq} and watch how far you climb.`,
        `Keep believing in your progress—with one or two sharper study tweaks in ${nq}, you can easily surpass this mark.`,
        `You have built great habits already; keep tightening the details in ${nq} and aim high.`,
        `Heading into ${nq}, stay confident—you are doing so much right, and your best work is still ahead of you.`,
        `I know you have an A inside you for ${nq}; stay focused, ask questions freely, and finish strong.`
      ];
    case 'C':
      return [
        `You have real potential here—lock in those small weekly habits in ${nq}, and I know we will see you pushing into the B range.`,
        `Don't underestimate what steady daily effort can do in ${nq}; stay patient with yourself and keep aiming higher.`,
        `Heading into ${nq}, bring a little more structure to your review routine, and you will feel much stronger on assessment days.`,
        `You are closer to a big jump than you might realize—keep showing up, ask more questions in ${nq}, and watch your confidence grow.`,
        `Use ${nq} to turn your steady foundation into higher scores; I am cheering for your progress every step of the way.`,
        `With just a bit more consistency outside class in ${nq}, this C can easily turn into a solid B.`
      ];
    case 'D':
      return [
        `Please don't let a Grade D discourage you—${nq} is a fresh slate, and I know that with regular practice you can climb much higher.`,
        `Small changes each week really do add up; bring steady determination into ${nq}, ask for help early, and you will see real improvement.`,
        `I believe you can turn this around in ${nq}—keep showing up, tackle one topic at a time, and don't hesitate to lean on me for support.`,
        `Take what you learned about your habits this quarter into ${nq}; once your weekly routine gets steadier, your grades will follow.`,
        `Heading into ${nq}, focus on progress rather than perfection—every finished assignment and asked question moves you forward.`,
        `You have the ability to do much better than a D, and ${nq} is your chance to prove it to yourself step by step.`
      ];
    case 'E':
    case 'F':
    default:
      return [
        `One hard quarter never defines what you can do—treat ${nq} as a fresh start, ask for help right away whenever you get stuck, and let's rebuild your confidence together.`,
        `I truly want to see you succeed in ${nq}; start with small daily goals, lean on teacher support early, and trust that your scores will begin moving up.`,
        `Don't lose heart—every student hits a rough patch at some point, and coming into ${nq} ready to ask questions and stay consistent can turn everything around.`,
        `You are worth the effort it takes to turn this grade around; let's work closely together from day one of ${nq} so you feel supported and capable.`,
        `Take ${nq} one day and one lesson at a time—keep bringing your effort to class, speak up early when confused, and give yourself a real chance to surprise yourself.`,
        `Keep your head up moving into ${nq}; with steady attendance, daily practice, and early support, you can absolutely move onto stronger ground.`
      ];
  }
};

interface ParticipationOnlyInputs {
  fullName: string;
  quarter: Quarter;
  nextQuarter: string;
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

const buildHumanParticipationComment = (
  d: ParticipationOnlyInputs,
  variantIndex: number,
  noScoreNotice: boolean
): string => {
  const qLabel = `Quarter ${d.quarter}`;
  const nq = d.nextQuarter;
  const typeText = d.topType ? d.topType.toLowerCase() : 'class discussions';
  const attIssue =
    d.attendance.total > 0 &&
    (d.attendance.unexcused >= d.attendanceSettings.warningThreshold || d.attendance.rate < 85);

  let openings: string[];
  let bodies: string[];
  let closings: string[];

  if (d.count === 0) {
    openings = [
      `Across ${qLabel}, we did not get to hear your voice much in logged class participation yet (0 recorded entries), even though I know you are taking in the lessons quietly.`,
      `It looks like you stayed mostly quiet during logged ${qLabel} participation (0 entries), listening along while classmates took the floor.`,
      `Your ${qLabel} participation count stayed at 0 this term, which makes me want to help you feel much more comfortable sharing out loud.`,
      `So far in ${qLabel}, you have 0 participation logs recorded—many thoughtful students hold back until they feel completely sure, so you are definitely not alone.`
    ];
    bodies = [
      `Even one small step—like asking a quick question when something feels unclear or sharing one answer with a partner first—makes a huge difference in building confidence and locking ideas into memory.`,
      `You do not need a perfect answer every time to speak up; sharing an observation, reading an example aloud, or asking "why does this step work?" helps both you and everyone around you learn deeper.`,
      `Starting small is the secret: aim for just one brief comment or question each week during warm-ups or group tasks so speaking up starts feeling natural rather than intimidating.`,
      `When you put ideas into your own words out loud, lessons stick twice as well—try testing out an idea with a classmate next to you before sharing it with the class.`
    ];
    closings = [
      `I would genuinely love to hear your thoughts in ${nq}; take one small chance next week and see how quickly your confidence grows.`,
      `Your perspective matters in our classroom—let's make ${nq} the quarter you start letting your voice be heard.`,
      `Heading into ${nq}, set a gentle goal of one contribution a week, and remember that every question is welcome here.`,
      `Step into ${nq} knowing you belong in every discussion, and never worry about getting every word perfect on the first try.`
    ];
  } else if (d.classAvg > 0 && d.count < Math.max(1, d.classAvg * 0.6)) {
    openings = [
      `You logged ${d.count} participation${d.count === 1 ? '' : 's'} in ${qLabel}, mostly through ${typeText}, giving yourself a modest start compared to the class average of ${d.classAvg}.`,
      `With ${d.count} contribution${d.count === 1 ? '' : 's'} recorded in ${qLabel} (${typeText}), you began joining in, though your voice was quieter than much of the class (average ${d.classAvg}).`,
      `I appreciated the ${d.count} time${d.count === 1 ? '' : 's'} you stepped in during ${qLabel} via ${typeText}, even though you held back more often than average (${d.classAvg}).`,
      `In ${qLabel}, you participated ${d.count} time${d.count === 1 ? '' : 's'} through ${typeText}, showing that you are willing to share when the moment feels comfortable.`
    ];
    bodies = [
      `You have already broken the ice by jumping in a few times, so the next step is pushing yourself just slightly past your comfort zone—try volunteering once or twice extra each week during class reviews.`,
      `Aiming for one additional comment or question every couple of lessons will quickly bring you right up with your classmates and help clarify tricky ideas before quizzes arrive.`,
      `Try stretching beyond ${typeText} into asking follow-up questions or explaining a step during group activities—engaging out loud makes lessons stick much better.`,
      `Keep building on those first contributions by speaking up early during warm-ups, when questions feel lighter and easier to share.`
    ];
    closings = [
      `With a little more boldness in ${nq}, your engagement and understanding will grow right alongside each other.`,
      `Keep pushing yourself gently in ${nq}—every time you share, your confidence in the subject gets stronger.`,
      `I look forward to hearing even more from you in ${nq} as you build on this start.`,
      `Carry that momentum into ${nq} and give yourself credit each time you raise your hand.`
    ];
  } else if (d.maxCount > 0 && d.count >= Math.max(2, d.maxCount * 0.85) && d.count > d.classAvg * 1.15) {
    openings = [
      `You were one of the brightest voices in the room throughout ${qLabel}, logging an outstanding ${d.count} participations led by ${typeText} (well above the ${d.classAvg} average).`,
      `With ${d.count} contributions in ${qLabel}—especially through ${typeText}—your enthusiasm helped energize the whole class.`,
      `I loved your energy all quarter long: ${d.count} participations in ${qLabel} (class average ${d.classAvg}) showed real curiosity and leadership during ${typeText}.`,
      `Finishing near the top of the class with ${d.count} participations in ${qLabel}, you consistently brought focus and active thinking into ${typeText}.`
    ];
    bodies = [
      `Because classmates look to active voices like yours, your next fun challenge is helping pull quieter teammates into group discussions and asking deeper "what if" questions that stretch everyone's thinking.`,
      `Keep pairing that wonderful verbal energy with careful written check-ins and thoughtful listening so your curiosity shines both out loud and on paper.`,
      `Try channeling this high engagement into mentoring peers during partner work and testing your own ideas against harder challenge questions.`,
      `Make sure you also leave space for teammates to think alongside you—guiding others in how you solved a problem deepens your own mastery even more.`
    ];
    closings = [
      `Keep bringing that infectious curiosity into ${nq}—classes are always better with leaders like you involved.`,
      `I cannot wait to see what thoughtful questions you ask in ${nq}; stay curious and keep setting a warm example.`,
      `Hold onto this awesome energy heading into ${nq}, and keep pushing yourself to grow even deeper.`,
      `Thank you for making ${qLabel} discussions so lively—keep leading with kindness and focus in ${nq}.`
    ];
  } else {
    openings = [
      `You stayed reliably engaged in ${qLabel} with ${d.count} participation${d.count === 1 ? '' : 's'}, most notably through ${typeText} (class average ${d.classAvg}).`,
      `With ${d.count} contribution${d.count === 1 ? '' : 's'} recorded in ${qLabel} via ${typeText}, you kept a steady, dependable presence in class discussions.`,
      `I appreciated your consistent involvement across ${qLabel}, where you logged ${d.count} participation${d.count === 1 ? '' : 's'} alongside your classmates.`,
      `Your ${d.count} participation${d.count === 1 ? '' : 's'} in ${qLabel}—especially in ${typeText}—showed steady focus and willingness to contribute when called on or inspired.`
    ];
    bodies = [
      `To push from solid to standout, try stepping slightly outside your routine—volunteer occasionally to walk through an answer at the board or ask a clarifying question whenever something feels nuanced.`,
      `Keeping this weekly rhythm while mixing in more collaborative leadership or peer explanations will deepen how firmly you hold onto tough concepts.`,
      `You already listen and engage well, so challenging yourself to speak up one extra time per week on trickier questions is a great next stretch goal.`,
      `Pairing your dependable participation with focused weekly review will turn steady classroom engagement into even stronger assessment confidence.`
    ];
    closings = [
      `Keep up that dependable presence in ${nq}—steady contributors like you make every class run smoother and stronger.`,
      `Looking ahead to ${nq}, trust your voice even more and keep building on these solid habits.`,
      `Stay consistent into ${nq}, and don't hesitate to step forward into bigger leadership roles in discussions.`,
      `Well done this quarter—keep bringing that reliable energy into ${nq}.`
    ];
  }

  const attSentence = attIssue
    ? ` Also, try keeping attendance as steady as possible (${fmtPct(d.attendance.rate)}, ${d.attendance.unexcused} unexcused) so you don't miss live discussions.`
    : '';
  const scoreNote = noScoreNotice
    ? ` (Note: academic score entries in the Score List have not been added yet for this quarter.)`
    : '';

  const oIdx = variantIndex % openings.length;
  const bIdx = Math.floor(variantIndex / openings.length) % bodies.length;
  const cIdx = Math.floor(variantIndex / (openings.length * bodies.length)) % closings.length;

  return `${openings[oIdx]} ${bodies[bIdx]}${attSentence} ${closings[cIdx]}${scoreNote}`.replace(/\s+/g, ' ').trim();
};

const composeScoreFeedback = (d: ScoreFeedbackInputs, variantIndex: number): string => {
  const openings = buildHumanOpenings(d);
  const strengths = buildHumanStrengths(d);
  const improvements = buildHumanImprovements(d);
  const closings = buildHumanClosings(d);

  const oIdx = variantIndex % openings.length;
  const sIdx = Math.floor(variantIndex / openings.length) % strengths.length;
  const iIdx = Math.floor(variantIndex / (openings.length * strengths.length)) % improvements.length;
  const cIdx =
    Math.floor(variantIndex / (openings.length * strengths.length * improvements.length)) %
    closings.length;

  return `${openings[oIdx]} ${strengths[sIdx]} ${improvements[iIdx]} ${closings[cIdx]}`;
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
        ? score!.conduct! / gradingSettings.maxScores.conduct
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

    const studentPartRecords = records.filter(
      r => r.studentId === student.id && r.quarter === quarter
    );
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

  const nextQuarter = getNextQuarterPhrase(quarter);
  const usedComments = new Set<string>();

  const analyses: StudentQuarterAnalysis[] = rawEntries.map((entry, idx) => {
    const fullName = formatStudentDisplayName(entry.student.name);
    const rank = rankMap[entry.student.id] || idx + 1;
    const baseSeed = hashString(
      `${entry.student.id}_${entry.student.name}_Q${quarter}_${entry.calculated.overallScore}_${entry.rawCp}_${seedOffset}`
    );

    let comment = '';

    if (classHasScores) {
      if (!entry.hasStudentScoreFields && entry.rawCp === 0) {
        const noDataTemplates = [
          `Hi ${fullName} — your Quarter ${quarter} scores and participation logs have not been entered yet. Once your assignments, quizzes, and exams are recorded in the Score List, I will put together personalized feedback to help guide you into ${nextQuarter}.`,
          `Quarter ${quarter} grades are still blank on file for ${fullName} right now. As soon as your coursework and test results are updated in the Score List, tailored feedback will appear here for ${nextQuarter}.`,
          `No scores or participation logs are recorded yet for ${fullName} in Quarter ${quarter}. Please check with me if any missing assignments or assessments still need to be turned in before we wrap up for ${nextQuarter}.`,
          `There are currently no graded entries recorded for ${fullName} this quarter. Once your scores are added to the Score List, this space will show specific feedback matched to your results.`,
          `Quarter ${quarter} entries have not been filled in yet for ${fullName}. Updating your homework, quiz, or exam marks will let us review your progress and set clear goals for ${nextQuarter}.`,
          `Awaiting Quarter ${quarter} score entries for ${fullName}—once your work is logged in the Score List, we can highlight your strengths and map out next steps for ${nextQuarter}.`
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
          fullName,
          quarter,
          nextQuarter,
          count: entry.rawCp,
          classAvg: classPartAvg,
          maxCount: mostParticipation,
          topType: entry.topParticipationType,
          attendance: entry.attendance,
          attendanceSettings
        };
        const maxAttempts = 64;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const candidate = buildHumanParticipationComment(
            pInputs,
            baseSeed + idx * 7 + attempt,
            true
          );
          if (!usedComments.has(candidate) || attempt === maxAttempts - 1) {
            comment = candidate;
            break;
          }
        }
      } else {
        const inputs: ScoreFeedbackInputs = {
          fullName,
          quarter,
          nextQuarter,
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

        // Step across openings, strengths, improvements, and closings so every student receives unique feedback
        const maxAttempts = 600;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const candidate = composeScoreFeedback(inputs, baseSeed + idx * 13 + attempt);
          if (!usedComments.has(candidate) || attempt === maxAttempts - 1) {
            comment = candidate;
            break;
          }
        }
      }
    } else {
      const pInputs: ParticipationOnlyInputs = {
        fullName,
        quarter,
        nextQuarter,
        count: entry.rawCp,
        classAvg: classPartAvg,
        maxCount: mostParticipation,
        topType: entry.topParticipationType,
        attendance: entry.attendance,
        attendanceSettings
      };

      const maxAttempts = 64;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = buildHumanParticipationComment(
          pInputs,
          baseSeed + idx * 7 + attempt,
          false
        );
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
