import React from 'react';

const Signup = () => {
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
          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            
            {/* Full Name Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Full Name
              </label>
              <input 
                type="text" 
                placeholder="John Doe"
                className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Email Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Email Address
              </label>
              <input 
                type="email" 
                placeholder="student@university.edu"
                className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Username Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Choose Username
              </label>
              <input 
                type="text" 
                placeholder="johndoe123"
                className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Password Field */}
            <div className="relative border-b border-gray-700 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
              <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
                Password
              </label>
              <input 
                type="password" 
                placeholder="••••••••"
                className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 text-sm py-1 focus:ring-0"
              />
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input 
                type="checkbox" 
                id="terms"
                className="rounded bg-[var(--background)] border-zinc-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-[var(--background)] w-4 h-4 cursor-pointer"
              />
              <label htmlFor="terms" className="text-xs text-[var(--muted)] cursor-pointer select-none">
                I agree to the <span className="text-[var(--primary)] hover:underline">Terms & Conditions</span>
              </label>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="w-full bg-[var(--primary)] hover:bg-[var(--secondary)] text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-purple-900/20 transform active:scale-[0.98] mt-2"
            >
              Sign Up
            </button>
          </form>

          {/* Footer Navigation */}
          <div className="mt-8 text-center md:text-left flex items-center justify-center md:justify-start gap-2">
            <span className="text-xs text-[var(--muted)]">Already have an account?</span>
            <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-4 py-1.5 rounded-lg border border-zinc-700 transition-colors duration-200">
              Login
            </button>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Signup;