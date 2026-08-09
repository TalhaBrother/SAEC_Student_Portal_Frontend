import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";
import Swal from "sweetalert2";

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

const todayISO = () => new Date().toISOString().split("T")[0];

// Student/class relations sometimes come back as a plain id and
// sometimes as a nested { id, name } object depending on the
// serializer — normalize both so filtering never silently breaks.
const idOf = (val) => {
    if (val === null || val === undefined) return null;
    return typeof val === "object" ? val.id : val;
};
const nameOf = (val) => {
    if (val === null || val === undefined) return null;
    return typeof val === "object" ? val.name ?? val.display_name ?? null : null;
};

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Pulls a readable message out of a failed axios call. Handles the
// PDF endpoints too, where an error response comes back as a Blob
// (since the success path expects binary PDF data) instead of JSON.
async function extractErrorMessage(err) {
    try {
        const data = err?.response?.data;
        if (data instanceof Blob) {
            const text = await data.text();
            try {
                return JSON.parse(text).error || text;
            } catch {
                return text || "Request failed.";
            }
        }
        return data?.error || err?.message || "Something went wrong.";
    } catch {
        return "Something went wrong.";
    }
}

function toast(icon, text, title) {
    Swal.fire({
        title: title || (icon === "success" ? "Success!" : "Heads up"),
        text,
        icon,
        confirmButtonText: "OK",
        confirmButtonColor: "#0056D2",
        background: "#F4F7FC",
        color: "#1A253C",
    });
}

const STATUS_STYLES = {
    PRESENT: "bg-green-500 border-green-500 text-white shadow-sm",
    ABSENT: "bg-red-500 border-red-500 text-white shadow-sm",
};
const STATUS_IDLE = "bg-white border-gray-200 text-gray-600 hover:bg-gray-50";

const inputClass =
    "bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm";
const labelClass = "text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1";

const TABS = [
    { key: "mark", label: "Mark Attendance" },
    { key: "records", label: "Records" },
    { key: "student", label: "Student Analytics" },
    { key: "class", label: "Class Analytics" },
];

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */

