import { Navigate } from "react-router"
import useAuthStore from "../store/authStore"
const ProtectedAdmin=({children})=>{
  const user=useAuthStore((state)=>state.user)
 
  if(user?.role !== 'admin'){
    return <Navigate to="/login" replace/>
  }
  else{
    return children
  }
}
export default ProtectedAdmin