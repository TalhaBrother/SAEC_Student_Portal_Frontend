import React, { useState } from 'react';
import axios from 'axios';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Add_Student = () => {
  
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const token = useAuthStore((state) => state.accessToken);
  // console.log("Token: ", token);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
     
      const res = await api.post(
        "/students/",
        {
          full_name: fullName,
          student_id: studentId,
          student_class: studentClass,
          phone: phone,
          username: username,
          email: email,
          password: password
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("Student Added Successfully!", res.data);

      
      setFullName("");
      setStudentId("");
      setStudentClass("");
      setPhone("");
      setUsername("");
      setEmail("");
      setPassword("");
    } catch (error) {
      console.error("Add Student Error!")
      console.log("Status:", error.response?.status);
      console.log("Data:", error.response?.data);
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-[var(--background)] text-white font-sans">

      {/* Right Side: Welcome Banner / Image Side */}
      <div className="hidden md:flex md:w-1/2 bg-[var(--primary)] p-12 flex-col justify-between items-center relative overflow-hidden select-none">
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-[var(--secondary)] rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-400 rounded-full filter blur-3xl opacity-20"></div>

        {/* Branding/Heading */}
        <div className="w-full text-left z-10 mt-10">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">
            Join the <br /> student portal
          </h1>
          <p className="text-purple-200 text-sm opacity-90">Create an account to start your journey</p>
        </div>

        {/* Minimalist Illustration Box */}
        <div className="w-full max-w-md aspect-square flex items-center justify-center z-10 relative mb-10">
          <div className="w-full h-full border-2 border-dashed border-purple-300/30 rounded-2xl flex flex-col items-center justify-center p-6 bg-white/5 backdrop-blur-sm">
            <span className="text-purple-200 text-sm text-center">
              [ Place Student Registration Illustration Here ]
            </span>
          </div>
        </div>
      </div>

      {/* Left Side: Form Side */}
      <div className="w-full md:w-1/2 flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-12">
        <div className="max-w-md w-full mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-wide mb-2">Create Account</h2>
            <p className="text-[var(--muted)] text-sm">Fill in the details to register</p>
          </div>

          {/* Form */}
          <form className="space-y-5" onSubmit={handleSubmit}>

            {/* Full Name */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Shayan Khan"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Username */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="shayankhan123"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Student ID */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="STU-2026-001"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Student Class */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Class / Grade
              </label>
              <input
                type="text"
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                placeholder="Grade 10"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Phone */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1234567890"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Email Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="shayan@gmail.com"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Password Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-transparent border-none outline-none text-black placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-[var(--primary)] hover:bg-[var(--secondary)] text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-purple-900/20 transform active:scale-[0.98] mt-2"
            >
              Sign Up
            </button>
          </form>

        </div>
      </div>

    </div>
  );
};

export default Add_Student;