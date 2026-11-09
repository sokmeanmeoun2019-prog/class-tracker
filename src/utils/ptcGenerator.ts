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
}

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateStrengths(stats: StudentStats): string[] {
  const strengths: string[] = [];
  
  if (stats.grade === 'A' || stats.grade === 'B' || stats.overallScore >= 80) {
    strengths.push('Strong overall academic performance');
  }

  // Determine highest academic component
  if (stats.hwTotal > 0 || stats.quizTotal > 0 || stats.testTotal > 0) {
    const highest = Math.max(stats.hwTotal, stats.quizTotal, stats.testTotal);
    if (highest >= 80) {
      if (highest === stats.hwTotal) strengths.push('Excellent homework completion and consistency');
      else if (highest === stats.quizTotal) strengths.push('Strong quiz performance and preparation');
      else if (highest === stats.testTotal) strengths.push('Excellent test performance and understanding');
    }
  }

  if (stats.participationTier === 'High') {
    strengths.push('Active and positive class participation');
  }
  
  if (stats.attendanceTier === 'Good') {
    strengths.push('Consistent attendance and punctuality');
  }

  if (strengths.length === 0) {
    if (stats.grade === 'C') strengths.push('Satisfactory understanding of basic concepts');
    if (stats.participationTier === 'Moderate') strengths.push('Respectful classroom behavior');
    if (strengths.length === 0) strengths.push('Shows potential with proper support');
  }
  
  // Return unique, up to 3
  return Array.from(new Set(strengths)).slice(0, 3);
}

export function generateAreasToImprove(stats: StudentStats): string[] {
  const areas: string[] = [];
  
  // Determine lowest academic component
  if (stats.hwTotal > 0 || stats.quizTotal > 0 || stats.testTotal > 0) {
    const lowest = Math.min(
      stats.hwTotal > 0 ? stats.hwTotal : 101, 
      stats.quizTotal > 0 ? stats.quizTotal : 101, 
      stats.testTotal > 0 ? stats.testTotal : 101
    );
    
    if (lowest < 75 && lowest !== 101) {
      if (lowest === stats.hwTotal) areas.push('Homework consistency and completion');
      else if (lowest === stats.quizTotal) areas.push('Quiz preparation and review');
      else if (lowest === stats.testTotal) areas.push('Test preparation and concept mastery');
    }
  }

  if (stats.grade === 'D' || stats.grade === 'E' || stats.grade === 'F') {
    areas.push('Core concept understanding', 'Consistent study habits');
  }

  if (stats.participationTier === 'Low') {
    areas.push('Active class participation', 'Asking questions when unsure');
  }
  
  if (stats.attendanceTier === 'Warning' || stats.attendanceTier === 'Alert') {
    areas.push('Attendance and punctuality');
  }
  
  if (areas.length === 0) {
    areas.push('Continue challenging problem-solving skills');
  }
  
  return Array.from(new Set(areas)).slice(0, 3);
}

