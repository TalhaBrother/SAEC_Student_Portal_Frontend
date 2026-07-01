import useAuthStore from "../store/authStore";
import { useEffect, useState } from "react";
import api from "../api/axios";

const Assign_Marks = () => {
    const token = useAuthStore((state) => state.accessToken);

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [SelectedClass, setSelectedClass] = useState("");

    const filteredStudents = Students.filter(
        (student) => student.student_class.id === Number(SelectedClass)
    );

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/students/", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                setStudents(res.data);
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
                setClasses(res.data);
            } catch (err) {
                console.log(err);
            }
        };

        fetchStudents();
        fetchClasses();
    }, [token]);

    return (
        <div>
            <div>Marks</div>

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
                <div
                    key={student.id}
                    className="flex flex-row justify-around"
                >
                    <div>{student.full_name}</div>
                </div>
            ))}
        </div>
    );
};

export default Assign_Marks;