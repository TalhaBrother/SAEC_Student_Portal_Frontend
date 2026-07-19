import { useEffect, useState } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";
import Swal from "sweetalert2";

const Attendance = () => {
    const token = useAuthStore((state) => state.accessToken);

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [SelectedClass, setSelectedClass] = useState(""); // Fixed from [] to ""
    const [AttendanceData, setAttendanceData] = useState({});
    const [AttendanceDate, setAttendanceDate] = useState(new Date().toISOString().split("T")[0]); // Defaults to today
    const [loading, setLoading] = useState(false);

    // Safe filtering checking nested object structures
    const filteredStudents = Students.filter(
        (student) => (student.student_class?.id === Number(SelectedClass) || student.student_class === Number(SelectedClass))
    );

    // Controlled key-value storage object mapping studentId -> status string
    const markAttendance = (studentId, status) => {
        setAttendanceData((prev) => ({
            ...prev,
            [studentId]: status,
        }));
    };

    // Submits structured matrix payload to your bulk attendance route
    const submitAttendance = async () => {
        if (!SelectedClass) {
            alert("Please select a class before saving attendance!");
            return;
        }

        if (!AttendanceDate) {
            alert("Please select a date before saving attendance!");
            return;
        }

        const validRecords = Object.entries(AttendanceData).map(([student_id, status]) => ({
            student_id: Number(student_id),
            status,
        }));

        if (validRecords.length === 0) {
            alert("Please mark attendance for at least one student before saving.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                class_id: Number(SelectedClass),
                date: AttendanceDate,
                records: validRecords,
            };

            await api.post("/attendance/bulk/", payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            Swal.fire({
                title: "Success!",
                text: "Attendance Submitted Successfully!",
                icon: "success",
                confirmButtonText: "OK",
                confirmButtonColor: "#0056D2", // --primary
                background: "#F4F7FC",         // --secondary
                color: "#1A253C",              // --quinary
            });
        } catch (err) {
            console.error("Failed to save bulk attendance:", err);
            alert("Error sending record payload data to backend server.");
        } finally {
            setLoading(false);
        }
    };

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

        if (token) {
            fetchStudents();
            fetchClasses();
        }
    }, [token]);

    const handleClassChange = (e) => {
        setSelectedClass(e.target.value);
        setAttendanceData({}); // Reset selection cache when switching classrooms
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Daily Attendance</div>
            <p className="text-gray-500 text-sm mb-6">Select a class section below to document student presence.</p>

            {/* Select Options Dropdown Container */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
                <div className="flex flex-col min-w-[200px] w-full sm:w-auto">
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

                <div className="flex flex-col min-w-[200px] w-full sm:w-auto">
                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Date</label>
                    <input
                        type="date"
                        value={AttendanceDate}
                        onChange={(e) => setAttendanceDate(e.target.value)}
                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                    />
                </div>
            </div>

            {/* Student Grid Section */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                {SelectedClass && filteredStudents.length > 0 ? (
                    filteredStudents.map((student) => {
                        const currentStatus = AttendanceData[student.id];
                        return (
                            <div
                                key={student.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0 gap-4"
                            >
                                {/* Student Name */}
                                <div className="font-semibold text-base text-[var(--quinary)] min-w-[220px]">
                                    {student.full_name}
                                </div>


                                {/* Status Selection Buttons Container */}
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => markAttendance(student.id, "PRESENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${currentStatus === "PRESENT"
                                                ? "bg-green-500 border-green-500 text-white shadow-sm"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        Present
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => markAttendance(student.id, "ABSENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${currentStatus === "ABSENT"
                                                ? "bg-red-500 border-red-500 text-white shadow-sm"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
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
                        {SelectedClass ? "No students found registered under this class." : "Please choose a class from the options above to manage student data."}
                    </div>
                )}
            </div>

            {/* Global Actions Bar Container */}
            {SelectedClass && filteredStudents.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={submitAttendance}
                        disabled={loading}
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98]"
                    >
                        {loading ? "Processing Records..." : "Save Attendance"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default Attendance;