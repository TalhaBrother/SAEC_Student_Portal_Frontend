import React, { useState } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

// Fixed board choices — backend only accepts these values, displayed with friendly labels
const BOARD_OPTIONS = [
    { value: "Sindh", label: "Sindh Board" },
    { value: "AKG", label: "Aga Khan Board" },
    { value: "O-Levels", label: "O-Levels" },
];

const Create_Class = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Form States
    const [className, setClassName] = useState("");
    const [board, setBoard] = useState("");
    const [section, setSection] = useState("");

    // Groups are optional — a class can be created with zero groups (e.g. O-Levels)
    const [groups, setGroups] = useState([""]);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    const addGroupField = () => {
        setGroups((prev) => [...prev, ""]);
    };

    const removeGroupField = (index) => {
        setGroups((prev) => prev.filter((_, i) => i !== index));
    };

    const updateGroupField = (index, value) => {
        setGroups((prev) => prev.map((g, i) => (i === index ? value : g)));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: "", text: "" });

        const headers = { Authorization: `Bearer ${token}` };

        try {
            // Step 1: create the class
            const classRes = await api.post(
                "/classes/",
                { name: className, board, section },
                { headers }
            );

            const classId = classRes.data.id;

            // Step 2: create any groups entered, scoped to the new class
            const validGroups = groups.map((g) => g.trim()).filter(Boolean);

            if (validGroups.length > 0) {
                await Promise.all(
                    validGroups.map((name) =>
                        api.post("/groups/", { student_class: classId, name }, { headers })
                    )
                );
            }

            console.log("Class Created Successfully:", classRes.data);
            setMessage({ type: "success", text: "Class created successfully!" });

            setClassName("");
            setBoard("");
            setSection("");
            setGroups([""]);
        } catch (error) {
            console.error("Error creating class:", error);

            // Duplicate name + board + section combo returns 400 with non_field_errors, not a field-specific error
            const nonFieldError = error.response?.data?.non_field_errors?.[0];

            setMessage({
                type: "error",
                text: nonFieldError || "Failed to create class. Please try again.",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Create New Class</div>
            <p className="text-gray-500 text-sm mb-6">Set up a class, its board, and any specialization groups.</p>

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

                    {/* Class Name Input */}
                    <div className="flex flex-col w-full">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                            Class Name
                        </label>
                        <input
                            type="text"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            placeholder="e.g., 9"
                            required
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                        />
                    </div>

                    {/* Board Selector Dropdown */}
                    <div className="flex flex-col w-full">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                            Board
                        </label>
                        <select
                            value={board}
                            onChange={(e) => setBoard(e.target.value)}
                            required
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                        >
                            <option value="">Select Board</option>
                            {BOARD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Section Input */}
                    <div className="flex flex-col w-full">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                            Section (Optional)
                        </label>
                        <input
                            type="text"
                            value={section}
                            onChange={(e) => setSection(e.target.value)}
                            placeholder="e.g., A"
                            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                        />
                        <p className="text-gray-400 text-xs mt-1">
                            Leave blank for classes that don't use sections.
                        </p>
                    </div>

                    {/* Groups / Specializations */}
                    <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                Groups (Optional)
                            </label>
                            <button
                                type="button"
                                onClick={addGroupField}
                                className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                            >
                                + Add Group
                            </button>
                        </div>
                        <p className="text-gray-400 text-xs mb-3">
                            e.g., Pre-Medical, Computer Science, Pre-Engineering. Leave blank if this class has no groups.
                        </p>

                        <div className="space-y-3">
                            {groups.map((group, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={group}
                                        onChange={(e) => updateGroupField(index, e.target.value)}
                                        placeholder="e.g., Biology"
                                        className="flex-1 bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                                    />
                                    {groups.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeGroupField(index)}
                                            className="text-gray-400 hover:text-red-500 transition-colors px-2 py-2 cursor-pointer"
                                            aria-label="Remove group"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98]"
                        >
                            {loading ? "Creating..." : "Create Class"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Create_Class;