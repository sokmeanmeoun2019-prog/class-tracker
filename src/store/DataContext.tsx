import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { AppState, AcademicYear, Class, Student, ActivitySession, ParticipationRecord, Quarter, TrashItem, ScoreRecord, GradingSettings, AttendanceRecord, AttendanceSettings } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
type Action =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'ADD_YEAR'; payload: AcademicYear }
  | { type: 'DELETE_YEAR'; payload: string }
  | { type: 'ADD_CLASS'; payload: Class }
  | { type: 'DELETE_CLASS'; payload: string }
  | { type: 'ADD_STUDENT'; payload: Student }
  | { type: 'UPDATE_STUDENT'; payload: Student }
  | { type: 'DELETE_STUDENT'; payload: string }
  | { type: 'ADD_SESSION'; payload: ActivitySession }
  | { type: 'END_SESSION'; payload: string }
  | { type: 'ADD_RECORD'; payload: ParticipationRecord }
  | { type: 'REMOVE_RECORD'; payload: string }
  | { type: 'UPDATE_RECORD'; payload: ParticipationRecord }
  | { type: 'UPDATE_SCORE'; payload: ScoreRecord }
  | { type: 'UPDATE_GRADING_SETTINGS'; payload: GradingSettings }
  | { type: 'SET_CURRENT_YEAR'; payload: string | null }
  | { type: 'SET_CURRENT_CLASS'; payload: string | null }
  | { type: 'SET_CURRENT_QUARTER'; payload: Quarter | null }
  | { type: 'IMPORT_STUDENTS'; payload: Student[] }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'RESTORE_TRASH_ITEM'; payload: string }
  | { type: 'DELETE_TRASH_ITEM'; payload: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'CLEANUP_OLD_TRASH' }
  | { type: 'SET_ATTENDANCE_RECORDS'; payload: AttendanceRecord[] }
  | { type: 'UPDATE_ATTENDANCE_RECORD'; payload: AttendanceRecord }
  | { type: 'UPDATE_ATTENDANCE_SETTINGS'; payload: AttendanceSettings };

const defaultGradingSettings: GradingSettings = {
  maxScores: { conduct: 10, hw: 100, quiz: 100, test: 100, cp: 10 },
  weights: { conduct: 10, hw: 20, quiz: 20, test: 40, cp: 10 },
  achievementOptions: ['Excellent', 'Very Good', 'Good', 'Satisfactory', 'Needs Improvement'],
  attitudeOptions: ['Excellent', 'Very Good', 'Good', 'Satisfactory', 'Needs Improvement'],
};

const defaultAttendanceSettings: AttendanceSettings = {
  warningThreshold: 5,
  alertThreshold: 6,
};

const defaultState: AppState = {
  academicYears: [],
  classes: [],
  students: [],
  sessions: [],
  records: [],
  scores: [],
  attendanceRecords: [],
  gradingSettings: defaultGradingSettings,
  attendanceSettings: defaultAttendanceSettings,
  trash: [],
  currentYearId: null,
  currentClassId: null,
  currentQuarter: null,
};

const DataContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'ADD_YEAR':
      return { ...state, academicYears: [...state.academicYears, action.payload] };
    case 'DELETE_YEAR': {
      const year = state.academicYears.find(y => y.id === action.payload);
      if (!year) return state;
      const classes = state.classes.filter(c => c.academicYearId === action.payload);
      const classIds = classes.map(c => c.id);
      const students = state.students.filter(s => classIds.includes(s.classId));
      const records = state.records.filter(r => classIds.includes(r.classId));
      const scores = state.scores.filter(s => classIds.includes(s.classId));
      const attendanceRecords = state.attendanceRecords.filter(a => classIds.includes(a.classId));
      
      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'YEAR',
        name: `Academic Year: ${year.name}`,
        deletedAt: new Date().toISOString(),
        payload: { year, classes, students, records, scores, attendanceRecords }
      };

      return { 
        ...state, 
        academicYears: state.academicYears.filter(y => y.id !== action.payload),
        classes: state.classes.filter(c => c.academicYearId !== action.payload),
        students: state.students.filter(s => !classIds.includes(s.classId)),
        records: state.records.filter(r => !classIds.includes(r.classId)),
        scores: state.scores.filter(s => !classIds.includes(s.classId)),
        attendanceRecords: state.attendanceRecords.filter(a => !classIds.includes(a.classId)),
        trash: [...(state.trash || []), trashItem],
        currentYearId: state.currentYearId === action.payload ? null : state.currentYearId
      };
    }
    case 'ADD_CLASS':
      return { ...state, classes: [...state.classes, action.payload] };
    case 'DELETE_CLASS': {
      const cls = state.classes.find(c => c.id === action.payload);
      if (!cls) return state;
      const students = state.students.filter(s => s.classId === action.payload);
      const records = state.records.filter(r => r.classId === action.payload);
      const scores = state.scores.filter(s => s.classId === action.payload);
      const attendanceRecords = state.attendanceRecords.filter(a => a.classId === action.payload);

      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'CLASS',
        name: `Class: ${cls.name}`,
        deletedAt: new Date().toISOString(),
        payload: { classes: [cls], students, records, scores, attendanceRecords }
      };

      return {
        ...state,
        classes: state.classes.filter(c => c.id !== action.payload),
        students: state.students.filter(s => s.classId !== action.payload),
        records: state.records.filter(r => r.classId !== action.payload),
        scores: state.scores.filter(s => s.classId !== action.payload),
        attendanceRecords: state.attendanceRecords.filter(a => a.classId !== action.payload),
        trash: [...(state.trash || []), trashItem],
        currentClassId: state.currentClassId === action.payload ? null : state.currentClassId
      };
    }
    case 'ADD_STUDENT':
      return { ...state, students: [...state.students, action.payload] };
    case 'UPDATE_STUDENT':
      return { ...state, students: state.students.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_STUDENT': {
      const student = state.students.find(s => s.id === action.payload);
      if (!student) return state;
      const records = state.records.filter(r => r.studentId === action.payload);
      const scores = state.scores.filter(s => s.studentId === action.payload);
      const attendanceRecords = state.attendanceRecords.filter(a => a.studentId === action.payload);
      
      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'STUDENT',
        name: `Student: ${student.name}`,
        deletedAt: new Date().toISOString(),
        payload: { students: [student], records, scores, attendanceRecords }
      };

      return { 
        ...state, 
        students: state.students.filter(s => s.id !== action.payload),
        records: state.records.filter(r => r.studentId !== action.payload),
        scores: state.scores.filter(s => s.studentId !== action.payload),
        attendanceRecords: state.attendanceRecords.filter(a => a.studentId !== action.payload),
        trash: [...(state.trash || []), trashItem]
      };
    }
    case 'UPDATE_SCORE': {
      const existing = state.scores.find(s => s.id === action.payload.id);
      if (existing) {
        return { ...state, scores: state.scores.map(s => s.id === action.payload.id ? action.payload : s) };
      }
      return { ...state, scores: [...state.scores, action.payload] };
    }
    case 'UPDATE_GRADING_SETTINGS':
      return { ...state, gradingSettings: action.payload };
    case 'RESTORE_TRASH_ITEM': {
      const item = state.trash.find(t => t.id === action.payload);
      if (!item) return state;
      
      return {
        ...state,
        academicYears: [...state.academicYears, ...(item.payload.year ? [item.payload.year] : [])],
        classes: [...state.classes, ...(item.payload.classes || [])],
        students: [...state.students, ...(item.payload.students || [])],
        records: [...state.records, ...(item.payload.records || [])],
        scores: [...(state.scores || []), ...(item.payload.scores || [])],
        attendanceRecords: [...(state.attendanceRecords || []), ...(item.payload.attendanceRecords || [])],
        trash: state.trash.filter(t => t.id !== action.payload)
      };
    }
    case 'DELETE_TRASH_ITEM':
      return { ...state, trash: state.trash.filter(t => t.id !== action.payload) };
    case 'EMPTY_TRASH':
      return { ...state, trash: [] };
    case 'CLEANUP_OLD_TRASH': {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        ...state,
        trash: (state.trash || []).filter(t => new Date(t.deletedAt) > thirtyDaysAgo)
      };
    }
    case 'IMPORT_STUDENTS':
      return { ...state, students: [...state.students, ...action.payload] };
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.payload] };
    case 'END_SESSION':
      return state;
    case 'ADD_RECORD':
      return { ...state, records: [...state.records, action.payload] };
    case 'REMOVE_RECORD':
      return { ...state, records: state.records.filter(r => r.id !== action.payload) };
    case 'UPDATE_RECORD':
      return { ...state, records: state.records.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'SET_CURRENT_YEAR':
      return { ...state, currentYearId: action.payload };
    case 'SET_CURRENT_CLASS':
      return { ...state, currentClassId: action.payload };
    case 'SET_CURRENT_QUARTER':
      return { ...state, currentQuarter: action.payload };
    case 'SET_ATTENDANCE_RECORDS':
      return { ...state, attendanceRecords: [...state.attendanceRecords, ...action.payload.filter(nr => !state.attendanceRecords.some(r => r.id === nr.id))] };
    case 'UPDATE_ATTENDANCE_RECORD': {
      const existing = state.attendanceRecords.find(a => a.id === action.payload.id);
      if (existing) {
        return { ...state, attendanceRecords: state.attendanceRecords.map(a => a.id === action.payload.id ? action.payload : a) };
      }
      return { ...state, attendanceRecords: [...state.attendanceRecords, action.payload] };
    }
    case 'UPDATE_ATTENDANCE_SETTINGS':
      return { ...state, attendanceSettings: action.payload };
    case 'CLEAR_ALL_DATA':
      return defaultState;
    default:
      return state;
  }
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth();
  const isRemoteUpdate = React.useRef(false);
  const isInitialized = React.useRef(false);

  const [state, dispatch] = useReducer(reducer, defaultState);

  // Sync from Firebase
  useEffect(() => {
    if (!currentUser) {
      dispatch({ type: 'CLEAR_ALL_DATA' });
      isInitialized.current = false;
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        // If the update came from the server (not our own local write), update local state
        if (!docSnap.metadata.hasPendingWrites) {
          isRemoteUpdate.current = true;
          const data = docSnap.data() as AppState;
          // Apply migrations if missing
          if (!data.trash) data.trash = [];
          if (!data.scores) data.scores = [];
          if (!data.attendanceRecords) data.attendanceRecords = [];
          if (!data.gradingSettings) data.gradingSettings = defaultGradingSettings;
          if (!data.attendanceSettings) data.attendanceSettings = defaultAttendanceSettings;
          
          dispatch({ type: 'SET_STATE', payload: data });
        }
      } else {
        // First time login, create the empty document
        setDoc(doc(db, 'users', currentUser.uid), defaultState);
      }
      isInitialized.current = true;
    });

    return unsub;
  }, [currentUser]);

  // Sync to Firebase
  useEffect(() => {
    if (currentUser && isInitialized.current) {
      if (isRemoteUpdate.current) {
        // State changed because of remote sync, don't write back
        isRemoteUpdate.current = false;
      } else {
        // State changed because of local user action, save to cloud
        setDoc(doc(db, 'users', currentUser.uid), state).catch(err => {
          console.error("Failed to save to cloud:", err);
        });
      }
    }
  }, [state, currentUser]);

  // Cleanup old trash items on load
  useEffect(() => {
    if (currentUser && isInitialized.current) {
      dispatch({ type: 'CLEANUP_OLD_TRASH' });
    }
  }, [currentUser]);

  // Egrade migration
  useEffect(() => {
    if (state.gradingSettings?.maxScores?.hw === 20 || state.gradingSettings?.maxScores?.hw === 0) {
      dispatch({
        type: 'UPDATE_GRADING_SETTINGS',
        payload: {
          ...state.gradingSettings,
          maxScores: { conduct: 10, hw: 100, quiz: 100, test: 100, cp: 10 },
          weights: { conduct: 10, hw: 20, quiz: 20, test: 40, cp: 10 }
        }
      });
    }
  }, [state.gradingSettings]);

  return (
    <DataContext.Provider value={{ state, dispatch }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
