import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { AppState, AcademicYear, Class, Student, ActivitySession, ParticipationRecord, Quarter, TrashItem, ScoreRecord, GradingSettings, AttendanceRecord, AttendanceSettings, PTCRecord, SemesterExamRecord, SemesterExamInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { doc, onSnapshot, setDoc, collection, writeBatch, getDoc } from 'firebase/firestore';
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
  | { type: 'REORDER_STUDENT'; payload: { studentId: string, classId: string, newNumber: number } }
  | { type: 'ADD_SESSION'; payload: ActivitySession }
  | { type: 'END_SESSION'; payload: string }
  | { type: 'ADD_RECORD'; payload: ParticipationRecord }
  | { type: 'REMOVE_RECORD'; payload: string }
  | { type: 'UPDATE_RECORD'; payload: ParticipationRecord }
  | { type: 'UPDATE_SCORE'; payload: ScoreRecord }
  | { type: 'BULK_UPDATE_SCORES'; payload: ScoreRecord[] }
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
  | { type: 'UPDATE_ATTENDANCE_SETTINGS'; payload: AttendanceSettings }
  | { type: 'UPDATE_PTC_RECORD'; payload: PTCRecord }
  | { type: 'UPDATE_EXAM_RECORD'; payload: SemesterExamRecord }
  | { type: 'UPDATE_EXAM_INFO'; payload: SemesterExamInfo };

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
  ptcRecords: [],
  examRecords: [],
  examInfos: [],
  gradingSettings: defaultGradingSettings,
  attendanceSettings: defaultAttendanceSettings,
  trash: [],
  currentYearId: null,
  currentClassId: null,
  currentQuarter: null,
};

export type SyncStatus = 'synced' | 'saving' | 'offline';

const DataContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  syncStatus: SyncStatus;
} | undefined>(undefined);

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_STATE': {
      const nextClasses = action.payload.classes || state.classes || [];
      const nextYears = action.payload.academicYears || state.academicYears || [];
      const keepYearId =
        state.currentYearId && nextYears.some(y => y.id === state.currentYearId)
          ? state.currentYearId
          : action.payload.currentYearId ?? state.currentYearId;
      const keepClassId =
        state.currentClassId && nextClasses.some(c => c.id === state.currentClassId)
          ? state.currentClassId
          : action.payload.currentClassId ?? state.currentClassId;
      const keepQuarter = state.currentQuarter ?? action.payload.currentQuarter;

      return {
        ...state,
        ...action.payload,
        currentYearId: keepYearId,
        currentClassId: keepClassId,
        currentQuarter: keepQuarter
      };
    }
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
      const ptcRecords = state.ptcRecords.filter(p => classIds.includes(p.classId));
      
      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'YEAR',
        name: `Academic Year: ${year.name}`,
        deletedAt: new Date().toISOString(),
        payload: { year, classes, students, records, scores, attendanceRecords, ptcRecords }
      };

      return { 
        ...state, 
        academicYears: state.academicYears.filter(y => y.id !== action.payload),
        classes: state.classes.filter(c => c.academicYearId !== action.payload),
        students: state.students.filter(s => !classIds.includes(s.classId)),
        records: state.records.filter(r => !classIds.includes(r.classId)),
        scores: state.scores.filter(s => !classIds.includes(s.classId)),
        attendanceRecords: state.attendanceRecords.filter(a => !classIds.includes(a.classId)),
        ptcRecords: state.ptcRecords.filter(p => !classIds.includes(p.classId)),
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
      const ptcRecords = state.ptcRecords.filter(p => p.classId === action.payload);

      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'CLASS',
        name: `Class: ${cls.name}`,
        deletedAt: new Date().toISOString(),
        payload: { classes: [cls], students, records, scores, attendanceRecords, ptcRecords }
      };

      return {
        ...state,
        classes: state.classes.filter(c => c.id !== action.payload),
        students: state.students.filter(s => s.classId !== action.payload),
        records: state.records.filter(r => r.classId !== action.payload),
        scores: state.scores.filter(s => s.classId !== action.payload),
        attendanceRecords: state.attendanceRecords.filter(a => a.classId !== action.payload),
        ptcRecords: state.ptcRecords.filter(p => p.classId !== action.payload),
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
      const ptcRecords = state.ptcRecords.filter(p => p.studentId === action.payload);
      
      const trashItem: TrashItem = {
        id: uuidv4(),
        type: 'STUDENT',
        name: `Student: ${student.name}`,
        deletedAt: new Date().toISOString(),
        payload: { students: [student], records, scores, attendanceRecords, ptcRecords }
      };

      return { 
        ...state, 
        students: state.students.filter(s => s.id !== action.payload),
        records: state.records.filter(r => r.studentId !== action.payload),
        scores: state.scores.filter(s => s.studentId !== action.payload),
        attendanceRecords: state.attendanceRecords.filter(a => a.studentId !== action.payload),
        ptcRecords: state.ptcRecords.filter(p => p.studentId !== action.payload),
        trash: [...(state.trash || []), trashItem]
      };
    }
    case 'REORDER_STUDENT': {
      const { studentId, classId, newNumber } = action.payload;
      
      // Get all students for this class, sorted by current rosterNumber or name
      let classStudents = state.students
        .filter(s => s.classId === classId)
        .sort((a, b) => {
           const numA = a.rosterNumber !== undefined ? a.rosterNumber : 9999;
           const numB = b.rosterNumber !== undefined ? b.rosterNumber : 9999;
           if (numA !== numB) return numA - numB;
           return a.name.localeCompare(b.name);
        });
        
      // Ensure everyone has a sequential roster number first (1 to N)
      classStudents = classStudents.map((s, i) => ({ ...s, rosterNumber: i + 1 }));

      const targetStudent = classStudents.find(s => s.id === studentId);
      if (!targetStudent) return state;

      const oldNumber = targetStudent.rosterNumber!;
      let targetNewNumber = newNumber;
      if (targetNewNumber < 1) targetNewNumber = 1;
      if (targetNewNumber > classStudents.length) targetNewNumber = classStudents.length;
      
      if (oldNumber === targetNewNumber) return state; // no change

      // Shift the others
      classStudents = classStudents.map(s => {
         if (s.id === studentId) {
             return { ...s, rosterNumber: targetNewNumber };
         }
         // Moving down
         if (oldNumber < targetNewNumber && s.rosterNumber! > oldNumber && s.rosterNumber! <= targetNewNumber) {
             return { ...s, rosterNumber: s.rosterNumber! - 1 };
         }
         // Moving up
         if (oldNumber > targetNewNumber && s.rosterNumber! >= targetNewNumber && s.rosterNumber! < oldNumber) {
             return { ...s, rosterNumber: s.rosterNumber! + 1 };
         }
         return s;
      });

      const updatedIds = classStudents.map(s => s.id);
      const otherStudents = state.students.filter(s => !updatedIds.includes(s.id));
      
      return {
         ...state,
         students: [...otherStudents, ...classStudents]
      };
    }
    case 'UPDATE_SCORE': {
      const existing = state.scores.find(s => s.id === action.payload.id);
      if (existing) {
        return { ...state, scores: state.scores.map(s => s.id === action.payload.id ? action.payload : s) };
      }
      return { ...state, scores: [...state.scores, action.payload] };
    }
    case 'BULK_UPDATE_SCORES': {
      const incomingList: ScoreRecord[] = Array.isArray(action.payload)
        ? action.payload
        : ((action.payload as any)?.scores || []);

      // Validate that every incoming score record belongs to a student in that exact classId
      const validIncoming = incomingList.filter(s => {
        if (!s || !s.studentId || !s.classId) return false;
        const student = state.students.find(st => st.id === s.studentId);
        return !student || student.classId === s.classId;
      });

      const incomingMap = new Map(
        validIncoming.map(s => [
          `${s.classId}-${s.studentId}-${Number(s.quarter)}`,
          {
            ...s,
            id: `${s.studentId}-${Number(s.quarter)}`,
            classId: s.classId,
            quarter: Number(s.quarter) as Quarter
          }
        ])
      );
      const seenKeys = new Set<string>();
      const updatedExisting: ScoreRecord[] = [];

      for (const s of state.scores) {
        const student = state.students.find(st => st.id === s.studentId);
        const effectiveClassId = s.classId || student?.classId || '';
        const key = `${effectiveClassId}-${s.studentId}-${Number(s.quarter)}`;
        if (incomingMap.has(key)) {
          if (!seenKeys.has(key)) {
            updatedExisting.push(incomingMap.get(key)!);
            seenKeys.add(key);
          }
        } else {
          updatedExisting.push(s);
        }
      }

      const newItems = validIncoming
        .filter(s => !seenKeys.has(`${s.classId}-${s.studentId}-${Number(s.quarter)}`))
        .map(s => ({
          ...s,
          id: `${s.studentId}-${Number(s.quarter)}`,
          classId: s.classId,
          quarter: Number(s.quarter) as Quarter
        }));

      return {
        ...state,
        scores: [...updatedExisting, ...newItems]
      };
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
        ptcRecords: [...(state.ptcRecords || []), ...(item.payload.ptcRecords || [])],
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
    case 'IMPORT_STUDENTS': {
      if (action.payload.length === 0) return state;
      const targetClassId = action.payload[0].classId;
      
      // Get IDs of students being removed to clean up their records
      const removedStudentIds = state.students
        .filter(s => s.classId === targetClassId)
        .map(s => s.id);
        
      const removedStudents = state.students.filter(s => s.classId === targetClassId);
      const removedRecords = state.records.filter(r => removedStudentIds.includes(r.studentId));
      const removedScores = state.scores.filter(s => removedStudentIds.includes(s.studentId));
      const removedAttendance = state.attendanceRecords.filter(a => removedStudentIds.includes(a.studentId));
      const removedPtc = state.ptcRecords.filter(p => removedStudentIds.includes(p.studentId));

      const otherStudents = state.students.filter(s => s.classId !== targetClassId);
      const otherRecords = state.records.filter(r => !removedStudentIds.includes(r.studentId));
      const otherScores = state.scores.filter(s => !removedStudentIds.includes(s.studentId));
      const otherAttendance = state.attendanceRecords.filter(a => !removedStudentIds.includes(a.studentId));
      const otherPtc = state.ptcRecords.filter(p => !removedStudentIds.includes(p.studentId));

      let updatedTrash = state.trash || [];
      if (removedStudents.length > 0) {
        const targetClass = state.classes.find(c => c.id === targetClassId);
        updatedTrash = [
          ...updatedTrash,
          {
            id: uuidv4(),
            type: 'STUDENT',
            name: `Replaced Roster: ${targetClass?.name || 'Class'} (${removedStudents.length} students)`,
            deletedAt: new Date().toISOString(),
            payload: {
              students: removedStudents,
              records: removedRecords,
              scores: removedScores,
              attendanceRecords: removedAttendance,
              ptcRecords: removedPtc
            }
          }
        ];
      }

      return { 
        ...state, 
        students: [...otherStudents, ...action.payload],
        records: otherRecords,
        scores: otherScores,
        attendanceRecords: otherAttendance,
        ptcRecords: otherPtc,
        trash: updatedTrash
      };
    }
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
    case 'UPDATE_PTC_RECORD': {
      const existing = state.ptcRecords.find(p => p.id === action.payload.id);
      if (existing) {
        return { ...state, ptcRecords: state.ptcRecords.map(p => p.id === action.payload.id ? action.payload : p) };
      }
      return { ...state, ptcRecords: [...state.ptcRecords, action.payload] };
    }
    case 'UPDATE_EXAM_RECORD': {
      const existing = state.examRecords.find(p => p.id === action.payload.id);
      if (existing) {
        return { ...state, examRecords: state.examRecords.map(p => p.id === action.payload.id ? action.payload : p) };
      }
      return { ...state, examRecords: [...(state.examRecords || []), action.payload] };
    }
    case 'UPDATE_EXAM_INFO': {
      const existing = state.examInfos.find(p => p.id === action.payload.id);
      if (existing) {
        return { ...state, examInfos: state.examInfos.map(p => p.id === action.payload.id ? action.payload : p) };
      }
      return { ...state, examInfos: [...(state.examInfos || []), action.payload] };
    }
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
  const lastSavedTimestamp = React.useRef<number>(0);
  const hasPendingLocalChanges = React.useRef<boolean>(false);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('synced');

  const [state, dispatch] = useReducer(reducer, defaultState);

  // Sync from Firebase
  useEffect(() => {
    if (!currentUser) {
      dispatch({ type: 'CLEAR_ALL_DATA' });
      isInitialized.current = false;
      lastSavedTimestamp.current = 0;
      hasPendingLocalChanges.current = false;
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), async (docSnap) => {
      if (docSnap.exists()) {
        // If the update came from the server (not our own local write), update local state
        if (!docSnap.metadata.hasPendingWrites) {
          const data = docSnap.data();

          // Ignore echoes of our own recent write or while local changes are waiting to be saved
          if (
            isInitialized.current &&
            (hasPendingLocalChanges.current ||
              (data.timestamp !== undefined && data.timestamp === lastSavedTimestamp.current))
          ) {
            return;
          }

          let parsedState: AppState | null = null;
          
          if (data.numChunks !== undefined) {
            let fullJson = '';
            try {
              for (let i = 0; i < data.numChunks; i++) {
                const chunkSnap = await getDoc(doc(db, 'users', currentUser.uid, 'chunks', `chunk_${i}`));
                if (chunkSnap.exists()) {
                  fullJson += chunkSnap.data().text;
                }
              }
              if (fullJson.trim().length > 0) {
                parsedState = JSON.parse(fullJson) as AppState;
              }
            } catch (e: any) {
              console.error("Failed to parse chunked state:", e);
              alert("CRITICAL ERROR: Failed to download your data from the server. To protect your data, saving has been disabled. Please check your internet connection and refresh the page.");
              return; // Stop initialization to prevent saving empty state
            }
          } else {
            // Legacy single-document state
            parsedState = data as AppState;
          }

          // Re-check after async chunk reads in case the user made local changes while chunks were downloading
          if (isInitialized.current && hasPendingLocalChanges.current) {
            return;
          }

          if (parsedState && (parsedState.classes?.length > 0 || parsedState.students?.length > 0)) {
            // Apply migrations if missing
            if (!parsedState.trash) parsedState.trash = [];
            if (!parsedState.scores) parsedState.scores = [];
            if (!parsedState.attendanceRecords) parsedState.attendanceRecords = [];
            if (!parsedState.ptcRecords) parsedState.ptcRecords = [];
            if (!parsedState.examRecords) parsedState.examRecords = [];
            if (!parsedState.examInfos) parsedState.examInfos = [];
            if (!parsedState.gradingSettings) parsedState.gradingSettings = defaultGradingSettings;
            if (!parsedState.attendanceSettings) parsedState.attendanceSettings = defaultAttendanceSettings;
            
            isRemoteUpdate.current = true;
            dispatch({ type: 'SET_STATE', payload: parsedState });
            setSyncStatus('synced');

            // Always save a copy to localStorage as a bulletproof device backup
            try {
              localStorage.setItem('class_tracker_offline_backup', JSON.stringify(parsedState));
              localStorage.setItem('class_tracker_last_backup_date', new Date().toISOString());
            } catch (e) {}
          } else {
            // Cloud has 0 classes. Check if localStorage on this device has saved data!
            try {
              const localBackup = localStorage.getItem('class_tracker_offline_backup') || 
                                  localStorage.getItem('class_participation_tracker_data');
              if (localBackup) {
                const localParsed = JSON.parse(localBackup);
                if (localParsed && (localParsed.classes?.length > 0 || localParsed.students?.length > 0)) {
                  console.log("Cloud was empty, but found local data! Restoring from localStorage...");
                  dispatch({ type: 'SET_STATE', payload: localParsed });
                  alert("RECOVERED: Found your saved classes and students stored safely in this browser! Restoring them now.");
                }
              }
            } catch (err) {
              console.error("Error checking local storage fallback:", err);
            }
          }
          isInitialized.current = true;
        }
      } else {
        // Cloud document does not exist yet. Check localStorage first!
        try {
          const localBackup = localStorage.getItem('class_tracker_offline_backup') || 
                              localStorage.getItem('class_participation_tracker_data');
          if (localBackup) {
            const localParsed = JSON.parse(localBackup);
            if (localParsed && (localParsed.classes?.length > 0 || localParsed.students?.length > 0)) {
              dispatch({ type: 'SET_STATE', payload: localParsed });
              isInitialized.current = true;
              return;
            }
          }
        } catch (e) {}
        isInitialized.current = true;
      }
    }, (error) => {
      console.error("Firebase Sync Error:", error);
      if (error.code === 'permission-denied') {
        alert("SECURITY ALERT: Your app is blocked from reading its own database! Your data is SAFE but hidden. Please check your Firebase Security Rules as instructed.");
      } else {
        alert(`Database connection error: ${error.message}`);
      }
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
        // CRITICAL IRONCLAD SAFETY LOCK: NEVER, EVER SAVE AN EMPTY STATE OVER THE CLOUD
        if (!state.classes || (state.classes.length === 0 && state.students.length === 0)) {
          console.warn("SAFETY LOCK ENGAGED: Blocked attempt to save 0 classes / 0 students to cloud database.");
          return;
        }

        // Save to browser localStorage immediately on every single change
        try {
          localStorage.setItem('class_tracker_offline_backup', JSON.stringify(state));
          localStorage.setItem('class_tracker_last_backup_date', new Date().toISOString());
          const today = new Date().toISOString().split('T')[0];
          localStorage.setItem(`class_tracker_daily_${today}`, JSON.stringify(state));
        } catch (err) {}

        let saveCompleted = false;
        hasPendingLocalChanges.current = true;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (!saveCompleted) {
            e.preventDefault();
            e.returnValue = 'Your points are still saving to the cloud. Please wait a second before refreshing!';
          }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Set saving indicator
        setSyncStatus('saving');

        const timerId = setTimeout(async () => {
          try {
            // Double check safety lock before network call
            if (!state.classes || (state.classes.length === 0 && state.students.length === 0)) {
              console.warn("SAFETY LOCK ENGAGED: Aborting write of empty state.");
              hasPendingLocalChanges.current = false;
              setSyncStatus('synced');
              return;
            }

            const json = JSON.stringify(state);
            const CHUNK_SIZE = 800000; // ~800KB chunks (Firestore limit is 1MB)
            const chunks: string[] = [];
            
            for (let i = 0; i < json.length; i += CHUNK_SIZE) {
              chunks.push(json.slice(i, i + CHUNK_SIZE));
            }
            
            const writeTs = Date.now();
            lastSavedTimestamp.current = writeTs;

            const batch = writeBatch(db);
            const userRef = doc(db, 'users', currentUser.uid);
            const chunksRef = collection(db, 'users', currentUser.uid, 'chunks');
            
            // Set root doc with metadata
            batch.set(userRef, { numChunks: chunks.length, timestamp: writeTs });
            
            // Set chunks
            chunks.forEach((chunk, index) => {
              batch.set(doc(chunksRef, `chunk_${index}`), { text: chunk });
            });
            
            // Cleanup any extra potential chunks from previous larger states
            for (let i = chunks.length; i < chunks.length + 20; i++) {
               batch.delete(doc(chunksRef, `chunk_${i}`));
            }
            
            await batch.commit();
            saveCompleted = true;
            hasPendingLocalChanges.current = false;
            setSyncStatus('synced');
          } catch (err) {
            console.error("Failed to save to cloud:", err);
            hasPendingLocalChanges.current = false;
            setSyncStatus('offline');
          }
        }, 1500); // Wait 1.5 seconds after they stop clicking to bundle the saves
        
        return () => {
          clearTimeout(timerId);
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
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
    <DataContext.Provider value={{ state, dispatch, syncStatus }}>
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
