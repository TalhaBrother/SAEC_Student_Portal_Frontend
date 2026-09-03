import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router';
import useAuthStore from '../store/authStore';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loginError, setLoginError] = useState('');
  const [loginErrorType, setLoginErrorType] = useState('');

  // 'loading' | 'success' | 'error'
  const [settingsStatus, setSettingsStatus] = useState('loading');
  const [instituteSettings, setInstituteSettings] = useState(null);

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    const fetchInstituteSettings = async () => {
      try {
        // GET is public (AllowAny) on this endpoint — no auth token needed here.
        const res = await api.get('/institute/settings/');
        setInstituteSettings(res.data);
        setSettingsStatus('success');
      } catch (error) {
        console.error('Failed to load institute settings:', error);
        setSettingsStatus('error');
      }
    };

    fetchInstituteSettings();
  }, []);

  const showSkeleton =
    settingsStatus === 'loading' || settingsStatus === 'error';

  const instituteName = instituteSettings?.institute_name || '';

  const tagline =
    instituteSettings?.motto ||
    'Student Portal & Academic Management System';

  const logoUrl = instituteSettings?.logo || null;

  // =========================================================
  // Extract a clean, meaningful API error
  // =========================================================
  const getApiErrorMessage = (error) => {
    const data = error?.response?.data;

    // ---------------------------------------------------------
    // LICENSE ERROR
    // ---------------------------------------------------------
    if (data?.error === 'LICENSE_ERROR') {
      return {
        type: 'license',
        message:
          data.message ||
          data.detail ||
          'There is a problem with your software license.',
      };
    }

    // ---------------------------------------------------------
    // DRF "detail" error
    // ---------------------------------------------------------
    if (data?.detail) {
      return {
        type: 'auth',
        message: data.detail,
      };
    }

    // ---------------------------------------------------------
    // DRF serializer ValidationError
    //
    // Example:
    // {
    //   "non_field_errors": [
    //      "Invalid username or password."
    //   ]
    // }
    // ---------------------------------------------------------
    if (data?.non_field_errors?.length) {
      return {
        type: 'auth',
        message: data.non_field_errors[0],
      };
    }

    // ---------------------------------------------------------
    // Username validation error
    // ---------------------------------------------------------
    if (data?.username?.length) {
      return {
        type: 'auth',
        message: data.username[0],
      };
    }

    // ---------------------------------------------------------
    // Password validation error
    // ---------------------------------------------------------
    if (data?.password?.length) {
      return {
        type: 'auth',
        message: data.password[0],
      };
    }

    // ---------------------------------------------------------
    // Generic backend "error"
    // ---------------------------------------------------------
    if (data?.error) {
      return {
        type: 'auth',
        message: data.error,
      };
    }

    // ---------------------------------------------------------
    // Server responded, but response was unexpected
    // ---------------------------------------------------------
    if (error?.response) {
      return {
        type: 'auth',
        message:
          'Authentication failed. Please verify your username and password.',
      };
    }

    // ---------------------------------------------------------
    // No response = backend/server unavailable
    // ---------------------------------------------------------
    return {
      type: 'server',
      message:
        'Unable to connect to the server. Please make sure the application is running.',
    };
  };

  // =========================================================
  // Login
  // =========================================================
  const handleLogin = async (e) => {
    e.preventDefault();

    // Clear previous error
    setLoginError('');
    setLoginErrorType('');

    setLoading(true);

    try {
      const res = await api.post('/auth/login/', {
        username,
        password,
      });

      console.log('Login successful:', res.data);

      login(res.data);

      if (res.data.user?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Login failed:', error);

      const { type, message } = getApiErrorMessage(error);

      setLoginErrorType(type);
      setLoginError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[var(--secondary)] text-[var(--quinary)] font-sans antialiased">

      {/* ─── Left Side: SaaS Authentication Panel ─── */}
      <div className="w-full md:w-1/2 min-h-screen flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-[var(--secondary)]">

        {/* Spacer for vertical balance */}
        <div className="hidden md:block h-6" />

        {/* Center Card: Form Container */}
        <div className="w-full max-w-md mx-auto my-auto">

          {/* SaaS Header Accent */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-semibold uppercase tracking-wider mb-3">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
              Student & Portal Access
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--quinary)] mb-2">
              Welcome Back
            </h1>

            <p className="text-gray-500 text-sm leading-relaxed">
              Please enter your academic credentials to sign in to your dashboard.
            </p>
          </div>

          {/* =====================================================
              Login / License Error
          ====================================================== */}
          {loginError && (
            <div
              role="alert"
              className={`mb-5 rounded-xl border p-4 text-sm ${
                loginErrorType === 'license'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : loginErrorType === 'server'
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <div className="flex items-start gap-3">

                <div className="mt-0.5 shrink-0">
                  {loginErrorType === 'license'
                    ? '⚠️'
                    : loginErrorType === 'server'
                      ? '⚠️'
                      : '✕'}
                </div>

                <div>
                  <p className="font-bold">
                    {loginErrorType === 'license'
                      ? 'License Problem'
                      : loginErrorType === 'server'
                        ? 'Connection Problem'
                        : 'Login Failed'}
                  </p>

                  <p className="mt-1 leading-relaxed">
                    {loginError}
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* =====================================================
              Core Interactive Login Form
          ====================================================== */}
          <form className="space-y-5" onSubmit={handleLogin}>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block">
                Username
              </label>

              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);

                    if (loginError) {
                      setLoginError('');
                      setLoginErrorType('');
                    }
                  }}
                  required
                  className="w-full bg-white text-[var(--quinary)] border border-gray-200 rounded-xl px-4 py-3 text-sm placeholder:text-gray-400 outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 transition-all duration-200 shadow-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">

              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block">
                  Password
                </label>

                <a
                  href="#forgot"
                  className="text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
                >
                  Forgot Password?
                </a>
              </div>

              <div className="relative flex items-center">

                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);

                    if (loginError) {
                      setLoginError('');
                      setLoginErrorType('');
                    }
                  }}
                  required
                  className="w-full bg-white text-[var(--quinary)] border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm placeholder:text-gray-400 outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 transition-all duration-200 shadow-sm"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none cursor-pointer"
                  tabIndex="-1"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1 4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.644m17.928 0a1.012 1.012 0 0 1 0 .644M12 18.75a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--primary)] hover:opacity-95 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer text-sm tracking-wider uppercase mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />

                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>

                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to Portal</span>
              )}
            </button>
          </form>
        </div>

        {/* Hoverable Dropdown on TSWare */}
        <div className="w-full max-w-md mx-auto pt-6 border-t border-gray-200/60 text-center relative">
          <div className="text-xs font-medium text-gray-400 tracking-wide">
            Designed &amp; Developed by{' '}
            <span className="relative inline-block group cursor-pointer text-[var(--quinary)] font-bold underline decoration-dotted underline-offset-4">
              TSWare

              {/* WhatsApp Contact Popup */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 hidden group-hover:flex flex-col gap-2 bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 text-left min-w-[190px] z-30 transition-all duration-200">

                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Contact Us via WhatsApp
                </span>

                {/* Contact Person 1 */}
                <a
                  href="https://wa.me/923112001157?text=Hello%20Shayan,%20I%20have%20an%20inquiry%20regarding%20SAEC%20Portal."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-emerald-50 text-xs font-semibold text-gray-700 hover:text-emerald-700 transition-colors group/link"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">💬</span>
                    <span>Shayan Khan</span>
                  </div>

                  <span className="text-[10px] opacity-0 group-hover/link:opacity-100 transition-opacity text-emerald-600 font-bold">
                    Chat →
                  </span>
                </a>

                {/* Contact Person 2 */}
                <a
                  href="https://wa.me/923273112383?text=Hello%20Talha,%20I%20have%20an%20inquiry%20regarding%20SAEC%20Portal."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-emerald-50 text-xs font-semibold text-gray-700 hover:text-emerald-700 transition-colors group/link"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">💬</span>
                    <span>Talha Ikram</span>
                  </div>

                  <span className="text-[10px] opacity-0 group-hover/link:opacity-100 transition-opacity text-emerald-600 font-bold">
                    Chat →
                  </span>
                </a>

                {/* Tail / Arrow */}
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-100 rotate-45" />
              </span>
            </span>
          </div>
        </div>

      </div>

      {/* ─── Right Side: Featured SAEC Branding Showcase ─── */}
      <div className="hidden md:flex md:w-1/2 bg-[var(--primary)] p-12 flex-col items-center justify-center relative overflow-hidden select-none">

        {/* Soft Modern Glow & Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20 pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-black/20 rounded-full blur-3xl" />

        {/* Prominent Institute Logo Stage */}
        <div className="z-10 flex flex-col items-center justify-center max-w-lg w-full text-center">
          <div className="relative group p-10 bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl transition-all duration-500 hover:scale-[1.02]">

            {/* Glow backing behind logo image */}
            <div className="absolute inset-0 bg-white/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {showSkeleton ? (
              <div className="relative z-10 h-[320px] w-[320px] max-w-full max-h-[320px] rounded-2xl bg-white/10 animate-pulse" />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt={`${instituteName || 'Institute'} Logo`}
                className="relative z-10 max-h-[320px] w-auto object-contain mx-auto drop-shadow-2xl"
              />
            ) : (
              <div className="relative z-10 h-[320px] w-[320px] max-w-full flex items-center justify-center rounded-2xl bg-white/10 text-white/40 text-xs font-semibold uppercase tracking-wider">
                No Logo Configured
              </div>
            )}
          </div>

          {/* Subheading below Big Emblem */}
          <div className="mt-8 space-y-1.5 w-full">
            {showSkeleton ? (
              <>
                <div className="h-7 w-56 mx-auto rounded-lg bg-white/20 animate-pulse" />
                <div className="h-3 w-72 mx-auto rounded bg-white/10 animate-pulse mt-3" />
              </>
            ) : (
              <>
                <h2 className="text-white text-2xl font-bold tracking-tight">
                  {instituteName || 'Institute Name Not Set'}
                </h2>

                <p className="text-white/70 text-xs font-medium uppercase tracking-widest">
                  {tagline}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Login;