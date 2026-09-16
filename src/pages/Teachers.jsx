// SAEC Teacher Management

import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';
import Swal from "sweetalert2";

// Shared theming for every SweetAlert popup so they match the app's palette
const SWAL_THEME = {
  confirmButtonColor: "var(--primary)",
  cancelButtonColor: "var(--neutral-400)",
  background: "var(--secondary)",
  color: "var(--quinary)",
};

// DRF list endpoints may or may not be paginated depending on settings —
// this handles either shape safely.
const asList = (data) => (Array.isArray(data) ? data : data?.results || []);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const emptyTeacherForm = () => ({
  id: null,
  teacherId: "",
  fullName: "",
  fatherName: "",
  gender: "",
  address: "",
  phone: "",
  monthlySalary: "",
  isActive: true,
  subjectIds: [],
  username: "",
  email: "",
  password: "",
});

const emptyPayrollForm = () => ({
  id: null,
  teacher: "",
  month: String(CURRENT_MONTH),
  year: String(CURRENT_YEAR),
  basicSalary: "",
  bonus: "0",
  deduction: "0",
  status: "PENDING",
  paymentMethod: "",
  reference: "",
  notes: "",
});

const inputClass =
  "bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm";
const disabledInputClass =
  "border border-neutral-300 rounded-xl p-3 outline-none text-sm bg-neutral-100 text-neutral-500 cursor-not-allowed";
const labelClass = "text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1";
const filterLabelClass = "text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-1";

