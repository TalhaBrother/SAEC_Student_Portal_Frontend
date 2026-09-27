// SAEC ID Cards — Students & Teachers
//
// One screen, two tabs. Each tab gives full CRUD over its records (the
// data the cards are generated from) plus every ID-card PDF endpoint the
// backend exposes. Out of scope on purpose (separate modules, unrelated
// to card content): Class/Section/Group management, Teaching Assignments,
// Teacher Attendance, Admission Report.
//
// STUDENTS talks to:
//   GET    /students/                        -> list (search + board/class/section/group/is_frozen filters)
//   POST   /students/                        -> create (+ linked user account)
//   GET    /students/<id>/                   -> full detail (used to prefill the edit form)
//   PATCH  /students/<id>/                   -> update
//   DELETE /students/<id>/                   -> delete (also deletes the linked user)
//   PATCH  /students/<id>/freeze/            -> freeze account
//   PATCH  /students/<id>/activate/          -> unfreeze account
//   GET    /classes/                         -> classes, each with nested sections[] and groups[]
//   GET    /students/<id>/id-card/           -> single student ID card PDF
//   GET    /students/id-cards/               -> bulk PDF, every student (backend takes no filters)
//   GET    /students/id-cards/class/<id>/    -> bulk PDF, one class only
//
// TEACHERS talks to:
//   GET    /teachers/                        -> list (search + is_active/class/subject/section/group filters + ordering)
//   POST   /teachers/                        -> create (+ linked user account)
//   GET    /teachers/<id>/                   -> full detail (used to prefill the edit form)
//   PATCH  /teachers/<id>/                   -> update (also used for the Active/Inactive toggle)
//   DELETE /teachers/<id>/                   -> delete
//   GET    /teachers/<id>/assignments/       -> fallback when list response omits assignments (for display only)
//   GET    /subjects/                        -> subject catalog, for filters
//   GET    /teachers/<id>/id-card/           -> single teacher ID card PDF
//   GET    /teachers/id-cards/               -> bulk PDF, every ACTIVE teacher (backend takes no filters)

import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";
import Swal from "sweetalert2";

/* ==================================================================== */
/*  Shared helpers (used by both the Student and Teacher panels)        */
/* ==================================================================== */

const SWAL_THEME = {
  confirmButtonColor: "var(--primary)",
  cancelButtonColor: "var(--neutral-400)",
  background: "var(--secondary)",
  color: "var(--quinary)",
};

// DRF list endpoints may or may not be paginated depending on settings —
// this handles either shape safely.
const asList = (data) => (Array.isArray(data) ? data : data?.results || []);

// Follows DRF pagination (`next` links) so we always get the full list,
// whether or not pagination is enabled on the backend.
const fetchAll = async (url, config = {}) => {
  const first = await api.get(url, config);
  if (Array.isArray(first.data)) return first.data;

  let items = first.data?.results || [];
  let next = first.data?.next;
  let guard = 0; // safety net against a misbehaving `next` chain
  while (next && guard < 100) {
    const res = await api.get(next, { headers: config.headers });
    items = items.concat(res.data?.results || []);
    next = res.data?.next;
    guard += 1;
  }
  return items;
};

// Pulls a readable message out of a failed axios call. The ID card
// endpoints return PDFs on success, so a failed request comes back as a
// Blob (since responseType was set to "blob") instead of JSON.
async function extractErrorMessage(err) {
  try {
    const data = err?.response?.data;
    if (data instanceof Blob) {
      const text = await data.text();
      try {
        const parsed = JSON.parse(text);
        return parsed.error || parsed.detail || text || "Request failed.";
      } catch {
        return text || "Request failed.";
      }
    }
    if (!data) {
      return err?.message === "Network Error" ? "Could not reach the server." : "Something went wrong.";
    }
    if (typeof data === "string") {
      return data.length > 300 ? `Something went wrong (server error ${err.response.status}).` : data;
    }
    return data.error || data.detail || Object.values(data).flat().join(" ") || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

// Pulls field-level validation errors out of a failed JSON response, e.g.
// { section: ["This class has sections defined..."] } -> used to show
// inline errors under the right input instead of just a generic toast.
function extractFieldErrors(err) {
  const data = err?.response?.data;
  if (!data || data instanceof Blob || typeof data === "string") return {};
  const { detail, error, non_field_errors, ...rest } = data;
  return rest;
}

function toast(icon, text, title) {
  Swal.fire({
    title: title || (icon === "success" ? "Success!" : icon === "error" ? "Error" : "Heads up"),
    text,
    icon,
    confirmButtonText: "OK",
    ...SWAL_THEME,
  });
}

async function confirmDialog({ title, text }) {
  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes, continue",
    cancelButtonText: "Cancel",
    ...SWAL_THEME,
  });
  return result.isConfirmed;
}