const Attendance = () => {
    const token = useAuthStore((state) => state.accessToken);
    const [activeTab, setActiveTab] = useState("mark");

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);

    useEffect(() => {
        if (!token) return;

        api.get("/students/", authHeaders(token))
            .then((res) => setStudents(res.data))
            .catch((err) => console.error("Failed to load students:", err));

        api.get("/classes/", authHeaders(token))
            .then((res) => setClasses(res.data))
            .catch((err) => console.error("Failed to load classes:", err));
    }, [token]);

    // Section / group options for a given class, derived from the
    // student roster instead of a dedicated endpoint (none is
    // documented), keyed with real ids so they can drive section_id /
    // group_id query params.
    const sectionOptionsFor = (classId) => {
        if (!classId) return [];
        const seen = new Map();
        Students.filter((s) => idOf(s.student_class) === Number(classId)).forEach((s) => {
            const id = idOf(s.section);
            const name = nameOf(s.section);
            if (id && name && !seen.has(id)) seen.set(id, name);
        });
        return Array.from(seen, ([id, name]) => ({ id, name }));
    };
    const groupOptionsFor = (classId) => {
        if (!classId) return [];
        const seen = new Map();
        Students.filter((s) => idOf(s.student_class) === Number(classId)).forEach((s) => {
            const id = idOf(s.group);
            const name = nameOf(s.group);
            if (id && name && !seen.has(id)) seen.set(id, name);
        });
        return Array.from(seen, ([id, name]) => ({ id, name }));
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Attendance</div>
            <p className="text-gray-500 text-sm mb-6">
                Mark daily attendance, browse and edit records, and review attendance analytics.
            </p>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors cursor-pointer ${
                            activeTab === tab.key
                                ? "bg-white text-[var(--primary)] border border-b-0 border-gray-200"
                                : "text-gray-500 hover:text-[var(--quinary)]"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "mark" && (
                <MarkAttendanceTab
                    token={token}
                    Classes={Classes}
                    sectionOptionsFor={sectionOptionsFor}
                    groupOptionsFor={groupOptionsFor}
                />
            )}
            {activeTab === "records" && (
                <RecordsTab
                    token={token}
                    Classes={Classes}
                    Students={Students}
                    sectionOptionsFor={sectionOptionsFor}
                    groupOptionsFor={groupOptionsFor}
                />
            )}
            {activeTab === "student" && <StudentAnalyticsTab token={token} Students={Students} />}
            {activeTab === "class" && (
                <ClassAnalyticsTab
                    token={token}
                    Classes={Classes}
                    sectionOptionsFor={sectionOptionsFor}
                    groupOptionsFor={groupOptionsFor}
                />
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Tab 1 — Mark Attendance (class-students -> bulk)                   */
/* ------------------------------------------------------------------ */

function MarkAttendanceTab({ token, Classes, sectionOptionsFor, groupOptionsFor }) {
    const [classId, setClassId] = useState("");
    const [date, setDate] = useState(todayISO());
    const [sectionId, setSectionId] = useState("");
    const [groupId, setGroupId] = useState("");
    const [search, setSearch] = useState("");

    const [roster, setRoster] = useState([]);
    const [className, setClassName] = useState("");
    const [rosterLoading, setRosterLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState({});
    const [saving, setSaving] = useState(false);
    const [lastSummary, setLastSummary] = useState(null);

    // Reset the section/group narrowing whenever the class changes.
    useEffect(() => {
        setSectionId("");
        setGroupId("");
    }, [classId]);

    // Load the roster (+ today's/selected date's existing status) any
    // time the class, date, section, or group filter changes.
    useEffect(() => {
        if (!classId || !token) {
            setRoster([]);
            setAttendanceData({});
            return;
        }

        setRosterLoading(true);
        setLastSummary(null);

        const params = new URLSearchParams({ class_id: classId, date });
        if (sectionId) params.set("section_id", sectionId);
        if (groupId) params.set("group_id", groupId);

        api.get(`/attendance/class-students/?${params.toString()}`, authHeaders(token))
            .then((res) => {
                setClassName(res.data.class || "");
                setRoster(res.data.students || []);
                // Pre-fill from already_marked/status; default unmarked
                // students to PRESENT so a full day can be saved in one click.
                const initial = {};
                (res.data.students || []).forEach((s) => {
                    initial[s.student_db_id] = s.status || "PRESENT";
                });
                setAttendanceData(initial);
            })
            .catch(async (err) => toast("error", await extractErrorMessage(err)))
            .finally(() => setRosterLoading(false));
    }, [classId, date, sectionId, groupId, token]);

    const filteredRoster = useMemo(() => {
        if (!search.trim()) return roster;
        const q = search.trim().toLowerCase();
        return roster.filter(
            (s) => s.full_name?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)
        );
    }, [roster, search]);

    const markStatus = (studentDbId, status) => {
        setAttendanceData((prev) => ({ ...prev, [studentDbId]: status }));
    };

    const markAllVisible = (status) => {
        setAttendanceData((prev) => {
            const next = { ...prev };
            filteredRoster.forEach((s) => {
                next[s.student_db_id] = status;
            });
            return next;
        });
    };

    const submitAttendance = async () => {
        if (!classId) return toast("warning", "Please select a class before saving attendance!");
        if (!date) return toast("warning", "Please select a date before saving attendance!");

        const records = roster.map((s) => ({
            student_id: s.student_db_id,
            status: attendanceData[s.student_db_id] || "PRESENT",
        }));

        if (records.length === 0) return toast("warning", "There are no students to mark for this selection.");

        setSaving(true);
        try {
            const payload = { class_id: Number(classId), date, records };
            if (sectionId) payload.section_id = Number(sectionId);
            if (groupId) payload.group_id = Number(groupId);

            const res = await api.post("/attendance/bulk/", payload, authHeaders(token));
            setLastSummary(res.data);
            toast(
                "success",
                `Created ${res.data.created}, updated ${res.data.updated} record(s) for ${date}. Parent notifications are being sent in the background.`
            );
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end flex-wrap">
                <div className="flex flex-col min-w-[200px]">
                    <label className={labelClass}>Class</label>
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[180px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} cursor-pointer`} />
                </div>

                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={sectionId}
                        onChange={(e) => setSectionId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All sections</option>
                        {sectionOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All groups</option>
                        {groupOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[220px] flex-1">
                    <label className={labelClass}>Search roster</label>
                    <input
                        type="text"
                        placeholder="Name or student ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} disabled:opacity-50`}
                    />
                </div>
            </div>

            {classId && filteredRoster.length > 0 && (
                <div className="flex justify-between items-center mb-3">
                    <div className="text-sm text-gray-500">
                        {className} &middot; {filteredRoster.length} student{filteredRoster.length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => markAllVisible("PRESENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 cursor-pointer"
                        >
                            Mark all present
                        </button>
                        <button
                            type="button"
                            onClick={() => markAllVisible("ABSENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Mark all absent
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                {rosterLoading ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Loading roster...</div>
                ) : classId && filteredRoster.length > 0 ? (
                    filteredRoster.map((student) => {
                        const currentStatus = attendanceData[student.student_db_id] || "PRESENT";
                        return (
                            <div
                                key={student.student_db_id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0 gap-3"
                            >
                                <div className="min-w-[220px]">
                                    <div className="font-semibold text-base text-[var(--quinary)]">{student.full_name}</div>
                                    <div className="text-xs text-gray-400">
                                        {student.student_id}
                                        {student.section ? ` · ${student.section}` : ""}
                                        {student.group ? ` · ${student.group}` : ""}
                                        {student.already_marked && <span className="text-[var(--primary)]"> · already marked</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => markStatus(student.student_db_id, "PRESENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                        }`}
                                    >
                                        Present
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => markStatus(student.student_db_id, "ABSENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                        }`}
                                    >
                                        Absent
                                    </button>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        {classId ? "No students match this selection." : "Choose a class above to load its roster."}
                    </div>
                )}
            </div>

            {classId && filteredRoster.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={submitAttendance}
                        disabled={saving}
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                    >
                        {saving ? "Processing Records..." : "Save Attendance"}
                    </button>
                </div>
            )}

            {lastSummary && (
                <div className="mt-4 text-xs text-gray-500 bg-white border border-gray-200 rounded-xl p-3">
                    Last save: {lastSummary.created} created, {lastSummary.updated} updated for {className || lastSummary.class}.
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 2 — Records (search/filter, inline edit, delete, quick add)    */
/* ------------------------------------------------------------------ */

function RecordsTab({ token, Classes, Students, sectionOptionsFor, groupOptionsFor }) {
    const [filters, setFilters] = useState({
        search: "",
        class_id: "",
        section_id: "",
        group_id: "",
        date: "",
        month: "",
    });
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }));

    const fetchRecords = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, val]) => {
                if (val) params.set(key, val);
            });
            const res = await api.get(`/attendance/?${params.toString()}`, authHeaders(token));
            setRecords(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const updateStatus = async (record, status) => {
        if (record.status === status) return;
        setBusyId(record.id);
        try {
            await api.patch(`/attendance/${record.id}/`, { status }, authHeaders(token));
            setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status } : r)));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const deleteRecord = async (record) => {
        const confirm = await Swal.fire({
            title: "Delete this record?",
            text: `${record.student_name} · ${record.date}`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            confirmButtonColor: "#DC2626",
            background: "#F4F7FC",
            color: "#1A253C",
        });
        if (!confirm.isConfirmed) return;

        setBusyId(record.id);
        try {
            await api.delete(`/attendance/${record.id}/`, authHeaders(token));
            setRecords((prev) => prev.filter((r) => r.id !== record.id));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex flex-col min-w-[200px] flex-1">
                    <label className={labelClass}>Search</label>
                    <input
                        type="text"
                        placeholder="Student name or ID..."
                        value={filters.search}
                        onChange={(e) => setFilter("search", e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Class</label>
                    <select
                        value={filters.class_id}
                        onChange={(e) => {
                            setFilter("class_id", e.target.value);
                            setFilter("section_id", "");
                            setFilter("group_id", "");
                        }}
                        className={`${inputClass} cursor-pointer`}
                    >
                        <option value="">All classes</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[140px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={filters.section_id}
                        onChange={(e) => setFilter("section_id", e.target.value)}
                        disabled={!filters.class_id}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All</option>
                        {sectionOptionsFor(filters.class_id).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[140px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={filters.group_id}
                        onChange={(e) => setFilter("group_id", e.target.value)}
                        disabled={!filters.class_id}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All</option>
                        {groupOptionsFor(filters.class_id).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={filters.date} onChange={(e) => setFilter("date", e.target.value)} className={inputClass} />
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Month</label>
                    <input type="month" value={filters.month} onChange={(e) => setFilter("month", e.target.value)} className={inputClass} />
                </div>
                <button
                    type="button"
                    onClick={fetchRecords}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer"
                >
                    Apply
                </button>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
                >
                    {showAddForm ? "Cancel" : "+ Add record"}
                </button>
            </div>

            {showAddForm && (
                <QuickAddRecord
                    token={token}
                    Classes={Classes}
                    Students={Students}
                    onCreated={(created) => {
                        setRecords((prev) => [created, ...prev]);
                        setShowAddForm(false);
                    }}
                />
            )}

            {/* Results table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                            <th className="p-3">Student</th>
                            <th className="p-3">Class</th>
                            <th className="p-3">Section / Group</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-400">
                                    Loading records...
                                </td>
                            </tr>
                        ) : records.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-400">
                                    No attendance records match these filters.
                                </td>
                            </tr>
                        ) : (
                            records.map((record) => (
                                <tr key={record.id} className="border-b border-gray-50 last:border-0">
                                    <td className="p-3">
                                        <div className="font-semibold">{record.student_name}</div>
                                        <div className="text-xs text-gray-400">{record.student_id}</div>
                                    </td>
                                    <td className="p-3">{record.class_name}</td>
                                    <td className="p-3 text-xs text-gray-500">
                                        {record.section || "—"} / {record.group || "—"}
                                    </td>
                                    <td className="p-3">{record.date}</td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "PRESENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                                }`}
                                            >
                                                Present
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "ABSENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                                }`}
                                            >
                                                Absent
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button
                                            type="button"
                                            disabled={busyId === record.id}
                                            onClick={() => deleteRecord(record)}
                                            className="text-xs font-semibold text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function QuickAddRecord({ token, Classes, Students, onCreated }) {
    const [classId, setClassId] = useState("");
    const [studentId, setStudentId] = useState("");
    const [date, setDate] = useState(todayISO());
    const [status, setStatus] = useState("PRESENT");
    const [saving, setSaving] = useState(false);

    const classStudents = useMemo(
        () => Students.filter((s) => idOf(s.student_class) === Number(classId)),
        [Students, classId]
    );

    const submit = async () => {
        if (!classId || !studentId || !date) return toast("warning", "Class, student, and date are all required.");
        setSaving(true);
        try {
            const res = await api.post(
                "/attendance/",
                { student: Number(studentId), student_class: Number(classId), date, status },
                authHeaders(token)
            );
            onCreated(res.data);
            toast("success", "Attendance record added.");
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col min-w-[180px]">
                <label className={labelClass}>Class</label>
                <select
                    value={classId}
                    onChange={(e) => {
                        setClassId(e.target.value);
                        setStudentId("");
                    }}
                    className={`${inputClass} cursor-pointer`}
                >
                    <option value="">Select class</option>
                    {Classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                            {cls.display_name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col min-w-[220px] flex-1">
                <label className={labelClass}>Student</label>
                <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={!classId}
                    className={`${inputClass} cursor-pointer disabled:opacity-50`}
                >
                    <option value="">Select student</option>
                    {classStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.full_name} ({s.student_id})
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col min-w-[150px]">
                <label className={labelClass}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col min-w-[140px]">
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} cursor-pointer`}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                </select>
            </div>
            <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer"
            >
                {saving ? "Saving..." : "Add record"}
            </button>
            <p className="text-xs text-gray-400 w-full">
                Note: a duplicate (student, date) pair will be rejected by the backend — edit the existing record in the table instead.
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Shared: period / date toggle used by both analytics tabs           */
/* ------------------------------------------------------------------ */

function PeriodToggle({ period, onPeriodChange, date, onDateChange, options }) {
    return (
        <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col">
                <label className={labelClass}>Period</label>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    <button
                        type="button"
                        onClick={() => onPeriodChange("")}
                        className={`px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer ${
                            period === "" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500"
                        }`}
                    >
                        All-time
                    </button>
                    {options.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onPeriodChange(opt)}
                            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer ${
                                period === opt ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500"
                            }`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col">
                <label className={labelClass}>Reference date</label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => onDateChange(e.target.value)}
                    disabled={period === ""}
                    className={`${inputClass} cursor-pointer disabled:opacity-50`}
                />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 3 — Individual student analytics                               */
/* ------------------------------------------------------------------ */

function StudentAnalyticsTab({ token, Students }) {
    const [query, setQuery] = useState("");
    const [studentId, setStudentId] = useState("");
    const [period, setPeriod] = useState("week");
    const [date, setDate] = useState(todayISO());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);

    const matches = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.trim().toLowerCase();
        return Students.filter((s) => s.full_name?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)).slice(0, 8);
    }, [Students, query]);

    const fetchSummary = async (id = studentId) => {
        if (!id) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/summary/${id}/?${params.toString()}`, authHeaders(token));
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (studentId) fetchSummary(studentId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, period, date]);

    const downloadPDF = async () => {
        if (!studentId) return;
        setPdfLoading(true);
        try {
            const params = new URLSearchParams();
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/student-pdf/${studentId}/?${params.toString()}`, {
                ...authHeaders(token),
                responseType: "blob",
            });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = `attendance_${studentId}.pdf`;
            link.click();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div>
            {/* Student search */}
            <div className="relative mb-4 max-w-md">
                <label className={labelClass}>Find student</label>
                <input
                    type="text"
                    placeholder="Search by name or student ID..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={`${inputClass} w-full`}
                />
                {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                        {matches.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                    setStudentId(s.id);
                                    setQuery(`${s.full_name} (${s.student_id})`);
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                            >
                                <span className="font-semibold">{s.full_name}</span>{" "}
                                <span className="text-gray-400">({s.student_id})</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {studentId && (
                <>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap justify-between items-end gap-4">
                        <PeriodToggle period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} options={["day", "week", "month"]} />
                        <button
                            type="button"
                            onClick={downloadPDF}
                            disabled={pdfLoading}
                            className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {pdfLoading ? "Preparing PDF..." : "Download PDF"}
                        </button>
                    </div>

                    {loading || !data ? (
                        <div className="text-center py-8 text-gray-400 text-sm">{loading ? "Loading summary..." : "No data yet."}</div>
                    ) : (
                        <StudentSummaryView data={data} />
                    )}
                </>
            )}
        </div>
    );
}

function StudentSummaryView({ data }) {
    const { student, summary, monthly_breakdown, attendance_calendar, date_range } = data;
    const months = Object.entries(monthly_breakdown || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    return (
        <div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{student.full_name}</div>
                <div className="text-xs text-gray-400 mb-3">
                    {student.student_id} · {student.class}
                    {student.section ? ` · ${student.section}` : ""}
                    {student.group ? ` · ${student.group}` : ""}
                </div>
                {date_range && (
                    <div className="text-xs text-gray-400 mb-3">
                        Showing {date_range.start} to {date_range.end}
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard label="Total" value={summary.total_classes} />
                    <StatCard label="Present" value={summary.present} accent="text-green-600" />
                    <StatCard label="Absent" value={summary.absent} accent="text-red-500" />
                    <StatCard label="Attendance %" value={`${summary.attendance_percentage}%`} accent="text-[var(--primary)]" />
                </div>
            </div>

            {months.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4 overflow-x-auto">
                    <div className="text-sm font-bold mb-3">Monthly breakdown</div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                                <th className="p-2">Month</th>
                                <th className="p-2">Present</th>
                                <th className="p-2">Absent</th>
                                <th className="p-2">Total</th>
                                <th className="p-2">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map(([month, stats]) => (
                                <tr key={month} className="border-b border-gray-50 last:border-0">
                                    <td className="p-2 font-medium">{month}</td>
                                    <td className="p-2 text-green-600">{stats.present}</td>
                                    <td className="p-2 text-red-500">{stats.absent}</td>
                                    <td className="p-2">{stats.total}</td>
                                    <td className="p-2">{stats.percentage}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {attendance_calendar?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <div className="text-sm font-bold mb-3">Day-by-day</div>
                    <div className="flex flex-wrap gap-2">
                        {attendance_calendar.map((entry) => (
                            <div
                                key={entry.date}
                                title={`${entry.date} — ${entry.status}`}
                                className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                                    entry.status === "PRESENT" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}
                            >
                                {entry.date.slice(5)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, accent }) {
    return (
        <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${accent || "text-[var(--quinary)]"}`}>{value}</div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">{label}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 4 — Class analytics                                            */
/* ------------------------------------------------------------------ */

function ClassAnalyticsTab({ token, Classes, sectionOptionsFor, groupOptionsFor }) {
    const [classId, setClassId] = useState("");
    const [sectionId, setSectionId] = useState("");
    const [groupId, setGroupId] = useState("");
    const [period, setPeriod] = useState("month");
    const [date, setDate] = useState(todayISO());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);

    useEffect(() => {
        setSectionId("");
        setGroupId("");
    }, [classId]);

    const fetchAnalytics = async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ class_id: classId });
            if (sectionId) params.set("section_id", sectionId);
            if (groupId) params.set("group_id", groupId);
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/class-analytics/?${params.toString()}`, authHeaders(token));
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (classId) fetchAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, sectionId, groupId, period, date]);

    // The class PDF export only supports week/month — "day" is
    // deliberately not offered as an option for that button.
    const downloadPDF = async () => {
        if (!classId) return;
        const pdfPeriod = period === "day" || period === "" ? "month" : period;
        setPdfLoading(true);
        try {
            const params = new URLSearchParams({ class_id: classId, period: pdfPeriod, date });
            if (sectionId) params.set("section_id", sectionId);
            if (groupId) params.set("group_id", groupId);
            const res = await api.get(`/attendance/class-pdf/?${params.toString()}`, {
                ...authHeaders(token),
                responseType: "blob",
            });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = `class_${classId}_attendance.pdf`;
            link.click();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-4 mb-4 items-end">
                <div className="flex flex-col min-w-[200px]">
                    <label className={labelClass}>Class</label>
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={sectionId}
                        onChange={(e) => setSectionId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All sections</option>
                        {sectionOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All groups</option>
                        {groupOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {classId && (
                <>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap justify-between items-end gap-4">
                        <PeriodToggle period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} options={["day", "week", "month"]} />
                        <div className="flex flex-col items-end gap-1">
                            <button
                                type="button"
                                onClick={downloadPDF}
                                disabled={pdfLoading}
                                className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {pdfLoading ? "Preparing PDF..." : "Download Class Report"}
                            </button>
                            {period === "day" && <span className="text-[11px] text-gray-400">PDF report will use "month" — day isn't supported for exports.</span>}
                        </div>
                    </div>

                    {loading || !data ? (
                        <div className="text-center py-8 text-gray-400 text-sm">{loading ? "Loading analytics..." : "No data yet."}</div>
                    ) : (
                        <ClassSummaryView data={data} />
                    )}
                </>
            )}
        </div>
    );
}

function ClassSummaryView({ data }) {
    const { class: className, total_students, average_attendance, highest_attendance, lowest_attendance, total_present, total_absent, students, date_range } = data;

    return (
        <div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{className}</div>
                {date_range && (
                    <div className="text-xs text-gray-400 mb-3">
                        Showing {date_range.start} to {date_range.end}
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-2">
                    <StatCard label="Students" value={total_students} />
                    <StatCard label="Present" value={total_present} accent="text-green-600" />
                    <StatCard label="Absent" value={total_absent} accent="text-red-500" />
                    <StatCard label="Average %" value={`${average_attendance}%`} accent="text-[var(--primary)]" />
                    <StatCard label="Highest %" value={`${highest_attendance}%`} accent="text-green-600" />
                    <StatCard label="Lowest %" value={`${lowest_attendance}%`} accent="text-red-500" />
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                            <th className="p-3">Student</th>
                            <th className="p-3">Section / Group</th>
                            <th className="p-3">Present</th>
                            <th className="p-3">Absent</th>
                            <th className="p-3">Total</th>
                            <th className="p-3">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(students || []).map((s) => (
                            <tr key={s.student_db_id} className="border-b border-gray-50 last:border-0">
                                <td className="p-3">
                                    <div className="font-semibold">{s.full_name}</div>
                                    <div className="text-xs text-gray-400">{s.student_id}</div>
                                </td>
                                <td className="p-3 text-xs text-gray-500">
                                    {s.section || "—"} / {s.group || "—"}
                                </td>
                                <td className="p-3 text-green-600">{s.present}</td>
                                <td className="p-3 text-red-500">{s.absent}</td>
                                <td className="p-3">{s.total_classes}</td>
                                <td className="p-3 font-semibold">{s.attendance_percentage}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Attendance;