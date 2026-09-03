import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

/* ============================================================
   Shared constants & helpers (used across sections)
   ============================================================ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// When a request uses responseType: 'blob', Axios also returns error
// bodies as a Blob — even though the backend sent JSON. This reads the
// blob back out as text and parses it so we can surface the backend's
// actual error message instead of a generic failure message.
const extractBlobErrorMessage = async (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error.response?.data;
  if (!data) return fallback;
  try {
    const text = typeof data.text === 'function' ? await data.text() : null;
    if (!text) return fallback;
    const parsed = JSON.parse(text);
    return parsed.error || parsed.detail || fallback;
  } catch {
    return fallback;
  }
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   Shared presentational bits
   ============================================================ */

const StatusBadge = ({ status }) => (
  <span
    className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${
      status === 'PAID'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}
  >
    {status}
  </span>
);

const Message = ({ message }) => {
  if (!message?.text) return null;
  return (
    <div
      className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${
        message.type === 'success'
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      {message.text}
    </div>
  );
};

const Field = ({ label, children, hint }) => (
  <div className="flex flex-col w-full">
    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
      {label}
    </label>
    {children}
    {hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
  </div>
);

const inputClass =
  "bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm";
const selectClass = `${inputClass} cursor-pointer`;
const primaryBtnClass =
  "bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase";
const secondaryBtnClass =
  "bg-white border border-gray-300 hover:border-[var(--primary)] disabled:opacity-50 text-[var(--quinary)] font-medium py-3 px-6 rounded-xl transition-all duration-300 cursor-pointer text-sm font-semibold tracking-wide uppercase";

const StatCard = ({ label, value, accent }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
    <span className={`text-2xl font-bold ${accent || 'text-[var(--quinary)]'}`}>{value}</span>
  </div>
);

const EmptyState = ({ text }) => (
  <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm">
    {text}
  </div>
);

const TableShell = ({ headers, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/60">
          {headers.map((h) => (
            <th
              key={h}
              className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const PeriodToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
    {PERIODS.map((p) => (
      <button
        key={p.key}
        type="button"
        onClick={() => onChange(p.key)}
        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
          value === p.key
            ? 'bg-[var(--primary)] text-white'
            : 'text-gray-500 hover:text-[var(--quinary)]'
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);

const MODES = [
  { key: 'class', label: 'Class' },
  { key: 'student', label: 'Individual Student' },
];

const ModeToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm mb-6">
    {MODES.map((m) => (
      <button
        key={m.key}
        type="button"
        onClick={() => onChange(m.key)}
        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
          value === m.key
            ? 'bg-[var(--primary)] text-white'
            : 'text-gray-500 hover:text-[var(--quinary)]'
        }`}
      >
        {m.label}
      </button>
    ))}
  </div>
);

// Shared GR No search box, reused wherever a single student needs to be
// looked up (individual fee structure + individual voucher generation).
// Mirrors the exact lookup used by the Student Search report tab
// (GET /fee-submission/search/<gr_no>/), so behavior stays consistent
// across the app.
const StudentSearchBox = ({ token, onFound, message, setMessage, hint }) => {
  const [grNo, setGrNo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!grNo.trim()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.get(`/fee-submission/search/${encodeURIComponent(grNo.trim())}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onFound(res.data);
    } catch (error) {
      console.error('Error searching student:', error);
      const status = error.response?.status;
      onFound(null);
      setMessage({
        type: 'error',
        text: status === 404 ? 'No student found with that GR No.' : 'Failed to search. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex items-end gap-4">
      <Field label="GR No" hint={hint || 'Search a student by their GR No.'}>
        <input
          type="text"
          value={grNo}
          onChange={(e) => setGrNo(e.target.value)}
          placeholder="e.g. 2021-045"
          required
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={loading} className={primaryBtnClass}>
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
};

const StudentSummaryCard = ({ student }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl grid grid-cols-2 md:grid-cols-4 gap-4">
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">GR No</p>
      <p className="font-medium">{student.gr_no}</p>
    </div>
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Name</p>
      <p className="font-medium">{student.full_name}</p>
    </div>
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Father Name</p>
      <p className="font-medium">{student.father_name}</p>
    </div>
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Class</p>
      <p className="font-medium">
        {student.student_class?.display_name || student.student_class?.name || '—'}
      </p>
    </div>
  </div>
);

// Shared tuition/exam/arrears + due-date fields grid, used by both the
// class-level FeeStructure form and the per-student override form —
// the two share an identical field shape on the backend.
const FeeAmountFields = ({ form, updateField }) => (
  <>
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Fee Amounts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Tuition Fee
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.tuition_fee}
            onChange={(e) => updateField('tuition_fee', e.target.value)}
            placeholder="5000"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Exam Fee
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.exam_fee}
            onChange={(e) => updateField('exam_fee', e.target.value)}
            placeholder="1000"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Arrears Amount
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.arrears_amount}
            onChange={(e) => updateField('arrears_amount', e.target.value)}
            placeholder="0"
            required
            className={inputClass}
          />
        </div>
      </div>
    </div>

    <hr className="border-gray-100" />

    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Due Date Handling
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Amount Within Due Date
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount_within_due_date}
            onChange={(e) => updateField('amount_within_due_date', e.target.value)}
            placeholder="6000"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Amount After Due Date
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount_after_due_date}
            onChange={(e) => updateField('amount_after_due_date', e.target.value)}
            placeholder="6500"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Due Day (1–28)
          </label>
          <input
            type="number"
            min="1"
            max="28"
            value={form.due_day}
            onChange={(e) => updateField('due_day', e.target.value)}
            placeholder="10"
            required
            className={inputClass}
          />
          <p className="text-gray-400 text-xs mt-1">
            Day of the month vouchers become due. Kept ≤28 so it's valid every month.
          </p>
        </div>
      </div>
    </div>
  </>
);

/* ============================================================
   SECTION 1 — Fee Structure
   ============================================================ */

const EMPTY_STRUCTURE_FORM = {
  tuition_fee: 0,
  exam_fee: 0,
  arrears_amount: 0,
  amount_within_due_date: 0 ,
  amount_after_due_date: 0,
  due_day: "10",
};

const ClassFeeStructureForm = ({ token, Classes }) => {
  const [studentClass, setStudentClass] = useState("");

  // Holds the id of the existing FeeStructure for the selected class,
  // if one exists. When set, submit does a PATCH instead of a POST —
  // the backend only allows one structure per class.
  const [structureId, setStructureId] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const [form, setForm] = useState(EMPTY_STRUCTURE_FORM);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Whenever the selected class changes, check if it already has a
  // fee structure. If so, load it into the form for editing (PATCH).
  // If not, reset the form to blank defaults (POST creates a new one).
  useEffect(() => {
    const fetchExisting = async () => {
      setCheckingExisting(true);
      try {
        const res = await api.get(`/fees/structures/?class_id=${studentClass}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const existing = res.data?.[0];
        if (existing) {
          setStructureId(existing.id);
          setForm({
            tuition_fee: String(existing.tuition_fee),
            exam_fee: String(existing.exam_fee),
            arrears_amount: String(existing.arrears_amount),
            amount_within_due_date: String(existing.amount_within_due_date),
            amount_after_due_date: String(existing.amount_after_due_date),
            due_day: String(existing.due_day),
          });
        } else {
          setStructureId(null);
          setForm(EMPTY_STRUCTURE_FORM);
        }
      } catch (err) {
        console.log(err);
        setStructureId(null);
        setForm(EMPTY_STRUCTURE_FORM);
      } finally {
        setCheckingExisting(false);
      }
    };

    setMessage({ type: "", text: "" });

    if (token && studentClass) {
      fetchExisting();
    } else {
      setStructureId(null);
      setForm(EMPTY_STRUCTURE_FORM);
    }
  }, [studentClass, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    const headers = { Authorization: `Bearer ${token}` };
    const payload = {
      student_class: studentClass,
      tuition_fee: form.tuition_fee,
      exam_fee: form.exam_fee,
      arrears_amount: form.arrears_amount,
      amount_within_due_date: form.amount_within_due_date,
      amount_after_due_date: form.amount_after_due_date,
      due_day: form.due_day,
    };

    try {
      if (structureId) {
        const res = await api.patch(`/fees/structures/${structureId}/`, payload, { headers });
        setMessage({ type: "success", text: "Fee structure updated successfully!" });
      } else {
        const res = await api.post("/fees/structures/", payload, { headers });
        setStructureId(res.data.id);
        setMessage({ type: "success", text: "Fee structure created successfully!" });
      }
    } catch (error) {
      console.error("Error saving fee structure:", error);
      const data = error.response?.data;
      const fieldError =
        data?.due_day?.[0] ||
        data?.non_field_errors?.[0] ||
        (typeof data === "string" ? data : null);

      setMessage({
        type: "error",
        text: fieldError || "Failed to save fee structure. Please check the values entered.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Set tuition, exam, and due-date amounts for a class. Vouchers generated for this class will use these values.
      </p>

      <Message message={message} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Class Selector */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Select Class
            </h3>
            <div className="flex flex-col max-w-sm">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Class / Grade
              </label>
              <select
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                required
                className={selectClass}
              >
                <option value="">Select Class</option>
                {Classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.display_name}</option>
                ))}
              </select>
              {checkingExisting && (
                <p className="text-xs text-gray-400 mt-1">Checking for an existing structure...</p>
              )}
              {!checkingExisting && studentClass && structureId && (
                <p className="text-xs text-[var(--primary)] mt-1">
                  Editing existing fee structure for this class.
                </p>
              )}
              {!checkingExisting && studentClass && !structureId && (
                <p className="text-xs text-gray-400 mt-1">
                  No fee structure yet — this will create a new one.
                </p>
              )}
            </div>
          </div>

          <hr className="border-gray-100" />

          <FeeAmountFields form={form} updateField={updateField} />

          {/* Submit Button */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading || !studentClass}
              className={primaryBtnClass}
            >
              {loading
                ? "Saving..."
                : structureId
                ? "Update Fee Structure"
                : "Create Fee Structure"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

// Search a student by GR No, then create/update/remove that one
// student's individual fee structure (StudentFeeOverride). This never
// touches the class's FeeStructure — deleting the override just
// reverts the student back to their class's structure.
const StudentFeeStructureForm = ({ token }) => {
  const [student, setStudent] = useState(null);
  const [searchMessage, setSearchMessage] = useState({ type: "", text: "" });

  const [overrideId, setOverrideId] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [form, setForm] = useState(EMPTY_STRUCTURE_FORM);

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Whenever a student is found, check if they already have an
  // individual override. If so, load it for editing (PUT). If not,
  // reset the form to blank defaults (PUT still creates it, per the
  // backend's upsert behavior).
  useEffect(() => {
    const fetchExisting = async () => {
      setCheckingExisting(true);
      try {
        const res = await api.get(`/fees/students/${student.id}/fee-override/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOverrideId(res.data.id);
        setForm({
          tuition_fee: String(res.data.tuition_fee),
          exam_fee: String(res.data.exam_fee),
          arrears_amount: String(res.data.arrears_amount),
          amount_within_due_date: String(res.data.amount_within_due_date),
          amount_after_due_date: String(res.data.amount_after_due_date),
          due_day: String(res.data.due_day),
        });
      } catch (err) {
        setOverrideId(null);
        setForm(EMPTY_STRUCTURE_FORM);
      } finally {
        setCheckingExisting(false);
      }
    };

    setMessage({ type: "", text: "" });

    if (token && student) {
      fetchExisting();
    } else {
      setOverrideId(null);
      setForm(EMPTY_STRUCTURE_FORM);
    }
  }, [student, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!student) return;
    setLoading(true);
    setMessage({ type: "", text: "" });

    const headers = { Authorization: `Bearer ${token}` };
    const payload = {
      tuition_fee: form.tuition_fee,
      exam_fee: form.exam_fee,
      arrears_amount: form.arrears_amount,
      amount_within_due_date: form.amount_within_due_date,
      amount_after_due_date: form.amount_after_due_date,
      due_day: form.due_day,
    };

    try {
      const res = await api.put(`/fees/students/${student.id}/fee-override/`, payload, { headers });
      setOverrideId(res.data.id);
      setMessage({
        type: "success",
        text: overrideId
          ? "Individual fee structure updated successfully!"
          : "Individual fee structure created successfully!",
      });
    } catch (error) {
      console.error("Error saving student fee override:", error);
      const data = error.response?.data;
      const fieldError =
        data?.due_day?.[0] ||
        data?.non_field_errors?.[0] ||
        (typeof data === "string" ? data : null);

      setMessage({
        type: "error",
        text: fieldError || "Failed to save individual fee structure. Please check the values entered.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOverride = async () => {
    if (!student || !overrideId) return;
    setDeleting(true);
    setMessage({ type: "", text: "" });

    try {
      await api.delete(`/fees/students/${student.id}/fee-override/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOverrideId(null);
      setForm(EMPTY_STRUCTURE_FORM);
      setMessage({
        type: "success",
        text: "Individual fee structure removed. This student now follows their class's fee structure again.",
      });
    } catch (error) {
      console.error("Error removing student fee override:", error);
      setMessage({ type: "error", text: "Failed to remove individual fee structure. Please try again." });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Search a student by GR No to set fee amounts just for them. When present, this takes priority over their class's fee structure whenever a voucher is generated for them.
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl mb-6">
        <StudentSearchBox
          token={token}
          onFound={(s) => {
            setStudent(s);
            setMessage({ type: "", text: "" });
          }}
          message={searchMessage}
          setMessage={setSearchMessage}
          hint="Search a student to set or edit their individual fee structure."
        />
      </div>

      <Message message={searchMessage} />

      {student && (
        <div className="space-y-4">
          <StudentSummaryCard student={student} />

          <Message message={message} />

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
            {checkingExisting ? (
              <p className="text-xs text-gray-400">Checking for an existing individual fee structure...</p>
            ) : (
              <>
                <p className={`text-xs mb-4 ${overrideId ? 'text-[var(--primary)]' : 'text-gray-400'}`}>
                  {overrideId
                    ? "This student has an individual fee structure. Editing below updates it."
                    : "No individual fee structure yet — this student currently follows their class's structure. Saving below will create one just for them."}
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <FeeAmountFields form={form} updateField={updateField} />

                  <div className="pt-4 flex justify-end gap-3">
                    {overrideId && (
                      <button
                        type="button"
                        onClick={handleRemoveOverride}
                        disabled={deleting}
                        className={secondaryBtnClass}
                      >
                        {deleting ? "Removing..." : "Remove Override (revert to class)"}
                      </button>
                    )}
                    <button type="submit" disabled={loading} className={primaryBtnClass}>
                      {loading ? "Saving..." : overrideId ? "Update Individual Structure" : "Create Individual Structure"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const FeeStructureSection = ({ token, Classes }) => {
  const [mode, setMode] = useState('class');

  return (
    <div>
      <ModeToggle value={mode} onChange={setMode} />
      {mode === 'class' ? (
        <ClassFeeStructureForm token={token} Classes={Classes} />
      ) : (
        <StudentFeeStructureForm token={token} />
      )}
    </div>
  );
};

/* ============================================================
   SECTION 2 — Generate Voucher
   ============================================================ */

const ClassGenerateVoucherForm = ({ token, Classes }) => {
  const [studentClass, setStudentClass] = useState("");

  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

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
      const text = await extractBlobErrorMessage(error, 'Failed to generate vouchers. Please try again.');
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Pick a class and month to generate (or re-download) that class's fee vouchers as a PDF.
      </p>

      <Message message={message} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
        <form onSubmit={handleGenerate} className="space-y-6">

          {/* Class Selector */}
          <Field label="Class">
            <select
              value={studentClass}
              onChange={(e) => setStudentClass(e.target.value)}
              required
              className={selectClass}
            >
              <option value="">Select Class</option>
              {Classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.display_name}</option>
              ))}
            </select>
          </Field>

          {/* Month + Year */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Month">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={selectClass}
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>
            </Field>

            <Field label="Year">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={String(today.getFullYear())}
                className={inputClass}
              />
            </Field>
          </div>

          <p className="text-gray-400 text-xs">
            Regenerating for the same class and month is safe — existing vouchers and challan numbers are reused, not duplicated. Pending vouchers are refreshed to each student's latest fee structure (individual override or class); already-paid vouchers are never changed.
          </p>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !studentClass}
              className={primaryBtnClass}
            >
              {loading ? "Generating..." : "Generate Vouchers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Search a student by GR No, pick a month/year, and generate that one
// student's voucher. The backend resolves their individual fee
// override first, falling back to their class's fee structure, and
// fails with a clear error if neither exists — no voucher gets created.
const StudentGenerateVoucherForm = ({ token }) => {
  const [student, setStudent] = useState(null);
  const [searchMessage, setSearchMessage] = useState({ type: "", text: "" });

  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!student) return;
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const params = new URLSearchParams();
      if (month) params.append('month', month);
      if (year) params.append('year', year);

      const res = await api.post(
        `/fees/generate/student/${student.id}/?${params.toString()}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');

      setMessage({ type: "success", text: "Voucher generated. Opening PDF in a new tab..." });
    } catch (error) {
      console.error("Error generating student voucher:", error);
      const text = await extractBlobErrorMessage(error, 'Failed to generate voucher. Please try again.');
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Search a student by GR No, pick a month, and generate their voucher. Their individual fee structure is used if they have one; otherwise their class's structure applies. If neither exists, generation is blocked.
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl mb-6">
        <StudentSearchBox
          token={token}
          onFound={(s) => {
            setStudent(s);
            setMessage({ type: "", text: "" });
          }}
          message={searchMessage}
          setMessage={setSearchMessage}
          hint="Search a student to generate a voucher just for them."
        />
      </div>

      <Message message={searchMessage} />

      {student && (
        <div className="space-y-4">
          <StudentSummaryCard student={student} />

          <Message message={message} />

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Month">
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className={selectClass}
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Year">
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder={String(today.getFullYear())}
                    className={inputClass}
                  />
                </Field>
              </div>

              <p className="text-gray-400 text-xs">
                Regenerating for the same student and month is safe — the existing voucher and challan number is reused, not duplicated. If it's still pending, its amounts are refreshed to the latest fee structure; a paid voucher is never changed.
              </p>

              <div className="flex justify-end">
                <button type="submit" disabled={loading} className={primaryBtnClass}>
                  {loading ? "Generating..." : "Generate Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const GenerateVoucherSection = ({ token, Classes }) => {
  const [mode, setMode] = useState('class');

  return (
    <div>
      <ModeToggle value={mode} onChange={setMode} />
      {mode === 'class' ? (
        <ClassGenerateVoucherForm token={token} Classes={Classes} />
      ) : (
        <StudentGenerateVoucherForm token={token} />
      )}
    </div>
  );
};

/* ============================================================
   SECTION 3 — Fee Reports (with its own inner tabs)
   ============================================================ */

const REPORT_TABS = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'paid', label: 'Paid Reports' },
  { key: 'defaulters', label: 'Defaulters' },
  { key: 'search', label: 'Student Search' },
];

const FeeReportsSection = ({ token, Classes }) => {
  const today = new Date();
  const [activeTab, setActiveTab] = useState('analytics');

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Analytics, collection history, defaulters, and per-student fee status — all in one place.
      </p>

      {/* Inner Tab Bar */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-2">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:text-[var(--quinary)] hover:border-[var(--primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <AnalyticsTab token={token} today={today} />
      )}
      {activeTab === 'paid' && (
        <PaidReportsTab token={token} today={today} />
      )}
      {activeTab === 'defaulters' && (
        <DefaultersTab token={token} today={today} Classes={Classes} />
      )}
      {activeTab === 'search' && (
        <StudentSearchTab token={token} />
      )}
    </div>
  );
};

/* ----------------------------- Analytics Tab ---------------------------- */

const AnalyticsTab = ({ token, today }) => {
  const [period, setPeriod] = useState('monthly');

  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [date, setDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [data, setData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setData(null);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      let res;
      if (period === 'monthly') {
        res = await api.get('/fees-report/analytics/', {
          headers,
          params: { month, year },
        });
      } else if (period === 'daily') {
        res = await api.get('/fees-report/analytics/daily/', {
          headers,
          params: { date },
        });
      } else {
        res = await api.get('/fees-report/analytics/weekly/', {
          headers,
          params: { date },
        });
      }
      setData(res.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setMessage({ type: 'error', text: 'Failed to load analytics. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          {period === 'monthly' && (
            <>
              <Field label="Month">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          {(period === 'daily' || period === 'weekly') && (
            <Field label={period === 'daily' ? 'Date' : 'Any date in the week'}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Analytics'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {data && period === 'monthly' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl">
          <StatCard label="Total Active Students" value={data.total_students} />
          <StatCard label="Paid" value={data.paid_count} accent="text-green-600" />
          <StatCard label="Unpaid" value={data.unpaid_count} accent="text-amber-600" />
          <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
          <StatCard label="Amount Pending" value={formatMoney(data.amount_pending)} accent="text-amber-600" />
        </div>
      )}

      {data && period === 'daily' && (
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <StatCard label={`Payments on ${formatDate(data.date)}`} value={data.paid_count} />
          <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
        </div>
      )}

      {data && period === 'weekly' && (
        <div className="space-y-3 max-w-2xl">
          <p className="text-sm text-gray-500">
            Week of {formatDate(data.week_start)} – {formatDate(data.week_end)}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Payments This Week" value={data.paid_count} />
            <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
          </div>
        </div>
      )}
    </div>
  );
};

/* --------------------------- Paid Reports Tab --------------------------- */

const PaidReportsTab = ({ token, today }) => {
  const [period, setPeriod] = useState('daily');

  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [date, setDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [rows, setRows] = useState([]);
  const [weekRange, setWeekRange] = useState(null);
  const [fetched, setFetched] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setWeekRange(null);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      let res;
      if (period === 'daily') {
        res = await api.get('/fee-submission/reports/daily/', { headers, params: { date } });
        setRows(res.data);
      } else if (period === 'weekly') {
        res = await api.get('/fee-submission/reports/weekly/', { headers, params: { date } });
        setRows(res.data.results || []);
        setWeekRange({ start: res.data.week_start, end: res.data.week_end });
      } else {
        res = await api.get('/fee-submission/reports/monthly/', { headers, params: { month, year } });
        setRows(res.data);
      }
      setFetched(true);
    } catch (error) {
      console.error('Error fetching paid reports:', error);
      setMessage({ type: 'error', text: 'Failed to load report. Please try again.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  return (
    <div className="space-y-6">
      <PeriodToggle value={period} onChange={setPeriod} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          {period === 'monthly' ? (
            <>
              <Field label="Month">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
              </Field>
            </>
          ) : (
            <Field label={period === 'daily' ? 'Date' : 'Any date in the week'}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
          )}

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Report'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {weekRange && (
        <p className="text-sm text-gray-500">
          Week of {formatDate(weekRange.start)} – {formatDate(weekRange.end)}
        </p>
      )}

      {fetched && rows.length === 0 && !loading && (
        <EmptyState text="No paid vouchers found for the selected period." />
      )}

      {rows.length > 0 && (
        <TableShell headers={['Challan No', 'GR No', 'Student', 'Class', 'Month/Year', 'Amount', 'Status', 'Paid At']}>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-3">{row.challan_no}</td>
              <td className="px-4 py-3">{row.gr_no}</td>
              <td className="px-4 py-3 font-medium">{row.student_name}</td>
              <td className="px-4 py-3">{row.class_name}</td>
              <td className="px-4 py-3">{MONTH_NAMES[row.month - 1]} {row.year}</td>
              <td className="px-4 py-3">{formatMoney(row.amount_within_due_date)}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-3 text-gray-500">{formatDateTime(row.paid_at)}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
};

/* ----------------------------- Defaulters Tab ---------------------------- */

const DefaultersTab = ({ token, today, Classes }) => {
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [classId, setClassId] = useState('');

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [rows, setRows] = useState([]);
  const [fetched, setFetched] = useState(false);

  const buildParams = () => {
    const params = { month, year };
    if (classId) params.class_id = classId;
    return params;
  };

  const fetchData = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.get('/fee-submission/reports/defaulters/', {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
      });
      setRows(res.data);
      setFetched(true);
    } catch (error) {
      console.error('Error fetching defaulters:', error);
      setMessage({ type: 'error', text: 'Failed to load defaulter list. Please try again.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api.get('/fee-submission/reports/defaulters/pdf/', {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
        responseType: 'blob',
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');
    } catch (error) {
      console.error('Error downloading defaulter PDF:', error);
      const text = await extractBlobErrorMessage(error, 'Failed to download the defaulter report PDF.');
      setMessage({ type: 'error', text });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form onSubmit={fetchData} className="flex flex-wrap items-end gap-4">
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Class (optional)">
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
              <option value="">All Classes</option>
              {Classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.display_name}</option>
              ))}
            </select>
          </Field>

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Defaulters'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className={secondaryBtnClass}
          >
            {downloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {fetched && rows.length === 0 && !loading && (
        <EmptyState text="No defaulters found — everyone in scope has paid for this month." />
      )}

      {rows.length > 0 && (
        <TableShell headers={['GR No', 'Name', 'Father Name', 'Class', 'Phone']}>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-3">{row.gr_no}</td>
              <td className="px-4 py-3 font-medium">{row.full_name}</td>
              <td className="px-4 py-3">{row.father_name}</td>
              <td className="px-4 py-3">{row.student_class?.display_name || row.student_class?.name || '—'}</td>
              <td className="px-4 py-3">{row.phone}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
};

/* --------------------------- Student Search Tab -------------------------- */

const StudentSearchTab = ({ token }) => {
  const [grNo, setGrNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [student, setStudent] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [reprintingId, setReprintingId] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!grNo.trim()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });
    setStudent(null);

    try {
      const res = await api.get(`/fee-submission/search/${encodeURIComponent(grNo.trim())}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudent(res.data);
    } catch (error) {
      console.error('Error searching student:', error);
      const status = error.response?.status;
      setMessage({
        type: 'error',
        text: status === 404 ? 'No student found with that GR No.' : 'Failed to search. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (voucher) => {
    // One-way: Pending -> Paid only. Once Paid, there's nothing to
    // toggle to, so this should never actually be called with a
    // Paid voucher (the button is hidden below) — this check just
    // makes that explicit rather than relying only on the UI.
    if (voucher.status === 'PAID') return;

    // Marking a voucher Paid is permanent (it can no longer be
    // reverted to Pending), so confirm with the exact student and
    // voucher details before committing — this is the admin's last
    // chance to catch a wrong voucher before it's locked in.
    const confirmResult = await Swal.fire({
      icon: 'warning',
      title: 'Mark this voucher as Paid?',
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.7;">
          <p><strong>Student:</strong> ${student.full_name}</p>
          <p><strong>GR No:</strong> ${student.gr_no}</p>
          <p><strong>Month/Year:</strong> ${MONTH_NAMES[voucher.month - 1]} ${voucher.year}</p>
          <p><strong>Challan No:</strong> ${voucher.challan_no}</p>
        </div>
        <p style="margin-top:12px;">Please verify these details are correct. Once marked Paid, this <strong>cannot be undone</strong>.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Yes, Mark as Paid',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1a3c5e',
      cancelButtonColor: '#7f8c8d',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    setUpdatingId(voucher.id);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.patch(
        `/fee-submission/vouchers/${voucher.id}/status/`,
        { status: 'PAID' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setStudent((prev) => ({
        ...prev,
        fee_vouchers: prev.fee_vouchers.map((v) =>
          v.id === voucher.id ? { ...v, ...res.data } : v
        ),
      }));
      setMessage({ type: 'success', text: `Voucher #${voucher.challan_no} marked as PAID.` });

      Swal.fire({
        icon: 'success',
        title: 'Marked as Paid',
        text: `Voucher #${voucher.challan_no} for ${student.full_name} is now marked Paid.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error updating voucher status:', error);
      const data = error.response?.data;
      const text = data?.error || 'Failed to update voucher status. Please try again.';
      setMessage({ type: 'error', text });
      Swal.fire({ icon: 'error', title: 'Failed', text });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReprint = async (voucher) => {
    setReprintingId(voucher.id);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.get(`/fees/vouchers/${voucher.id}/reprint/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');
    } catch (error) {
      console.error('Error reprinting voucher:', error);
      const status = error.response?.status;
      const text =
        status === 404
          ? 'That voucher no longer exists and cannot be reprinted.'
          : await extractBlobErrorMessage(error, 'Failed to reprint the voucher. Please try again.');
      setMessage({ type: 'error', text });
    } finally {
      setReprintingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
        <form onSubmit={handleSearch} className="flex items-end gap-4">
          <Field label="GR No" hint="Search a student to see and manage every month's voucher status.">
            <input
              type="text"
              value={grNo}
              onChange={(e) => setGrNo(e.target.value)}
              placeholder="e.g. 2021-045"
              required
              className={inputClass}
            />
          </Field>
          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {student && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">GR No</p>
              <p className="font-medium">{student.gr_no}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Name</p>
              <p className="font-medium">{student.full_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Father Name</p>
              <p className="font-medium">{student.father_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Class</p>
              <p className="font-medium">
                {student.student_class?.display_name || student.student_class?.name || '—'}
              </p>
            </div>
          </div>

          {student.fee_vouchers?.length === 0 ? (
            <EmptyState text="No fee vouchers have been generated for this student yet." />
          ) : (
            <TableShell headers={['Challan No', 'Month/Year', 'Due Date', 'Status', 'Paid At', 'Action']}>
              {student.fee_vouchers.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">{v.challan_no}</td>
                  <td className="px-4 py-3">{MONTH_NAMES[v.month - 1]} {v.year}</td>
                  <td className="px-4 py-3">{formatDate(v.due_date)}</td>
                  <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(v.paid_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {v.status === 'PAID' ? (
                        <span
                          className="text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-not-allowed"
                          title="Paid vouchers are locked and can't be reverted to Pending."
                        >
                          Paid &amp; Locked
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleStatus(v)}
                          disabled={updatingId === v.id}
                          className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)] hover:text-[var(--quinary)] disabled:opacity-50 cursor-pointer"
                        >
                          {updatingId === v.id ? 'Updating...' : 'Mark Paid'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReprint(v)}
                        disabled={reprintingId === v.id}
                        className="text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-[var(--quinary)] disabled:opacity-50 cursor-pointer"
                      >
                        {reprintingId === v.id ? 'Reprinting...' : 'Reprint'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   TOP-LEVEL — Fees (merges Structure + Voucher + Reports)
   ============================================================ */

const TOP_TABS = [
  { key: 'structure', label: 'Fee Structure' },
  { key: 'generate', label: 'Generate Voucher' },
  { key: 'reports', label: 'Fee Reports' },
];

const Fees = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [activeSection, setActiveSection] = useState('structure');

  // Classes are used by all three sections, so fetch once here instead
  // of once per section.
  const [Classes, setClasses] = useState([]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get('/classes/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClasses(res.data);
      } catch (err) {
        console.log(err);
      }
    };
    if (token) fetchClasses();
  }, [token]);

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
        Fees
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Define fee structures, generate vouchers, and review collection reports — all from one place.
      </p>

      {/* Top-level Tab Bar */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-3">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSection(tab.key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-colors cursor-pointer ${
              activeSection === tab.key
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:text-[var(--quinary)] hover:border-[var(--primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'structure' && (
        <FeeStructureSection token={token} Classes={Classes} />
      )}
      {activeSection === 'generate' && (
        <GenerateVoucherSection token={token} Classes={Classes} />
      )}
      {activeSection === 'reports' && (
        <FeeReportsSection token={token} Classes={Classes} />
      )}
    </div>
  );
};

export default Fees;