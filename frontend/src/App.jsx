import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/parent/Login';
import ParentHub from './pages/parent/ParentHub';
import WeeklyStudentDashboard from './pages/parent/WeeklyStudentDashboard';
import KidsSpaceEntry from './pages/parent/KidsSpaceEntry';
import Curriculum from './pages/parent/Curriculum';
import CurriculumReview from './pages/parent/CurriculumReview';
import ChapterPicker from './pages/child/ChapterPicker';
import StudentDashboard from './pages/child/StudentDashboard';
import AnimatedLessonPlayer from './pages/child/AnimatedLessonPlayer';
import QuizView from './pages/child/QuizView';
import RemediationDev from './pages/dev/RemediationDev';
import { api } from './api';

function ProtectedRoute({ children }) {
  const user = api.getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function NavigationWrapper() {
  const location = useLocation();
  // Hide default navbar on full-screen custom pages (Landing, Choose Chapter, Kids Entry, Parent Hub, Weekly Dashboard, Login, Signup, Curriculum, Dev Remediation)
  const hideNavbarOn = ['/', '/chapters', '/kids-entry', '/dashboard', '/analytics', '/login', '/signup', '/curriculum', '/dev/remediation'];
  const showNav = !hideNavbarOn.includes(location.pathname);

  return (
    <>
      {showNav && <Navbar />}
      <Routes>
        {/* Splash Landing Screen with Cute Crab Pull Animation */}
        <Route path="/" element={<Landing />} />

        {/* Parent Hub */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ParentHub />
            </ProtectedRoute>
          }
        />

        {/* Weekly Student Dashboard with Attentivity, Accuracy & Subject Charts */}
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <WeeklyStudentDashboard />
            </ProtectedRoute>
          }
        />

        {/* Choose a Chapter with CSS Notebooks & Animated Progress Timeline */}
        <Route
          path="/chapters"
          element={
            <ProtectedRoute>
              <ChapterPicker />
            </ProtectedRoute>
          }
        />

        {/* Kids Space Entry with Real Scannable QR Code */}
        <Route
          path="/kids-entry"
          element={
            <ProtectedRoute>
              <KidsSpaceEntry />
            </ProtectedRoute>
          }
        />

        {/* Curriculum Upload & Ingestion */}
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

        {/* Child Play Study Space */}
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

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login initialSignUp={true} />} />
        <Route path="/dev/remediation" element={<RemediationDev />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigationWrapper />
    </BrowserRouter>
  );
}
