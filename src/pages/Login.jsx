import React from 'react';
import api from '../api/axios';
import { useState } from 'react';
import {useNavigate} from 'react-router';

const Login = () => {
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const navigate = useNavigate()
const handleLogin = async (e) => {
  e.preventDefault();
  setLoading(true);
  try {
    const response = await api.post('/auth/login/', { username, password });
    console.log('Login successful:', response.data);
    localStorage.setItem('Access Token', response.data.access);
    localStorage.setItem('Refresh Token', response.data.refresh);
    navigate('/')

  } catch (error) {
    console.error('Login failed:', error.response ? error.response.data : error.message);
  
  } finally {
    setLoading(false);
  }
};
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-[var(--background)] text-white font-sans">
      
      {/* Right Side: Welcome Banner / Image Side */}
      <div className="hidden md:flex md:w-1/2 bg-[var(--primary)] p-12 flex-col justify-between items-center relative overflow-hidden select-none">
        {/* Subtle abstract background blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-[var(--secondary)] rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-400 rounded-full filter blur-3xl opacity-20"></div>

        {/* Branding/Heading */}
        <div className="w-full text-left z-10 mt-10">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">
            Welcome to <br /> student portal
          </h1>
          <p className="text-purple-200 text-sm opacity-90">Login to access your account</p>
        </div>

        {/* Minimalist Illustration Box */}
        <div className="w-full max-w-md aspect-square flex items-center justify-center z-10 relative mb-10">
          <div className="w-full h-full border-2 border-dashed border-purple-300/30 rounded-2xl flex flex-col items-center justify-center p-6 bg-white/5 backdrop-blur-sm">
            <span className="text-purple-200 text-sm text-center">
              [ Place Student Vector Illustration Here ]
            </span>
          </div>
        </div>
      </div>

      {/* Left Side: Form Side */}
      <div className="w-full md:w-1/2 flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-12">
        <div className="max-w-md w-full mx-auto">
          
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-wide mb-2">Login</h2>
            <p className="text-[var(--muted)] text-sm">Enter your account details</p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={handleLogin}>
            
            {/* Username Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Username
              </label>
              <input 
                type="text" 
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Password Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Password
              </label>
              <div className="flex items-center">
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
                />
                <button type="button" className="text-[var(--muted)] hover:text-white transition-colors ml-2 focus:outline-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.644m17.928 0a1.012 1.012 0 0 1 0 .644M12 18.75a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Forgot Password Link */}
            <div className="text-right">
              <a href="#forgot" className="text-xs text-[var(--muted)] hover:text-[var(--primary)] transition-colors duration-200">
                Forgot Password?
              </a>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="w-full bg-[var(--primary)] hover:bg-[var(--secondary)] text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-purple-900/20 transform active:scale-[0.98]"
            >
              Login
            </button>
          </form>

          {/* Footer Navigation */}
          <div className="mt-8 text-center md:text-left flex items-center justify-center md:justify-start gap-2">
            <span className="text-xs text-[var(--muted)]">Don't have an account?</span>
            <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-4 py-1.5 rounded-lg border border-zinc-700 transition-colors duration-200">
              Sign up
            </button>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Login;