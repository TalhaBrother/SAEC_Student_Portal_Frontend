import React, { useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router';
import useAuthStore from '../store/authStore';
import logo from "../assets/logo.webp";

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login/', { username, password });
      console.log('Login successful:', res.data);
      login(res.data);
      
      if (res.data.user?.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Login failed:', error.message);
      alert(error.response?.data?.detail || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[var(--secondary)] text-[var(--quinary)] font-sans antialiased">
      
      {/* Left Side: Clean Professional SaaS Form Panel */}
      <div className="w-full md:w-1/2 flex flex-col justify-between px-6 sm:px-16 lg:px-24 py-8 md:py-12 bg-[var(--secondary)]">
        
        {/* Responsive Top Branding Header */}
        <div className="flex items-center gap-3 max-w-md w-full mx-auto mb-10 md:mb-0">
          <div className="h-10 w-16 overflow-hidden rounded-lg shadow-sm border border-gray-100 flex items-center justify-center">
            <img 
              src={logo} 
              alt="The Nedians Institute" 
              className="h-full w-full object-cover scale-110"
            />
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--quinary)] uppercase">
            The Nedians Institute
          </span>
        </div>

        {/* Core Interactive Login Box */}
        <div className="max-w-md w-full mx-auto my-auto w-full">
          {/* Header Description */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
              Welcome Back
            </h2>
            <p className="text-gray-500 text-sm">
              Enter your system credentials to access your dashboard overview.
            </p>
          </div>

          {/* Core Interactive Login Form */}
          <form className="space-y-5" onSubmit={handleLogin}>
            
            {/* Username Input Container */}
            <div className="flex flex-col">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Username
              </label>
              <input 
                type="text" 
                placeholder="Enter your account username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
              />
            </div>

            {/* Password Input Container */}
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Password
                </label>
                <a href="#forgot" className="text-xs font-semibold text-[var(--primary)] hover:underline transition-all">
                  Forgot Password?
                </a>
              </div>
              <div className="relative flex items-center">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 pr-10 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none cursor-pointer"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.644m17.928 0a1.012 1.012 0 0 1 0 .644M12 18.75a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Security Request Action */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] mt-2 cursor-pointer text-sm tracking-wide uppercase"
            >
              {loading ? "Verifying Credentials..." : "Sign In to Portal"}
            </button>
          </form>
        </div>

        {/* Footer Navigation Redirection */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center flex items-center justify-center gap-2 max-w-md w-full mx-auto">
          <span className="text-xs text-gray-500">Don't have an institutional account?</span>
          <button className="bg-white hover:bg-gray-50 text-[var(--quinary)] font-medium text-xs px-4 py-2 rounded-xl border border-gray-300 transition-all cursor-pointer shadow-sm">
            Sign up
          </button>
        </div>

      </div>

      {/* Right Side: High-End Marketing Banner Aspect */}
      <div className="hidden md:flex md:w-1/2 bg-[var(--primary)] p-12 flex-col justify-between items-center relative overflow-hidden select-none">
        {/* Geometric aesthetic background accents */}
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-white/10 rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-900 rounded-full filter blur-3xl opacity-20"></div>

        {/* Branding Messaging */}
        <div className="w-full text-left z-10 mt-10 max-w-md mx-auto">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-3 text-white leading-tight">
            The Nedians <br /> Institute
          </h1>
          <p className="text-indigo-100 text-sm opacity-80 leading-relaxed">
            Monitor dynamic grading distributions, process real-time bulk attendance metrics, and orchestrate institutional operational pipelines cleanly.
          </p>
        </div>

        {/* Dynamic Abstract Framed Graphic - Now contains the logo cleanly */}
        <div className="w-full max-w-md aspect-video flex items-center justify-center z-10 relative mb-10 mx-auto">
          <div className="w-full h-full border border-white/15 rounded-2xl flex flex-col items-center justify-center p-6 bg-white/10 backdrop-blur-xl shadow-2xl overflow-hidden group">
            <div className="w-3/4 max-w-[240px] aspect-[1.6] rounded-xl overflow-hidden shadow-lg border border-white/10 transition-transform duration-500 group-hover:scale-105  flex items-center justify-center">
              <img 
                src={logo} 
                alt="Academy Emblem" 
                className="w-full h-full object-cover scale-110" 
              />
            </div>
            <div className="mt-4 text-center">
              <span className="text-white font-medium text-xs tracking-wider uppercase block">
                Official Institutional Portal
              </span>
              <span className="text-indigo-200/50 text-[10px] block mt-0.5">
                Secured Environment • Live Sync
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Login;