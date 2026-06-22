import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import StudentDashboard from './views/StudentDashboard'
import { Routes, Route } from 'react-router'

function App() {
  

  return (
    <>
      <Routes>
        <Route path="/" element={<StudentDashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
      </Routes>
    </>
  )
}

export default App
