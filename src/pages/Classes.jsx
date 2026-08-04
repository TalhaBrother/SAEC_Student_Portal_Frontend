// SAEC

import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

// Fixed board choices — backend only accepts these values, displayed with friendly labels
const BOARD_OPTIONS = [
    { value: "Sindh", label: "Sindh Board" },
    { value: "AKG", label: "Aga Khan Board" },
    { value: "O-Levels", label: "O-Levels" },
];

const boardLabel = (value) =>
    BOARD_OPTIONS.find((opt) => opt.value === value)?.label || value;

// Blank form shape — used for both "create" and reset after save/cancel.
// sections/groups always keep at least one empty slot for a fresh input row.
const emptyForm = () => ({
    id: null,
    name: "",
    board: "",
    sections: [""],
    groups: [""],
});

const Class = () => {
    const token = useAuthStore((state) => state.accessToken);
    const headers = { Authorization: `Bearer ${token}` };

    // "list" = browsing/reading classes, "form" = create or edit a class
    const [mode, setMode] = useState("list");

    const [classes, setClasses] = useState([]);
    const [fetching, setFetching] = useState(true);

    const [formData, setFormData] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const [message, setMessage] = useState({ type: "", text: "" });

    // ---------- READ ----------
    const fetchClasses = async () => {
        setFetching(true);
        try {
            const res = await api.get("/classes/", { headers });
            // Show the most recently pushed classes first.
            const sorted = [...res.data].sort((a, b) => b.id - a.id);
            setClasses(sorted);
        } catch (error) {
            console.error("Error fetching classes:", error);
            setMessage({ type: "error", text: "Failed to load classes." });
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchClasses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- FORM HELPERS (shared by sections & groups) ----------
    const addField = (field) => {
        setFormData((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
    };

    const removeField = (field, index) => {
        setFormData((prev) => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index),
        }));
    };

    const updateField = (field, index, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: prev[field].map((v, i) => (i === index ? value : v)),
        }));
    };

    const openCreateForm = () => {
        setFormData(emptyForm());
        setMessage({ type: "", text: "" });
        setMode("form");
    };

    const openEditForm = (cls) => {
        setFormData({
            id: cls.id,
            name: cls.name,
            board: cls.board,
            sections: cls.sections?.length ? cls.sections.map((s) => s.name) : [""],
            groups: cls.groups?.length ? cls.groups.map((g) => g.name) : [""],
        });
        setMessage({ type: "", text: "" });
        setMode("form");
    };

    const cancelForm = () => {
        setFormData(emptyForm());
        setMode("list");
    };

    // ---------- CREATE / UPDATE ----------
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: "", text: "" });

        const payload = {
            name: formData.name,
            board: formData.board,
            sections: formData.sections
                .map((s) => s.trim())
                .filter(Boolean)
                .map((name) => ({ name })),
            groups: formData.groups
                .map((g) => g.trim())
                .filter(Boolean)
                .map((name) => ({ name })),
        };

        try {
            if (formData.id) {
                const res = await api.patch(`/classes/${formData.id}/`, payload, { headers });
                console.log("Class Updated Successfully:", res.data);
                setMessage({ type: "success", text: "Class updated successfully!" });
            } else {
                const res = await api.post("/classes/", payload, { headers });
                console.log("Class Created Successfully:", res.data);
                setMessage({ type: "success", text: "Class created successfully!" });
            }

            await fetchClasses();
            setFormData(emptyForm());
            setMode("list");
        } catch (error) {
            console.error("Error saving class:", error);

            const data = error.response?.data;
            // Duplicate name + board combo returns 400 with non_field_errors, not a field-specific error
            const nonFieldError = data?.non_field_errors?.[0];
            const firstFieldError =
                data && typeof data === "object" ? Object.values(data).flat()[0] : null;

            setMessage({
                type: "error",
                text: nonFieldError || firstFieldError || "Failed to save class. Please try again.",
            });
        } finally {
            setSaving(false);
        }
    };

    // ---------- DELETE ----------
    const handleDelete = async (cls) => {
        const confirmed = window.confirm(
            `Delete "${cls.display_name}"? This cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingId(cls.id);
        setMessage({ type: "", text: "" });

        try {
            await api.delete(`/classes/${cls.id}/`, { headers });
            console.log("Class Deleted Successfully:", cls.id);
            setMessage({ type: "success", text: "Class deleted successfully!" });
            await fetchClasses();
        } catch (error) {
            console.error("Error deleting class:", error);
            setMessage({
                type: "error",
                text:
                    error.response?.data?.detail ||
                    "Failed to delete class. It may still have students linked to it.",
            });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
                <div>
                    <div className="text-3xl font-bold tracking-tight text-[var(--quinary)]">
                        Classes
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                        Create, view, update, and delete classes, their sections, and groups.
                    </p>
                </div>

                {mode === "list" && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={fetchClasses}
                            disabled={fetching}
                            className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
                        >
                            {fetching ? "Refreshing..." : "Refresh"}
                        </button>
                        <button
                            type="button"
                            onClick={openCreateForm}
                            className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-2.5 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                        >
                            + New Class
                        </button>
                    </div>
                )}
            </div>

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

            {mode === "form" ? (
                /* ---------------- CREATE / EDIT FORM ---------------- */
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
                    <div className="text-lg font-semibold mb-4 text-[var(--quinary)]">
                        {formData.id ? "Update Class" : "Create New Class"}
                    </div>

                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {/* Class Name Input */}
                        <div className="flex flex-col w-full">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                Class Name
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                                }
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
                                value={formData.board}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, board: e.target.value }))
                                }
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

                        {/* Sections */}
                        <div className="flex flex-col w-full">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                    Sections (Optional)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addField("sections")}
                                    className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                                >
                                    + Add Section
                                </button>
                            </div>
                            <p className="text-gray-400 text-xs mb-3">
                                e.g., A, B, C. Leave blank for classes that don't use sections.
                            </p>

                            <div className="space-y-3">
                                {formData.sections.map((section, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={section}
                                            onChange={(e) =>
                                                updateField("sections", index, e.target.value)
                                            }
                                            placeholder="e.g., A"
                                            className="flex-1 bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                                        />
                                        {formData.sections.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeField("sections", index)}
                                                className="text-gray-400 hover:text-red-500 transition-colors px-2 py-2 cursor-pointer"
                                                aria-label="Remove section"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Groups / Specializations */}
                        <div className="flex flex-col w-full">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                    Groups (Optional)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addField("groups")}
                                    className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                                >
                                    + Add Group
                                </button>
                            </div>
                            <p className="text-gray-400 text-xs mb-3">
                                e.g., Pre-Medical, Computer Science, Pre-Engineering. Leave blank if this
                                class has no groups.
                            </p>

                            <div className="space-y-3">
                                {formData.groups.map((group, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={group}
                                            onChange={(e) => updateField("groups", index, e.target.value)}
                                            placeholder="e.g., Biology"
                                            className="flex-1 bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                                        />
                                        {formData.groups.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeField("groups", index)}
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

                        {/* Save / Cancel */}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={cancelForm}
                                disabled={saving}
                                className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-3 px-6 rounded-xl border border-gray-300 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                            >
                                {saving
                                    ? formData.id
                                        ? "Updating..."
                                        : "Creating..."
                                    : formData.id
                                    ? "Update Class"
                                    : "Create Class"}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                /* ---------------- LIST / READ VIEW ---------------- */
                <div className="max-w-4xl">
                    {fetching ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                            Loading classes...
                        </div>
                    ) : classes.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                            No classes yet. Click "+ New Class" to create your first one.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {classes.map((cls) => (
                                <div
                                    key={cls.id}
                                    className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
                                >
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-lg font-semibold text-[var(--quinary)]">
                                                    {cls.name}
                                                </span>
                                                <span className="text-xs font-medium bg-[var(--secondary)] text-[var(--quinary)] px-2.5 py-1 rounded-full border border-gray-200">
                                                    {boardLabel(cls.board)}
                                                </span>
                                            </div>

                                            {/* Sections */}
                                            <div className="mt-3">
                                                <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold mr-2">
                                                    Sections:
                                                </span>
                                                {cls.sections?.length ? (
                                                    <span className="inline-flex flex-wrap gap-1.5 align-middle">
                                                        {cls.sections.map((s) => (
                                                            <span
                                                                key={s.id}
                                                                className="text-xs bg-gray-50 text-[var(--quinary)] px-2 py-0.5 rounded-md border border-gray-200"
                                                            >
                                                                {s.name}
                                                            </span>
                                                        ))}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">None</span>
                                                )}
                                            </div>

                                            {/* Groups */}
                                            <div className="mt-1.5">
                                                <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold mr-2">
                                                    Groups:
                                                </span>
                                                {cls.groups?.length ? (
                                                    <span className="inline-flex flex-wrap gap-1.5 align-middle">
                                                        {cls.groups.map((g) => (
                                                            <span
                                                                key={g.id}
                                                                className="text-xs bg-gray-50 text-[var(--quinary)] px-2 py-0.5 rounded-md border border-gray-200"
                                                            >
                                                                {g.name}
                                                            </span>
                                                        ))}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">None</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => openEditForm(cls)}
                                                className="text-sm font-medium text-[var(--primary)] hover:underline cursor-pointer px-2 py-1"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(cls)}
                                                disabled={deletingId === cls.id}
                                                className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer px-2 py-1"
                                            >
                                                {deletingId === cls.id ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Class;