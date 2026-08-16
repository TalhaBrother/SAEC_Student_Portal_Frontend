import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Login from './pages/Login'
import Students from './pages/Students'
import StudentDashboard from './views/StudentDashboard'
import AdminDashboard from './views/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import ProtectedAdmin from "./components/ProtectedAdmin"
import DashboardLayout from './layouts/DashboardLayout'
import Attendance from './pages/Attendance'
import Marks from './pages/Marks'
import Result from './pages/Result'
import Tests from './pages/Tests'
import Subjects from './pages/Subjects'
import Classes from "./pages/Classes"
import Fee_Structure from './pages/Fee_Structure'
import Generate_Vouchers from './pages/Generate_Vouchers'
import Fee_Reports from './pages/Fee_Reports'
import Fees from './pages/Fees'
import Examination from './pages/Examination'
import { Routes, Route } from 'react-router'
import { useNavigate } from 'react-router'

function App() {
  
  const Navigate=useNavigate()

  return (
    <>
      <Routes>

          <Route path='/' element={<ProtectedRoute><DashboardLayout/></ProtectedRoute>}>
            <Route index element={<ProtectedRoute><ProtectedAdmin><AdminDashboard /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin' element={<ProtectedRoute><ProtectedAdmin><AdminDashboard /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/students' element={<ProtectedRoute><ProtectedAdmin><Students /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/attendance' element={<ProtectedRoute><ProtectedAdmin><Attendance/></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/marks' element={<ProtectedRoute><ProtectedAdmin><Marks/></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/tests' element={<ProtectedRoute><ProtectedAdmin><Tests/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/result' element={<ProtectedRoute><ProtectedAdmin><Result/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/subjects' element={<ProtectedRoute><ProtectedAdmin><Subjects/></ProtectedAdmin></ProtectedRoute>}/>
              <Route path='/admin/classes' element={<ProtectedRoute><ProtectedAdmin><Classes/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/fee-structure' element={<ProtectedRoute><ProtectedAdmin><Fee_Structure/></ProtectedAdmin></ProtectedRoute>}/>
              <Route path='/admin/generate-vouchers' element={<ProtectedRoute><ProtectedAdmin><Generate_Vouchers/></ProtectedAdmin></ProtectedRoute>}/>
               <Route path='/admin/fee-report' element={<ProtectedRoute><ProtectedAdmin><Fee_Reports/></ProtectedAdmin></ProtectedRoute>}/>
                <Route path='/admin/fees' element={<ProtectedRoute><ProtectedAdmin><Fees/></ProtectedAdmin></ProtectedRoute>}/>
                 <Route path='/admin/examination' element={<ProtectedRoute><ProtectedAdmin><Examination/></ProtectedAdmin></ProtectedRoute>}/>




          </Route>
        <Route path="/auth/login" element={<Login />} />              
      </Routes>
    </>
  )
}

export default App
