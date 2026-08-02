import useAuthStore from "../store/authStore";
import { useEffect, useState } from "react";
import api from "../api/axios";
import Swal from "sweetalert2";

const Assign_Marks = () => {
    const token = useAuthStore((state) => state.accessToken);

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [Subjects, setSubjects] = useState([]);
    const [Tests, setTests] = useState([]);
    const [Marks, setMarks] = useState([]);

    const [SelectedClass, setSelectedClass] = useState("");
    const [SelectedTest, setSelectedTest] = useState("");
    const [globalTotalMarks, setGlobalTotalMarks] = useState("100");
    const [scoresInput, setScoresInput] = useState({});
    const [loading, setLoading] = useState(false);

    // Group-related state
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState("");
    const [groupsLoading, setGroupsLoading] = useState(false);

    // Filter students by selected class AND group (if specified)
    const filteredStudents = Students.filter((student) => {
        const matchesClass =
            student.student_class?.id === Number(SelectedClass) ||
            student.student_class === Number(SelectedClass);

        if (!matchesClass) return false;

        // If no specific group is selected (or "All Groups" is chosen), show all students in the class
        if (!selectedGroup) return true;

        const studentGroupId = student.group?.id ?? student.group;
        return Number(studentGroupId) === Number(selectedGroup);
    });

    const filteredSubjects = Subjects.filter(
        (subject) => (subject.student_class?.id === Number(SelectedClass) || subject.student_class === Number(SelectedClass))
    );

    const filteredTests = Tests.filter(
        (test) => (test.student_class?.id === Number(SelectedClass) || test.student_class === Number(SelectedClass))
    );

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/students/", { headers: { Authorization: `Bearer ${token}` } });
                console.log(res.data)
                setStudents(res.data);
            } catch (err) { console.log(err); }
        };
        const fetchClasses = async () => {
            try {
                const res = await api.get("/classes/", { headers: { Authorization: `Bearer ${token}` } });
                setClasses(res.data);
            } catch (err) { console.log(err); }
        };
        const fetchSubjects = async () => {
            try {
                const res = await api.get("/subjects/", { headers: { Authorization: `Bearer ${token}` } });
                setSubjects(res.data);
            } catch (err) { console.log(err); }
        };
        const fetchTests = async () => {
            try {
                const res = await api.get("/tests/", { headers: { Authorization: `Bearer ${token}` } });
                setTests(res.data);
            } catch (err) { console.log(err); }
        };
        const fetchMarks = async () => {
            try {
                const res = await api.get("/marks/", { headers: { Authorization: `Bearer ${token}` } });
                setMarks(res.data);
            } catch (err) { console.log(err); }
        };

        if (token) {
            fetchStudents();
            fetchClasses();
            fetchSubjects();
            fetchTests();
            fetchMarks();
        }
    }, [token]);

    // Fetch groups whenever SelectedClass changes
    useEffect(() => {
        const fetchGroups = async () => {
            setGroupsLoading(true);
            try {
                const res = await api.get(`/groups/?class_id=${SelectedClass}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setGroups(res.data);
            } catch (err) {
                console.log(err);
                setGroups([]);
            } finally {
                setGroupsLoading(false);
            }
        };

        setSelectedGroup(""); // Reset selected group on class change

        if (token && SelectedClass) {
            fetchGroups();
        } else {
            setGroups([]);
        }
    }, [SelectedClass, token]);

    useEffect(() => {
        if (SelectedTest && Marks.length > 0) {
            const initialScores = {};
            const testMarks = Marks.filter(m => Number(m.test?.id || m.test) === Number(SelectedTest));

            testMarks.forEach(mark => {
                const studentId = mark.student?.id || mark.student;
                const subjectId = mark.subject?.id || mark.subject;
                if (studentId && subjectId) {
                    initialScores[`${studentId}_${subjectId}`] = mark.obtained_marks !== undefined ? mark.obtained_marks : "";
                }
            });
            setScoresInput(initialScores);
        } else {
            setScoresInput({});
        }
    }, [SelectedTest, Marks]);

    const handleClassChange = (e) => {
        setSelectedClass(e.target.value);
        setSelectedTest("");
    };

    const handleScoreChange = (studentId, subjectId, val) => {
        setScoresInput(prev => ({
            ...prev,
            [`${studentId}_${subjectId}`]: val
        }));
    };

    const handleSaveMarks = async () => {
        if (!SelectedTest) {
            alert("Please select a test before saving marks!");
            return;
        }

        setLoading(true);
        try {
            const marksArray = Object.entries(scoresInput)
                .filter(([_, score]) => score !== "")
                .map(([key, score]) => {
                    const [studentId, subjectId] = key.split("_");
                    return {
                        student_id: Number(studentId),
                        subject_id: Number(subjectId),
                        obtained_marks: Number(score),
                        total_marks: Number(globalTotalMarks)
                    };
                });

            const bulkPayload = {
                test_id: Number(SelectedTest),
                marks: marksArray
            };

            await api.post("/marks/bulk/", bulkPayload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            Swal.fire({
                title: "Success!",
                text: "Marks Submitted Successfully!",
                icon: "success",
                confirmButtonText: "OK",
                confirmButtonColor: "#0056D2",
                background: "#F4F7FC",
                color: "#1A253C",
            });

            const updatedMarks = await api.get("/marks/", { headers: { Authorization: `Bearer ${token}` } });
            setMarks(updatedMarks.data);
        } catch (err) {
            console.error("Failed to save bulk marks:", err);
            alert("Error sending request payload to backend bulk route.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Assign Marks</div>
            <p className="text-gray-500 text-sm mb-6">Select a class, optional group, and an assessment to record student grades.</p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
                {/* Class Select */}
                <div className="flex flex-col min-w-[200px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Class</label>
                    <select
                        value={SelectedClass}
                        onChange={handleClassChange}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer"
                    >
                        <option value="">Select Class</option>
                        {Classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.display_name}</option>)}
                    </select>
                </div>

                {/* Group Select (Conditional based on class) */}
                {SelectedClass && groupsLoading && (
                    <div className="flex flex-col min-w-[180px] w-full sm:w-auto">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Group</label>
                        <div className="text-sm text-gray-400 p-3">Loading groups...</div>
                    </div>
                )}

                {SelectedClass && !groupsLoading && groups.length > 0 && (
                    <div className="flex flex-col min-w-[180px] w-full sm:w-auto">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Group</label>
                        <select
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer"
                        >
                            <option value="">All Groups</option>
                            {groups.map((grp) => (
                                <option key={grp.id} value={grp.id}>{grp.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Assessment Select */}
                <div className="flex flex-col min-w-[200px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Assessment / Test</label>
                    <select
                        value={SelectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        disabled={!SelectedClass}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm cursor-pointer disabled:opacity-50 disabled:bg-gray-100"
                    >
                        <option value="">Select Test</option>
                        {filteredTests.map((test) => <option key={test.id} value={test.id}>{test.name} ({test.date})</option>)}
                    </select>
                </div>

                {/* Total Marks */}
                <div className="flex flex-col w-full sm:w-28">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Total Marks</label>
                    <input
                        type="number"
                        min="1"
                        value={globalTotalMarks}
                        onChange={(e) => setGlobalTotalMarks(e.target.value)}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] text-sm text-center"
                    />
                </div>
            </div>

            {/* Students List Container */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                {SelectedClass && filteredStudents.length > 0 ? (
                    filteredStudents.map((student) => (
                        <div key={student.id} className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0 gap-4">
                            <div className="font-semibold text-base text-[var(--quinary)] min-w-[220px]">{student.full_name}</div>
                            <div className="flex flex-wrap gap-3 items-center">
                                {filteredSubjects.map((subject) => {
                                    const inputKey = `${student.id}_${subject.id}`;
                                    return (
                                        <div key={subject.id} className="flex items-center gap-2 bg-[var(--secondary)] px-3 py-1.5 rounded-xl border border-gray-200">
                                            <span className="text-xs uppercase text-gray-600 font-bold">{subject.name}:</span>
                                            <input
                                                type="number"
                                                placeholder="Score"
                                                min="0"
                                                max={globalTotalMarks}
                                                value={scoresInput[inputKey] || ""}
                                                onChange={(e) => handleScoreChange(student.id, subject.id, e.target.value)}
                                                className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-sm text-center text-[var(--quinary)] outline-none focus:border-[var(--primary)]"
                                            />
                                            <span className="text-xs text-gray-400">/ {globalTotalMarks}</span>
                                        </div>
                                    );
                                })}
                                {filteredSubjects.length === 0 && <span className="text-gray-400 text-sm italic">No subjects assigned to this class.</span>}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        {SelectedClass
                            ? selectedGroup
                                ? "No students found registered under this class group."
                                : "No students found registered under this class."
                            : "Please choose a class from the options above to manage student data."}
                    </div>
                )}
            </div>

            {SelectedClass && filteredStudents.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={handleSaveMarks}
                        disabled={loading || !SelectedTest}
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98]"
                    >
                        {loading ? "Saving Records..." : "Save Dynamic Marks"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default Assign_Marks;