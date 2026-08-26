import { useEffect, useState, useCallback, useRef } from "react";
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

    // Report card format is a single global setting on the backend — there's
    // no per-request param. To give per-download choice anyway, we flip that
    // global setting immediately before each download/zip request. This ref
    // tracks what we last set it to, so we skip redundant PATCH calls.
    const lastSetFormatRef = useRef(null);

    // Whole-class ZIP generation
    const [downloadingZip, setDownloadingZip] = useState(false);
    const [classZipFormat, setClassZipFormat] = useState("current"); // "current" | "individual"
    const [classTests, setClassTests] = useState([]);
    const [loadingClassTests, setLoadingClassTests] = useState(false);
    const [selectedZipTestId, setSelectedZipTestId] = useState("");

    // Per-student test selection for the row-level Format 2 (individual)
    // download — keyed by studentId, since Format 2 always needs one test.
    const [rowTestSelection, setRowTestSelection] = useState({});

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
    // Load the tests available for the selected class, so the whole-class
    // ZIP action can offer a test picker when Format 2 is chosen.
    // ---------------------------------------------------------
    useEffect(() => {
        setClassTests([]);
        setSelectedZipTestId("");
        setClassZipFormat("current");

        if (!SelectedClass || !token) return;

        const loadClassTests = async () => {
            setLoadingClassTests(true);
            try {
                const res = await api.get(`/report-tests/?class_id=${SelectedClass}`, {
                    headers: authHeaders,
                });
                setClassTests(res.data || []);
            } catch (err) {
                console.error("Failed to load class tests:", err);
                setClassTests([]);
            } finally {
                setLoadingClassTests(false);
            }
        };
        loadClassTests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SelectedClass, token]);

    // ---------------------------------------------------------
    // Make sure the backend's global report-card-format setting matches
    // what this specific download needs, right before requesting it.
    // Skips the PATCH if we already know it's set correctly.
    // ---------------------------------------------------------
    const ensureServerFormat = async (format) => {
        if (lastSetFormatRef.current === format) return;
        await api.patch(
            "/reports/report-card-settings/",
            { format },
            { headers: authHeaders }
        );
        lastSetFormatRef.current = format;
    };

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
        setRowTestSelection({});

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
    // Download the combined report card (every test, Format 1 only —
    // Format 2 always needs one specific test, see handleDownloadTestReport).
    // ---------------------------------------------------------
    const handleDownloadReportCard = async (studentId, studentName) => {
        const busyKey = `${studentId}`;
        setDownloadingId(busyKey);
        try {
            await ensureServerFormat("current");

            const res = await api.get(`/reports/report-card/${studentId}/`, {
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
    // Download a single test's report card in either format.
    // format: "current" (Format 1) | "individual" (Format 2)
    // ---------------------------------------------------------
    const handleDownloadTestReport = async (studentId, studentName, testId, format) => {
        const busyKey = `${studentId}-${testId}-${format}`;
        setDownloadingId(busyKey);
        try {
            await ensureServerFormat(format);

            const res = await api.get(
                `/reports/report-card/${studentId}/?test_id=${testId}`,
                {
                    headers: authHeaders,
                    responseType: "blob",
                }
            );

            const file = new Blob([res.data], { type: "application/pdf" });
            const fileURL = URL.createObjectURL(file);
            window.open(fileURL, "_blank");
        } catch (err) {
            console.error("Test report download failed:", err);
            alert(`Could not generate this report for ${studentName}. Make sure marks are assigned for this test.`);
        } finally {
            setDownloadingId(null);
        }
    };

    // ---------------------------------------------------------
    // Generate a ZIP of report cards, in the chosen format, for every
    // student matching the currently selected class/section/group/search
    // filters. Format 2 additionally requires one test selected up front
    // (that format is inherently per-test).
    // ---------------------------------------------------------
    const handleGenerateClassZip = async () => {
        if (!SelectedClass) return;

        if (classZipFormat === "individual" && !selectedZipTestId) {
            alert("Please select a test first — Format 2 needs one test to generate the whole class's reports.");
            return;
        }

        setDownloadingZip(true);
        try {
            await ensureServerFormat(classZipFormat);

            const params = new URLSearchParams({ class_id: SelectedClass });
            if (SelectedSection) params.append("section_id", SelectedSection);
            if (SelectedGroup) params.append("group_id", SelectedGroup);
            if (DebouncedSearch) params.append("search", DebouncedSearch);
            if (classZipFormat === "individual") params.append("test_id", selectedZipTestId);

            const res = await api.get(
                `/reports/class-report-cards-zip/?${params.toString()}`,
                {
                    headers: authHeaders,
                    responseType: "blob",
                }
            );

            let filename = `report_cards_class_${SelectedClass}.zip`;
            const disposition = res.headers?.["content-disposition"];
            if (disposition) {
                const match = disposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = match[1];
            }

            const file = new Blob([res.data], { type: "application/zip" });
            const fileURL = URL.createObjectURL(file);

            const link = document.createElement("a");
            link.href = fileURL;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(fileURL);
        } catch (err) {
            console.error("Class report ZIP generation failed:", err);
            alert(
                "Could not generate the class report cards. Make sure students matching this selection exist."
            );
        } finally {
            setDownloadingZip(false);
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

            {/* Bulk actions */}
            {SelectedClass && (
                <div className="flex flex-col gap-3 mb-8 max-w-5xl bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Whole Class Format:</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setClassZipFormat("current"); setSelectedZipTestId(""); }}
                                className={`text-xs font-semibold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                                    classZipFormat === "current"
                                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                        : "bg-white text-[var(--quinary)] border-gray-300 hover:border-[var(--primary)]"
                                }`}
                            >
                                Format 1
                            </button>
                            <button
                                onClick={() => setClassZipFormat("individual")}
                                className={`text-xs font-semibold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                                    classZipFormat === "individual"
                                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                        : "bg-white text-[var(--quinary)] border-gray-300 hover:border-[var(--primary)]"
                                }`}
                            >
                                Format 2
                            </button>
                        </div>

                        {classZipFormat === "individual" && (
                            <select
                                value={selectedZipTestId}
                                onChange={(e) => setSelectedZipTestId(e.target.value)}
                                disabled={loadingClassTests}
                                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-lg py-1.5 px-3 outline-none focus:border-[var(--primary)] text-xs cursor-pointer font-medium disabled:opacity-50 min-w-[160px]"
                            >
                                <option value="">
                                    {loadingClassTests ? "Loading tests..." : "Select a test"}
                                </option>
                                {classTests.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {classZipFormat === "individual" && (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            Format 2 generates one report per student for a single test — pick the test above before generating.
                        </div>
                    )}

                    <div className="flex gap-3 flex-wrap">
                        <button
                            onClick={handleGenerateClassZip}
                            disabled={
                                downloadingZip ||
                                loadingStudents ||
                                Students.length === 0 ||
                                (classZipFormat === "individual" && !selectedZipTestId)
                            }
                            className="text-xs bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-semibold py-2 px-4 rounded-xl border border-gray-200 transition-all cursor-pointer disabled:opacity-40"
                        >
                            {downloadingZip ? "Generating ZIP..." : "📦 Generate Complete Class Reports"}
                        </button>
                    </div>
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
                                            {downloadingId === `${student.id}` ? "Generating..." : "Full Report Card (Format 1)"}
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <select
                                                value={rowTestSelection[student.id] || ""}
                                                onChange={(e) =>
                                                    setRowTestSelection((prev) => ({
                                                        ...prev,
                                                        [student.id]: e.target.value,
                                                    }))
                                                }
                                                disabled={loadingClassTests || classTests.length === 0}
                                                className="text-xs bg-white text-[var(--quinary)] border border-gray-300 rounded-xl py-2 px-2 outline-none focus:border-[var(--primary)] cursor-pointer font-medium disabled:opacity-50 max-w-[130px]"
                                            >
                                                <option value="">
                                                    {loadingClassTests
                                                        ? "Loading tests..."
                                                        : classTests.length === 0
                                                        ? "No tests"
                                                        : "Select test"}
                                                </option>
                                                {classTests.map((t) => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() =>
                                                    handleDownloadTestReport(
                                                        student.id,
                                                        student.full_name,
                                                        rowTestSelection[student.id],
                                                        "individual"
                                                    )
                                                }
                                                disabled={
                                                    !rowTestSelection[student.id] ||
                                                    downloadingId === `${student.id}-${rowTestSelection[student.id]}-individual`
                                                }
                                                className="text-xs bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-40 border border-indigo-200"
                                            >
                                                {downloadingId === `${student.id}-${rowTestSelection[student.id]}-individual`
                                                    ? "..."
                                                    : "Format 2"}
                                            </button>
                                        </div>
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
                                                    <div className="flex gap-2 flex-wrap">
                                                        <button
                                                            onClick={() => handleDownloadTestReport(student.id, student.full_name, test.test_id, "current")}
                                                            disabled={downloadingId === `${student.id}-${test.test_id}-current`}
                                                            className="text-xs bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-semibold py-1.5 px-3 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                                                        >
                                                            {downloadingId === `${student.id}-${test.test_id}-current` ? "..." : "Format 1"}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownloadTestReport(student.id, student.full_name, test.test_id, "individual")}
                                                            disabled={downloadingId === `${student.id}-${test.test_id}-individual`}
                                                            className="text-xs bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 font-semibold py-1.5 px-3 rounded-lg transition-all cursor-pointer disabled:opacity-40 border border-indigo-200"
                                                        >
                                                            {downloadingId === `${student.id}-${test.test_id}-individual` ? "..." : "Format 2"}
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