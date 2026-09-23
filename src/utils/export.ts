import * as XLSX from 'xlsx';
import { Student, ParticipationRecord, Class, Quarter } from '../types';
import { getStudentQuarterTotal, getStudentSemesterTotal, getStudentYearTotal, getClassRoster, calculateStudentGrades } from './calculations';

export const exportToExcel = (data: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportQuarterSummary = (students: Student[], records: ParticipationRecord[], classObj: Class, quarter: Quarter) => {
  const sortedStudents = getClassRoster(students, classObj.id);

  const data = sortedStudents.map(student => ({
    'Student Number': student.displayNum,
    'Name': student.name,
    'Student ID': student.studentId || '',
    'Q1': getStudentQuarterTotal(records, student.id, 1),
    'Q2': getStudentQuarterTotal(records, student.id, 2),
    'Q3': getStudentQuarterTotal(records, student.id, 3),
    'Q4': getStudentQuarterTotal(records, student.id, 4),
    'Semester 1 Total': getStudentSemesterTotal(records, student.id, 1),
    'Semester 2 Total': getStudentSemesterTotal(records, student.id, 2),
    'Year Total': getStudentYearTotal(records, student.id)
  }));
  
  exportToExcel(data, `${classObj.name}_Q${quarter}_Summary`);
};

export const parseExcelStudents = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const exportScoreList = (
  students: Student[], 
  scores: any[], 
  records: ParticipationRecord[], 
  classObj: Class, 
  quarter: Quarter,
  settings: any
) => {
  const sortedStudents = getClassRoster(students, classObj.id);

  const classScores = scores.filter(s => s.classId === classObj.id && s.quarter === quarter);
  
  const data = sortedStudents.map(student => {
    const score = scores.find(s => s.studentId === student.id && s.quarter === quarter);
    const rawCp = getStudentQuarterTotal(records, student.id, quarter);
    const cappedRawCp = Math.min(rawCp, settings.maxScores.cp);
    const calculated = calculateStudentGrades(score, rawCp, settings, student.id, quarter, classObj.name, classScores);

    return {
      'No.': student.displayNum,
      'Name': student.name,
      'Sex': student.sex || '',
      'Conduct': score?.conduct ?? '',
      'C.P': score?.cpScore ?? cappedRawCp,
      'HW1': score?.hw1 ?? '',
      'HW2': score?.hw2 ?? '',
      'HW3': score?.hw3 ?? '',
      'HW Total': calculated.hwTotal,
      'Quiz 1': score?.quiz1 ?? '',
      'Quiz 2': score?.quiz2 ?? '',
      'Quiz 3': score?.quiz3 ?? '',
      'Quiz Total': calculated.quizTotal,
      'Test 1': score?.test1 ?? '',
      'Test 2': score?.test2 ?? '',
      'Test Total': calculated.testTotal,
      'Overall Score': calculated.overallScore,
      'Grade': calculated.letterGrade,
      'Achievement': score?.achievement ?? calculated.autoAchievement,
      'Attitude': score?.attitude ?? calculated.autoAttitude,
      'Areas to Improve': score?.areasToImprove ?? calculated.autoImprovement
    };
  });
  
  exportToExcel(data, `${classObj.name}_Q${quarter}_ScoreList`);
};