// Generates a sanitized username from full name + random 3-digit suffix
const generateUsername = (fullName) => {
  if (!fullName) return "";
  const sanitized = fullName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${sanitized}${randomSuffix}`;
};

const generateEmail = (fullName) => {
  if (!fullName) return "";
  const handle = fullName.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return `${handle}@gmail.com`;
};

const generatePassword = (length = 10) => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const Teachers = () => {
  const token = useAuthStore((state) => state.accessToken);
  const headers = { Authorization: `Bearer ${token}` };

  // ---------- Tabs ----------
  const [activeTab, setActiveTab] = useState("directory"); // "directory" | "payroll" | "summary"

  // ---------- Shared reference data ----------
  const [subjects, setSubjects] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]); // unfiltered — powers the Payroll teacher dropdown + Summary

  const fetchSubjects = async () => {
    try {
      const res = await api.get("/subjects/", { headers });
      setSubjects(asList(res.data));
    } catch (err) {
      console.error("Error fetching subjects:", err);
    }
  };

  const fetchAllTeachers = async () => {
    try {
      const res = await api.get("/teachers/", { headers });
      setAllTeachers(asList(res.data));
    } catch (err) {
      console.error("Error fetching teachers (unfiltered):", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSubjects();
      fetchAllTeachers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeTeacherOptions = useMemo(
    () => allTeachers.filter((t) => t.is_active),
    [allTeachers]
  );

  // Subjects grouped by their class — used to render the teacher form's subject picker
  const subjectsByClass = useMemo(() => {
    const groups = new Map();
    subjects.forEach((subj) => {
      const cls = subj.student_class;
      const key = cls?.id ?? "unassigned";
      const label = cls?.display_name || cls?.name || "Other Subjects";
      if (!groups.has(key)) groups.set(key, { label, subjects: [] });
      groups.get(key).subjects.push(subj);
    });
    return Array.from(groups.values());
  }, [subjects]);

  return (
    <div className="p-6 bg-secondary text-quinary min-h-screen font-sans">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight text-quinary">Teacher Management</div>
          <p className="text-neutral-500 text-sm mt-1">
            Manage teaching staff, run payroll, and keep an eye on the numbers.
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 bg-surface border border-neutral-200 rounded-xl p-1 mb-5 shadow-sm">
        {[
          { key: "directory", label: "Directory" },
          { key: "payroll", label: "Payroll" },
          { key: "summary", label: "Summary" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-primary text-white shadow-sm"
                : "text-neutral-500 hover:text-quinary hover:bg-neutral-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "directory" && (
        <DirectoryTab
          token={token}
          headers={headers}
          subjects={subjects}
          subjectsByClass={subjectsByClass}
          onTeachersChanged={fetchAllTeachers}
        />
      )}

      {activeTab === "payroll" && (
        <PayrollTab
          token={token}
          headers={headers}
          allTeachers={allTeachers}
          activeTeacherOptions={activeTeacherOptions}
        />
      )}

      {activeTab === "summary" && (
        <SummaryTab
          token={token}
          headers={headers}
          allTeachers={allTeachers}
        />
      )}
    </div>
  );
};

// =====================================================================
// DIRECTORY TAB — Teacher CRUD, search, filters
// =====================================================================
const DirectoryTab = ({ token, headers, subjects, subjectsByClass, onTeachersChanged }) => {
  const [mode, setMode] = useState("list"); // "list" | "form"

  const [teachers, setTeachers] = useState([]);
  const [fetching, setFetching] = useState(true);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState(""); // "", "true", "false"

  // Form state
  const [formData, setFormData] = useState(emptyTeacherForm());
  const [formLoading, setFormLoading] = useState(false);

  // Profile image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Row-level action loading
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  // Distinct classes derived from subjects — powers the class filter dropdown
  const classOptions = useMemo(() => {
    const map = new Map();
    subjects.forEach((subj) => {
      const cls = subj.student_class;
      if (cls?.id != null && !map.has(cls.id)) {
        map.set(cls.id, cls.display_name || cls.name);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [subjects]);

  // Subject filter options narrow to the selected class, mirroring the
  // class → section/group scoping pattern used elsewhere in the app.
  const subjectFilterOptions = useMemo(() => {
    if (!classFilter) return subjects;
    return subjects.filter((s) => String(s.student_class?.id) === String(classFilter));
  }, [subjects, classFilter]);

  useEffect(() => {
    // Changing the class filter invalidates a subject filter picked under the old class
    if (subjectFilter && !subjectFilterOptions.some((s) => String(s.id) === String(subjectFilter))) {
      setSubjectFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  // ---------- READ ----------
  const fetchTeachers = async () => {
    setFetching(true);
    try {
      const params = {};
      if (appliedSearch) params.search = appliedSearch;
      if (subjectFilter) params.subject_id = subjectFilter;
      if (classFilter) params.class_id = classFilter;
      if (activeFilter !== "") params.is_active = activeFilter;

      const res = await api.get("/teachers/", { headers, params });
      setTeachers(asList(res.data));
    } catch (err) {
      console.error("Error fetching teachers:", err);
      setMessage({ type: "error", text: "Failed to load teachers." });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, subjectFilter, classFilter, activeFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setSubjectFilter("");
    setClassFilter("");
    setActiveFilter("");
  };

  // ---------- PROFILE IMAGE ----------
  const clearImagePreview = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

    if (file.size > MAX_IMAGE_SIZE) {
      e.target.value = "";
      setImageFile(null);
      setMessage({ type: "error", text: "Profile picture must be 5 MB or smaller." });
      return;
    }

    setImageFile(file);
    setMessage({ type: "", text: "" });

    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
  };

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // ---------- FORM open/close ----------
  const openCreateForm = () => {
    setFormData(emptyTeacherForm());
    clearImagePreview();
    setMessage({ type: "", text: "" });
    setMode("form");
  };

  const openEditForm = async (teacher) => {
    setMessage({ type: "", text: "" });
    setMode("form");
    setFormLoading(true);
    try {
      const res = await api.get(`/teachers/${teacher.id}/`, { headers });
      const detail = res.data;

      setFormData({
        id: detail.id,
        teacherId: detail.teacher_id || "",
        fullName: detail.full_name || "",
        fatherName: detail.father_name || "",
        gender: detail.gender || "",
        address: detail.address || "",
        phone: detail.phone || "",
        monthlySalary: detail.monthly_salary != null ? String(detail.monthly_salary) : "",
        isActive: Boolean(detail.is_active),
        subjectIds: (detail.subjects || detail.subject_ids || []).map((s) =>
          typeof s === "object" ? s.id : s
        ),
        username: detail.username || "",
        email: detail.email || "",
        password: "",
      });

      setImageFile(null);
      setImagePreview(detail.image || null);
    } catch (err) {
      console.error("Error loading teacher for edit:", err);
      setMessage({ type: "error", text: "Failed to load teacher record." });
      setMode("list");
    } finally {
      setFormLoading(false);
    }
  };

  const cancelForm = () => {
    setFormData(emptyTeacherForm());
    clearImagePreview();
    setMode("list");
  };

  const toggleSubjectId = (subjectId) => {
    setFormData((prev) => {
      const exists = prev.subjectIds.includes(subjectId);
      return {
        ...prev,
        subjectIds: exists
          ? prev.subjectIds.filter((id) => id !== subjectId)
          : [...prev.subjectIds, subjectId],
      };
    });
  };

  // ---------- CREATE / UPDATE ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const isEdit = Boolean(formData.id);

    try {
      // Teacher has an ImageField on the backend, so use multipart/form-data.
      const payload = new FormData();

      payload.append("full_name", formData.fullName);
      payload.append("father_name", formData.fatherName);
      payload.append("gender", formData.gender);
      payload.append("address", formData.address);
      payload.append("phone", formData.phone);
      payload.append("monthly_salary", formData.monthlySalary);
      payload.append("is_active", formData.isActive ? "true" : "false");

      formData.subjectIds.forEach((id) => payload.append("subject_ids", id));
      if (formData.subjectIds.length === 0) {
        // Explicitly signal "no subjects" so the M2M gets cleared on update
        payload.append("subject_ids", "");
      }

      if (!isEdit) {
        payload.append("teacher_id", formData.teacherId);
        payload.append("username", formData.username);
        payload.append("email", formData.email);
        payload.append("password", formData.password);
      } else {
        if (formData.username) payload.append("username", formData.username);
        if (formData.email) payload.append("email", formData.email);
        if (formData.password) payload.append("password", formData.password);
      }

      if (imageFile) {
        payload.append("image", imageFile);
      }

      const multipartHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": undefined,
      };

      const res = isEdit
        ? await api.patch(`/teachers/${formData.id}/`, payload, { headers: multipartHeaders })
        : await api.post("/teachers/", payload, { headers: multipartHeaders });

      console.log(isEdit ? "Teacher Updated Successfully:" : "Teacher Added Successfully:", res.data);

      Swal.fire({
        title: "Success!",
        text: isEdit ? "Teacher profile updated successfully!" : "Teacher registered successfully!",
        icon: "success",
        confirmButtonText: "OK",
        ...SWAL_THEME,
      });

      await fetchTeachers();
      await onTeachersChanged?.();
      setFormData(emptyTeacherForm());
      clearImagePreview();
      setMode("list");
    } catch (error) {
      console.error(isEdit ? "Update Teacher Error!" : "Add Teacher Error!", error.response?.data);

      const errorData = error.response?.data;
      let errorMsg = isEdit
        ? "Failed to update teacher. Please check input field constraints."
        : "Failed to register teacher. Please check input field constraints.";

      if (errorData && typeof errorData === "object") {
        errorMsg = Object.entries(errorData)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(" ") : val}`)
          .join("\n");
      }

      setMessage({ type: "error", text: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  // ---------- DELETE ----------
  const handleDelete = async (teacher) => {
    const confirmResult = await Swal.fire({
      title: `Delete ${teacher.full_name}?`,
      text: `Teacher ID ${teacher.teacher_id} will be permanently removed. This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
      confirmButtonColor: "var(--danger)",
    });

    if (!confirmResult.isConfirmed) return;

    setDeletingId(teacher.id);
    try {
      await api.delete(`/teachers/${teacher.id}/`, { headers });
      Swal.fire({
        title: "Deleted",
        text: "Teacher record has been deleted.",
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchTeachers();
      await onTeachersChanged?.();
    } catch (error) {
      console.error("Delete Teacher Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text:
          error.response?.data?.detail ||
          "Failed to delete teacher. They may have linked payroll records.",
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- ACTIVATE / DEACTIVATE ----------
  const handleToggleActive = async (teacher) => {
    const activating = !teacher.is_active;

    const confirmResult = await Swal.fire({
      title: activating ? `Activate ${teacher.full_name}?` : `Deactivate ${teacher.full_name}?`,
      text: activating
        ? "This teacher will be marked active again."
        : "This teacher will be marked inactive. Their login is not deleted.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: activating ? "Activate" : "Deactivate",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
    });

    if (!confirmResult.isConfirmed) return;

    setTogglingId(teacher.id);
    try {
      await api.patch(`/teachers/${teacher.id}/`, { is_active: activating }, { headers });
      Swal.fire({
        title: "Done",
        text: `Teacher marked ${activating ? "active" : "inactive"}.`,
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchTeachers();
      await onTeachersChanged?.();
    } catch (error) {
      console.error("Toggle Active Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text: error.response?.data?.detail || "Failed to update teacher status.",
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      {mode === "list" && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={fetchTeachers}
            disabled={fetching}
            className="bg-surface hover:bg-neutral-50 disabled:opacity-50 text-quinary font-medium py-2.5 px-4 rounded-xl border border-neutral-300 transition-colors text-sm cursor-pointer"
          >
            {fetching ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-primary hover:bg-quinary text-white font-medium py-2.5 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
          >
            + New Teacher
          </button>
        </div>
      )}

      {/* Status Message */}
      {message.text && (
        <div
          className={`p-3 rounded-xl text-sm mb-6 whitespace-pre-line text-center border max-w-3xl ${
            message.type === "success"
              ? "bg-success/10 text-success border-success/20"
              : "bg-danger/10 text-danger border-danger/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === "form" ? (
        /* ---------------- CREATE / EDIT FORM ---------------- */
        <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6 max-w-3xl">
          <div className="text-lg font-semibold mb-4 text-quinary">
            {formData.id ? "Update Teacher" : "Register New Teacher"}
          </div>

          {formLoading ? (
            <div className="text-sm text-neutral-400 p-6 text-center">Loading teacher record...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section: Profile Picture */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Profile Picture
                </h3>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                  <div className="w-28 h-28 rounded-full border-4 border-neutral-100 bg-neutral-50 overflow-hidden flex items-center justify-center shadow-sm shrink-0">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Teacher profile preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <svg className="w-12 h-12 text-neutral-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.5c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="bg-surface hover:bg-neutral-50 text-quinary font-medium py-2 px-4 rounded-xl border border-neutral-300 transition-colors text-sm cursor-pointer inline-block w-fit">
                      Choose Photo
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={clearImagePreview}
                        className="text-xs font-semibold text-danger hover:underline cursor-pointer text-left"
                      >
                        Remove Photo
                      </button>
                    )}
                    <p className="text-neutral-400 text-xs">JPG or PNG, up to 5 MB.</p>
                  </div>
                </div>
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Personal Information */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className={labelClass}>Full Name</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFormData((prev) => {
                          if (!prev.id) {
                            const autoUsername = generateUsername(name);
                            const autoEmail = generateEmail(name);
                            const autoPassword = prev.password || generatePassword(10);
                            return {
                              ...prev,
                              fullName: name,
                              username: autoUsername,
                              email: autoEmail,
                              password: autoPassword,
                            };
                          }
                          return { ...prev, fullName: name };
                        });
                      }}
                      placeholder="Ayesha Malik"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Father Name</label>
                    <input
                      type="text"
                      value={formData.fatherName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, fatherName: e.target.value }))}
                      placeholder="Malik Tariq"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData((prev) => ({ ...prev, gender: e.target.value }))}
                      required
                      className={inputClass}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      maxLength={11}
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="03001234567"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col md:col-span-2">
                    <label className={labelClass}>Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="Block 4, Gulshan-e-Iqbal, Karachi"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Employment */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Employment
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className={labelClass}>Teacher ID</label>
                    <input
                      type="text"
                      value={formData.teacherId}
                      onChange={(e) => setFormData((prev) => ({ ...prev, teacherId: e.target.value }))}
                      placeholder="TCH-2026-001"
                      required
                      disabled={Boolean(formData.id)}
                      className={formData.id ? disabledInputClass : inputClass}
                    />
                    {formData.id && (
                      <p className="text-neutral-400 text-xs mt-1">Teacher ID cannot be changed after registration.</p>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Monthly Salary</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.monthlySalary}
                      onChange={(e) => setFormData((prev) => ({ ...prev, monthlySalary: e.target.value }))}
                      placeholder="45000"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 cursor-pointer select-none mt-2">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                      Active Teacher
                    </label>
                  </div>
                </div>
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Teaching Subjects */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Teaching Subjects
                </h3>
                {subjectsByClass.length === 0 ? (
                  <p className="text-xs text-neutral-400">No subjects available yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-neutral-200 rounded-xl p-4 space-y-4">
                    {subjectsByClass.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.subjects.map((subj) => {
                            const checked = formData.subjectIds.includes(subj.id);
                            return (
                              <label
                                key={subj.id}
                                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border cursor-pointer select-none transition-colors ${
                                  checked
                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                    : "bg-surface border-neutral-300 text-neutral-500 hover:border-neutral-400"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSubjectId(subj.id)}
                                  className="w-3.5 h-3.5 accent-primary cursor-pointer"
                                />
                                {subj.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Login Credentials */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">
                    Login Credentials
                  </h3>
                  {!formData.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const autoUsername = generateUsername(formData.fullName);
                        const autoEmail = generateEmail(formData.fullName);
                        const autoPassword = generatePassword(10);
                        setFormData((prev) => ({
                          ...prev,
                          username: autoUsername,
                          email: autoEmail,
                          password: autoPassword,
                        }));
                      }}
                      className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      ↻ Regenerate Credentials
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col">
                    <label className={labelClass}>Username</label>
                    <input
                      type="text"
                      value={formData.username || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                      disabled={Boolean(formData.id)}
                      placeholder="Auto-generated"
                      required={!formData.id}
                      className={formData.id ? disabledInputClass : inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Email Address</label>
                    <input
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="ayesha@gmail.com"
                      className={inputClass}
                    />
                  </div>

                  {!formData.id && (
                    <div className="flex flex-col">
                      <label className={labelClass}>System Password</label>
                      <input
                        type="text"
                        value={formData.password || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Auto-generated"
                        required
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  )}

                  {formData.id && (
                    <div className="flex flex-col">
                      <label className={labelClass}>New Password</label>
                      <input
                        type="text"
                        value={formData.password || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Leave blank to keep current password"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelForm}
                  disabled={saving}
                  className="bg-surface hover:bg-neutral-50 disabled:opacity-50 text-quinary font-medium py-3 px-6 rounded-xl border border-neutral-300 transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-quinary disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
                >
                  {saving
                    ? formData.id ? "Updating..." : "Registering..."
                    : formData.id ? "Update Teacher" : "Create Teacher Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* ---------------- LIST / READ VIEW ---------------- */
        <div>
          {/* Filter Bar */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 mb-5">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col flex-1 min-w-[220px]">
                <label className={filterLabelClass}>Search by Teacher ID / Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="e.g., TCH-2026-001"
                    className="flex-1 bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm placeholder-neutral-400"
                  />
                  <button
                    type="submit"
                    className="bg-primary hover:bg-quinary text-white font-medium px-4 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="flex flex-col min-w-[160px]">
                <label className={filterLabelClass}>Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Classes</option>
                  {classOptions.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[180px]">
                <label className={filterLabelClass}>Subject</label>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Subjects</option>
                  {subjectFilterOptions.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[140px]">
                <label className={filterLabelClass}>Status</label>
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-neutral-500 hover:text-quinary hover:underline cursor-pointer py-3"
              >
                Clear Filters
              </button>
            </form>
          </div>

          {/* Results Table */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {fetching ? (
              <div className="p-8 text-center text-neutral-400 text-sm">Loading teachers...</div>
            ) : teachers.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                No teachers found. Try adjusting your filters, or click "+ New Teacher" to register one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Teacher ID</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Full Name</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Father Name</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Gender</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Phone</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Subjects</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Salary</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Status</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher) => (
                      <tr key={teacher.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="p-3 font-medium text-quinary whitespace-nowrap">{teacher.teacher_id}</td>
                        <td className="p-3 text-quinary whitespace-nowrap">{teacher.full_name}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.father_name || "—"}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.gender || "—"}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.phone || "—"}</td>
                        <td className="p-3 text-neutral-500 max-w-[220px]">
                          {(teacher.subjects || []).length > 0
                            ? teacher.subjects.map((s) => (typeof s === "object" ? s.name : s)).join(", ")
                            : "—"}
                        </td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(teacher.monthly_salary)}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                              teacher.is_active
                                ? "bg-success/10 text-success border-success/20"
                                : "bg-danger/10 text-danger border-danger/20"
                            }`}
                          >
                            {teacher.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openEditForm(teacher)}
                              className="text-sm font-medium text-primary hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(teacher)}
                              disabled={togglingId === teacher.id}
                              className={`text-sm font-medium hover:underline cursor-pointer disabled:opacity-50 ${
                                teacher.is_active ? "text-warning" : "text-success"
                              }`}
                            >
                              {togglingId === teacher.id
                                ? "..."
                                : teacher.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(teacher)}
                              disabled={deletingId === teacher.id}
                              className="text-sm font-medium text-danger hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {deletingId === teacher.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// PAYROLL TAB — Payroll CRUD, search, filters, mark paid/pending
// =====================================================================
const PAYMENT_METHOD_LABELS = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

const PayrollTab = ({ token, headers, allTeachers, activeTeacherOptions }) => {
  const [mode, setMode] = useState("list"); // "list" | "form"

  const [records, setRecords] = useState([]);
  const [fetching, setFetching] = useState(true);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [ordering, setOrdering] = useState("");

  // Form
  const [formData, setFormData] = useState(emptyPayrollForm());
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [deletingId, setDeletingId] = useState(null);
  const [statusChangingId, setStatusChangingId] = useState(null);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR + 1; y >= CURRENT_YEAR - 4; y--) years.push(y);
    return years;
  }, []);

  // ---------- READ ----------
  const fetchRecords = async () => {
    setFetching(true);
    try {
      const params = {};
      if (appliedSearch) params.search = appliedSearch;
      if (teacherFilter) params.teacher = teacherFilter;
      if (monthFilter) params.month = monthFilter;
      if (yearFilter) params.year = yearFilter;
      if (statusFilter) params.status = statusFilter;
      if (methodFilter) params.payment_method = methodFilter;
      if (ordering) params.ordering = ordering;

      const res = await api.get("/payroll/", { headers, params });
      setRecords(asList(res.data));
    } catch (err) {
      console.error("Error fetching payroll:", err);
      setMessage({ type: "error", text: "Failed to load payroll records." });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, teacherFilter, monthFilter, yearFilter, statusFilter, methodFilter, ordering]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setTeacherFilter("");
    setMonthFilter("");
    setYearFilter("");
    setStatusFilter("");
    setMethodFilter("");
    setOrdering("");
  };

  // ---------- FORM open/close ----------
  const openCreateForm = () => {
    setFormData(emptyPayrollForm());
    setMessage({ type: "", text: "" });
    setMode("form");
  };

  const openEditForm = async (record) => {
    setMessage({ type: "", text: "" });
    setMode("form");
    setFormLoading(true);
    try {
      const res = await api.get(`/payroll/${record.id}/`, { headers });
      const detail = res.data;

      setFormData({
        id: detail.id,
        teacher: detail.teacher != null ? String(detail.teacher) : "",
        month: String(detail.month),
        year: String(detail.year),
        basicSalary: detail.basic_salary != null ? String(detail.basic_salary) : "",
        bonus: detail.bonus != null ? String(detail.bonus) : "0",
        deduction: detail.deduction != null ? String(detail.deduction) : "0",
        status: detail.status || "PENDING",
        paymentMethod: detail.payment_method || "",
        reference: detail.reference || "",
        notes: detail.notes || "",
      });
    } catch (err) {
      console.error("Error loading payroll record for edit:", err);
      setMessage({ type: "error", text: "Failed to load payroll record." });
      setMode("list");
    } finally {
      setFormLoading(false);
    }
  };

  const cancelForm = () => {
    setFormData(emptyPayrollForm());
    setMode("list");
  };

  const netSalaryPreview =
    (parseFloat(formData.basicSalary) || 0) +
    (parseFloat(formData.bonus) || 0) -
    (parseFloat(formData.deduction) || 0);

  const handleTeacherSelect = (teacherId) => {
    setFormData((prev) => {
      const next = { ...prev, teacher: teacherId };
      if (!prev.id && !prev.basicSalary) {
        const selected = allTeachers.find((t) => String(t.id) === String(teacherId));
        if (selected?.monthly_salary != null) {
          next.basicSalary = String(selected.monthly_salary);
        }
      }
      return next;
    });
  };

  // ---------- CREATE / UPDATE ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const isEdit = Boolean(formData.id);

    const payload = {
      teacher: formData.teacher,
      month: Number(formData.month),
      year: Number(formData.year),
      basic_salary: formData.basicSalary,
      bonus: formData.bonus || "0",
      deduction: formData.deduction || "0",
      status: formData.status,
      payment_method: formData.paymentMethod,
      reference: formData.reference,
      notes: formData.notes,
    };

    try {
      const res = isEdit
        ? await api.patch(`/payroll/${formData.id}/`, payload, { headers })
        : await api.post("/payroll/", payload, { headers });

      console.log(isEdit ? "Payroll Updated Successfully:" : "Payroll Created Successfully:", res.data);

      Swal.fire({
        title: "Success!",
        text: isEdit ? "Payroll record updated successfully!" : "Payroll record created successfully!",
        icon: "success",
        confirmButtonText: "OK",
        ...SWAL_THEME,
      });

      await fetchRecords();
      setFormData(emptyPayrollForm());
      setMode("list");
    } catch (error) {
      console.error(isEdit ? "Update Payroll Error!" : "Add Payroll Error!", error.response?.data);

      const errorData = error.response?.data;
      let errorMsg = isEdit
        ? "Failed to update payroll record. Please check input field constraints."
        : "Failed to create payroll record. Please check input field constraints.";

      if (errorData && typeof errorData === "object") {
        errorMsg = Object.entries(errorData)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(" ") : val}`)
          .join("\n");
      }

      setMessage({ type: "error", text: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  // ---------- DELETE ----------
  const handleDelete = async (record) => {
    const confirmResult = await Swal.fire({
      title: `Delete this payroll record?`,
      text: `${record.teacher_name} — ${MONTH_NAMES[record.month - 1]} ${record.year} will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
      confirmButtonColor: "var(--danger)",
    });

    if (!confirmResult.isConfirmed) return;

    setDeletingId(record.id);
    try {
      await api.delete(`/payroll/${record.id}/`, { headers });
      Swal.fire({
        title: "Deleted",
        text: "Payroll record has been deleted.",
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchRecords();
    } catch (error) {
      console.error("Delete Payroll Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text: error.response?.data?.detail || "Failed to delete payroll record.",
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- MARK PAID / PENDING ----------
  const handleStatusChange = async (record, newStatus) => {
    const marking = newStatus === "PAID";

    const confirmResult = await Swal.fire({
      title: marking ? "Mark this payroll as Paid?" : "Mark this payroll as Pending?",
      text: marking
        ? "The payment date will be recorded as now."
        : "This will clear the recorded payment date.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: marking ? "Mark Paid" : "Mark Pending",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
    });

    if (!confirmResult.isConfirmed) return;

    setStatusChangingId(record.id);
    try {
      await api.patch(`/payroll/${record.id}/`, { status: newStatus }, { headers });
      Swal.fire({
        title: "Done",
        text: `Payroll marked ${marking ? "Paid" : "Pending"}.`,
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchRecords();
    } catch (error) {
      console.error("Status Change Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text: error.response?.data?.detail || "Failed to update payroll status.",
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setStatusChangingId(null);
    }
  };

  return (
    <div>
      {mode === "list" && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={fetchRecords}
            disabled={fetching}
            className="bg-surface hover:bg-neutral-50 disabled:opacity-50 text-quinary font-medium py-2.5 px-4 rounded-xl border border-neutral-300 transition-colors text-sm cursor-pointer"
          >
            {fetching ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-primary hover:bg-quinary text-white font-medium py-2.5 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
          >
            + New Payroll Record
          </button>
        </div>
      )}

      {message.text && (
        <div
          className={`p-3 rounded-xl text-sm mb-6 whitespace-pre-line text-center border max-w-3xl ${
            message.type === "success"
              ? "bg-success/10 text-success border-success/20"
              : "bg-danger/10 text-danger border-danger/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === "form" ? (
        /* ---------------- CREATE / EDIT FORM ---------------- */
        <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6 max-w-2xl">
          <div className="text-lg font-semibold mb-4 text-quinary">
            {formData.id ? "Update Payroll Record" : "New Payroll Record"}
          </div>

          {formLoading ? (
            <div className="text-sm text-neutral-400 p-6 text-center">Loading payroll record...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section: Period */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Teacher &amp; Pay Period
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col md:col-span-1">
                    <label className={labelClass}>Teacher</label>
                    <select
                      value={formData.teacher}
                      onChange={(e) => handleTeacherSelect(e.target.value)}
                      required
                      disabled={Boolean(formData.id)}
                      className={formData.id ? disabledInputClass : inputClass}
                    >
                      <option value="">Select Teacher</option>
                      {allTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.teacher_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Month</label>
                    <select
                      value={formData.month}
                      onChange={(e) => setFormData((prev) => ({ ...prev, month: e.target.value }))}
                      required
                      disabled={Boolean(formData.id)}
                      className={formData.id ? disabledInputClass : inputClass}
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={name} value={idx + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Year</label>
                    <input
                      type="number"
                      min="2000"
                      value={formData.year}
                      onChange={(e) => setFormData((prev) => ({ ...prev, year: e.target.value }))}
                      required
                      disabled={Boolean(formData.id)}
                      className={formData.id ? disabledInputClass : inputClass}
                    />
                  </div>
                </div>
                {formData.id && (
                  <p className="text-neutral-400 text-xs mt-2">
                    Teacher and pay period cannot be changed after creation — delete and re-create the record instead.
                  </p>
                )}
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Amounts */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Amounts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col">
                    <label className={labelClass}>Basic Salary</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.basicSalary}
                      onChange={(e) => setFormData((prev) => ({ ...prev, basicSalary: e.target.value }))}
                      placeholder="45000"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Bonus</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.bonus}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bonus: e.target.value }))}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Deduction</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.deduction}
                      onChange={(e) => setFormData((prev) => ({ ...prev, deduction: e.target.value }))}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between bg-secondary rounded-xl p-4 border border-neutral-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Net Salary (auto-calculated)
                  </span>
                  <span className="text-lg font-bold text-quinary">{formatCurrency(netSalaryPreview)}</span>
                </div>
              </div>

              <hr className="border-neutral-100" />

              {/* Section: Payment Status */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Payment Status
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className={labelClass}>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Payment Method</label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">Not Specified</option>
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Reference</label>
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
                      placeholder="Cheque / transaction no."
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className={labelClass}>Notes</label>
                    <input
                      type="text"
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Optional notes"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelForm}
                  disabled={saving}
                  className="bg-surface hover:bg-neutral-50 disabled:opacity-50 text-quinary font-medium py-3 px-6 rounded-xl border border-neutral-300 transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-quinary disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
                >
                  {saving
                    ? formData.id ? "Updating..." : "Saving..."
                    : formData.id ? "Update Record" : "Create Record"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* ---------------- LIST / READ VIEW ---------------- */
        <div>
          {/* Filter Bar */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 mb-5">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col flex-1 min-w-[200px]">
                <label className={filterLabelClass}>Search by Teacher</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Name or Teacher ID"
                    className="flex-1 bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm placeholder-neutral-400"
                  />
                  <button
                    type="submit"
                    className="bg-primary hover:bg-quinary text-white font-medium px-4 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="flex flex-col min-w-[180px]">
                <label className={filterLabelClass}>Teacher</label>
                <select
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Teachers</option>
                  {allTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[140px]">
                <label className={filterLabelClass}>Month</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Months</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[110px]">
                <label className={filterLabelClass}>Year</label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Years</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[140px]">
                <label className={filterLabelClass}>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>

              <div className="flex flex-col min-w-[160px]">
                <label className={filterLabelClass}>Payment Method</label>
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Methods</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="flex flex-col min-w-[170px]">
                <label className={filterLabelClass}>Sort By</label>
                <select
                  value={ordering}
                  onChange={(e) => setOrdering(e.target.value)}
                  className="bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
                >
                  <option value="">Newest Period First</option>
                  <option value="-net_salary">Net Salary (High → Low)</option>
                  <option value="net_salary">Net Salary (Low → High)</option>
                  <option value="teacher__full_name">Teacher Name (A → Z)</option>
                  <option value="status">Status</option>
                </select>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-neutral-500 hover:text-quinary hover:underline cursor-pointer py-3"
              >
                Clear Filters
              </button>
            </form>
          </div>

          {/* Results Table */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {fetching ? (
              <div className="p-8 text-center text-neutral-400 text-sm">Loading payroll records...</div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                No payroll records found. Try adjusting your filters, or click "+ New Payroll Record" to add one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Teacher</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Period</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Basic</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Bonus</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Deduction</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Net Salary</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Method</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Status</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="p-3 text-quinary whitespace-nowrap">
                          <div className="font-medium">{record.teacher_name}</div>
                          <div className="text-xs text-neutral-400">{record.teacher_id}</div>
                        </td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">
                          {MONTH_NAMES[record.month - 1]} {record.year}
                        </td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(record.basic_salary)}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(record.bonus)}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(record.deduction)}</td>
                        <td className="p-3 text-quinary font-semibold whitespace-nowrap">{formatCurrency(record.net_salary)}</td>
                        <td className="p-3 text-neutral-500 whitespace-nowrap">
                          {PAYMENT_METHOD_LABELS[record.payment_method] || "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                              record.status === "PAID"
                                ? "bg-success/10 text-success border-success/20"
                                : "bg-warning/10 text-warning border-warning/20"
                            }`}
                          >
                            {record.status === "PAID" ? "Paid" : "Pending"}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openEditForm(record)}
                              className="text-sm font-medium text-primary hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStatusChange(record, record.status === "PAID" ? "PENDING" : "PAID")
                              }
                              disabled={statusChangingId === record.id}
                              className={`text-sm font-medium hover:underline cursor-pointer disabled:opacity-50 ${
                                record.status === "PAID" ? "text-warning" : "text-success"
                              }`}
                            >
                              {statusChangingId === record.id
                                ? "..."
                                : record.status === "PAID" ? "Mark Pending" : "Mark Paid"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              disabled={deletingId === record.id}
                              className="text-sm font-medium text-danger hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {deletingId === record.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// SUMMARY TAB — quick counts + current-month payroll snapshot
// =====================================================================
const SummaryTab = ({ token, headers, allTeachers }) => {
  const [monthPayroll, setMonthPayroll] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);

  const fetchMonthPayroll = async (m, y) => {
    setFetching(true);
    try {
      const res = await api.get("/payroll/", { headers, params: { month: m, year: y } });
      setMonthPayroll(asList(res.data));
    } catch (err) {
      console.error("Error fetching summary payroll:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchMonthPayroll(month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, month, year]);

  const totalTeachers = allTeachers.length;
  const activeTeachers = allTeachers.filter((t) => t.is_active).length;
  const inactiveTeachers = totalTeachers - activeTeachers;
  const monthlySalaryBudget = allTeachers
    .filter((t) => t.is_active)
    .reduce((sum, t) => sum + Number(t.monthly_salary || 0), 0);

  const genderBreakdown = allTeachers.reduce(
    (acc, t) => {
      if (t.gender === "Male") acc.male += 1;
      else if (t.gender === "Female") acc.female += 1;
      return acc;
    },
    { male: 0, female: 0 }
  );

  const paidRecords = monthPayroll.filter((r) => r.status === "PAID");
  const pendingRecords = monthPayroll.filter((r) => r.status === "PENDING");
  const paidAmount = paidRecords.reduce((sum, r) => sum + Number(r.net_salary || 0), 0);
  const pendingAmount = pendingRecords.reduce((sum, r) => sum + Number(r.net_salary || 0), 0);
  const totalNetForMonth = paidAmount + pendingAmount;
  const teachersWithoutPayroll = Math.max(totalTeachers - monthPayroll.length, 0);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR + 1; y >= CURRENT_YEAR - 4; y--) years.push(y);
    return years;
  }, []);

  const StatCard = ({ label, value, sublabel, accent }) => (
    <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <span className={`text-2xl font-bold ${accent || "text-quinary"}`}>{value}</span>
      {sublabel && <span className="text-xs text-neutral-400">{sublabel}</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Staff Overview */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">Staff Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Teachers" value={totalTeachers} />
          <StatCard label="Active" value={activeTeachers} accent="text-success" />
          <StatCard label="Inactive" value={inactiveTeachers} accent="text-danger" />
          <StatCard
            label="Monthly Salary Budget"
            value={formatCurrency(monthlySalaryBudget)}
            sublabel="Sum of active teachers' salaries"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <StatCard label="Male Teachers" value={genderBreakdown.male} />
          <StatCard label="Female Teachers" value={genderBreakdown.female} />
        </div>
      </div>

      {/* Payroll Snapshot */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Payroll Snapshot</h3>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-surface text-quinary border border-neutral-300 rounded-xl p-2 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-surface text-quinary border border-neutral-300 rounded-xl p-2 outline-none focus:border-primary transition-colors text-sm cursor-pointer"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {fetching ? (
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-8 text-center text-neutral-400 text-sm">
            Loading payroll snapshot...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Paid"
                value={paidRecords.length}
                sublabel={formatCurrency(paidAmount)}
                accent="text-success"
              />
              <StatCard
                label="Pending"
                value={pendingRecords.length}
                sublabel={formatCurrency(pendingAmount)}
                accent="text-warning"
              />
              <StatCard label="Total Net Payroll" value={formatCurrency(totalNetForMonth)} />
              <StatCard
                label="Teachers Without a Record"
                value={teachersWithoutPayroll}
                sublabel="For the selected period"
                accent={teachersWithoutPayroll > 0 ? "text-danger" : "text-quinary"}
              />
            </div>

            {monthPayroll.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-8 text-center text-neutral-400 text-sm mt-4">
                No payroll records exist for {MONTH_NAMES[month - 1]} {year} yet.
              </div>
            ) : (
              <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary text-left">
                        <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Teacher</th>
                        <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Net Salary</th>
                        <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthPayroll.map((record) => (
                        <tr key={record.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3 text-quinary whitespace-nowrap">{record.teacher_name}</td>
                          <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(record.net_salary)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                                record.status === "PAID"
                                  ? "bg-success/10 text-success border-success/20"
                                  : "bg-warning/10 text-warning border-warning/20"
                              }`}
                            >
                              {record.status === "PAID" ? "Paid" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Teachers;