import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Login from './pages/Login'
import Add_Student from './pages/Add_Student'
import StudentDashboard from './views/StudentDashboard'
import AdminDashboard from './views/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import ProtectedAdmin from "./components/ProtectedAdmin"
import DashboardLayout from './layouts/DashboardLayout'
import Attendance from './pages/Attendance'
import { Routes, Route } from 'react-router'

function App() {
  

  return (
    <>
      <Routes>

          <Route path='/' element={<ProtectedRoute><DashboardLayout/></ProtectedRoute>}>
            <Route index element={<StudentDashboard/>}/>
            <Route path='/admin' element={<ProtectedRoute><ProtectedAdmin><AdminDashboard /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/add-student' element={<ProtectedRoute><ProtectedAdmin><Add_Student /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/attendance' element={<ProtectedRoute><ProtectedAdmin><Attendance/></ProtectedAdmin></ProtectedRoute>}/>

          </Route>
        <Route path="/login" element={<Login />} />              
      </Routes>
    </>
  )
}

export default App
