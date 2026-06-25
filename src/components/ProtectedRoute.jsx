import { Navigate } from "react-router"
import useAuthStore from "../store/authStore"
const ProtectedRoute=({children})=>{
  const accessToken=useAuthStore((state)=>state.accessToken)
  const user=useAuthStore((state)=>state.user)
 
  if(!accessToken){
    return <Navigate to="/login" replace/>
  }

      return children

  
}
export default ProtectedRoute