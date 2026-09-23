// SAEC Teacher ID Card Generation
//
// Talks to:
//   GET /teachers/                 -> list active teachers (search + assignment filters)
//   GET /teachers/<id>/assignments/-> fallback when list response omits assignments
//   GET /teachers/<id>/id-card/    -> single teacher ID card PDF (front + back, 2 pages)
//   GET /teachers/id-cards/        -> bulk PDF for every active teacher (backend takes no filters)
//
// The bulk endpoint always includes *all* active teachers — it accepts no
// query params on the backend — so the filters here only narrow what you
// see/pick for single-card generation, never what goes into the bulk PDF.

import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";
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

function toast(icon, text, title) {
  Swal.fire({
    title: title || (icon === "success" ? "Success!" : icon === "error" ? "Error" : "Heads up"),
    text,
    icon,
    confirmButtonText: "OK",
    ...SWAL_THEME,
  });
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
  "bg-surface text-quinary border border-neutral-300 rounded-xl p-3 outline-none focus:border-primary transition-colors text-sm";
const labelClass = "text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1";

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */

const IDCard = () => {
  const token = useAuthStore((state) => state.accessToken);
  const headers = { Authorization: `Bearer ${token}` };

  // ---------- Reference data (for filters) ----------
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

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

  useEffect(() => {
    if (token) fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const classById = useMemo(() => new Map(classes.map((c) => [String(c.id), c])), [classes]);

  // ---------- Teacher list ----------
  const [teachers, setTeachers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const fetchSeq = useRef(0); // ignores out-of-order responses when filters change quickly

  // Filters (all map to real TeacherViewSet filter/search params)
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

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

  // A class change can invalidate a subject/section/group picked earlier
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

  // ---------- READ ----------
  const fetchTeachers = async () => {
    const seq = ++fetchSeq.current;
    setFetching(true);
    try {
      const params = { is_active: "true", ordering: "full_name" };
      if (appliedSearch) params.search = appliedSearch;
      if (classFilter) params.teaching_assignments__subject__student_class = classFilter;
      if (subjectFilter) params.teaching_assignments__subject = subjectFilter;
      if (sectionFilter) params.teaching_assignments__sections = sectionFilter;
      if (groupFilter) params.teaching_assignments__groups = groupFilter;

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
      if (seq === fetchSeq.current) toast("error", await extractErrorMessage(err));
    } finally {
      if (seq === fetchSeq.current) setFetching(false);
    }
  };

  useEffect(() => {
    if (token) fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, appliedSearch, classFilter, subjectFilter, sectionFilter, groupFilter]);

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
  };

  // ---------- PDF generation ----------
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
      await openPdf(`/teachers/id-cards/`, {
        headers,
        filenameHint: "teacher_id_cards.pdf",
      });
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
    <div className="p-6 bg-secondary text-quinary min-h-screen font-sans">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight text-quinary">Teacher ID Cards</div>
          <p className="text-neutral-500 text-sm mt-1">
            Generate a printable ID card for one teacher, or for every active teacher at once.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={generateAllCards}
            disabled={bulkLoading}
            className="bg-primary hover:bg-quinary disabled:opacity-50 text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer shadow-md transform active:scale-[0.98]"
          >
            {bulkLoading ? "Generating..." : "Generate All Active Teachers' ID Cards"}
          </button>
          <span className="text-[11px] text-neutral-400 max-w-xs text-right">
            Always includes every active teacher — the filters below don't change what's in this PDF.
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

        <button type="submit" className="bg-primary hover:bg-quinary text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer">
          Search
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="border border-neutral-300 text-neutral-500 font-medium py-3 px-5 rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          Clear
        </button>
      </form>

      <div className="text-xs text-neutral-400 mb-3">
        Showing active teachers only — inactive teachers aren't selectable for ID card generation.
      </div>

      {/* Teacher list */}
      <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm">
        {fetching ? (
          <div className="text-center py-10 text-neutral-400 text-sm">Loading teachers...</div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-10 text-neutral-400 text-sm">No active teachers match these filters.</div>
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
                    <div className="font-semibold text-base text-quinary truncate">{teacher.full_name}</div>
                    <div className="text-xs text-neutral-400">
                      {teacher.teacher_id}
                      {teacher.gender ? ` · ${teacher.gender}` : ""}
                      {teacher.phone ? ` · ${teacher.phone}` : ""}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">{subjectNames(teacher)}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => generateSingleCard(teacher)}
                  disabled={rowBusyId === teacher.id}
                  className="border border-primary text-primary font-semibold py-2.5 px-4 rounded-xl hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {rowBusyId === teacher.id ? "Generating..." : "Generate ID Card"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IDCard;