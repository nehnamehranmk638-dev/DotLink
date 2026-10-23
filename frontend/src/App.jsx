import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/parent/Login';
import Dashboard from './pages/parent/Dashboard';
import Curriculum from './pages/parent/Curriculum';
import CurriculumReview from './pages/parent/CurriculumReview';
import StudentDashboard from './pages/child/StudentDashboard';
import AnimatedLessonPlayer from './pages/child/AnimatedLessonPlayer';
import QuizView from './pages/child/QuizView';
import { api } from './api';

function ProtectedRoute({ children }) {
  const user = api.getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/curriculum"
          element={
            <ProtectedRoute>
              <Curriculum />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:topicId"
          element={
            <ProtectedRoute>
              <CurriculumReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/play"
          element={
            <ProtectedRoute>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/play/session/:sessionId"
          element={
            <ProtectedRoute>
              <AnimatedLessonPlayer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/play/quiz/:sessionId"
          element={
            <ProtectedRoute>
              <QuizView />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
