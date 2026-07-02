import useAuthStore from "../store/authStore";
import { useEffect, useState } from "react";
import api from "../api/axios";

const Assign_Marks = () => {
    const token = useAuthStore((state) => state.accessToken);

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [Subjects, setSubjects] = useState([]);
    const [Tests, setTests] = useState([]);
    const [Marks, setMarks]=useState([]);
    const [SelectedClass, setSelectedClass] = useState("");
    const [SelectedTest, setSelectedTest] = useState("");

    // Safe filtering checking nested object structures or raw IDs
    const filteredStudents = Students.filter(
        (student) => (student.student_class?.id === Number(SelectedClass) || student.student_class === Number(SelectedClass))
    );
    
    const filteredSubjects = Subjects.filter(
        (subject) => (subject.student_class?.id === Number(SelectedClass) || subject.student_class === Number(SelectedClass))
    );

    const filteredTests = Tests.filter(
        (test) => (test.student_class?.id === Number(SelectedClass) || test.student_class === Number(SelectedClass))
    );

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/students/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setStudents(res.data);
            } catch (err) {
                console.log(err);
            }
        };

        const fetchClasses = async () => {
            try {
                const res = await api.get("/classes/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setClasses(res.data);
            } catch (err) {
                console.log(err);
            }
        };

        const fetchSubjects = async () => {
            try {
                const res = await api.get("/subjects/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSubjects(res.data);
            } catch (err) {
                console.log(err);
            }
        };

        const fetchTests = async () => {
            try {
                const res = await api.get("/tests/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setTests(res.data);
            } catch (err) {
                console.log(err);
            }
        };

         const fetchMarks = async () => {
            try {
                const res = await api.get("/marks/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setMarks(res.data);
                console.log(res.data)
            } catch (err) {
                console.log(err);
            }
        };

        

        if (token) {
            fetchStudents();
            fetchClasses();
            fetchSubjects();
            fetchTests();
            fetchMarks()
        }
    }, [token]);

    // Handle clearing the test selection if the class changes
    const handleClassChange = (e) => {
        setSelectedClass(e.target.value);
        setSelectedTest(""); 
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Assign Marks</div>
            <p className="text-gray-500 text-sm mb-6">Select a class and an assessment to record student grades.</p>

            {/* Select Options Container */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
                {/* Dropdown for Classes */}
                <div className="flex flex-col min-w-[200px]">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Class</label>
                    <select
                        value={SelectedClass}
                        onChange={handleClassChange}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                    >
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Dropdown for Tests */}
                <div className="flex flex-col min-w-[200px]">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Assessment / Test</label>
                    <select
                        value={SelectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        disabled={!SelectedClass}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:bg-gray-100"
                    >
                        <option value="">Select Test</option>
                        {filteredTests.map((test) => (
                            <option key={test.id} value={test.id}>
                                {test.name} ({test.date})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Student List Grid Layout */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                {SelectedClass && filteredStudents.length > 0 ? (
                    filteredStudents.map((student) => (
                        <div
                            key={student.id}
                            className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0 gap-4"
                        >
                            {/* Student Name */}
                            <div className="font-semibold text-base text-[var(--quinary)] min-w-[220px]">
                                {student.full_name}
                            </div>

                            {/* Subjects Inputs Container aligned next to the student */}
                            <div className="flex flex-wrap gap-3 items-center">
                                {filteredSubjects.map((subject) => (
                                    <div 
                                        key={subject.id} 
                                        className="flex items-center gap-2 bg-[var(--secondary)] px-3 py-1.5 rounded-xl border border-gray-200"
                                    >
                                        <span className="text-xs uppercase text-gray-600 font-bold">
                                            {subject.name}:
                                        </span>
                                        <input 
                                            type="number" 
                                            placeholder="Score" 
                                            min="0"
                                            className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-sm text-center text-[var(--quinary)] outline-none focus:border-[var(--primary)]"
                                        />
                                    </div>
                                ))}
                                {filteredSubjects.length === 0 && (
                                    <span className="text-gray-400 text-sm italic">No subjects assigned to this class.</span>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        {SelectedClass ? "No students found registered under this class." : "Please choose a class from the options above to manage student data."}
                    </div>
                )}
            </div>

            {/* Global Submit Action Button */}
            {SelectedClass && filteredStudents.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button 
                        type="button"
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98]"
                    >
                        Save Dynamic Marks
                    </button>
                </div>
            )}
        </div>
    );
};

export default Assign_Marks;