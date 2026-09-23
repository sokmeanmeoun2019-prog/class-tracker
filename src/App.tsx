import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './store/DataContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
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

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <div className="print:hidden h-full">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6 print:p-0 print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <DataProvider>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/record" element={<RecordParticipation />} />
            <Route path="/scores" element={<ScoreList />} />
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
      </Router>
    </DataProvider>
  );
}

export default App;
