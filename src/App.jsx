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
import Assign_Marks from './pages/Assign_Marks'
import Result from './pages/Result'
import Create_Test from './pages/Create_Test'
import Add_Subject from './pages/Add_Subject'
import Create_Class from "./pages/Create_Class"
import Fee_Structure from './pages/Fee_Structure'
import Generate_Vouchers from './pages/Generate_Vouchers'
import { Routes, Route } from 'react-router'

function App() {
  

  return (
    <>
      <Routes>

          <Route path='/' element={<ProtectedRoute><DashboardLayout/></ProtectedRoute>}>
            <Route index element={<StudentDashboard/>}/>
            <Route path='/admin' element={<ProtectedRoute><ProtectedAdmin><AdminDashboard /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/add-student' element={<ProtectedRoute><ProtectedAdmin><Add_Student /></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/attendance' element={<ProtectedRoute><ProtectedAdmin><Attendance/></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/assign-marks' element={<ProtectedRoute><ProtectedAdmin><Assign_Marks/></ProtectedAdmin></ProtectedRoute>}/>
            <Route path='/admin/create-test' element={<ProtectedRoute><ProtectedAdmin><Create_Test/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/result' element={<ProtectedRoute><ProtectedAdmin><Result/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/add-subject' element={<ProtectedRoute><ProtectedAdmin><Add_Subject/></ProtectedAdmin></ProtectedRoute>}/>
              <Route path='/admin/create-class' element={<ProtectedRoute><ProtectedAdmin><Create_Class/></ProtectedAdmin></ProtectedRoute>}/>
             <Route path='/admin/fee-structure' element={<ProtectedRoute><ProtectedAdmin><Fee_Structure/></ProtectedAdmin></ProtectedRoute>}/>
              <Route path='/admin/generate-vouchers' element={<ProtectedRoute><ProtectedAdmin><Generate_Vouchers/></ProtectedAdmin></ProtectedRoute>}/>



          </Route>
        <Route path="/auth/login" element={<Login />} />              
      </Routes>
    </>
  )
}

export default App
