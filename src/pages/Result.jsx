import { useEffect, useState } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";

const Result = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Structural System State
    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [Tests, setTests] = useState([]);
    
    // Filtering & Selections
    const [SelectedClass, setSelectedClass] = useState("");
    const [SelectedTest, setSelectedTest] = useState("");

    // Report Viewing Data Storage
    const [activeReportCard, setActiveReportCard] = useState(null);
    const [activeHistory, setActiveHistory] = useState(null);
    const [selectedStudentName, setSelectedStudentName] = useState("");
    const [loadingReport, setLoadingReport] = useState(false);

    // Client-side filtration
    const filteredStudents = Students.filter(
        (student) => (student.student_class?.id === Number(SelectedClass) || student.student_class === Number(SelectedClass))
    );

    const filteredTests = Tests.filter(
        (test) => (test.student_class?.id === Number(SelectedClass) || test.student_class === Number(SelectedClass))
    );

    // API Pipeline Handlers
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const headers = { Authorization: `Bearer ${token}` };
                const [studRes, clsRes, testRes] = await Promise.all([
                    api.get("/students/", { headers }),
                    api.get("/classes/", { headers }),
                    api.get("/tests/", { headers })
                ]);
                setStudents(studRes.data);
                setClasses(clsRes.data);
                setTests(testRes.data);
            } catch (err) {
                console.error("Failed to load initial directory datasets:", err);
            }
        };
        if (token) fetchInitialData();
    }, [token]);

   // FETCH & VIEW: Individual Test Report Card (Generates and opens PDF)
const handleFetchReportCard = async (studentId, studentName) => {
    if (!SelectedTest) {
        alert("Please select a target evaluation test framework first!");
        return;
    }
    setLoadingReport(true);
    setSelectedStudentName(studentName);
    
    try {
        // CRITICAL: responseType: 'blob' tells Axios to handle raw file binaries
        const res = await api.get(`reports/report-card/${studentId}/`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob' 
        });

        // 1. Create a local temporary URL for the binary PDF data
        const file = new Blob([res.data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);

        // 2. Open the PDF in a new browser tab for professional viewing/printing
        window.open(fileURL, '_blank');

    } catch (err) {
        console.error("PDF Compilation Error:", err);
        alert("Could not retrieve Report Card. Make sure marks are assigned for this test.");
    } finally {
        setLoadingReport(false);
    }
};

