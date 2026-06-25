import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Login from './pages/Login'
import StudentDashboard from './views/StudentDashboard'
import AdminDashboard from './views/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import ProtectedAdmin from "./components/ProtectedAdmin"
import { Routes, Route } from 'react-router'

function App() {
  

  return (
    <>
      <Routes>
        <Route path="/" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
         <Route path="/admin" element={<ProtectedRoute><ProtectedAdmin><AdminDashboard /></ProtectedAdmin></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        
      </Routes>
    </>
  )
}

export default App
