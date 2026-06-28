import { useEffect, useState } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";

const Attendance = () => {
    const [Students, setStudents] = useState([])
    const [Classes, setClasses] = useState([])
    const [SelectedClass, setSelectedClass] = useState([])
    const [AttendanceData, setAttendanceData] = useState({})
    const token = useAuthStore((state) => state.accessToken);

    const filteredStudents = Students.filter(
        (student) => student.student_class.id === Number(SelectedClass)
    )

    const markAttendance = (studentId, status) => {
        setAttendanceData((prev) => ({
            ...prev, [studentId]: status
        }))
    }

    const submitAttendance = async () => {
    try {
        const payload = {
            class_id: Number(SelectedClass),
            date: new Date().toISOString().split("T")[0],
            records: Object.entries(AttendanceData).map(
                ([student_id, status]) => ({
                    student_id: Number(student_id),
                    status,
                })
            ),
        };

        const res = await api.post(
            "/attendance/bulk/",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        console.log(res.data);
        alert("Attendance Saved Successfully!");
    } catch (err) {
        console.log(err);
    }
};

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/students/", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                setStudents(res.data)
                console.log(res.data)
            } catch (err) {
                console.log(err);
            }
        };

        const fetchClasses = async () => {
            try {
                const res = await api.get("/classes/", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                setClasses(res.data)
                console.log(res.data)

            } catch (err) {
                console.log(err);
            }
        };

        fetchStudents();
        fetchClasses();
    }, [token]);

    return (
        <>
            <div>Attendance</div>

            <select
                value={SelectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
            >
                <option value="">Select Class</option>

                {Classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                        {cls.name}
                    </option>
                ))}
            </select>

            {filteredStudents.map((student) => (
                <div className="flex flex-row justify-around">
                    <div key={student.id}>
                        {student.full_name}
                    </div>
                    <div>
                        <button onClick={() => markAttendance(student.id, "PRESENT")} className={`border-2 p-1 cursor-pointer ${
        AttendanceData[student.id] === "PRESENT"
            ? "bg-green-500"
            : ""
    }`}>Present</button>
                        <button onClick={() => markAttendance(student.id, "ABSENT")} className={`border-2 p-1 cursor-pointer  ${
        AttendanceData[student.id] === "ABSENT"
            ? "bg-red-500"
            : ""
    }`}>Absent</button>
                    </div>
                    <button onClick={submitAttendance} className="border-2 p-1 cursor-pointer">
                        Save Attendance
                    </button>
                </div>
            ))}

            {/* {Students.map((student)=>(
            <div className="flex flex-row justify-around">
            <div key={student.id}>{student.full_name}</div>
            <div>
                <button className="border-2 p-1 cursor-pointer">Present</button>
                <button className="border-2 p-1 cursor-pointer">Absent</button>
            </div>
          </div>
        
          ))} */}



        </>

    )
};

export default Attendance;