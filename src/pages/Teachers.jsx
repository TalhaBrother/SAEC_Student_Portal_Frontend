// SAEC Teacher Management

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  assignments: [],
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

// =====================================================================
// SHARED HELPERS — pagination, error formatting, assignment utilities
// =====================================================================

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

// Turns any DRF error response into readable text. Handles nested
// `assignments` errors (a list of per-row error objects) and HTML 500 pages.
const extractError = (error, fallback, rowLabels = []) => {
  const data = error?.response?.data;
  if (!data) {
    return error?.message === "Network Error" ? "Could not reach the server." : fallback;
  }
  if (typeof data === "string") {
    return data.length > 300 ? `${fallback} (server error ${error.response.status})` : data;
  }

  const lines = [];
  Object.entries(data).forEach(([key, val]) => {
    if (key === "assignments" && Array.isArray(val)) {
      val.forEach((item, idx) => {
        if (!item || (typeof item === "object" && Object.keys(item).length === 0)) return;
        const label = rowLabels[idx] ? ` (${rowLabels[idx]})` : "";
        const text =
          typeof item === "string"
            ? item
            : Object.entries(item)
                .map(([field, msg]) => `${field}: ${[].concat(msg).join(" ")}`)
                .join("; ");
        lines.push(`Assignment ${idx + 1}${label}: ${text}`);
      });
    } else if (Array.isArray(val)) {
      lines.push(`${key}: ${val.join(" ")}`);
    } else if (val && typeof val === "object") {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  });
  return lines.join("\n") || fallback;
};

// ---------- Assignment rows (form state) ----------
let rowKeySeq = 0;
const newRowKey = () => `row-${Date.now()}-${rowKeySeq++}`;

const emptyAssignmentRow = () => ({
  key: newRowKey(),
  classId: "",
  subjectId: "",
  sectionIds: [], // empty = all sections the subject covers
  groupIds: [], // empty = all groups the subject covers
});

// API assignment -> editable row
const apiAssignmentToRow = (a, catalog) => {
  const subject = catalog.subjectById.get(String(a.subject));
  return {
    key: newRowKey(),
    classId: String(a.class_id ?? subject?.student_class ?? ""),
    subjectId: String(a.subject),
    sectionIds: (a.section_ids || []).map(String),
    groupIds: (a.group_ids || []).map(String),
  };
};

// Editable row -> API payload
const rowToPayload = (row) => ({
  subject: Number(row.subjectId),
  section_ids: row.sectionIds.map(Number),
  group_ids: row.groupIds.map(Number),
});

// Which sections/groups can this subject actually be taught to?
// Mirrors the backend rule: if the subject is restricted to specific
// sections/groups, only those are allowed; otherwise the whole class is.
const getScope = (catalog, subjectId, classId) => {
  const subject = subjectId ? catalog.subjectById.get(String(subjectId)) : null;
  const cls = catalog.classById.get(String(subject?.student_class ?? classId));
  const classSections = cls?.sections || [];
  const classGroups = cls?.groups || [];
  const subjectSectionIds = (subject?.sections || []).map(String);
  const subjectGroupIds = (subject?.groups || []).map(String);

  return {
    sections: subjectSectionIds.length
      ? classSections.filter((s) => subjectSectionIds.includes(String(s.id)))
      : classSections,
    groups: subjectGroupIds.length
      ? classGroups.filter((g) => subjectGroupIds.includes(String(g.id)))
      : classGroups,
    sectionsRestricted: subjectSectionIds.length > 0,
    groupsRestricted: subjectGroupIds.length > 0,
    classHasSections: classSections.length > 0,
    classHasGroups: classGroups.length > 0,
  };
};

// ---------- Assignment display helpers ----------
const assignmentClassId = (a, catalog) =>
  String(a.class_id ?? catalog.subjectById.get(String(a.subject))?.student_class ?? "");

const assignmentClassLabel = (a, catalog) => {
  const cls = catalog.classById.get(assignmentClassId(a, catalog));
  if (cls) return cls.display_name || cls.name;
  if (a.class_name) return `${a.class_name}${a.board ? ` (${a.board})` : ""}`;
  return "Unknown class";
};

const groupAssignmentsByClass = (assignments, catalog) => {
  const map = new Map();
  assignments.forEach((a) => {
    const classId = assignmentClassId(a, catalog) || "unknown";
    if (!map.has(classId)) {
      map.set(classId, { classId, label: assignmentClassLabel(a, catalog), items: [] });
    }
    map.get(classId).items.push(a);
  });
  return Array.from(map.values());
};

const idsToNames = (ids, lookup) =>
  (ids || []).map((id) => lookup.get(String(id))?.name).filter(Boolean);

// =====================================================================
// PARENT — loads shared reference data (classes, subjects, teachers)
// =====================================================================
const Teachers = () => {
  const token = useAuthStore((state) => state.accessToken);
  const headers = { Authorization: `Bearer ${token}` };

  // ---------- Tabs ----------
  const [activeTab, setActiveTab] = useState("directory"); // "directory" | "payroll" | "summary"

  // ---------- Shared reference data ----------
  const [classes, setClasses] = useState([]); // each class carries its nested sections + groups
  const [subjects, setSubjects] = useState([]); // student_class is an id; sections/groups are id lists
  const [allTeachers, setAllTeachers] = useState([]); // unfiltered — powers the Payroll dropdown + Summary

  const fetchCatalog = async () => {
    try {
      const [classList, subjectList] = await Promise.all([
        fetchAll("/classes/", { headers }),
        fetchAll("/subjects/", { headers }),
      ]);
      setClasses(classList);
      setSubjects(subjectList);
    } catch (err) {
      console.error("Error fetching classes/subjects:", err);
    }
  };

  const fetchAllTeachers = async () => {
    try {
      setAllTeachers(await fetchAll("/teachers/", { headers }));
    } catch (err) {
      console.error("Error fetching teachers (unfiltered):", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCatalog();
      fetchAllTeachers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeTeacherOptions = useMemo(
    () => allTeachers.filter((t) => t.is_active),
    [allTeachers]
  );

  // Lookup maps keyed by string id, used everywhere assignments are shown or edited
  const catalog = useMemo(() => {
    const classById = new Map();
    const sectionById = new Map();
    const groupById = new Map();
    classes.forEach((cls) => {
      classById.set(String(cls.id), cls);
      (cls.sections || []).forEach((s) => sectionById.set(String(s.id), { ...s, classId: cls.id }));
      (cls.groups || []).forEach((g) => groupById.set(String(g.id), { ...g, classId: cls.id }));
    });
    const subjectById = new Map(subjects.map((s) => [String(s.id), s]));
    return { classes, subjects, classById, sectionById, groupById, subjectById };
  }, [classes, subjects]);

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
          catalog={catalog}
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
// ASSIGNMENT UI — one row editor, the multi-row editor, and read-only lines
// =====================================================================
const ChipToggle = ({ label, checked, onClick }) => (
  <button
    type="button"
    aria-pressed={checked}
    onClick={onClick}
    className={`text-sm px-3 py-1 rounded-full border cursor-pointer select-none transition-colors ${
      checked
        ? "bg-primary/10 border-primary text-primary font-medium"
        : "bg-surface border-neutral-300 text-neutral-500 hover:border-neutral-400"
    }`}
  >
    {label}
  </button>
);

// Class -> Subject -> Sections -> Groups for a single assignment
const AssignmentRowFields = ({ row, onChange, catalog, takenSubjectIds = [] }) => {
  const classSubjects = catalog.subjects.filter(
    (s) => String(s.student_class) === String(row.classId)
  );
  const scope = getScope(catalog, row.subjectId, row.classId);

  const handleClassChange = (classId) => {
    onChange({ classId, subjectId: "", sectionIds: [], groupIds: [] });
  };

  const handleSubjectChange = (subjectId) => {
    // Keep only the picked sections/groups that the new subject still allows
    const next = getScope(catalog, subjectId, row.classId);
    onChange({
      subjectId,
      sectionIds: row.sectionIds.filter((id) => next.sections.some((s) => String(s.id) === id)),
      groupIds: row.groupIds.filter((id) => next.groups.some((g) => String(g.id) === id)),
    });
  };

  const toggle = (field, id) => {
    const value = String(id);
    const current = row[field];
    onChange({
      [field]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className={labelClass}>Class</label>
          <select
            value={row.classId}
            onChange={(e) => handleClassChange(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">Select class</option>
            {catalog.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.display_name || cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className={labelClass}>Subject</label>
          <select
            value={row.subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            disabled={!row.classId}
            className={row.classId ? `${inputClass} cursor-pointer` : disabledInputClass}
          >
            <option value="">{row.classId ? "Select subject" : "Pick a class first"}</option>
            {classSubjects.map((subj) => {
              const taken =
                takenSubjectIds.includes(String(subj.id)) && String(subj.id) !== row.subjectId;
              return (
                <option key={subj.id} value={subj.id} disabled={taken}>
                  {subj.name}
                  {taken ? " (already assigned)" : ""}
                </option>
              );
            })}
          </select>
          {row.classId && classSubjects.length === 0 && (
            <p className="text-neutral-400 text-xs mt-1">This class has no subjects yet.</p>
          )}
        </div>
      </div>

      {row.subjectId ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sections */}
          <div>
            <p className={labelClass}>Sections</p>
            {!scope.classHasSections ? (
              <p className="text-xs text-neutral-400">This class has no sections.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {scope.sections.map((sec) => (
                    <ChipToggle
                      key={sec.id}
                      label={sec.name}
                      checked={row.sectionIds.includes(String(sec.id))}
                      onClick={() => toggle("sectionIds", sec.id)}
                    />
                  ))}
                </div>
                <p className="text-neutral-400 text-xs mt-2">
                  {row.sectionIds.length === 0
                    ? scope.sectionsRestricted
                      ? `Nothing selected: covers all sections of this subject (${scope.sections
                          .map((s) => s.name)
                          .join(", ")}).`
                      : "Nothing selected: covers all sections."
                    : scope.sectionsRestricted
                    ? "This subject is limited to the sections shown."
                    : ""}
                </p>
              </>
            )}
          </div>

          {/* Groups */}
          <div>
            <p className={labelClass}>Groups</p>
            {!scope.classHasGroups ? (
              <p className="text-xs text-neutral-400">This class has no groups.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {scope.groups.map((grp) => (
                    <ChipToggle
                      key={grp.id}
                      label={grp.name}
                      checked={row.groupIds.includes(String(grp.id))}
                      onClick={() => toggle("groupIds", grp.id)}
                    />
                  ))}
                </div>
                <p className="text-neutral-400 text-xs mt-2">
                  {row.groupIds.length === 0
                    ? scope.groupsRestricted
                      ? `Nothing selected: covers all groups of this subject (${scope.groups
                          .map((g) => g.name)
                          .join(", ")}).`
                      : "Nothing selected: covers all groups."
                    : scope.groupsRestricted
                    ? "This subject is limited to the groups shown."
                    : ""}
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        row.classId && (
          <p className="text-xs text-neutral-400">Pick a subject to choose sections and groups.</p>
        )
      )}
    </div>
  );
};

// The full list of assignment rows inside the teacher form
const AssignmentEditor = ({ rows, onChange, catalog }) => {
  const updateRow = (key, patch) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => onChange(rows.filter((r) => r.key !== key));
  const addRow = () => onChange([...rows, emptyAssignmentRow()]);

  const takenSubjectIds = rows.map((r) => r.subjectId).filter(Boolean);

  if (catalog.classes.length === 0) {
    return (
      <p className="text-xs text-neutral-400">
        No classes found yet. Create classes and subjects first, then assign them here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <p className="text-xs text-neutral-400">
          No subjects assigned yet. Add one to say what this teacher teaches.
        </p>
      )}

      {rows.map((row, idx) => (
        <div key={row.key} className="border border-neutral-200 rounded-xl p-4 bg-secondary/40">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-quinary">Assignment {idx + 1}</p>
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="text-xs font-semibold text-danger hover:underline cursor-pointer"
            >
              Remove
            </button>
          </div>
          <AssignmentRowFields
            row={row}
            onChange={(patch) => updateRow(row.key, patch)}
            catalog={catalog}
            takenSubjectIds={takenSubjectIds}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="bg-surface hover:bg-neutral-50 text-primary font-medium py-2 px-4 rounded-xl border border-primary/40 transition-colors text-sm cursor-pointer"
      >
        + Add subject
      </button>
    </div>
  );
};

// Read-only description of one saved assignment
const AssignmentLine = ({ assignment, catalog, dim = false }) => {
  const subjectName =
    assignment.subject_name || catalog.subjectById.get(String(assignment.subject))?.name || "Subject";
  const cls = catalog.classById.get(assignmentClassId(assignment, catalog));
  const hasSections = (cls?.sections || []).length > 0;
  const hasGroups = (cls?.groups || []).length > 0;

  const sectionNames = idsToNames(assignment.section_ids, catalog.sectionById);
  const groupNames = idsToNames(assignment.group_ids, catalog.groupById);

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${dim ? "opacity-40" : ""}`}>
      <span className="font-semibold text-quinary text-sm">{subjectName}</span>
      {hasSections && (
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
          {sectionNames.length ? `Sections: ${sectionNames.join(", ")}` : "All sections"}
        </span>
      )}
      {hasGroups && (
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
          {groupNames.length ? `Groups: ${groupNames.join(", ")}` : "All groups"}
        </span>
      )}
    </div>
  );
};

// =====================================================================
// DIRECTORY TAB — Teacher CRUD, teaching assignments, search, filters
// =====================================================================
const TEACHER_SORT_OPTIONS = [
  { value: "", label: "Name (A → Z)" },
  { value: "-full_name", label: "Name (Z → A)" },
  { value: "teacher_id", label: "Teacher ID (A → Z)" },
  { value: "-teacher_id", label: "Teacher ID (Z → A)" },
  { value: "-monthly_salary", label: "Salary (High → Low)" },
  { value: "monthly_salary", label: "Salary (Low → High)" },
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
];

const MAX_ASSIGNMENTS_IN_TABLE = 4;

const DirectoryTab = ({ token, headers, catalog, onTeachersChanged }) => {
  const [mode, setMode] = useState("list"); // "list" | "form" | "detail"

  const [teachers, setTeachers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const fetchSeq = useRef(0); // ignores out-of-order responses when filters change quickly

  // Filters (all map to real backend filter keys)
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState(""); // "", "true", "false"
  const [ordering, setOrdering] = useState("");

  // Form state
  const [formData, setFormData] = useState(emptyTeacherForm());
  const [formLoading, setFormLoading] = useState(false);

  // Profile image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Row-level action loading
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  // Detail view state
  const [detailTeacher, setDetailTeacher] = useState(null);
  const [detailAssignments, setDetailAssignments] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quickRow, setQuickRow] = useState(emptyAssignmentRow());
  const [quickSaving, setQuickSaving] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null);

  // ---------- Filter option lists (dependent dropdowns) ----------
  const subjectFilterOptions = useMemo(() => {
    if (!classFilter) return catalog.subjects;
    return catalog.subjects.filter((s) => String(s.student_class) === String(classFilter));
  }, [catalog.subjects, classFilter]);

  // Sections/groups narrow to the chosen subject, else the chosen class, else everything.
  const sectionFilterOptions = useMemo(() => {
    if (subjectFilter) {
      return getScope(catalog, subjectFilter, classFilter).sections.map((s) => ({
        id: s.id,
        label: s.name,
      }));
    }
    if (classFilter) {
      const cls = catalog.classById.get(String(classFilter));
      return (cls?.sections || []).map((s) => ({ id: s.id, label: s.name }));
    }
    return catalog.classes.flatMap((cls) =>
      (cls.sections || []).map((s) => ({
        id: s.id,
        label: `${cls.display_name || cls.name} – ${s.name}`,
      }))
    );
  }, [catalog, classFilter, subjectFilter]);

  const groupFilterOptions = useMemo(() => {
    if (subjectFilter) {
      return getScope(catalog, subjectFilter, classFilter).groups.map((g) => ({
        id: g.id,
        label: g.name,
      }));
    }
    if (classFilter) {
      const cls = catalog.classById.get(String(classFilter));
      return (cls?.groups || []).map((g) => ({ id: g.id, label: g.name }));
    }
    return catalog.classes.flatMap((cls) =>
      (cls.groups || []).map((g) => ({
        id: g.id,
        label: `${cls.display_name || cls.name} – ${g.name}`,
      }))
    );
  }, [catalog, classFilter, subjectFilter]);

  // Changing class/subject can invalidate a section/group/subject picked earlier
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
  }, [classFilter, subjectFilter, catalog]);

  const anyAssignmentFilter = Boolean(classFilter || subjectFilter || sectionFilter || groupFilter);

  // When assignment filters are on, the row still lists everything the teacher
  // teaches, but the matching assignments stand out.
  const assignmentMatchesFilters = (a) => {
    if (classFilter && assignmentClassId(a, catalog) !== String(classFilter)) return false;
    if (subjectFilter && String(a.subject) !== String(subjectFilter)) return false;
    if (sectionFilter && !(a.section_ids || []).map(String).includes(String(sectionFilter))) return false;
    if (groupFilter && !(a.group_ids || []).map(String).includes(String(groupFilter))) return false;
    return true;
  };

  // ---------- READ ----------
  const fetchTeachers = async () => {
    const seq = ++fetchSeq.current;
    setFetching(true);
    try {
      const params = {};
      if (appliedSearch) params.search = appliedSearch;
      if (activeFilter !== "") params.is_active = activeFilter;
      if (classFilter) params.teaching_assignments__subject__student_class = classFilter;
      if (subjectFilter) params.teaching_assignments__subject = subjectFilter;
      if (sectionFilter) params.teaching_assignments__sections = sectionFilter;
      if (groupFilter) params.teaching_assignments__groups = groupFilter;
      if (ordering) params.ordering = ordering;

      const raw = await fetchAll("/teachers/", { headers, params });

      // Joining through assignments can repeat a teacher — keep each one once
      const seen = new Set();
      let list = raw.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

      // If the list response doesn't include assignments, load them per teacher
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
      if (seq === fetchSeq.current) {
        setMessage({ type: "error", text: "Failed to load teachers." });
      }
    } finally {
      if (seq === fetchSeq.current) setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, classFilter, subjectFilter, sectionFilter, groupFilter, activeFilter, ordering]);

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
    setActiveFilter("");
    setOrdering("");
  };

  // ---------- PROFILE IMAGE ----------
  const clearImagePreview = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(false);
  };

  const handleRemovePhoto = () => {
    // A blob: preview is only a not-yet-saved pick; anything else is a saved photo
    const wasSaved = imagePreview && !imagePreview.startsWith("blob:") && !imageFile;
    setImageFile(null);
    setImagePreview(null);
    if (wasSaved) setImageRemoved(true);
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
    setImageRemoved(false);
    setMessage({ type: "", text: "" });
    setImagePreview(URL.createObjectURL(file));
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

      // Prefer assignments from the detail response; otherwise ask the assignments endpoint
      let apiAssignments = Array.isArray(detail.assignments) ? detail.assignments : null;
      if (!apiAssignments) {
        const assignmentsRes = await api.get(`/teachers/${teacher.id}/assignments/`, { headers });
        apiAssignments = asList(assignmentsRes.data);
      }

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
        assignments: apiAssignments.map((a) => apiAssignmentToRow(a, catalog)),
        username: detail.username || "",
        email: detail.email || "",
        password: "",
      });

      setImageFile(null);
      setImageRemoved(false);
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

  // ---------- DETAIL VIEW ----------
  const loadDetailAssignments = async (teacherId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/teachers/${teacherId}/assignments/`, { headers });
      setDetailAssignments(asList(res.data));
    } catch (err) {
      console.error("Error loading assignments:", err);
      setMessage({ type: "error", text: "Failed to load this teacher's assignments." });
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (teacher) => {
    setMessage({ type: "", text: "" });
    setDetailTeacher(teacher);
    setDetailAssignments(Array.isArray(teacher.assignments) ? teacher.assignments : []);
    setQuickRow(emptyAssignmentRow());
    setMode("detail");
    await loadDetailAssignments(teacher.id);
  };

  const closeDetail = () => {
    setDetailTeacher(null);
    setDetailAssignments([]);
    setMode("list");
  };

  // Add one assignment via POST /teachers/{id}/assignments/
  const handleQuickAdd = async () => {
    if (!quickRow.subjectId) {
      setMessage({ type: "error", text: "Choose a class and subject before adding." });
      return;
    }
    setQuickSaving(true);
    setMessage({ type: "", text: "" });
    try {
      await api.post(`/teachers/${detailTeacher.id}/assignments/`, rowToPayload(quickRow), { headers });
      Swal.fire({
        title: "Added",
        text: "Assignment added.",
        icon: "success",
        ...SWAL_THEME,
      });
      setQuickRow(emptyAssignmentRow());
      await loadDetailAssignments(detailTeacher.id);
      await fetchTeachers();
    } catch (error) {
      console.error("Add Assignment Error!", error.response?.data);
      setMessage({
        type: "error",
        text: extractError(error, "Failed to add assignment. This subject may already be assigned."),
      });
    } finally {
      setQuickSaving(false);
    }
  };

  // There is no single-assignment DELETE route, so removal re-sends the remaining list
  const handleRemoveAssignment = async (assignment) => {
    const subjectName =
      assignment.subject_name || catalog.subjectById.get(String(assignment.subject))?.name || "this subject";

    const confirmResult = await Swal.fire({
      title: `Remove ${subjectName}?`,
      text: `${assignmentClassLabel(assignment, catalog)} will no longer be assigned to ${detailTeacher.full_name}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
      ...SWAL_THEME,
      confirmButtonColor: "var(--danger)",
    });
    if (!confirmResult.isConfirmed) return;

    setRemovingAssignmentId(assignment.id);
    try {
      const remaining = detailAssignments
        .filter((a) => a.id !== assignment.id)
        .map((a) => rowToPayload(apiAssignmentToRow(a, catalog)));

      await api.patch(`/teachers/${detailTeacher.id}/`, { assignments: remaining }, { headers });
      await loadDetailAssignments(detailTeacher.id);
      await fetchTeachers();
    } catch (error) {
      console.error("Remove Assignment Error!", error.response?.data);
      Swal.fire({
        title: "Error",
        text: extractError(error, "Failed to remove assignment."),
        icon: "error",
        ...SWAL_THEME,
      });
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  // ---------- CREATE / UPDATE ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    const isEdit = Boolean(formData.id);
    const rows = formData.assignments;

    // Client-side checks that mirror backend rules so errors are caught early
    const emptyIdx = rows.findIndex((r) => !r.subjectId);
    if (emptyIdx !== -1) {
      setMessage({
        type: "error",
        text: `Assignment ${emptyIdx + 1} has no subject. Choose one or remove that assignment.`,
      });
      return;
    }
    const subjectIds = rows.map((r) => r.subjectId);
    if (new Set(subjectIds).size !== subjectIds.length) {
      setMessage({ type: "error", text: "A teacher can only have each subject once." });
      return;
    }

    setSaving(true);

    const assignmentPayload = rows.map(rowToPayload);
    const rowLabels = rows.map((r) => {
      const subj = catalog.subjectById.get(String(r.subjectId));
      return subj ? `${subj.name}, ${subj.class_name}` : "";
    });

    // Fields shared by both request styles
    const fields = {
      full_name: formData.fullName,
      father_name: formData.fatherName,
      gender: formData.gender,
      address: formData.address,
      phone: formData.phone,
      monthly_salary: formData.monthlySalary,
      is_active: formData.isActive,
    };
    if (!isEdit) {
      fields.teacher_id = formData.teacherId;
      fields.username = formData.username;
      fields.email = formData.email;
      fields.password = formData.password;
    } else {
      if (formData.username) fields.username = formData.username;
      if (formData.email) fields.email = formData.email;
      if (formData.password) fields.password = formData.password;
    }

    let savedId = formData.id;

    try {
      if (!imageFile) {
        // No new photo: a single JSON request saves the teacher AND assignments atomically
        const body = { ...fields, assignments: assignmentPayload };
        if (isEdit && imageRemoved) body.image = null;

        const res = isEdit
          ? await api.patch(`/teachers/${formData.id}/`, body, { headers })
          : await api.post("/teachers/", body, { headers });
        savedId = res.data?.id ?? savedId;
      } else {
        // New photo: the teacher goes as multipart (files can't ride in JSON)...
        const payload = new FormData();
        Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
        payload.append("image", imageFile);

        const multipartHeaders = { Authorization: `Bearer ${token}`, "Content-Type": undefined };
        const res = isEdit
          ? await api.patch(`/teachers/${formData.id}/`, payload, { headers: multipartHeaders })
          : await api.post("/teachers/", payload, { headers: multipartHeaders });
        savedId = res.data?.id ?? savedId;

        // ...and assignments follow as JSON, because nested lists don't survive multipart.
        if (isEdit || assignmentPayload.length > 0) {
          try {
            await api.patch(`/teachers/${savedId}/`, { assignments: assignmentPayload }, { headers });
          } catch (assignError) {
            console.error("Assignments save failed after teacher save:", assignError.response?.data);
            // Teacher exists now — stay in the form as an edit so the user can retry
            setFormData((prev) => ({ ...prev, id: savedId, password: "" }));
            setImageFile(null);
            setImageRemoved(false);
            setImagePreview(res.data?.image || imagePreview);
            setMessage({
              type: "error",
              text: `Teacher was saved, but assignments were not.\n${extractError(
                assignError,
                "Failed to save assignments.",
                rowLabels
              )}`,
            });
            await fetchTeachers();
            await onTeachersChanged?.();
            return;
          }
        }
      }

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
      setMessage({
        type: "error",
        text: extractError(
          error,
          isEdit
            ? "Failed to update teacher. Please check input field constraints."
            : "Failed to register teacher. Please check input field constraints.",
          rowLabels
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- DELETE ----------
  const handleDelete = async (teacher) => {
    const confirmResult = await Swal.fire({
      title: `Delete ${teacher.full_name}?`,
      text: `Teacher ID ${teacher.teacher_id} and all of their assignments will be permanently removed. This cannot be undone.`,
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
      if (mode === "detail") closeDetail();
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
      if (detailTeacher?.id === teacher.id) {
        setDetailTeacher({ ...detailTeacher, is_active: activating });
      }
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

  // ---------- Shared render bits ----------
  const StatusBadge = ({ active }) => (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
        active
          ? "bg-success/10 text-success border-success/20"
          : "bg-danger/10 text-danger border-danger/20"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );

  const selectClass =
    "bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm cursor-pointer";

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
        <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6 max-w-4xl">
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
                        onClick={handleRemovePhoto}
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

              {/* Section: Teaching Assignments */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  Teaching Assignments
                </h3>
                <p className="text-neutral-400 text-xs mb-4">
                  For each subject, choose the class, then the sections and groups this teacher covers.
                </p>
                <AssignmentEditor
                  rows={formData.assignments}
                  onChange={(next) => setFormData((prev) => ({ ...prev, assignments: next }))}
                  catalog={catalog}
                />
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
      ) : mode === "detail" && detailTeacher ? (
        /* ---------------- TEACHER DETAIL (what they teach) ---------------- */
        <div className="max-w-4xl space-y-5">
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-neutral-100 bg-neutral-50 overflow-hidden flex items-center justify-center shrink-0">
                  {detailTeacher.image ? (
                    <img src={detailTeacher.image} alt={detailTeacher.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-8 h-8 text-neutral-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.5c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9z" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-xl font-semibold text-quinary">{detailTeacher.full_name}</div>
                  <div className="text-sm text-neutral-500">
                    {detailTeacher.teacher_id}
                    {detailTeacher.phone ? `, ${detailTeacher.phone}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge active={detailTeacher.is_active} />
                <button
                  type="button"
                  onClick={() => openEditForm(detailTeacher)}
                  className="bg-primary hover:bg-quinary text-white font-medium py-2 px-4 rounded-xl transition-colors text-sm cursor-pointer"
                >
                  Edit Teacher
                </button>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="bg-surface hover:bg-neutral-50 text-quinary font-medium py-2 px-4 rounded-xl border border-neutral-300 transition-colors text-sm cursor-pointer"
                >
                  Back to list
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
              <div>
                <p className={labelClass}>Father name</p>
                <p className="text-quinary">{detailTeacher.father_name || "—"}</p>
              </div>
              <div>
                <p className={labelClass}>Gender</p>
                <p className="text-quinary">{detailTeacher.gender || "—"}</p>
              </div>
              <div>
                <p className={labelClass}>Monthly salary</p>
                <p className="text-quinary">{formatCurrency(detailTeacher.monthly_salary)}</p>
              </div>
              <div>
                <p className={labelClass}>Address</p>
                <p className="text-quinary">{detailTeacher.address || "—"}</p>
              </div>
            </div>
          </div>

          {/* Assignments grouped by class */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6">
            <div className="text-lg font-semibold text-quinary mb-4">Teaching assignments</div>

            {detailLoading && detailAssignments.length === 0 ? (
              <p className="text-sm text-neutral-400">Loading assignments...</p>
            ) : detailAssignments.length === 0 ? (
              <p className="text-sm text-neutral-400">
                This teacher has no subjects assigned yet. Add one below.
              </p>
            ) : (
              <div className="space-y-5">
                {groupAssignmentsByClass(detailAssignments, catalog).map((group) => (
                  <div key={group.classId}>
                    <p className="text-sm font-semibold text-neutral-500 mb-2">{group.label}</p>
                    <div className="space-y-2">
                      {group.items.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-3 border border-neutral-200 rounded-xl px-4 py-3"
                        >
                          <AssignmentLine assignment={a} catalog={catalog} />
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignment(a)}
                            disabled={removingAssignmentId === a.id}
                            className="text-xs font-semibold text-danger hover:underline disabled:opacity-50 cursor-pointer shrink-0"
                          >
                            {removingAssignmentId === a.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick add */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-6">
            <div className="text-lg font-semibold text-quinary mb-4">Add an assignment</div>
            <AssignmentRowFields
              row={quickRow}
              onChange={(patch) => setQuickRow((prev) => ({ ...prev, ...patch }))}
              catalog={catalog}
              takenSubjectIds={detailAssignments.map((a) => String(a.subject))}
            />
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={quickSaving || !quickRow.subjectId}
                className="bg-primary hover:bg-quinary disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-xl transition-colors text-sm cursor-pointer"
              >
                {quickSaving ? "Adding..." : "Add assignment"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- LIST / READ VIEW ---------------- */
        <div>
          {/* Filter Bar */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 mb-5">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col flex-1 min-w-[240px]">
                <label className={filterLabelClass}>Search</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Name, ID, phone, username, email or subject"
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

              <div className="flex flex-col min-w-[170px]">
                <label className={filterLabelClass}>Class</label>
                <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={selectClass}>
                  <option value="">All Classes</option>
                  {catalog.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.display_name || cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[190px]">
                <label className={filterLabelClass}>Subject</label>
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className={selectClass}>
                  <option value="">All Subjects</option>
                  {subjectFilterOptions.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {classFilter ? subj.name : `${subj.name} (${subj.class_name})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[150px]">
                <label className={filterLabelClass}>Section</label>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={selectClass}>
                  <option value="">All Sections</option>
                  {sectionFilterOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[150px]">
                <label className={filterLabelClass}>Group</label>
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={selectClass}>
                  <option value="">All Groups</option>
                  {groupFilterOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col min-w-[140px]">
                <label className={filterLabelClass}>Status</label>
                <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className={selectClass}>
                  <option value="">All Statuses</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="flex flex-col min-w-[170px]">
                <label className={filterLabelClass}>Sort by</label>
                <select value={ordering} onChange={(e) => setOrdering(e.target.value)} className={selectClass}>
                  {TEACHER_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
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
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Teaches</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Salary</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider">Status</th>
                      <th className="p-3 font-semibold text-neutral-500 uppercase text-xs tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher) => {
                      const assignments = teacher.assignments || [];
                      const visible = assignments.slice(0, MAX_ASSIGNMENTS_IN_TABLE);
                      const hiddenCount = assignments.length - visible.length;

                      return (
                        <tr key={teacher.id} className="border-t border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3 font-medium text-quinary whitespace-nowrap">{teacher.teacher_id}</td>
                          <td className="p-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openDetail(teacher)}
                              className="text-quinary font-medium hover:text-primary hover:underline cursor-pointer text-left"
                            >
                              {teacher.full_name}
                            </button>
                          </td>
                          <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.father_name || "—"}</td>
                          <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.gender || "—"}</td>
                          <td className="p-3 text-neutral-500 whitespace-nowrap">{teacher.phone || "—"}</td>
                          <td className="p-3 min-w-[300px]">
                            {assignments.length === 0 ? (
                              <span className="text-neutral-400">No subjects assigned</span>
                            ) : (
                              <div className="space-y-2">
                                {groupAssignmentsByClass(visible, catalog).map((group) => (
                                  <div key={group.classId}>
                                    <p className="text-xs font-semibold text-neutral-400 mb-1">{group.label}</p>
                                    <div className="space-y-1">
                                      {group.items.map((a) => (
                                        <AssignmentLine
                                          key={a.id}
                                          assignment={a}
                                          catalog={catalog}
                                          dim={anyAssignmentFilter && !assignmentMatchesFilters(a)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                {hiddenCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openDetail(teacher)}
                                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                                  >
                                    +{hiddenCount} more
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-neutral-500 whitespace-nowrap">{formatCurrency(teacher.monthly_salary)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <StatusBadge active={teacher.is_active} />
                          </td>
                          <td className="p-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => openDetail(teacher)}
                                className="text-sm font-medium text-quinary hover:underline cursor-pointer"
                              >
                                View
                              </button>
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
                      );
                    })}
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