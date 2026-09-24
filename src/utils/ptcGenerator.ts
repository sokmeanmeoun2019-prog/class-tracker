export type PerformanceTier = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'Unknown';
export type AttendanceTier = 'Good' | 'Warning' | 'Alert';
export type ParticipationTier = 'High' | 'Moderate' | 'Low';

const comments = {
  A: [
    "Your child has demonstrated excellent academic performance this semester. They have shown strong understanding of the lessons and consistent engagement in class. We encourage them to continue challenging themselves and maintaining these positive learning habits.",
    "Your child has achieved a strong result this semester and has demonstrated consistent effort and understanding. Continued curiosity, active participation, and regular practice will help them maintain their progress.",
    "The student has excelled this semester, grasping concepts quickly and thoroughly. We are very proud of their dedication and encourage them to keep up the excellent work."
  ],
  B: [
    "Your child has demonstrated good academic progress this semester. They have a solid understanding of most concepts. With continued practice and attention to areas that need improvement, they can further strengthen their performance.",
    "Your child has shown good progress and a positive approach to learning. Encouraging regular review and continued participation can help them develop greater confidence and achieve further improvement.",
    "The student has performed well and shows a good grasp of the material. A bit more consistent practice with the more challenging topics will help them reach an even higher level of achievement."
  ],
  C: [
    "Your child has demonstrated a satisfactory understanding of the course material. There are some areas that would benefit from additional practice. Regular review and asking questions when concepts are unclear can help strengthen their understanding.",
    "Your child is making progress in the subject. With more consistent practice and review of challenging topics, they can continue to improve their academic performance.",
    "The student understands the basic concepts but sometimes struggles with more complex applications. We encourage them to review their lessons regularly and not hesitate to ask for help when needed."
  ],
  D: [
    "Your child is showing progress but would benefit from additional support and more consistent study habits. Regular review of lessons and practice with problems can help build stronger understanding and confidence.",
    "Your child has the opportunity to improve their performance through more consistent preparation and practice. We encourage continued support at home and communication with the teacher when difficulties arise.",
    "While the student is putting in effort, they are finding some of the material challenging. Establishing a regular study routine and reviewing class notes daily will be very beneficial."
  ],
  E: [
    "Your child is currently experiencing some challenges with the course material. Additional review and regular practice would be helpful. Working together between home and school can provide the support needed to make steady progress.",
    "Your child would benefit from additional guidance and consistent practice, particularly in the areas identified in this report. With continued encouragement and support, improvement is possible.",
    "The student is finding this semester's topics quite difficult. We recommend setting aside dedicated time for revision each day and working closely with us to ensure they get the support they need."
  ],
  F: [
    "Your child is currently experiencing significant difficulty with some of the course concepts. We would like to work together to provide additional support and identify the areas that need the most attention. Regular review, practice, and communication with the teacher can help your child make progress.",
    "Your child would benefit from additional academic support and a consistent study routine. We encourage us to work together to identify the main learning difficulties and develop practical steps to support improvement.",
    "We have noticed that the student is facing substantial challenges with the current curriculum. It is important that we collaborate to provide a supportive environment, both at home and at school, to help them grasp these foundational concepts."
  ]
};

const attendanceComments = {
  Good: [
    "Your child's attendance has been consistent, which provides a good foundation for continued learning.",
    "Excellent attendance this semester has helped them stay on track with all lessons.",
    "They have maintained very good attendance, ensuring they don't miss important classroom discussions."
  ],
  Warning: [
    "Regular attendance will be important in helping your child maintain continuity in learning. We encourage continued attention to attendance and punctuality.",
    "There have been a few unexcused absences. Please ensure they attend regularly so they don't fall behind.",
    "We have noted some absences recently. Consistent attendance is key to keeping up with the coursework."
  ],
  Alert: [
    "Your child's frequent unexcused absences may have affected their continuity of learning. We would appreciate working together to support more consistent attendance and help your child keep up with the lessons.",
    "Significant absences have been recorded this semester. It is very important that we address this, as missing class makes it difficult to maintain academic progress.",
    "The number of absences is a concern. We need to ensure they are present for lessons to receive the full benefit of classroom instruction."
  ]
};

const participationComments = {
  High: [
    "Your child participates actively in classroom activities and contributes positively to the learning environment.",
    "They are always eager to answer questions and are a positive force during group activities.",
    "We highly appreciate their enthusiastic participation and willingness to lead discussions."
  ],
  Moderate: [
    "Your child participates in class, and encouraging them to contribute more frequently may help build confidence and strengthen their understanding.",
    "They occasionally volunteer answers, but we would love to see them share their thoughts more often.",
    "The student engages well when called upon. Encouraging them to raise their hand more will further build their confidence."
  ],
  Low: [
    "Encouraging your child to participate more actively in classroom discussions and activities may help build confidence and improve their understanding of the lessons.",
    "They tend to be quiet during class. We encourage them to speak up and share their ideas, as their contributions are valuable.",
    "We would like to see them take a more active role in class activities to fully engage with the material."
  ]
};

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generatePTCFeedback(
  grade: PerformanceTier,
  attendance: AttendanceTier,
  participation: ParticipationTier
): string {
  if (grade === 'Unknown') return "Please ensure grades are calculated to generate a complete summary.";
  
  const gradeText = getRandom(comments[grade]);
  const attendanceText = getRandom(attendanceComments[attendance]);
  const participationText = getRandom(participationComments[participation]);

  return `${gradeText}\n\n${attendanceText}\n\n${participationText}`;
}

export function generateStrengths(grade: PerformanceTier, participation: ParticipationTier, attendance: AttendanceTier): string[] {
  const strengths: string[] = [];
  if (grade === 'A' || grade === 'B') strengths.push('Strong academic performance', 'Good understanding of concepts');
  if (participation === 'High') strengths.push('Active participation', 'Positive classroom attitude');
  if (attendance === 'Good') strengths.push('Consistent attendance', 'Reliable and punctual');
  
  if (strengths.length === 0) {
    if (grade === 'C') strengths.push('Satisfactory understanding of basic concepts');
    if (participation === 'Moderate') strengths.push('Respectful classroom behavior');
    if (strengths.length === 0) strengths.push('Shows potential with proper support');
  }
  return strengths.slice(0, 3);
}

export function generateAreasToImprove(grade: PerformanceTier, participation: ParticipationTier, attendance: AttendanceTier): string[] {
  const areas: string[] = [];
  if (grade === 'D' || grade === 'E' || grade === 'F') areas.push('Concept understanding', 'Consistent study habits', 'Test preparation');
  if (grade === 'C') areas.push('Calculation accuracy', 'Problem solving');
  if (participation === 'Low') areas.push('Class participation', 'Asking questions');
  if (attendance === 'Warning' || attendance === 'Alert') areas.push('Attendance and punctuality');
  
  if (areas.length === 0 && (grade === 'A' || grade === 'B')) {
    areas.push('Continue challenging problem-solving skills');
  }
  return areas.slice(0, 3);
}
