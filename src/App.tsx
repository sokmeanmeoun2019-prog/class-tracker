import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './store/DataContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import RecordAttendance from './pages/RecordAttendance';
import AttendanceList from './pages/AttendanceList';
import RecordParticipation from './pages/RecordParticipation';
import ManageClasses from './pages/ManageClasses';
import ManageStudents from './pages/ManageStudents';
import QuarterSummary from './pages/QuarterSummary';
import SemesterSummary from './pages/SemesterSummary';
import History from './pages/History';
import Settings from './pages/Settings';
import StudentProfile from './pages/StudentProfile';
import RecentlyDeleted from './pages/RecentlyDeleted';
import ScoreList from './pages/ScoreList';
import PTCDashboard from './pages/PTCDashboard';
import PTCStudentReport from './pages/PTCStudentReport';
import SemesterExam from './pages/SemesterExam';

import { AuthProvider, useAuth } from './store/AuthContext';
import Login from './pages/Login';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-transparent overflow-hidden print:overflow-visible print:h-auto">
      <div className="print:hidden h-full">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible relative">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible p-6 md:p-8 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/record-attendance" element={<RecordAttendance />} />
                    <Route path="/attendance" element={<AttendanceList />} />
                    <Route path="/record" element={<RecordParticipation />} />
                    <Route path="/scores" element={<ScoreList />} />
                    <Route path="/ptc" element={<PTCDashboard />} />
                    <Route path="/ptc/:id" element={<PTCStudentReport />} />
                    <Route path="/semester-exam" element={<SemesterExam />} />
                    <Route path="/classes" element={<ManageClasses />} />
                    <Route path="/students" element={<ManageStudents />} />
                    <Route path="/quarter-summary" element={<QuarterSummary />} />
                    <Route path="/semester-summary" element={<SemesterSummary />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/trash" element={<RecentlyDeleted />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/student/:id" element={<StudentProfile />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
