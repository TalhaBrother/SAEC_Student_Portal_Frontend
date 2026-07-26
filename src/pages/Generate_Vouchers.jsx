import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// When the request uses responseType: 'blob', Axios also returns error
// bodies as a Blob — even though the backend sent JSON. This reads the
// blob back out as text and parses it so we can surface the backend's
// actual error message (e.g. "No fee structure has been set...")
// instead of a generic failure message.
const extractBlobErrorMessage = async (error) => {
  const fallback = 'Failed to generate vouchers. Please try again.';
  const data = error.response?.data;
  if (!data) return fallback;

  try {
    const text = typeof data.text === 'function' ? await data.text() : null;
    if (!text) return fallback;
    const parsed = JSON.parse(text);
    return parsed.error || fallback;
  } catch {
    return fallback;
  }
};

const Generate_Vouchers = () => {
  const token = useAuthStore((state) => state.accessToken);

  const [Classes, setClasses] = useState([]);
  const [studentClass, setStudentClass] = useState("");

  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get("/classes/", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClasses(res.data);
      } catch (err) {
        console.log(err);
      }
    };

    if (token) {
      fetchClasses();
    }
  }, [token]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const params = new URLSearchParams();
      if (month) params.append('month', month);
      if (year) params.append('year', year);

      const res = await api.post(
        `/fees/generate/${studentClass}/?${params.toString()}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');

      setMessage({ type: "success", text: "Vouchers generated. Opening PDF in a new tab..." });
    } catch (error) {
      console.error("Error generating vouchers:", error);
      const text = await extractBlobErrorMessage(error);
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
        Generate Fee Vouchers
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Pick a class and month to generate (or re-download) that class's fee vouchers as a PDF.
      </p>

      {/* Status Message Display */}
      {message.text && (
        <div
          className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
        <form onSubmit={handleGenerate} className="space-y-6">

          {/* Class Selector */}
          <div className="flex flex-col w-full">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Class
            </label>
            <select
              value={studentClass}
              onChange={(e) => setStudentClass(e.target.value)}
              required
              className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
            >
              <option value="">Select Class</option>
              {Classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.display_name}</option>
              ))}
            </select>
          </div>

          {/* Month + Year */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col w-full">
              <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col w-full">
              <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                Year
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={String(today.getFullYear())}
                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
              />
            </div>
          </div>

          <p className="text-gray-400 text-xs">
            Regenerating for the same class and month is safe — existing vouchers and challan numbers are reused, not duplicated.
          </p>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !studentClass}
              className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
            >
              {loading ? "Generating..." : "Generate Vouchers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Generate_Vouchers;