// FETCH & VIEW: Full History Report (Assuming this might also be a PDF layout)
const handleFetchHistory = async (studentId, studentName) => {
    setLoadingReport(true);
    setSelectedStudentName(studentName);
    
    try {
        const res = await api.get(`reports/student/${studentId}/`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob' // Keeps backend file consistency
        });

        const file = new Blob([res.data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');

    } catch (err) {
        console.error("History Stream Error:", err);
        alert("Failed to track down timeline history profiles for this student entry.");
    } finally {
        setLoadingReport(false);
    }
};

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Context Module Header */}
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Academic Analytics & Reports</div>
            <p className="text-gray-500 text-sm mb-6">Inspect, compile, and distribute finalized performance metrics and multi-test summaries.</p>

            {/* Controls Filter Deck Container */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end bg-white p-5 rounded-2xl border border-gray-200 shadow-sm max-w-4xl">
                <div className="flex flex-col min-w-[220px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Target Class Registry</label>
                    <select
                        value={SelectedClass}
                        onChange={(e) => { setSelectedClass(e.target.value); setSelectedTest(""); }}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer font-medium"
                    >
                        <option value="">Select Class</option>
                        {Classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                    </select>
                </div>

                <div className="flex flex-col min-w-[220px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Evaluation Cycle (Test)</label>
                    <select
                        value={SelectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        disabled={!SelectedClass}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer disabled:opacity-50 disabled:bg-gray-50 font-medium"
                    >
                        <option value="">Select Target Test</option>
                        {filteredTests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Split Screen Panel Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                
                {/* Roster Selection Block */}
                <div className="xl:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Class Registry List</h3>
                    
                    {SelectedClass && filteredStudents.length > 0 ? (
                        filteredStudents.map((student) => (
                            <div key={student.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0 space-y-2">
                                <div className="font-semibold text-[var(--quinary)] text-sm">{student.full_name}</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleFetchReportCard(student.id, student.full_name)}
                                        disabled={!SelectedTest}
                                        className="text-xs bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:hover:bg-[var(--secondary)] disabled:hover:text-[var(--primary)]"
                                    >
                                        Report Card
                                    </button>
                                    <button
                                        onClick={() => handleFetchHistory(student.id, student.full_name)}
                                        className="text-xs bg-gray-100 hover:bg-[var(--quinary)] hover:text-white text-gray-600 font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer"
                                    >
                                        Full History
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-400 text-xs italic py-4">Select an active class directory filter to map profiles.</div>
                    )}
                </div>

                {/* Display Analytics Terminal Window */}
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 min-h-[400px] flex flex-col justify-between">
                    
                    {loadingReport ? (
                        <div className="flex flex-col items-center justify-center my-auto space-y-2 py-20">
                            <div className="w-8 h-8 border-4 border-t-[var(--primary)] border-gray-200 rounded-full animate-spin"></div>
                            <span className="text-gray-400 text-xs font-medium">Assembling Records...</span>
                        </div>
                    ) : activeReportCard ? (
                        /* OPTION A: COMPACT REPORT CARD FORMAT */
                        <div className="space-y-6">
                            <div className="border-b border-gray-200 pb-4 flex justify-between items-start">
                                <div>
                                    <h4 className="text-xl font-bold text-[var(--quinary)]">{selectedStudentName}</h4>
                                    <p className="text-xs text-[var(--primary)] font-semibold tracking-wider uppercase mt-1">
                                        {activeReportCard.test_name || "Official Assessment Record Summary"}
                                    </p>
                                </div>
                                <button onClick={() => window.print()} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-2 px-4 rounded-xl border border-gray-300 transition-all cursor-pointer">
                                    Print Document
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase tracking-wider text-xs">
                                            <th className="pb-3">Subject Module</th>
                                            <th className="pb-3 text-center">Marks Obtained</th>
                                            <th className="pb-3 text-center">Max Base Allocation</th>
                                            <th className="pb-3 text-right">Performance Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                                        {(activeReportCard.marks || []).map((m, idx) => (
                                            <tr key={idx}>
                                                <td className="py-3.5 font-semibold text-[var(--quinary)]">{m.subject_name || m.subject}</td>
                                                <td className="py-3.5 text-center font-mono text-base text-gray-900">{m.obtained_marks}</td>
                                                <td className="py-3.5 text-center font-mono text-gray-400">/ {m.total_marks}</td>
                                                <td className="py-3.5 text-right">
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${m.obtained_marks >= (m.total_marks * 0.4) ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                                        {m.obtained_marks >= (m.total_marks * 0.4) ? "Clear" : "Deficit"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : activeHistory ? (
                        /* OPTION B: FULL TIMELINE AUDIT HISTORY RECORD */
                        <div className="space-y-6">
                            <div className="border-b border-gray-200 pb-4">
                                <h4 className="text-xl font-bold text-[var(--quinary)]">{selectedStudentName}</h4>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Institutional Evaluation Timeline Log</p>
                            </div>

                            <div className="space-y-4 relative border-l-2 border-gray-100 pl-4 ml-2">
                                {(activeHistory.reports || activeHistory).map((report, idx) => (
                                    <div key={idx} className="relative space-y-2">
                                        <div className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-[var(--primary)] ring-4 ring-white" />
                                        <div className="bg-[var(--secondary)] border border-gray-200 rounded-xl p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-sm text-[var(--quinary)]">{report.test_name}</span>
                                                <span className="text-xs font-mono text-gray-400">{report.date || "Archived Matrix"}</span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                                {(report.marks || []).map((m, mIdx) => (
                                                    <div key={mIdx} className="bg-white px-2.5 py-1.5 rounded-lg border border-gray-100 flex justify-between font-medium">
                                                        <span className="text-gray-500">{m.subject_name || m.subject}:</span>
                                                        <span className="font-bold text-[var(--quinary)]">{m.obtained_marks}/{m.total_marks}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* EMPTY HOVER STATE BACKGROUND INTERACTION FLAG */
                        <div className="text-center py-24 my-auto text-gray-400 text-sm">
                            No student reports fetched. Select a student and action path parameter from the sidebar to compile metric representations.
                        </div>
                    )}

                    {/* Bottom Status Branding Disclaimer */}
                    <div className="border-t border-gray-100 pt-4 mt-6 flex justify-between items-center text-[10px] text-gray-400 font-mono tracking-widest uppercase">
                        <span>Data State Core: Synchronized</span>
                        <span>Secure Verification Portal</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Result;