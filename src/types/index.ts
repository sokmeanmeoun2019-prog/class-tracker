export type Quarter = 1 | 2 | 3 | 4;

export interface AcademicYear {
  id: string;
  name: string;
}

export interface Class {
  id: string;
  name: string;
  academicYearId: string;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  studentId?: string; 
  sex?: 'Male' | 'Female' | '';
  nameKhmer?: string;
  group?: string;
  rosterNumber?: number;
}

export interface ActivitySession {
  id: string;
  classId: string;
  quarter: Quarter;
  date: string;
  name: string;
}

export const ParticipationTypes = [
  'Answering Question',
  'Asking Question',
  'Group Activity',
  'Presentation',
  'Discussion',
  'Problem Solving',
  'Demonstration',
  'Class Participation',
  'Other'
] as const;

export type ParticipationType = typeof ParticipationTypes[number];

export interface ParticipationRecord {
  id: string;
  sessionId?: string;
  classId: string;
  studentId: string;
  quarter: Quarter;
  date: string;
  time: string;
  activityName?: string;
  participationType: ParticipationType;
}

export interface ScoreRecord {
  id: string; // usually `${studentId}-${quarter}`
  studentId: string;
  classId: string;
  quarter: Quarter;
  conduct?: number;
  cpScore?: number; // Manual override, otherwise falls back to raw participation
  hw1?: number;
  hw2?: number;
  hw3?: number;
  quiz1?: number;
  quiz2?: number;
  quiz3?: number;
  test1?: number;
  test2?: number;
  comment1?: string;
  comment2?: string;
  comment3?: string;
  achievement?: string;
  attitude?: string;
  areasToImprove?: string;
}

export interface GradingSettings {
  maxScores: {
    conduct: number;
    hw: number;
    quiz: number;
    test: number;
    cp: number; // Used if they want a max C.P score
  };
  weights: {
    conduct: number;
    hw: number;
    quiz: number;
    test: number;
    cp: number;
  };
  achievementOptions: string[];
  attitudeOptions: string[];
}

export type AttendanceStatus = 'Present' | 'Excused' | 'Unexcused';

export interface AttendanceRecord {
  id: string; // usually `${classId}-${date}-${studentId}`
  classId: string;
  studentId: string;
  quarter: Quarter;
  date: string;
  status: AttendanceStatus;
}

export interface AttendanceSettings {
  warningThreshold: number;
  alertThreshold: number;
}

export interface PTCRecord {
  id: string; // usually `${studentId}-${semester}`
  studentId: string;
  classId: string;
  semester: 1 | 2;
  teacherComment: string;
  strengths: string[];
  areasToImprove: string[];
  lastUpdated: string;
}

export interface TrashItem {
  id: string;
  type: 'YEAR' | 'CLASS' | 'STUDENT';
  name: string; // The display name of the item
  deletedAt: string; // ISO date string
  payload: {
    year?: AcademicYear;
    classes?: Class[];
    students?: Student[];
    records?: ParticipationRecord[];
    scores?: ScoreRecord[];
    attendanceRecords?: AttendanceRecord[];
    ptcRecords?: PTCRecord[];
    examRecords?: SemesterExamRecord[];
    examInfos?: SemesterExamInfo[];
  };
}

export interface SemesterExamRecord {
  id: string; // `${studentId}-${semester}`
  studentId: string;
  classId: string;
  semester: 1 | 2;
  seatNumber?: string;
  nameKhmer?: string;
  studentIdString?: string;
  sex?: string;
  group?: string;
  score?: number | null; // 0-100
}

export interface SemesterExamInfo {
  id: string; // `${classId}-${semester}`
  classId: string;
  semester: 1 | 2;
  examDate?: string;
  examTime?: string;
  subject?: string;
  teacherName?: string;
  roomNumber?: string;
}

export interface AppState {
  academicYears: AcademicYear[];
  classes: Class[];
  students: Student[];
  sessions: ActivitySession[];
  records: ParticipationRecord[];
  scores: ScoreRecord[];
  attendanceRecords: AttendanceRecord[];
  ptcRecords: PTCRecord[];
  examRecords: SemesterExamRecord[];
  examInfos: SemesterExamInfo[];
  gradingSettings: GradingSettings;
  attendanceSettings: AttendanceSettings;
  trash: TrashItem[];
  
  currentYearId: string | null;
  currentClassId: string | null;
  currentQuarter: Quarter | null;
}
