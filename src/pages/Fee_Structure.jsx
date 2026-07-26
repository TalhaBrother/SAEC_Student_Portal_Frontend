import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const EMPTY_FORM = {
  tuition_fee: "",
  exam_fee: "",
  arrears_amount: "",
  amount_within_due_date: "",
  amount_after_due_date: "",
  due_day: "10",
};

const Fee_Structure = () => {
  const token = useAuthStore((state) => state.accessToken);

  const [Classes, setClasses] = useState([]);
  const [studentClass, setStudentClass] = useState("");

  // Holds the id of the existing FeeStructure for the selected class,
  // if one exists. When set, submit does a PATCH instead of a POST —
  // the backend only allows one structure per class.
  const [structureId, setStructureId] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

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
          setForm(EMPTY_FORM);
        }
      } catch (err) {
        console.log(err);
        setStructureId(null);
        setForm(EMPTY_FORM);
      } finally {
        setCheckingExisting(false);
      }
    };

    setMessage({ type: "", text: "" });

    if (token && studentClass) {
      fetchExisting();
    } else {
      setStructureId(null);
      setForm(EMPTY_FORM);
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
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
        Fee Structure
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Set tuition, exam, and due-date amounts for a class. Vouchers generated for this class will use these values.
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
                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
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

          {/* Fee Amounts */}
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Due Date Handling */}
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
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
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Day of the month vouchers become due. Kept ≤28 so it's valid every month.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading || !studentClass}
              className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
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

export default Fee_Structure;