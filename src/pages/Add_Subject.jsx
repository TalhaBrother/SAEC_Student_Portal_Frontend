import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Add_Subject = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Form States
    const [subjectName, setSubjectName] = useState("");
    const [selectedClass, setSelectedClass] = useState("");

    // Classes list state
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    // Fetch classes list for dropdown
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get("/classes/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setClasses(res.data);
            } catch (err) {
                console.error("Error fetching classes:", err);
            }
        };
        if (token) fetchClasses();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: "", text: "" });

        const subjectPayload = {
            name: subjectName,
            student_class: Number(selectedClass),
        };

        try {
            const res = await api.post("/subjects/", subjectPayload, {
                headers: { Authorization: `Bearer ${token}` },
            });

            console.log("Subject Created Successfully:", res.data);
            setMessage({ type: "success", text: "Subject added successfully!" });

            setSubjectName("");
            setSelectedClass("");
        } catch (error) {
            console.error("Error creating subject:", error);
            setMessage({ type: "error", text: "Failed to add subject. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-[var(--secondary)] text-[var(--quinary)] font-sans">

            {/* Left Side: Form Side */}
            <div className="w-full  flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-12">
                <div className="max-w-md w-full mx-auto">

                    {/* Header */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-semibold tracking-wide mb-2 text-[var(--quinary)]">Add New Subject</h2>
                        <p className="text-gray-500 text-sm">Assign a subject to a class</p>
                    </div>

                    {/* Status Message Display */}
                    {message.text && (
                        <div className={`p-3 rounded-xl text-sm mb-4 text-center border ${
                            message.type === "success"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {/* Form matching your specific line styling layout */}
                    <form className="space-y-6" onSubmit={handleSubmit}>

                        {/* Subject Name Input */}
                        <div className="relative border-b border-gray-300 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                Subject Name
                            </label>
                            <input
                                type="text"
                                value={subjectName}
                                onChange={(e) => setSubjectName(e.target.value)}
                                placeholder="e.g., Mathematics"
                                required
                                className="w-full bg-transparent border-none outline-none text-[var(--quinary)] placeholder-gray-400 text-sm py-1 focus:ring-0"
                            />
                        </div>

                        {/* Class Selector Dropdown */}
                        <div className="relative border-b border-gray-300 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                Assign to Class
                            </label>
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                required
                                className="w-full bg-transparent border-none outline-none text-[var(--quinary)] text-sm py-1 focus:ring-0 cursor-pointer"
                            >
                                <option value="" className="text-gray-400">Select Class</option>
                                {classes.map((cls) => (
                                    <option key={cls.id} value={cls.id} className="text-[var(--quinary)]">
                                        {cls.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-blue-900/10 transform active:scale-[0.98] mt-4"
                        >
                            {loading ? "Adding..." : "Add Subject"}
                        </button>
                    </form>

                </div>
            </div>

        </div>
    );
};

export default Add_Subject;