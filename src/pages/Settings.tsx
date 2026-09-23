import React, { useRef } from 'react';
import { useData } from '../store/DataContext';
import { Download, Upload, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

const Settings = () => {
  const { state, dispatch } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attendanceInputRef = useRef<HTMLInputElement>(null);

  const handleExportJson = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Class_Tracker_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.confirm('WARNING: Importing a backup will overwrite ALL current data. Are you sure you want to proceed?')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && Array.isArray(parsed.classes)) {
            dispatch({ type: 'SET_STATE', payload: parsed });
            alert('Backup restored successfully!');
          } else {
            throw new Error('Invalid format');
          }
        } catch (error) {
          alert('Failed to parse backup file. Please ensure it is a valid JSON backup from this app.');
        }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportAttendanceList = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('This will parse the Excel file, create an Academic Year "2026-2027", and add all classes and students found in the sheets. Proceed?')) {
      if (attendanceInputRef.current) attendanceInputRef.current.value = '';
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        let newYearId = uuidv4();
        let newClasses: any[] = [];
        let newStudents: any[] = [];
        let foundValidData = false;

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          
          if (rows.length > 0) {
            foundValidData = true;
            const classId = uuidv4();
            newClasses.push({
              id: classId,
              name: sheetName.trim(),
              academicYearId: newYearId
            });

            rows.forEach((row) => {
              let name = '';
              let studentId = '';

              for (const key of Object.keys(row)) {
                const k = key.toLowerCase();
                if (k.includes('name') && !k.includes('school')) {
                  name = row[key];
                }
                if (k === 'id' || k.includes('student id')) {
                   studentId = String(row[key]);
                }
              }

              // Fallback: If no column header matches 'name', take the first string column that has a reasonable length
              if (!name) {
                for (const key of Object.keys(row)) {
                  if (typeof row[key] === 'string' && row[key].length > 2 && row[key].length < 50 && !row[key].match(/^[0-9]+$/)) {
                    name = row[key];
                    break;
                  }
                }
              }

              if (name && name.trim() !== '') {
                newStudents.push({
                  id: uuidv4(),
                  classId: classId,
                  name: name.trim(),
                  studentId: studentId.trim() || undefined
                });
              }
            });
          }
        });

        if (foundValidData) {
          const updatedState = {
            ...state,
            academicYears: [...state.academicYears, { id: newYearId, name: '2026-2027' }],
            classes: [...state.classes, ...newClasses],
            students: [...state.students, ...newStudents],
            currentYearId: newYearId,
            currentClassId: newClasses.length > 0 ? newClasses[0].id : state.currentClassId
          };
          dispatch({ type: 'SET_STATE', payload: updatedState });
          alert(`Successfully imported ${newClasses.length} classes and ${newStudents.length} students!`);
        } else {
          alert('Could not find any student data in the file.');
        }
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error(error);
      alert('Error reading the Attendance List file.');
    }
    
    if (attendanceInputRef.current) attendanceInputRef.current.value = '';
  };

  const handleClearData = () => {
    if (window.confirm('CRITICAL WARNING: This will permanently delete ALL data (classes, students, and records). There is no undo. Make sure you have exported a backup first.\n\nType "DELETE" to confirm (without quotes).')) {
      const promptRes = window.prompt('Type DELETE to confirm:');
      if (promptRes === 'DELETE') {
        dispatch({ type: 'CLEAR_ALL_DATA' });
        alert('All data has been cleared.');
      }
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-800">Export & Backup</h2>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Full Database Backup</h3>
        <p className="text-gray-600 text-sm mb-4">
          Export all your data (Classes, Students, Participation Records) as a JSON file. Keep this file safe. You can use it to restore your data later or move it to another computer.
        </p>
        <div className="flex gap-4">
          <button onClick={handleExportJson} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            <Download size={18} /> Export JSON Backup
          </button>
          
          <label className="flex items-center gap-2 bg-gray-100 text-gray-700 border px-6 py-2 rounded hover:bg-gray-200 cursor-pointer">
            <Upload size={18} /> Import JSON Backup
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImportJson} 
            />
          </label>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Bulk Import Students from Attendance List</h3>
        <p className="text-gray-600 text-sm mb-4">
          Upload your "Attendance List for 2026-2027.xlsx". The app will automatically create a class for each sheet (e.g., Grade 12AM, Grade 9F) and import all the student names.
          <br/><br/>
          After importing, you can easily go to the <strong>Classes & Years</strong> or <strong>Students</strong> tabs to edit any section and revise names or class details.
        </p>
        <label className="flex items-center gap-2 bg-green-600 text-white border border-transparent px-6 py-2 rounded hover:bg-green-700 cursor-pointer w-fit">
          <FileSpreadsheet size={18} /> Upload Attendance List
          <input 
            type="file" 
            accept=".xlsx,.xls" 
            className="hidden" 
            ref={attendanceInputRef}
            onChange={handleImportAttendanceList} 
          />
        </label>
      </div>

      <div className="bg-red-50 p-6 rounded-lg shadow-sm border border-red-200 mt-8">
        <h3 className="text-lg font-bold text-red-700 border-b border-red-200 pb-2 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} /> Danger Zone
        </h3>
        <p className="text-red-600 text-sm mb-4">
          Clearing data will remove all your classes, students, and records permanently from this browser. Please export a backup first.
        </p>
        <button onClick={handleClearData} className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 font-medium">
          Clear All App Data
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4 mt-8">
        <h3 className="text-lg font-bold border-b pb-2">Grading System Configuration (Score List)</h3>
        <p className="text-gray-600 text-sm mb-4">
          Configure the maximum possible scores and the percentage weight for each category. Weights must total 100%.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
            <div className="text-sm py-2">Conduct</div>
            <div className="text-sm py-2">C.P (Participation)</div>
            <div className="text-sm py-2">Homework (x3)</div>
            <div className="text-sm py-2">Quiz (x3)</div>
            <div className="text-sm py-2">Test (x2)</div>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-1">Max Score (Per Entry)</label>
            {['conduct', 'cp', 'hw', 'quiz', 'test'].map((key) => (
              <div key={`max-${key}`} className="py-1">
                <input 
                  type="number" 
                  min="0"
                  className="border rounded px-2 py-1 w-24 text-sm"
                  value={(state.gradingSettings.maxScores as any)[key]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    dispatch({ 
                      type: 'UPDATE_GRADING_SETTINGS', 
                      payload: { 
                        ...state.gradingSettings, 
                        maxScores: { ...state.gradingSettings.maxScores, [key]: val } 
                      } 
                    });
                  }}
                />
              </div>
            ))}
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-1">Weight (%)</label>
            {['conduct', 'cp', 'hw', 'quiz', 'test'].map((key) => (
              <div key={`weight-${key}`} className="py-1">
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  className="border rounded px-2 py-1 w-24 text-sm"
                  value={(state.gradingSettings.weights as any)[key]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    dispatch({ 
                      type: 'UPDATE_GRADING_SETTINGS', 
                      payload: { 
                        ...state.gradingSettings, 
                        weights: { ...state.gradingSettings.weights, [key]: val } 
                      } 
                    });
                  }}
                />
              </div>
            ))}
            <div className="py-2 text-sm font-bold border-t mt-2">
              Total Weight: {Object.values(state.gradingSettings.weights).reduce((a, b) => a + b, 0)}%
              {Object.values(state.gradingSettings.weights).reduce((a, b) => a + b, 0) !== 100 && (
                <span className="text-red-500 ml-2">(Must equal 100%)</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
