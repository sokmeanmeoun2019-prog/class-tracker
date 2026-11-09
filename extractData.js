import * as XLSX from 'xlsx';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

try {
  // Read the Excel file
  const filename = 'Attendance List for 2026-2027.xlsx';
  console.log(`Reading ${filename}...`);
  const workbook = XLSX.readFile(filename);
  
  // Create an Academic Year
  const yearId = uuidv4();
  const academicYears = [{ id: yearId, name: '2026-2027' }];
  
  const classes = [];
  const students = [];
  
  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    // We expect 12 classes, e.g., Grade 12AM to Grade 9F
    // Let's assume every sheet is a class, or at least sheets with "Grade" in the name or we just import all sheets.
    console.log(`Processing sheet: ${sheetName}`);
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    
    if (data.length > 0) {
      const classId = uuidv4();
      classes.push({
        id: classId,
        name: sheetName.trim(),
        academicYearId: yearId
      });
      
      data.forEach((row, index) => {
        // Try to find Name column (could be 'Name', 'Student Name', 'Full Name', 'English Name', etc.)
        let name = '';
        let studentNo = index + 1; // Default to row index if no number column
        
        for (const key of Object.keys(row)) {
          const k = key.toLowerCase();
          if (k.includes('name') && !k.includes('school')) {
            name = row[key];
          }
          if (k === 'no' || k === 'no.' || k.includes('number') || k === 'id') {
            const val = parseInt(row[key], 10);
            if (!isNaN(val)) studentNo = val;
          }
        }
        
        if (name && name.trim() !== '') {
          students.push({
            id: uuidv4(),
            classId: classId,
            studentNumber: studentNo,
            name: name.trim()
          });
        }
      });
    }
  });

  const backupData = {
    academicYears,
    classes,
    students,
    sessions: [],
    records: [],
    currentYearId: yearId,
    currentClassId: classes.length > 0 ? classes[0].id : null,
    currentQuarter: 1
  };

  fs.writeFileSync('Class_Tracker_Initial_Data.json', JSON.stringify(backupData, null, 2));
  console.log(`Successfully extracted ${classes.length} classes and ${students.length} students.`);
  console.log('Saved to Class_Tracker_Initial_Data.json');
  console.log('You can now open the app, go to Export / Backup, and import this JSON file!');
  
} catch (error) {
  console.error("Error reading the Excel file. Please make sure the file is not currently open in Excel and the script is running in the correct folder.", error);
}
