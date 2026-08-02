// SAEC

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

    // Group-related state
    const [groups, setGroups] = useState([]);
    const [groupId, setGroupId] = useState("");
    const [groupsLoading, setGroupsLoading] = useState(false);

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

    // Fetch groups whenever the selected class changes.
    useEffect(() => {
        const fetchGroups = async () => {
            setGroupsLoading(true);
            try {
                const res = await api.get(`/groups/?class_id=${selectedClass}`, {
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

        // Reset group selection whenever the class changes
        setGroupId("");

        if (token && selectedClass) {
            fetchGroups();
        } else {
            setGroups([]);
        }
    }, [selectedClass, token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: "", text: "" });

        const subjectPayload = {
            name: subjectName,
            student_class: Number(selectedClass),
        };

        // Only include `group` when the selected class actually has groups.
        if (groups.length > 0 && groupId) {
            subjectPayload.group = groupId;
        }

        try {
            const res = await api.post("/subjects/", subjectPayload, {
                headers: { Authorization: `Bearer ${token}` },
            });

            console.log("Subject Created Successfully:", res.data);
            setMessage({ type: "success", text: "Subject added successfully!" });

            setSubjectName("");
            setSelectedClass("");
            setGroupId("");
            setGroups([]);
        } catch (error) {
            console.error("Error creating subject:", error);
            setMessage({ type: "error", text: "Failed to add subject. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Add New Subject</div>
            <p className="text-gray-500 text-sm mb-6">Assign a subject to a class section below.</p>

            {/* Status Message Display */}
            {message.text && (
                <div
                    className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${
                        message.type === "success"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Form Card Container */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
                <form className="space-y-6" onSubmit={handleSubmit}>

                    {/* Subject Name Input */}
                    <div className="flex flex-col w-full">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                            Subject Name
                        </label>
                        <input
                            type="text"
                            value={subjectName}
                            onChange={(e) => setSubjectName(e.target.value)}
                            placeholder="e.g., Mathematics"
                            required
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                        />
                    </div>

                    {/* Class Selector Dropdown */}
                    <div className="flex flex-col w-full">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                            Assign to Class
                        </label>
                        <select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            required
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                        >
                            <option value="">Select Class</option>
                            {classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                    {cls.display_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Group is conditional: only shown when the selected class has groups defined */}
                    {selectedClass && groupsLoading && (
                        <div className="flex flex-col w-full">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                Group
                            </label>
                            <div className="text-sm text-gray-400 p-3">Loading groups...</div>
                        </div>
                    )}

                    {selectedClass && !groupsLoading && groups.length > 0 && (
                        <div className="flex flex-col w-full">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                Group
                            </label>
                            <select
                                value={groupId}
                                onChange={(e) => setGroupId(e.target.value)}
                                required
                                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                            >
                                <option value="">Select Group</option>
                                {groups.map((grp) => (
                                    <option key={grp.id} value={grp.id}>{grp.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Submit Button */}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98]"
                        >
                            {loading ? "Adding..." : "Add Subject"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Add_Subject;