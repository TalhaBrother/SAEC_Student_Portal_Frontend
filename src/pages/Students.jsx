// SAEC Student Portal

import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';
import Swal from "sweetalert2";

// Shared theming for every SweetAlert popup so they match the app's palette
const SWAL_THEME = {
  confirmButtonColor: "#0056D2", // --primary
  cancelButtonColor: "#94A3B8",
  background: "#F4F7FC",         // --secondary
  color: "#1A253C",              // --quinary
};

const emptyForm = () => ({
  id: null,
  fullName: "",
  fatherName: "",
  studentId: "",
  studentClass: "",
  section: "",
  group: "",
  phone: "",
  gender: "",
  residence: "",
  studentWhatsappNo: "",
  username: "",
  email: "",
  password: "",
});

// DRF list endpoints may or may not be paginated depending on settings —
// this handles either shape safely.
const asList = (data) => (Array.isArray(data) ? data : data?.results || []);

const Students = () => {
  const token = useAuthStore((state) => state.accessToken);
  const headers = { Authorization: `Bearer ${token}` };

  const [mode, setMode] = useState("list"); // "list" | "form"

  // Master class list (with nested sections & groups) — powers form dropdowns AND filters
  const [classes, setClasses] = useState([]);

  // Student list + fetch state
  const [students, setStudents] = useState([]);
  const [fetching, setFetching] = useState(true);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [frozenFilter, setFrozenFilter] = useState(""); // "", "true", "false"

  // Form state
  const [formData, setFormData] = useState(emptyForm());
  const [formLoading, setFormLoading] = useState(false); // loading the detail record for edit
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Row-level action loading
  const [deletingId, setDeletingId] = useState(null);
  const [statusChangingId, setStatusChangingId] = useState(null);

  // ---------- Load classes (with nested sections/groups) once ----------
  const fetchClasses = async () => {
    try {
      const res = await api.get("/classes/", { headers });
      setClasses(asList(res.data));
    } catch (err) {
      console.error("Error fetching classes:", err);
    }
  };

  useEffect(() => {
    if (token) fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------- READ: fetch students whenever a filter changes ----------
  const fetchStudents = async () => {
    setFetching(true);
    try {
      const params = {};
      if (appliedSearch) params.search = appliedSearch;
      if (classFilter) params.class_id = classFilter;
      if (sectionFilter) params.section_id = sectionFilter;
      if (groupFilter) params.group_id = groupFilter;
      if (frozenFilter !== "") params.is_frozen = frozenFilter;

      const res = await api.get("/students/", { headers, params });
      setStudents(asList(res.data));
    } catch (err) {
      console.error("Error fetching students:", err);
      setMessage({ type: "error", text: "Failed to load students." });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, classFilter, sectionFilter, groupFilter, frozenFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setClassFilter("");
    setSectionFilter("");
    setGroupFilter("");
    setFrozenFilter("");
  };

  // Sections/groups scoped to whichever class is picked in the FILTER bar
  const filterClassObj = classes.find((c) => String(c.id) === String(classFilter));
  const filterSections = filterClassObj?.sections || [];
  const filterGroups = filterClassObj?.groups || [];

  useEffect(() => {
    // Changing the class filter invalidates any section/group filter picked under the old class
    setSectionFilter("");
    setGroupFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  // Sections/groups scoped to whichever class is picked in the create/edit FORM
  const formClassObj = classes.find((c) => String(c.id) === String(formData.studentClass));
  const formSections = formClassObj?.sections || [];
  const formGroups = formClassObj?.groups || [];

  // ---------- FORM open/close ----------
  const openCreateForm = () => {
    setFormData(emptyForm());
    setMessage({ type: "", text: "" });
    setMode("form");
  };

  const openEditForm = async (student) => {
    setMessage({ type: "", text: "" });
    setMode("form");
    setFormLoading(true);
    try {
      // The list row uses the lightweight serializer (no email/is_active) —
      // pull the full detail record so the edit form has everything.
      const res = await api.get(`/students/${student.id}/`, { headers });
      const detail = res.data;

      setFormData({
        id: detail.id,
        fullName: detail.full_name || "",
        fatherName: detail.father_name || "",
        studentId: detail.gr_no || detail.student_id || "",
        studentClass: detail.student_class?.id ? String(detail.student_class.id) : "",
        section: detail.section?.id ? String(detail.section.id) : "",
        group: detail.group?.id ? String(detail.group.id) : "",
        phone: detail.phone || "",
        gender: detail.gender || "",
        residence: detail.residence || "",
        studentWhatsappNo: detail.student_whatsapp_no || "",
        username: detail.username || "",
        email: detail.email || "",
        password: "",
      });
    } catch (err) {
      console.error("Error loading student for edit:", err);
      setMessage({ type: "error", text: "Failed to load student record." });
      setMode("list");
    } finally {
      setFormLoading(false);
    }
  };

  const cancelForm = () => {
    setFormData(emptyForm());
    setMode("list");
  };

  // ---------- CREATE / UPDATE ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const isEdit = Boolean(formData.id);

    try {
      let res;

      if (isEdit) {
        const payload = {
          full_name: formData.fullName,
          father_name: formData.fatherName,
          student_class: formData.studentClass,
          phone: formData.phone,
          gender: formData.gender,
          residence: formData.residence,
          student_whatsapp_no: formData.studentWhatsappNo,
        };
        if (formSections.length > 0 && formData.section) payload.section = formData.section;
        if (formGroups.length > 0 && formData.group) payload.group = formData.group;
        if (formData.email) payload.email = formData.email;

        res = await api.patch(`/students/${formData.id}/`, payload, { headers });
      } else {
        const payload = {
          full_name: formData.fullName,
          father_name: formData.fatherName,
          student_id: formData.studentId,
          student_class: formData.studentClass,
          phone: formData.phone,
          gender: formData.gender,
          residence: formData.residence,
          student_whatsapp_no: formData.studentWhatsappNo,
          username: formData.username,
          email: formData.email,
          password: formData.password,
        };
        if (formSections.length > 0 && formData.section) payload.section = formData.section;
        if (formGroups.length > 0 && formData.group) payload.group = formData.group;

        res = await api.post("/students/", payload, { headers });
      }

      console.log(isEdit ? "Student Updated Successfully:" : "Student Added Successfully:", res.data);

      Swal.fire({
        title: "Success!",
        text: isEdit
          ? "Student profile updated successfully!"
          : "Student profile registered successfully!",
        icon: "success",
        confirmButtonText: "OK",
        ...SWAL_THEME,
      });

      await fetchStudents();
      setFormData(emptyForm());
      setMode("list");
    } catch (error) {
      console.error(isEdit ? "Update Student Error!" : "Add Student Error!", error.response?.data);

      const errorData = error.response?.data;
      let errorMsg = isEdit
        ? "Failed to update student. Please check input field constraints."
        : "Failed to register student. Please check input field constraints.";

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
  const handleDelete = async (student) => {
    const confirmResult = await Swal.fire({
      title: `Delete ${student.full_name}?`,
      text: `GR No ${student.gr_no || student.student_id} will be permanently removed. This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
      confirmButtonColor: "#DC2626",
    });

    if (!confirmResult.isConfirmed) return;

    setDeletingId(student.id);
    try {
      await api.delete(`/students/${student.id}/`, { headers });
      Swal.fire({
        title: "Deleted",
        text: "Student record has been deleted.",
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchStudents();
    } catch (error) {
      console.error("Delete Student Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text: error.response?.data?.detail || "Failed to delete student.",
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- FREEZE / ACTIVATE ----------
  const handleToggleStatus = async (student) => {
    const freezing = !student.is_frozen;
    const action = freezing ? "freeze" : "activate";

    const confirmResult = await Swal.fire({
      title: freezing
        ? `Freeze ${student.full_name}'s account?`
        : `Activate ${student.full_name}'s account?`,
      text: freezing
        ? "The student will not be able to access the portal until reactivated."
        : "The student will regain access to the portal.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: freezing ? "Freeze" : "Activate",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
    });

    if (!confirmResult.isConfirmed) return;

    setStatusChangingId(student.id);
    try {
      const res = await api.patch(`/students/${student.id}/${action}/`, {}, { headers });
      Swal.fire({
        title: "Done",
        text: res.data?.message || `Account ${action}d successfully.`,
        icon: "success",
        ...SWAL_THEME,
      });
      await fetchStudents();
    } catch (error) {
      console.error(`${action} Student Error!`, error.response?.data);
      Swal.fire({
        title: "Error",
        text: error.response?.data?.detail || `Failed to ${action} account.`,
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setStatusChangingId(null);
    }
  };

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Students</div>
          <p className="text-gray-500 text-sm mt-1">
            Register, search, filter, update, and manage student accounts.
          </p>
        </div>

        {mode === "list" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchStudents}
              disabled={fetching}
              className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
            >
              {fetching ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-2.5 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
            >
              + New Student
            </button>
          </div>
        )}
      </div>

      {/* Status Message Display */}
      {message.text && (
        <div
          className={`p-3 rounded-xl text-sm mb-6 whitespace-pre-line text-center border max-w-3xl ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === "form" ? (
        /* ---------------- CREATE / EDIT FORM ---------------- */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
          <div className="text-lg font-semibold mb-4 text-[var(--quinary)]">
            {formData.id ? "Update Student" : "Register New Student"}
          </div>

          {formLoading ? (
            <div className="text-sm text-gray-400 p-6 text-center">Loading student record...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section: Personal Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                      placeholder="Shayan Khan"
                      required
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Father Name
                    </label>
                    <input
                      type="text"
                      value={formData.fatherName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, fatherName: e.target.value }))}
                      placeholder="Shafat Khan"
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Gender
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData((prev) => ({ ...prev, gender: e.target.value }))}
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Residence Address
                    </label>
                    <input
                      type="text"
                      value={formData.residence}
                      onChange={(e) => setFormData((prev) => ({ ...prev, residence: e.target.value }))}
                      placeholder="Block 13, Gulshan-e-Iqbal, Karachi"
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Parent WhatsApp No
                    </label>
                    <input
                      type="tel"
                      maxLength={11}
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="03001234567"
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                    {formData.phone.length > 0 && formData.phone.length < 11 && (
                      <span className="text-xs text-red-500 mt-1 font-medium">
                        Phone number must be exactly 11 digits ({formData.phone.length}/11)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Student WhatsApp No
                    </label>
                    <input
                      type="tel"
                      maxLength={11}
                      value={formData.studentWhatsappNo}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, studentWhatsappNo: e.target.value }))
                      }
                      placeholder="03007654321"
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                    {formData.studentWhatsappNo.length > 0 && formData.studentWhatsappNo.length < 11 && (
                      <span className="text-xs text-red-500 mt-1 font-medium">
                        Phone number must be exactly 11 digits ({formData.studentWhatsappNo.length}/11)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Section: Academic Placement */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Academic Placement
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      GR No / Student ID
                    </label>
                    <input
                      type="text"
                      value={formData.studentId}
                      onChange={(e) => setFormData((prev) => ({ ...prev, studentId: e.target.value }))}
                      placeholder="STU-2026-001"
                      required
                      disabled={Boolean(formData.id)}
                      className={`border border-gray-300 rounded-xl p-3 outline-none transition-colors text-sm ${
                        formData.id
                          ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                          : "bg-white text-[var(--quinary)] focus:border-[var(--primary)]"
                      }`}
                    />
                    {formData.id && (
                      <p className="text-gray-400 text-xs mt-1">GR No cannot be changed after registration.</p>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Class / Grade Assigned
                    </label>
                    <select
                      value={formData.studentClass}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, studentClass: e.target.value, section: "", group: "" }))
                      }
                      required
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    >
                      <option value="">Select Class</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Section is conditional: only shown when the selected class has sections defined */}
                  {formData.studentClass && formSections.length > 0 && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                        Section
                      </label>
                      <select
                        value={formData.section}
                        onChange={(e) => setFormData((prev) => ({ ...prev, section: e.target.value }))}
                        required
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                      >
                        <option value="">Select Section</option>
                        {formSections.map((sec) => (
                          <option key={sec.id} value={sec.id}>
                            {sec.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Group is conditional: only shown when the selected class has groups defined */}
                  {formData.studentClass && formGroups.length > 0 && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                        Group
                      </label>
                      <select
                        value={formData.group}
                        onChange={(e) => setFormData((prev) => ({ ...prev, group: e.target.value }))}
                        required
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                      >
                        <option value="">Select Group</option>
                        {formGroups.map((grp) => (
                          <option key={grp.id} value={grp.id}>
                            {grp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Section: Portal Account Credentials */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Portal Account Credentials
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Username: shown always, but only editable at creation — the backend has no way to change it after */}
                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Username
                    </label>
                    {formData.id ? (
                      <input
                        type="text"
                        value={formData.username}
                        disabled
                        className="bg-gray-100 text-gray-500 border border-gray-300 rounded-xl p-3 outline-none text-sm cursor-not-allowed"
                      />
                    ) : (
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                        placeholder="shayankhan123"
                        required
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                      />
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="shayan@gmail.com"
                      className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                    />
                  </div>

                  {/* Password: creation only — backend has no password-reset field on update */}
                  {!formData.id && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                        System Password
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="••••••••"
                        required
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
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
                  className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-3 px-6 rounded-xl border border-gray-300 transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
                >
                  {saving
                    ? formData.id
                      ? "Updating..."
                      : "Registering..."
                    : formData.id
                    ? "Update Student"
                    : "Create Student Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* ---------------- LIST / READ VIEW ---------------- */
        <div>
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
              {/* Search by GR No / Name */}
              <div className="flex flex-col flex-1 min-w-[220px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Search by GR No / Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="e.g., STU-2026-001"
                    className="flex-1 bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                  />
                  <button
                    type="submit"
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium px-4 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              </div>

              {/* Class filter */}
              <div className="flex flex-col min-w-[160px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Class
                </label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Classes</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section filter — scoped to the selected class */}
              <div className="flex flex-col min-w-[150px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Section
                </label>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  disabled={!classFilter || filterSections.length === 0}
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {classFilter ? "All Sections" : "Select a class first"}
                  </option>
                  {filterSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Group filter — scoped to the selected class */}
              <div className="flex flex-col min-w-[150px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Group
                </label>
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  disabled={!classFilter || filterGroups.length === 0}
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {classFilter ? "All Groups" : "Select a class first"}
                  </option>
                  {filterGroups.map((grp) => (
                    <option key={grp.id} value={grp.id}>
                      {grp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div className="flex flex-col min-w-[140px]">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  Status
                </label>
                <select
                  value={frozenFilter}
                  onChange={(e) => setFrozenFilter(e.target.value)}
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="false">Active</option>
                  <option value="true">Frozen</option>
                </select>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-gray-500 hover:text-[var(--quinary)] hover:underline cursor-pointer py-3"
              >
                Clear Filters
              </button>
            </form>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {fetching ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading students...</div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No students found. Try adjusting your filters, or click "+ New Student" to register one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--secondary)] text-left">
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">GR No</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Full Name</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Father Name</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Class</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Section</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Group</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Parent WhatsApp</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Status</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase text-xs tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-medium text-[var(--quinary)] whitespace-nowrap">
                          {student.gr_no || student.student_id}
                        </td>
                        <td className="p-3 text-[var(--quinary)] whitespace-nowrap">{student.full_name}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">{student.father_name || "—"}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">
                          {student.student_class?.display_name || "—"}
                        </td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">{student.section?.name || "—"}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">{student.group?.name || "—"}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">
                          {student.parent_whatsapp_no || student.phone || "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                              student.is_frozen
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-green-50 text-green-700 border-green-200"
                            }`}
                          >
                            {student.is_frozen ? "Frozen" : "Active"}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openEditForm(student)}
                              className="text-sm font-medium text-[var(--primary)] hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(student)}
                              disabled={statusChangingId === student.id}
                              className={`text-sm font-medium hover:underline cursor-pointer disabled:opacity-50 ${
                                student.is_frozen ? "text-green-600" : "text-amber-600"
                              }`}
                            >
                              {statusChangingId === student.id
                                ? "..."
                                : student.is_frozen
                                ? "Activate"
                                : "Freeze"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(student)}
                              disabled={deletingId === student.id}
                              className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                            >
                              {deletingId === student.id ? "Deleting..." : "Delete"}
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

export default Students;