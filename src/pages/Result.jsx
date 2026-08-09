import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";

const Result = () => {
    const token = useAuthStore((state) => state.accessToken);
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Directory data
    const [Classes, setClasses] = useState([]);
    const [Sections, setSections] = useState([]);
    const [Groups, setGroups] = useState([]);
    const [Students, setStudents] = useState([]);

    // Filters
    const [SelectedClass, setSelectedClass] = useState("");
    const [SelectedSection, setSelectedSection] = useState("");
    const [SelectedGroup, setSelectedGroup] = useState("");
    const [SearchTerm, setSearchTerm] = useState("");
    const [DebouncedSearch, setDebouncedSearch] = useState("");

    // Loading flags
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null); // studentId or `${id}-${testId}` currently generating a PDF
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [loadingAvailable, setLoadingAvailable] = useState(false);
    const [availableReportsByStudent, setAvailableReportsByStudent] = useState({});

    // ---------------------------------------------------------
    // Debounce the search box so we don't hammer the API on every keystroke
    // ---------------------------------------------------------
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(SearchTerm.trim()), 400);
        return () => clearTimeout(timer);
    }, [SearchTerm]);

    // ---------------------------------------------------------
    // Load classes once on mount
    // ---------------------------------------------------------
    useEffect(() => {
        const loadClasses = async () => {
            try {
                const res = await api.get("/classes/", { headers: authHeaders });
                setClasses(res.data);
            } catch (err) {
                console.error("Failed to load classes:", err);
            }
        };
        if (token) loadClasses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // ---------------------------------------------------------
    // When class changes: reset dependent filters, load sections & groups
    // ---------------------------------------------------------
    useEffect(() => {
        setSelectedSection("");
        setSelectedGroup("");
        setSearchTerm("");
        setDebouncedSearch("");
        setSections([]);
        setGroups([]);
        setStudents([]);
        setExpandedStudentId(null);

        if (!SelectedClass || !token) return;

        const loadSectionsAndGroups = async () => {
            try {
                const [secRes, grpRes] = await Promise.all([
                    api.get(`/sections/?class_id=${SelectedClass}`, { headers: authHeaders }),
                    api.get(`/groups/?class_id=${SelectedClass}`, { headers: authHeaders }),
                ]);
                setSections(secRes.data || []);
                setGroups(grpRes.data || []);
            } catch (err) {
                console.error("Failed to load sections/groups:", err);
            }
        };
        loadSectionsAndGroups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SelectedClass, token]);

    // ---------------------------------------------------------
    // Load students whenever class/section/group/search change
    // ---------------------------------------------------------
    const fetchStudents = useCallback(async () => {
        if (!SelectedClass || !token) return;

        setLoadingStudents(true);
        try {
            const params = new URLSearchParams({ class_id: SelectedClass });
            if (SelectedSection) params.append("section_id", SelectedSection);
            if (SelectedGroup) params.append("group_id", SelectedGroup);
            if (DebouncedSearch) params.append("search", DebouncedSearch);

            const res = await api.get(`/students/?${params.toString()}`, {
                headers: authHeaders,
            });
            setStudents(res.data || []);
        } catch (err) {
            console.error("Failed to load students:", err);
            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SelectedClass, SelectedSection, SelectedGroup, DebouncedSearch, token]);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    // ---------------------------------------------------------
    // Download the PDF report card. testId is optional — omit it to
    // generate the combined report across every test the student has marks for.
    // ---------------------------------------------------------
    const handleDownloadReportCard = async (studentId, studentName, testId = null) => {
        const busyKey = testId ? `${studentId}-${testId}` : `${studentId}`;
        setDownloadingId(busyKey);
        try {
            const url = testId
                ? `/reports/report-card/${studentId}/?test_id=${testId}`
                : `/reports/report-card/${studentId}/`;

            const res = await api.get(url, {
                headers: authHeaders,
                responseType: "blob",
            });

            const file = new Blob([res.data], { type: "application/pdf" });
            const fileURL = URL.createObjectURL(file);
            window.open(fileURL, "_blank");
        } catch (err) {
            console.error("Report card download failed:", err);
            alert(`Could not generate the report card for ${studentName}. Make sure marks are assigned.`);
        } finally {
            setDownloadingId(null);
        }
    };

    // ---------------------------------------------------------
    // Expand a student row to show every test they have marks for,
    // each with its own download / WhatsApp action.
    // ---------------------------------------------------------
    const handleToggleAvailableTests = async (studentId) => {
        if (expandedStudentId === studentId) {
            setExpandedStudentId(null);
            return;
        }

        setExpandedStudentId(studentId);

        if (availableReportsByStudent[studentId]) return; // already cached

        setLoadingAvailable(true);
        try {
            const res = await api.get(`/reports/student/${studentId}/`, {
                headers: authHeaders,
            });
            setAvailableReportsByStudent((prev) => ({
                ...prev,
                [studentId]: res.data?.available_reports || [],
            }));
        } catch (err) {
            console.error("Failed to load available tests:", err);
            setAvailableReportsByStudent((prev) => ({ ...prev, [studentId]: [] }));
        } finally {
            setLoadingAvailable(false);
        }
    };

    // ---------------------------------------------------------
    // WhatsApp a single test's results to the student's guardian
    // ---------------------------------------------------------
    const handleSendWhatsAppText = async (studentId, testId) => {
        try {
            const res = await api.get(`/reports/whatsapp-text/${studentId}/${testId}/`, {
                headers: authHeaders,
            });

            const { phone, message } = res.data;

            if (!phone) {
                alert("This student profile doesn't have a phone number attached.");
                return;
            }

            let cleanPhone = phone.replace(/\D/g, "");
            if (cleanPhone.startsWith("0")) {
                cleanPhone = "92" + cleanPhone.substring(1);
            }

            const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, "_blank");
        } catch (err) {
            console.error("WhatsApp dispatch failed:", err);
            alert(err.response?.data?.error || "Failed to generate the WhatsApp text template.");
        }
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Academic Reports</div>
            <p className="text-gray-500 text-sm mb-6">Inspect, compile, and distribute finalized performance metrics and multi-test summaries.</p>

            {/* Filter Deck */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end bg-white p-5 rounded-2xl border border-gray-200 shadow-sm max-w-5xl flex-wrap">
                <div className="flex flex-col min-w-[220px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Class</label>
                    <select
                        value={SelectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer font-medium"
                    >
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name || cls.name}
                            </option>
                        ))}
                    </select>
                </div>

                {Sections.length > 0 && (
                    <div className="flex flex-col min-w-[180px] w-full sm:w-auto">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Section</label>
                        <select
                            value={SelectedSection}
                            onChange={(e) => setSelectedSection(e.target.value)}
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer font-medium"
                        >
                            <option value="">All Sections</option>
                            {Sections.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {Groups.length > 0 && (
                    <div className="flex flex-col min-w-[180px] w-full sm:w-auto">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Group</label>
                        <select
                            value={SelectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer font-medium"
                        >
                            <option value="">All Groups</option>
                            {Groups.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="flex flex-col min-w-[220px] w-full sm:w-auto flex-1">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Search (name or roll no.)</label>
                    <input
                        type="text"
                        value={SearchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={!SelectedClass}
                        placeholder="Search by name or student ID..."
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm disabled:opacity-50 disabled:bg-gray-50 font-medium"
                    />
                </div>
            </div>

            {/* Bulk / future actions — backend endpoints not implemented yet */}
            {SelectedClass && (
                <div className="flex gap-3 mb-8 max-w-5xl flex-wrap">
                    <button
                        disabled
                        title="Coming soon"
                        className="text-xs bg-gray-100 text-gray-400 font-semibold py-2 px-4 rounded-xl border border-gray-200 cursor-not-allowed"
                    >
                        📦 Generate Complete Class Reports (Coming soon)
                    </button>
                    <button
                        disabled
                        title="Coming soon"
                        className="text-xs bg-gray-100 text-gray-400 font-semibold py-2 px-4 rounded-xl border border-gray-200 cursor-not-allowed"
                    >
                        💬 WhatsApp All Parents (Coming soon)
                    </button>
                </div>
            )}

            {/* Student Roster */}
            <div className="max-w-5xl bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Class Registry List</h3>

                {!SelectedClass ? (
                    <div className="text-gray-400 text-xs italic py-4">Select a class to load its students.</div>
                ) : loadingStudents ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-gray-400 text-xs font-medium">
                        <div className="w-5 h-5 border-4 border-t-[var(--primary)] border-gray-200 rounded-full animate-spin"></div>
                        Loading students...
                    </div>
                ) : Students.length === 0 ? (
                    <div className="text-gray-400 text-xs italic py-4">No students found for the current filters.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {Students.map((student) => (
                            <div key={student.id} className="py-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="font-semibold text-[var(--quinary)] text-sm">{student.full_name}</div>
                                        <div className="text-xs text-gray-400">
                                            {student.student_id}
                                            {/* {student.section ? ` · ${student.section}` : ""}
                                            {student.group ? ` · ${student.group}` : ""} */}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={() => handleDownloadReportCard(student.id, student.full_name)}
                                            disabled={downloadingId === `${student.id}`}
                                            className="text-xs bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-40"
                                        >
                                            {downloadingId === `${student.id}` ? "Generating..." : "Full Report Card"}
                                        </button>
                                        <button
                                            onClick={() => handleToggleAvailableTests(student.id)}
                                            className="text-xs bg-gray-100 hover:bg-[var(--quinary)] hover:text-white text-gray-600 font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer"
                                        >
                                            {expandedStudentId === student.id ? "Hide Tests" : "View Tests"}
                                        </button>
                                    </div>
                                </div>

                                {expandedStudentId === student.id && (
                                    <div className="bg-[var(--secondary)] border border-gray-200 rounded-xl p-3 space-y-2">
                                        {loadingAvailable && !availableReportsByStudent[student.id] ? (
                                            <div className="text-xs text-gray-400 py-2">Loading test history...</div>
                                        ) : (availableReportsByStudent[student.id] || []).length === 0 ? (
                                            <div className="text-xs text-gray-400 py-2">No marks recorded for this student yet.</div>
                                        ) : (
                                            availableReportsByStudent[student.id].map((test) => (
                                                <div
                                                    key={test.test_id}
                                                    className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                                                >
                                                    <div>
                                                        <div className="text-sm font-semibold text-[var(--quinary)]">{test.test_name}</div>
                                                        <div className="text-xs text-gray-400">{test.date} · {test.percentage}%</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleDownloadReportCard(student.id, student.full_name, test.test_id)}
                                                            disabled={downloadingId === `${student.id}-${test.test_id}`}
                                                            className="text-xs bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-semibold py-1.5 px-3 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                                                        >
                                                            {downloadingId === `${student.id}-${test.test_id}` ? "..." : "Download"}
                                                        </button>
                                                        <button
                                                            onClick={() => handleSendWhatsAppText(student.id, test.test_id)}
                                                            className="text-xs bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer border border-emerald-200"
                                                        >
                                                            💬
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Result;