export function generatePTCFeedback(stats: StudentStats): string {
  if (stats.grade === 'Unknown') return "Please ensure grades are calculated to generate a complete summary.";

  const student = stats.name.split(' ')[0]; // use first name

  // 1. POSITIVE OBSERVATION
  let positiveOptions = [];
  if (stats.hwTotal >= 85) positiveOptions.push(`${student} has shown great responsibility with highly consistent homework completion.`);
  if (stats.quizTotal >= 85) positiveOptions.push(`${student} has demonstrated a strong grasp of short-term material through excellent quiz scores.`);
  if (stats.testTotal >= 85) positiveOptions.push(`${student} has shown excellent understanding of core concepts in major tests.`);
  if (stats.participationTier === 'High') positiveOptions.push(`${student} brings positive energy to the classroom and participates actively in discussions.`);
  if (stats.attendanceTier === 'Good') positiveOptions.push(`${student} has maintained excellent attendance, which provides a strong foundation for learning.`);
  
  if (positiveOptions.length === 0) {
    if (stats.grade === 'C') positiveOptions.push(`${student} has shown satisfactory effort and understands the foundational concepts covered in class.`);
    else positiveOptions.push(`${student} has shown potential and a willingness to learn when properly supported.`);
  }
  const positiveObservation = getRandom(positiveOptions);

  let performanceText = "";
  if (stats.overallScore >= 90) performanceText = `Currently, their overall performance is outstanding with an average of ${stats.overallScore}%.`;
  else if (stats.overallScore >= 80) performanceText = `They have achieved a strong overall average of ${stats.overallScore}%, reflecting good academic progress.`;
  else if (stats.overallScore >= 70) performanceText = `Their current overall average is ${stats.overallScore}%, indicating a satisfactory grasp of the material.`;
  else if (stats.overallScore >= 60) performanceText = `They are currently holding an average of ${stats.overallScore}%, showing that they are putting in effort but finding some material challenging.`;
  else performanceText = `Their current average is ${stats.overallScore}%, which indicates they are experiencing significant difficulties with the curriculum.`;

  if (stats.examScore !== undefined && stats.examScore !== null) {
    if (stats.examScore >= 80) {
      performanceText += ` The student demonstrated good performance in the semester final examination (${stats.examScore}%) and showed a solid understanding of the course content.`;
    } else if (stats.examScore >= 60) {
      performanceText += ` Their semester examination result (${stats.examScore}%) indicates a reasonable grasp of the fundamentals, though further review is encouraged.`;
    } else {
      performanceText += ` The semester examination results (${stats.examScore}%) suggest that additional review and practice of key concepts may help strengthen the student's performance.`;
    }
  }

  // 3. SPECIFIC AREA TO IMPROVE & 4. PRACTICAL SUGGESTION
  let improvementOptions = [];
  let suggestionOptions = [];

  // Determine lowest academic component for targeted feedback
  const scores = [
    { type: 'homework', val: stats.hwTotal },
    { type: 'quizzes', val: stats.quizTotal },
    { type: 'tests', val: stats.testTotal }
  ].filter(s => s.val > 0);
  
  if (scores.length > 0) {
    scores.sort((a, b) => a.val - b.val);
    const weakest = scores[0];
    
    if (weakest.val < 75) {
      if (weakest.type === 'homework') {
        improvementOptions.push(`To continue improving, ${student} should focus on completing homework more consistently.`);
        suggestionOptions.push(`Setting aside a dedicated, quiet time each day for assignments will help build better study habits.`);
      } else if (weakest.type === 'quizzes') {
        improvementOptions.push(`There is room for improvement in quiz preparation.`);
        suggestionOptions.push(`Reviewing class notes daily, rather than waiting until right before a quiz, will help solidify their understanding.`);
      } else if (weakest.type === 'tests') {
        improvementOptions.push(`Major tests seem to be a specific area of challenge right now.`);
        suggestionOptions.push(`Practicing complex problems and asking questions about confusing topics well before test day will build confidence.`);
      }
    }
  }

  if (stats.participationTier === 'Low') {
    improvementOptions.push(`We would love to see ${student} become more engaged during class activities.`);
    suggestionOptions.push(`Encouraging them to raise their hand at least once per lesson or share their thoughts in smaller groups will help build confidence.`);
  }

  if (stats.attendanceTier === 'Alert' || stats.attendanceTier === 'Warning') {
    improvementOptions.push(`We have noticed several unexcused absences recently.`);
    suggestionOptions.push(`Regular attendance is absolutely vital to maintain continuity in learning and avoid missing important foundational lessons.`);
  }

  // Fallback if no glaring weaknesses
  if (improvementOptions.length === 0) {
    improvementOptions.push(`To continue their positive trajectory, ${student} should focus on challenging themselves with more advanced problem-solving.`);
    suggestionOptions.push(`Engaging with extension activities and helping peers can further deepen their own mastery of the subject.`);
  }

  const areaToImprove = getRandom(improvementOptions);
  const suggestion = suggestionOptions[improvementOptions.indexOf(areaToImprove)] || suggestionOptions[0];

  // 5. ENCOURAGING CLOSING
  const closingOptions = [
    `With continued effort and collaboration between home and school, I am confident ${student} will make further progress.`,
    `I am very proud of their dedication and look forward to seeing their continued growth.`,
    `By implementing these small steps, ${student} is highly capable of achieving their full potential.`,
    `We will continue to support ${student} in class, and your encouragement at home makes a huge difference.`,
    `They are a valued member of our classroom, and I am optimistic about their continued development.`
  ];
  const closing = getRandom(closingOptions);

  return `${positiveObservation} ${performanceText}\n\n${areaToImprove} ${suggestion}\n\n${closing}`;
}
