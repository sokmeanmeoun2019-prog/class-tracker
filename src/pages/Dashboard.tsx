import React from 'react';
import { useData } from '../store/DataContext';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { state } = useData();

  const totalClasses = state.classes.length;
  const totalStudents = state.students.length;
  const totalRecords = state.records.length;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Welcome to Class Participation Tracker</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-gray-500 text-sm font-medium">Total Classes</h3>
          <p className="text-3xl font-bold mt-2">{totalClasses}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-gray-500 text-sm font-medium">Total Students</h3>
          <p className="text-3xl font-bold mt-2">{totalStudents}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-gray-500 text-sm font-medium">Total Participations Recorded</h3>
          <p className="text-3xl font-bold mt-2">{totalRecords}</p>
        </div>
      </div>

      {!state.currentClassId || !state.currentQuarter ? (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-yellow-800">
            Please select an <strong>Academic Year</strong>, <strong>Class</strong>, and <strong>Quarter</strong> in the top header to begin recording.
          </p>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg text-center">
          <h3 className="text-xl font-semibold text-blue-800 mb-4">Ready to start class?</h3>
          <Link 
            to="/record" 
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Go to Record Participation
          </Link>
        </div>
      )}
      
      <div className="bg-white p-6 rounded-lg shadow-sm border">
         <h3 className="text-lg font-medium text-gray-800 mb-4">Quick Guide</h3>
         <ol className="list-decimal pl-5 space-y-2 text-gray-600">
           <li>Go to <strong>Classes & Years</strong> to setup your Academic Years and Classes.</li>
           <li>Go to <strong>Students</strong> to add or import your students.</li>
           <li>Select your Class and Quarter in the top header.</li>
           <li>Go to <strong>Record Participation</strong> during your lesson to easily add marks.</li>
           <li>View summaries in the Summary tabs.</li>
         </ol>
      </div>
    </div>
  );
};

export default Dashboard;