// Opens a blank tab immediately (so popup blockers don't swallow it), then
// swaps in the PDF blob once the request resolves. Falls back to a
// same-tab download if the popup was blocked anyway.
async function openPdf(url, { headers, filenameHint }) {
  const printWindow = window.open("", "_blank");
  try {
    const res = await api.get(url, { headers, responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);

    if (printWindow && !printWindow.closed) {
      printWindow.location.href = objectUrl;
    } else {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filenameHint || "id-card.pdf";
      link.click();
    }

    // Keep the blob alive long enough for the PDF viewer/download to load it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    if (printWindow && !printWindow.closed) printWindow.close();
    throw err;
  }
}

const inputClass =
  "bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm w-full";
const labelClass = "text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1";
const primaryBtn =
  "bg-primary hover:bg-quinary disabled:opacity-50 text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer shadow-md transform active:scale-[0.98]";
const ghostBtn =
  "border border-neutral-300 text-neutral-500 font-medium py-3 px-5 rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50";

const GENDER_CHOICES = ["Male", "Female"];
const BOARD_CHOICES = [
  { value: "Sindh", label: "Sindh Board" },
  { value: "AKG", label: "Aga Khan Board" },
  { value: "O-Levels", label: "O-Levels" },
];

function FieldError({ error }) {
  if (!error) return null;
  const msg = Array.isArray(error) ? error.join(" ") : String(error);
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-surface text-quinary rounded-2xl shadow-2xl w-full ${
          wide ? "max-w-3xl" : "max-w-xl"
        } max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-200 sticky top-0 bg-surface z-10">
          <div>
            <h3 className="text-lg font-bold text-quinary">{title}</h3>
            {subtitle && <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-quinary text-2xl leading-none cursor-pointer px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3 sticky bottom-0 bg-surface">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function ImagePicker({ file, existingUrl, onChange, label }) {
  const previewUrl = useMemo(() => {
    if (file instanceof File) return URL.createObjectURL(file);
    return existingUrl || null;
  }, [file, existingUrl]);

  useEffect(() => {
    return () => {
      if (file instanceof File && previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  return (
    <div className="flex flex-col">
      <label className={labelClass}>{label || "Photo"}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Photo</span>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="text-xs text-neutral-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer cursor-pointer"
        />
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  STUDENTS                                                             */
/* ==================================================================== */

const emptyStudentForm = {
  username: "",
  password: "",
  email: "",
  full_name: "",
  father_name: "",
  student_id: "",
  student_class: "",
  section: "",
  group: "",
  phone: "",
  gender: "",
  residence: "",
  student_whatsapp_no: "",
  image: null,
};

function StudentPanel({ headers, token }) {
  // ---------- Reference data ----------
  const [classes, setClasses] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const classList = await fetchAll("/classes/", { headers });
      setClasses(classList);
    } catch (err) {
      console.error("Error fetching classes:", err);
      toast("error", await extractErrorMessage(err));
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (token) fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const classById = useMemo(() => new Map(classes.map((c) => [String(c.id), c])), [classes]);

  // ---------- List + filters ----------
  const [students, setStudents] = useState([]);
  const [fetching, setFetching] = useState(true);
  const fetchSeq = useRef(0);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | frozen

  const classFilterOptions = useMemo(() => {
    if (!boardFilter) return classes;
    return classes.filter((c) => c.board === boardFilter);
  }, [classes, boardFilter]);

  const sectionFilterOptions = useMemo(() => {
    const cls = classById.get(String(classFilter));
    return cls?.sections || [];
  }, [classById, classFilter]);

  const groupFilterOptions = useMemo(() => {
    const cls = classById.get(String(classFilter));
    return cls?.groups || [];
  }, [classById, classFilter]);

  useEffect(() => {
    if (classFilter && !classFilterOptions.some((c) => String(c.id) === String(classFilter))) {
      setClassFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardFilter]);

  useEffect(() => {
    if (sectionFilter && !sectionFilterOptions.some((s) => String(s.id) === String(sectionFilter))) {
      setSectionFilter("");
    }
    if (groupFilter && !groupFilterOptions.some((g) => String(g.id) === String(groupFilter))) {
      setGroupFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  const fetchStudents = async () => {
    const seq = ++fetchSeq.current;
    setFetching(true);
    try {
      const params = {};
      if (appliedSearch) params.search = appliedSearch;
      if (boardFilter) params.board = boardFilter;
      if (classFilter) params.class_id = classFilter;
      if (sectionFilter) params.section_id = sectionFilter;
      if (groupFilter) params.group_id = groupFilter;
      if (statusFilter !== "all") params.is_frozen = statusFilter === "frozen";

      const list = await fetchAll("/students/", { headers, params });
      if (seq === fetchSeq.current) setStudents(list);
    } catch (err) {
      console.error("Error fetching students:", err);
      if (seq === fetchSeq.current) toast("error", await extractErrorMessage(err));
    } finally {
      if (seq === fetchSeq.current) setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, boardFilter, classFilter, sectionFilter, groupFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setBoardFilter("");
    setClassFilter("");
    setSectionFilter("");
    setGroupFilter("");
    setStatusFilter("all");
  };

  // ---------- Create / Edit modal ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [modalLoading, setModalLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [formData, setFormData] = useState(emptyStudentForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const formClass = useMemo(() => classById.get(String(formData.student_class)), [classById, formData.student_class]);
  const formHasSections = (formClass?.sections || []).length > 0;
  const formHasGroups = (formClass?.groups || []).length > 0;

  useEffect(() => {
    if (formData.section && !(formClass?.sections || []).some((s) => String(s.id) === String(formData.section))) {
      setField("section", "");
    }
    if (formData.group && !(formClass?.groups || []).some((g) => String(g.id) === String(formData.group))) {
      setField("group", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.student_class]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingId(null);
    setFormData(emptyStudentForm);
    setExistingImageUrl(null);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = async (student) => {
    setModalMode("edit");
    setEditingId(student.id);
    setFormErrors({});
    setModalOpen(true);
    setModalLoading(true);
    try {
      // The list serializer omits username/email — fetch the full detail
      // record so the edit form is prefilled accurately.
      const res = await api.get(`/students/${student.id}/`, { headers });
      const detail = res.data;
      setFormData({
        ...emptyStudentForm,
        email: detail.email || "",
        full_name: detail.full_name || "",
        father_name: detail.father_name || "",
        student_id: detail.student_id || detail.gr_no || "",
        student_class: detail.student_class?.id ? String(detail.student_class.id) : "",
        section: detail.section?.id ? String(detail.section.id) : "",
        group: detail.group?.id ? String(detail.group.id) : "",
        phone: detail.phone || "",
        gender: detail.gender || "",
        residence: detail.residence || "",
        student_whatsapp_no: detail.student_whatsapp_no || "",
        image: null,
      });
      setExistingImageUrl(detail.image || null);
    } catch (err) {
      toast("error", await extractErrorMessage(err));
      setModalOpen(false);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    setSaving(true);
    try {
      const fd = new FormData();

      if (modalMode === "create") {
        fd.append("username", formData.username);
        fd.append("password", formData.password);
        if (formData.email) fd.append("email", formData.email);
        fd.append("student_id", formData.student_id);
      } else if (formData.email) {
        fd.append("email", formData.email);
      }

      fd.append("full_name", formData.full_name);
      fd.append("father_name", formData.father_name || "");
      fd.append("student_class", formData.student_class);
      if (formData.section) fd.append("section", formData.section);
      if (formData.group) fd.append("group", formData.group);
      fd.append("phone", formData.phone || "");
      fd.append("gender", formData.gender || "");
      fd.append("residence", formData.residence || "");
      fd.append("student_whatsapp_no", formData.student_whatsapp_no || "");
      if (formData.image instanceof File) fd.append("image", formData.image);

      let res;
      if (modalMode === "create") {
        res = await api.post("/students/", fd, { headers });
      } else {
        res = await api.patch(`/students/${editingId}/`, fd, { headers });
      }

      toast("success", `${res.data.full_name} ${modalMode === "create" ? "added" : "updated"} successfully.`);
      closeModal();
      fetchStudents();
    } catch (err) {
      const fieldErrs = extractFieldErrors(err);
      if (Object.keys(fieldErrs).length) {
        setFormErrors(fieldErrs);
      } else {
        toast("error", await extractErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Row actions: freeze/activate, delete ----------
  const [rowActionId, setRowActionId] = useState(null);

  const handleFreezeToggle = async (student) => {
    const endpoint = student.is_frozen ? "activate" : "freeze";
    setRowActionId(student.id);
    try {
      const res = await api.patch(`/students/${student.id}/${endpoint}/`, {}, { headers });
      toast("success", res.data.message);
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_frozen: !s.is_frozen } : s))
      );
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowActionId(null);
    }
  };

  const handleDelete = async (student) => {
    const ok = await confirmDialog({
      title: `Delete ${student.full_name}?`,
      text: "This permanently removes the student and their login account. This cannot be undone.",
    });
    if (!ok) return;

    setRowActionId(student.id);
    try {
      await api.delete(`/students/${student.id}/`, { headers });
      toast("success", "Student deleted successfully.");
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowActionId(null);
    }
  };

  // ---------- ID card generation ----------
  const [rowBusyId, setRowBusyId] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [classBulkId, setClassBulkId] = useState("");
  const [classBulkLoading, setClassBulkLoading] = useState(false);

  const generateSingleCard = async (student) => {
    setRowBusyId(student.id);
    try {
      await openPdf(`/students/${student.id}/id-card/`, {
        headers,
        filenameHint: `student_id_card_${student.student_id}.pdf`,
      });
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowBusyId(null);
    }
  };

  const generateAllCards = async () => {
    setBulkLoading(true);
    try {
      await openPdf(`/students/id-cards/`, { headers, filenameHint: "student_id_cards_all.pdf" });
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setBulkLoading(false);
    }
  };

  const generateClassCards = async () => {
    if (!classBulkId) {
      toast("error", "Pick a class first.");
      return;
    }
    setClassBulkLoading(true);
    try {
      await openPdf(`/students/id-cards/class/${classBulkId}/`, {
        headers,
        filenameHint: `class_${classBulkId}_student_id_cards.pdf`,
      });
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setClassBulkLoading(false);
    }
  };

  const classDisplay = (student) => {
    const parts = [student.student_class?.display_name || student.student_class?.name];
    if (student.section?.name) parts.push(`Sec ${student.section.name}`);
    if (student.group?.name) parts.push(student.group.name);
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight text-quinary">Student ID Cards</div>
          <p className="text-neutral-500 text-sm mt-1">
            Manage student records and generate printable ID cards.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button type="button" onClick={openCreateModal} className={primaryBtn}>
            + Add Student
          </button>
          <button type="button" onClick={generateAllCards} disabled={bulkLoading} className={primaryBtn}>
            {bulkLoading ? "Generating..." : "Generate All Students' ID Cards"}
          </button>
        </div>
      </div>

      {/* Class-scoped bulk generation */}
      <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col min-w-[220px]">
          <label className={labelClass}>Generate ID Cards For One Class</label>
          <select value={classBulkId} onChange={(e) => setClassBulkId(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="">Select a class...</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.display_name || cls.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={generateClassCards} disabled={classBulkLoading} className={ghostBtn}>
          {classBulkLoading ? "Generating..." : "Generate Class ID Cards"}
        </button>
        <span className="text-[11px] text-neutral-400">
          "Generate All" always includes every student — this generates one class only.
        </span>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleSearchSubmit}
        className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col min-w-[220px] flex-1">
          <label className={labelClass}>Search</label>
          <input
            type="text"
            placeholder="Name or GR No..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col min-w-[150px]">
          <label className={labelClass}>Board</label>
          <select value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="">All boards</option>
            {BOARD_CHOICES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[170px]">
          <label className={labelClass}>Class</label>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="">All classes</option>
            {classFilterOptions.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.display_name || cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[150px]">
          <label className={labelClass}>Section</label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            disabled={!classFilter}
            className={`${inputClass} cursor-pointer disabled:opacity-50`}
          >
            <option value="">All sections</option>
            {sectionFilterOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[150px]">
          <label className={labelClass}>Group</label>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            disabled={!classFilter}
            className={`${inputClass} cursor-pointer disabled:opacity-50`}
          >
            <option value="">All groups</option>
            {groupFilterOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[140px]">
          <label className={labelClass}>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="all">All students</option>
            <option value="active">Active only</option>
            <option value="frozen">Frozen only</option>
          </select>
        </div>

        <button type="submit" className="bg-primary hover:bg-quinary text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer">
          Search
        </button>
        <button type="button" onClick={clearFilters} className={ghostBtn}>
          Clear
        </button>
      </form>

      {/* List */}
      <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm">
        {fetching || loadingCatalog ? (
          <div className="text-center py-10 text-neutral-400 text-sm">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-10 text-neutral-400 text-sm">No students match these filters.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {students.map((student) => (
              <div key={student.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
                    {student.image ? (
                      <img src={student.image} alt={student.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Photo</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-base text-quinary truncate flex items-center gap-2">
                      {student.full_name}
                      {student.is_frozen && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          Frozen
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">
                      GR {student.gr_no || student.student_id}
                      {student.gender ? ` · ${student.gender}` : ""}
                      {student.parent_whatsapp_no || student.phone ? ` · ${student.parent_whatsapp_no || student.phone}` : ""}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">{classDisplay(student)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(student)}
                    className="border border-primary text-primary font-medium py-2 px-3 rounded-xl hover:bg-primary/10 transition-colors cursor-pointer text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFreezeToggle(student)}
                    disabled={rowActionId === student.id}
                    className="border border-amber-500 text-amber-600 font-medium py-2 px-3 rounded-xl hover:bg-amber-50 transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    {student.is_frozen ? "Activate" : "Freeze"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(student)}
                    disabled={rowActionId === student.id}
                    className="border border-red-500 text-red-600 font-medium py-2 px-3 rounded-xl hover:bg-red-50 transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => generateSingleCard(student)}
                    disabled={rowBusyId === student.id}
                    className="bg-primary hover:bg-quinary text-white font-medium py-2 px-3 rounded-xl transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    {rowBusyId === student.id ? "Generating..." : "Generate ID Card"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <Modal
          title={modalMode === "create" ? "Add Student" : "Edit Student"}
          subtitle={modalMode === "edit" ? `GR No: ${formData.student_id}` : undefined}
          onClose={closeModal}
          wide
          footer={
            <>
              <button type="button" onClick={closeModal} className={ghostBtn}>
                Cancel
              </button>
              <button type="submit" form="student-form" disabled={saving} className={primaryBtn}>
                {saving ? "Saving..." : modalMode === "create" ? "Add Student" : "Save Changes"}
              </button>
            </>
          }
        >
          {modalLoading ? (
            <div className="text-center py-10 text-neutral-400 text-sm">Loading...</div>
          ) : (
            <form id="student-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {modalMode === "create" && (
                <>
                  <div className="flex flex-col">
                    <label className={labelClass}>Username *</label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setField("username", e.target.value)}
                      className={inputClass}
                    />
                    <FieldError error={formErrors.username} />
                  </div>
                  <div className="flex flex-col">
                    <label className={labelClass}>Password *</label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setField("password", e.target.value)}
                      className={inputClass}
                    />
                    <FieldError error={formErrors.password} />
                  </div>
                  <div className="flex flex-col">
                    <label className={labelClass}>GR No (Student ID) *</label>
                    <input
                      type="text"
                      required
                      value={formData.student_id}
                      onChange={(e) => setField("student_id", e.target.value)}
                      className={inputClass}
                    />
                    <FieldError error={formErrors.student_id} />
                  </div>
                </>
              )}

              <div className="flex flex-col">
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.email} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.full_name} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Father Name</label>
                <input
                  type="text"
                  value={formData.father_name}
                  onChange={(e) => setField("father_name", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.father_name} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Class *</label>
                <select
                  required
                  value={formData.student_class}
                  onChange={(e) => setField("student_class", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Select class...</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.display_name || cls.name}
                    </option>
                  ))}
                </select>
                <FieldError error={formErrors.student_class} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>
                  Section {formHasSections ? "*" : "(not used by this class)"}
                </label>
                <select
                  value={formData.section}
                  onChange={(e) => setField("section", e.target.value)}
                  disabled={!formHasSections}
                  required={formHasSections}
                  className={`${inputClass} cursor-pointer disabled:opacity-50`}
                >
                  <option value="">{formHasSections ? "Select section..." : "Not applicable"}</option>
                  {(formClass?.sections || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <FieldError error={formErrors.section} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Group {formHasGroups ? "*" : "(not used by this class)"}</label>
                <select
                  value={formData.group}
                  onChange={(e) => setField("group", e.target.value)}
                  disabled={!formHasGroups}
                  required={formHasGroups}
                  className={`${inputClass} cursor-pointer disabled:opacity-50`}
                >
                  <option value="">{formHasGroups ? "Select group..." : "Not applicable"}</option>
                  {(formClass?.groups || []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <FieldError error={formErrors.group} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setField("gender", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Select...</option>
                  {GENDER_CHOICES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <FieldError error={formErrors.gender} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Parent WhatsApp No</label>
                <input
                  type="text"
                  placeholder="03001234567"
                  value={formData.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.phone} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Student WhatsApp No</label>
                <input
                  type="text"
                  placeholder="03001234567"
                  value={formData.student_whatsapp_no}
                  onChange={(e) => setField("student_whatsapp_no", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.student_whatsapp_no} />
              </div>

              <div className="flex flex-col sm:col-span-2">
                <label className={labelClass}>Residence</label>
                <input
                  type="text"
                  value={formData.residence}
                  onChange={(e) => setField("residence", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.residence} />
              </div>

              <div className="sm:col-span-2">
                <ImagePicker
                  file={formData.image}
                  existingUrl={existingImageUrl}
                  onChange={(file) => setField("image", file)}
                  label="Student Photo"
                />
                <FieldError error={formErrors.image} />
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ==================================================================== */
/*  TEACHERS                                                             */
/* ==================================================================== */

const emptyTeacherForm = {
  teacher_id: "",
  username: "",
  password: "",
  email: "",
  full_name: "",
  father_name: "",
  gender: "",
  address: "",
  phone: "",
  monthly_salary: "",
  is_active: true,
  image: null,
};

const TEACHER_SORT_OPTIONS = [
  { value: "full_name", label: "Name (A-Z)" },
  { value: "-full_name", label: "Name (Z-A)" },
  { value: "teacher_id", label: "Teacher ID" },
  { value: "-monthly_salary", label: "Salary (High-Low)" },
  { value: "monthly_salary", label: "Salary (Low-High)" },
  { value: "-created_at", label: "Newest First" },
  { value: "created_at", label: "Oldest First" },
];

function TeacherPanel({ headers, token }) {
  // ---------- Reference data ----------
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [classList, subjectList] = await Promise.all([
        fetchAll("/classes/", { headers }),
        fetchAll("/subjects/", { headers }),
      ]);
      setClasses(classList);
      setSubjects(subjectList);
    } catch (err) {
      console.error("Error fetching classes/subjects:", err);
      toast("error", await extractErrorMessage(err));
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (token) fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const classById = useMemo(() => new Map(classes.map((c) => [String(c.id), c])), [classes]);

  // ---------- List + filters ----------
  const [teachers, setTeachers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const fetchSeq = useRef(0);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive
  const [sortBy, setSortBy] = useState("full_name");

  const subjectFilterOptions = useMemo(() => {
    if (!classFilter) return subjects;
    return subjects.filter((s) => String(s.student_class) === String(classFilter));
  }, [subjects, classFilter]);

  const sectionFilterOptions = useMemo(() => {
    const cls = classById.get(String(classFilter));
    return (cls?.sections || []).map((s) => ({ id: s.id, name: s.name }));
  }, [classById, classFilter]);

  const groupFilterOptions = useMemo(() => {
    const cls = classById.get(String(classFilter));
    return (cls?.groups || []).map((g) => ({ id: g.id, name: g.name }));
  }, [classById, classFilter]);

  useEffect(() => {
    if (subjectFilter && !subjectFilterOptions.some((s) => String(s.id) === String(subjectFilter))) {
      setSubjectFilter("");
    }
    if (sectionFilter && !sectionFilterOptions.some((s) => String(s.id) === String(sectionFilter))) {
      setSectionFilter("");
    }
    if (groupFilter && !groupFilterOptions.some((g) => String(g.id) === String(groupFilter))) {
      setGroupFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  const fetchTeachers = async () => {
    const seq = ++fetchSeq.current;
    setFetching(true);
    try {
      const params = { ordering: sortBy };
      if (appliedSearch) params.search = appliedSearch;
      if (classFilter) params.teaching_assignments__subject__student_class = classFilter;
      if (subjectFilter) params.teaching_assignments__subject = subjectFilter;
      if (sectionFilter) params.teaching_assignments__sections = sectionFilter;
      if (groupFilter) params.teaching_assignments__groups = groupFilter;
      if (statusFilter !== "all") params.is_active = statusFilter === "active";

      const raw = await fetchAll("/teachers/", { headers, params });

      // Joining through assignments/sections/groups can repeat a teacher —
      // keep each one once.
      const seen = new Set();
      let list = raw.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

      // If the list response doesn't include assignments, load them per teacher.
      const missing = list.filter((t) => !Array.isArray(t.assignments));
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map((t) =>
            api
              .get(`/teachers/${t.id}/assignments/`, { headers })
              .then((res) => [t.id, asList(res.data)])
              .catch((err) => {
                console.error(`Error loading assignments for teacher ${t.id}:`, err);
                return [t.id, []];
              })
          )
        );
        const byTeacher = new Map(fetched);
        list = list.map((t) =>
          Array.isArray(t.assignments) ? t : { ...t, assignments: byTeacher.get(t.id) || [] }
        );
      }

      if (seq === fetchSeq.current) setTeachers(list);
    } catch (err) {
      console.error("Error fetching teachers:", err);
      if (seq === fetchSeq.current) toast("error", await extractErrorMessage(err));
    } finally {
      if (seq === fetchSeq.current) setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, classFilter, subjectFilter, sectionFilter, groupFilter, statusFilter, sortBy]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setClassFilter("");
    setSubjectFilter("");
    setSectionFilter("");
    setGroupFilter("");
    setStatusFilter("all");
    setSortBy("full_name");
  };

  // ---------- Create / Edit modal ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalLoading, setModalLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [formData, setFormData] = useState(emptyTeacherForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const openCreateModal = () => {
    setModalMode("create");
    setEditingId(null);
    setFormData(emptyTeacherForm);
    setExistingImageUrl(null);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = async (teacher) => {
    setModalMode("edit");
    setEditingId(teacher.id);
    setFormErrors({});
    setModalOpen(true);
    setModalLoading(true);
    try {
      const res = await api.get(`/teachers/${teacher.id}/`, { headers });
      const detail = res.data;
      setFormData({
        ...emptyTeacherForm,
        teacher_id: detail.teacher_id || "",
        username: detail.user?.username || detail.username || teacher.username || "",
        password: "",
        email: detail.user?.email || detail.email || teacher.email || "",
        full_name: detail.full_name || "",
        father_name: detail.father_name || "",
        gender: detail.gender || "",
        address: detail.address || "",
        phone: detail.phone || "",
        monthly_salary: detail.monthly_salary ?? "",
        is_active: !!detail.is_active,
        image: null,
      });
      setExistingImageUrl(detail.image || null);
    } catch (err) {
      toast("error", await extractErrorMessage(err));
      setModalOpen(false);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    setSaving(true);
    try {
      const fd = new FormData();

      fd.append("teacher_id", formData.teacher_id);
      fd.append("username", formData.username);
      if (formData.email) fd.append("email", formData.email);
      // The backend requires a password key to exist when creating a
      // teacher, so it's always sent on create; on edit, an empty value
      // is skipped so the current password is left untouched.
      if (modalMode === "create" || formData.password) {
        fd.append("password", formData.password);
      }
      fd.append("full_name", formData.full_name);
      fd.append("father_name", formData.father_name || "");
      fd.append("gender", formData.gender || "");
      fd.append("address", formData.address || "");
      fd.append("phone", formData.phone || "");
      fd.append("monthly_salary", formData.monthly_salary || "0");
      fd.append("is_active", formData.is_active ? "true" : "false");
      if (formData.image instanceof File) fd.append("image", formData.image);

      let res;
      if (modalMode === "create") {
        res = await api.post("/teachers/", fd, { headers });
      } else {
        res = await api.patch(`/teachers/${editingId}/`, fd, { headers });
      }

      toast("success", `${res.data.full_name} ${modalMode === "create" ? "added" : "updated"} successfully.`);
      closeModal();
      fetchTeachers();
    } catch (err) {
      const fieldErrs = extractFieldErrors(err);
      if (Object.keys(fieldErrs).length) {
        setFormErrors(fieldErrs);
      } else {
        toast("error", await extractErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Row actions: active toggle, delete ----------
  const [rowActionId, setRowActionId] = useState(null);

  const handleActiveToggle = async (teacher) => {
    setRowActionId(teacher.id);
    try {
      const fd = new FormData();
      fd.append("is_active", teacher.is_active ? "false" : "true");
      await api.patch(`/teachers/${teacher.id}/`, fd, { headers });
      toast("success", `${teacher.full_name} is now ${teacher.is_active ? "inactive" : "active"}.`);
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacher.id ? { ...t, is_active: !t.is_active } : t))
      );
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowActionId(null);
    }
  };

  const handleDelete = async (teacher) => {
    const ok = await confirmDialog({
      title: `Delete ${teacher.full_name}?`,
      text: "This permanently removes the teacher record. This cannot be undone.",
    });
    if (!ok) return;

    setRowActionId(teacher.id);
    try {
      await api.delete(`/teachers/${teacher.id}/`, { headers });
      toast("success", "Teacher deleted successfully.");
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowActionId(null);
    }
  };

  // ---------- ID card generation ----------
  const [rowBusyId, setRowBusyId] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const generateSingleCard = async (teacher) => {
    setRowBusyId(teacher.id);
    try {
      await openPdf(`/teachers/${teacher.id}/id-card/`, {
        headers,
        filenameHint: `teacher_id_card_${teacher.teacher_id}.pdf`,
      });
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setRowBusyId(null);
    }
  };

  const generateAllCards = async () => {
    setBulkLoading(true);
    try {
      await openPdf(`/teachers/id-cards/`, { headers, filenameHint: "teacher_id_cards.pdf" });
    } catch (err) {
      toast("error", await extractErrorMessage(err));
    } finally {
      setBulkLoading(false);
    }
  };

  const subjectNames = (teacher) => {
    const list = Array.isArray(teacher.assignments) ? teacher.assignments : [];
    const names = [...new Set(list.map((a) => a.subject_name).filter(Boolean))];
    return names.length ? names.join(", ") : "No subjects assigned";
  };

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight text-quinary">Teacher ID Cards</div>
          <p className="text-neutral-500 text-sm mt-1">
            Manage teacher records and generate printable ID cards.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={openCreateModal} className={primaryBtn}>
              + Add Teacher
            </button>
            <button type="button" onClick={generateAllCards} disabled={bulkLoading} className={primaryBtn}>
              {bulkLoading ? "Generating..." : "Generate All Active Teachers' ID Cards"}
            </button>
          </div>
          <span className="text-[11px] text-neutral-400 max-w-xs text-right">
            "Generate All" always includes every active teacher — the filters below don't change what's in this PDF.
          </span>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleSearchSubmit}
        className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col min-w-[220px] flex-1">
          <label className={labelClass}>Search</label>
          <input
            type="text"
            placeholder="Name, teacher ID, phone, subject..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col min-w-[170px]">
          <label className={labelClass}>Class</label>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="">All classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.display_name || cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[170px]">
          <label className={labelClass}>Subject</label>
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="">All subjects</option>
            {subjectFilterOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[150px]">
          <label className={labelClass}>Section</label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            disabled={!classFilter}
            className={`${inputClass} cursor-pointer disabled:opacity-50`}
          >
            <option value="">All sections</option>
            {sectionFilterOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[150px]">
          <label className={labelClass}>Group</label>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            disabled={!classFilter}
            className={`${inputClass} cursor-pointer disabled:opacity-50`}
          >
            <option value="">All groups</option>
            {groupFilterOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[140px]">
          <label className={labelClass}>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} cursor-pointer`}>
            <option value="all">All teachers</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <div className="flex flex-col min-w-[160px]">
          <label className={labelClass}>Sort By</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`${inputClass} cursor-pointer`}>
            {TEACHER_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="bg-primary hover:bg-quinary text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer">
          Search
        </button>
        <button type="button" onClick={clearFilters} className={ghostBtn}>
          Clear
        </button>
      </form>

      {/* List */}
      <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm">
        {fetching || loadingCatalog ? (
          <div className="text-center py-10 text-neutral-400 text-sm">Loading teachers...</div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-10 text-neutral-400 text-sm">No teachers match these filters.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {teachers.map((teacher) => (
              <div key={teacher.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
                    {teacher.image ? (
                      <img src={teacher.image} alt={teacher.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Photo</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-base text-quinary truncate flex items-center gap-2">
                      {teacher.full_name}
                      {!teacher.is_active && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-neutral-200 text-neutral-500 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {teacher.teacher_id}
                      {teacher.gender ? ` · ${teacher.gender}` : ""}
                      {teacher.phone ? ` · ${teacher.phone}` : ""}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">{subjectNames(teacher)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(teacher)}
                    className="border border-primary text-primary font-medium py-2 px-3 rounded-xl hover:bg-primary/10 transition-colors cursor-pointer text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActiveToggle(teacher)}
                    disabled={rowActionId === teacher.id}
                    className="border border-amber-500 text-amber-600 font-medium py-2 px-3 rounded-xl hover:bg-amber-50 transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    {teacher.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(teacher)}
                    disabled={rowActionId === teacher.id}
                    className="border border-red-500 text-red-600 font-medium py-2 px-3 rounded-xl hover:bg-red-50 transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => generateSingleCard(teacher)}
                    disabled={rowBusyId === teacher.id}
                    className="bg-primary hover:bg-quinary text-white font-medium py-2 px-3 rounded-xl transition-colors cursor-pointer text-sm disabled:opacity-50"
                  >
                    {rowBusyId === teacher.id ? "Generating..." : "Generate ID Card"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <Modal
          title={modalMode === "create" ? "Add Teacher" : "Edit Teacher"}
          subtitle={modalMode === "edit" ? `Teacher ID: ${formData.teacher_id}` : undefined}
          onClose={closeModal}
          wide
          footer={
            <>
              <button type="button" onClick={closeModal} className={ghostBtn}>
                Cancel
              </button>
              <button type="submit" form="teacher-form" disabled={saving} className={primaryBtn}>
                {saving ? "Saving..." : modalMode === "create" ? "Add Teacher" : "Save Changes"}
              </button>
            </>
          }
        >
          {modalLoading ? (
            <div className="text-center py-10 text-neutral-400 text-sm">Loading...</div>
          ) : (
            <form id="teacher-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className={labelClass}>Teacher ID *</label>
                <input
                  type="text"
                  required
                  value={formData.teacher_id}
                  onChange={(e) => setField("teacher_id", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.teacher_id} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Username *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setField("username", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.username} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>
                  Password {modalMode === "create" ? "*" : "(leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  required={modalMode === "create"}
                  value={formData.password}
                  onChange={(e) => setField("password", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.password} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.email} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.full_name} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Father Name *</label>
                <input
                  type="text"
                  required
                  value={formData.father_name}
                  onChange={(e) => setField("father_name", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.father_name} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Gender *</label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => setField("gender", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Select...</option>
                  {GENDER_CHOICES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <FieldError error={formErrors.gender} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Phone *</label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.phone} />
              </div>

              <div className="flex flex-col">
                <label className={labelClass}>Monthly Salary</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.monthly_salary}
                  onChange={(e) => setField("monthly_salary", e.target.value)}
                  className={inputClass}
                />
                <FieldError error={formErrors.monthly_salary} />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="teacher-active"
                  checked={formData.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                  className="w-4 h-4 cursor-pointer accent-[var(--primary)]"
                />
                <label htmlFor="teacher-active" className="text-sm text-quinary cursor-pointer">
                  Active account
                </label>
              </div>

              <div className="flex flex-col sm:col-span-2">
                <label className={labelClass}>Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setField("address", e.target.value)}
                  rows={2}
                  className={inputClass}
                />
                <FieldError error={formErrors.address} />
              </div>

              <div className="sm:col-span-2">
                <ImagePicker
                  file={formData.image}
                  existingUrl={existingImageUrl}
                  onChange={(file) => setField("image", file)}
                  label="Teacher Photo"
                />
                <FieldError error={formErrors.image} />
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ==================================================================== */
/*  Root component                                                       */
/* ==================================================================== */

const IDCard = () => {
  const token = useAuthStore((state) => state.accessToken);
  const headers = { Authorization: `Bearer ${token}` };
  const [activeTab, setActiveTab] = useState("students"); // students | teachers

  return (
    <div className="p-6 bg-secondary text-quinary min-h-screen font-sans">
      <div className="flex gap-2 mb-6 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab("students")}
          className={`px-5 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            activeTab === "students"
              ? "border-primary text-primary"
              : "border-transparent text-neutral-400 hover:text-quinary"
          }`}
        >
          Students
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("teachers")}
          className={`px-5 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            activeTab === "teachers"
              ? "border-primary text-primary"
              : "border-transparent text-neutral-400 hover:text-quinary"
          }`}
        >
          Teachers
        </button>
      </div>

      {activeTab === "students" ? (
        <StudentPanel headers={headers} token={token} />
      ) : (
        <TeacherPanel headers={headers} token={token} />
      )}
    </div>
  );
};

export default IDCard;