import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Subjects = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Data States
    const [subjects, setSubjects] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [groups, setGroups] = useState([]);

    // Filtering & Search States
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBoard, setSelectedBoard] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState('');
    const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState('');

    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        student_class: '',
        sections: [],
        groups: []
    });

    // Sub-loading states for forms
    const [formSections, setFormSections] = useState([]);
    const [formGroups, setFormGroups] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    // General UI States
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Toast helper
    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
    };

    // 1. Fetch Classes list for dropdowns
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get('/classes/', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setClasses(res.data || []);
            } catch (err) {
                console.error('Error fetching classes:', err);
            }
        };
        if (token) fetchClasses();
    }, [token]);

    // 2. Dynamic Fetching of Filter Dependent Dropdowns (Sections/Groups)
    useEffect(() => {
        const fetchFilterOptions = async () => {
            if (!selectedClassFilter) {
                setSections([]);
                setGroups([]);
                setSelectedSectionFilter('');
                setSelectedGroupFilter('');
                return;
            }

            try {
                const [secRes, grpRes] = await Promise.all([
                    api.get(`/sections/?class_id=${selectedClassFilter}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => ({ data: [] })),
                    api.get(`/groups/?class_id=${selectedClassFilter}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => ({ data: [] }))
                ]);

                setSections(secRes.data || []);
                setGroups(grpRes.data || []);
            } catch (err) {
                console.error('Error fetching dependent options:', err);
            }
        };

        if (token) fetchFilterOptions();
    }, [selectedClassFilter, token]);

    // 3. Fetch Subjects with Search & Backend Filters
    const fetchSubjects = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchTerm.trim()) params.append('search', searchTerm.trim());
            if (selectedBoard) params.append('board', selectedBoard);
            if (selectedClassFilter) params.append('class_id', selectedClassFilter);
            if (selectedSectionFilter) params.append('section_id', selectedSectionFilter);
            if (selectedGroupFilter) params.append('group_id', selectedGroupFilter);

            const res = await api.get(`/subjects/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSubjects(res.data || []);
        } catch (err) {
            console.error('Error fetching subjects:', err);
            showMessage('error', 'Failed to fetch subjects list.');
        } finally {
            setLoading(false);
        }
    }, [token, searchTerm, selectedBoard, selectedClassFilter, selectedSectionFilter, selectedGroupFilter]);

    useEffect(() => {
        if (token) {
            const debounceTimer = setTimeout(() => {
                fetchSubjects();
            }, 300);
            return () => clearTimeout(debounceTimer);
        }
    }, [fetchSubjects, token]);

    // 4. Handle Class changes inside Modal (Fetches applicable sections and groups for selected class)
    const handleFormClassChange = async (classId) => {
        setFormData((prev) => ({
            ...prev,
            student_class: classId,
            sections: [],
            groups: []
        }));

        if (!classId) {
            setFormSections([]);
            setFormGroups([]);
            return;
        }

        setFormLoading(true);
        try {
            const [secRes, grpRes] = await Promise.all([
                api.get(`/sections/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] })),
                api.get(`/groups/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] }))
            ]);

            setFormSections(secRes.data || []);
            setFormGroups(grpRes.data || []);
        } catch (err) {
            console.error('Error loading form dropdowns:', err);
        } finally {
            setFormLoading(false);
        }
    };

    // Open Modal for Add/Edit
    const handleOpenModal = async (subject = null) => {
        if (subject) {
            setEditingSubject(subject);
            setFormData({
                name: subject.name,
                student_class: subject.student_class,
                sections: subject.sections || [],
                groups: subject.groups || []
            });
            await handleFormClassChange(subject.student_class);
            setFormData({
                name: subject.name,
                student_class: subject.student_class,
                sections: subject.sections || [],
                groups: subject.groups || []
            });
        } else {
            setEditingSubject(null);
            setFormData({
                name: '',
                student_class: '',
                sections: [],
                groups: []
            });
            setFormSections([]);
            setFormGroups([]);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSubject(null);
        setFormData({ name: '', student_class: '', sections: [], groups: [] });
    };

    // Save (Create or Update)
    const handleSave = async (e) => {
        e.preventDefault();
        setActionLoading(true);

        const payload = {
            name: formData.name,
            student_class: Number(formData.student_class),
            sections: formData.sections,
            groups: formData.groups
        };

        try {
            if (editingSubject) {
                await api.put(`/subjects/${editingSubject.id}/`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Subject updated successfully!');
            } else {
                await api.post('/subjects/', payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Subject created successfully!');
            }
            handleCloseModal();
            fetchSubjects();
        } catch (err) {
            console.error('Error saving subject:', err);
            const errorData = err.response?.data;
            if (errorData && typeof errorData === 'object') {
                const firstKey = Object.keys(errorData)[0];
                const msg = Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey];
                showMessage('error', `${firstKey.toUpperCase()}: ${msg}`);
            } else {
                showMessage('error', 'Failed to save subject. Please check inputs.');
            }
        } finally {
            setActionLoading(false);
        }
    };

    // Delete Subject
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this subject?')) return;

        setActionLoading(true);
        try {
            await api.delete(`/subjects/${id}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            showMessage('success', 'Subject deleted successfully!');
            fetchSubjects();
        } catch (err) {
            console.error('Error deleting subject:', err);
            showMessage('error', 'Failed to delete subject.');
        } finally {
            setActionLoading(false);
        }
    };

    // Clear Filters
    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedBoard('');
        setSelectedClassFilter('');
        setSelectedSectionFilter('');
        setSelectedGroupFilter('');
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Subjects</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage, filter, search, and assign subjects across classes.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-3 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] self-start md:self-auto cursor-pointer"
                >
                    + Add New Subject
                </button>
            </div>

            {/* Status Message Display */}
            {message.text && (
                <div
                    className={`p-3 rounded-xl text-sm mb-6 border transition-all ${
                        message.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Filters Section */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Search Input */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Search
                        </label>
                        <input
                            type="text"
                            placeholder="Subject name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)]"
                        />
                    </div>

                    {/* Board Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Board
                        </label>
                        <select
                            value={selectedBoard}
                            onChange={(e) => setSelectedBoard(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        >
                            <option value="">All Boards</option>
                            <option value="O-Levels">O-Levels</option>
                            <option value="Sindh Board">Sindh Board</option>
                            <option value="Aga Khan Board">Aga Khan Board</option>
                        </select>
                    </div>

                    {/* Class Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Class
                        </label>
                        <select
                            value={selectedClassFilter}
                            onChange={(e) => setSelectedClassFilter(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        >
                            <option value="">All Classes</option>
                            {classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                    {cls.display_name || cls.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Section Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Section
                        </label>
                        <select
                            value={selectedSectionFilter}
                            onChange={(e) => setSelectedSectionFilter(e.target.value)}
                            disabled={!selectedClassFilter}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">All Sections</option>
                            {sections.map((sec) => (
                                <option key={sec.id} value={sec.id}>{sec.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Group Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Group
                        </label>
                        <select
                            value={selectedGroupFilter}
                            onChange={(e) => setSelectedGroupFilter(e.target.value)}
                            disabled={!selectedClassFilter}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">All Groups</option>
                            {groups.map((grp) => (
                                <option key={grp.id} value={grp.id}>{grp.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end mt-3">
                    <button
                        onClick={handleResetFilters}
                        className="text-xs text-gray-500 hover:text-[var(--primary)] underline font-medium cursor-pointer"
                    >
                        Reset All Filters
                    </button>
                </div>
            </div>

            {/* Subjects Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="p-4">#</th>
                                <th className="p-4">Subject Name</th>
                                <th className="p-4">Class</th>
                                <th className="p-4">Sections</th>
                                <th className="p-4">Groups</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-gray-400">
                                        Loading subjects...
                                    </td>
                                </tr>
                            ) : subjects.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-gray-400">
                                        No subjects found matching the criteria.
                                    </td>
                                </tr>
                            ) : (
                                subjects.map((sub, idx) => (
                                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-gray-400 font-medium">{idx + 1}</td>
                                        <td className="p-4 font-semibold text-[var(--quinary)]">{sub.name}</td>
                                        <td className="p-4">{sub.class_name || 'N/A'}</td>
                                        <td className="p-4">
                                            {sub.section_details && sub.section_details.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {sub.section_details.map((s) => (
                                                        <span key={s.id} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                                            {s.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">All Sections</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {sub.group_details && sub.group_details.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {sub.group_details.map((g) => (
                                                        <span key={g.id} className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md border border-purple-100 font-medium">
                                                            {g.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">All Groups</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right space-x-2">
                                            <button
                                                onClick={() => handleOpenModal(sub)}
                                                className="px-3 py-1.5 text-xs font-medium text-[var(--primary)] bg-gray-100 hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors cursor-pointer"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(sub.id)}
                                                disabled={actionLoading}
                                                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal for Create / Edit Subject */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-[var(--quinary)]">
                                {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-gray-400 hover:text-gray-600 text-sm font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Subject Name */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Subject Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Mathematics"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)]"
                                />
                            </div>

                            {/* Class Selection */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Assign to Class
                                </label>
                                <select
                                    required
                                    value={formData.student_class}
                                    onChange={(e) => handleFormClassChange(e.target.value)}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                                >
                                    <option value="">Select Class</option>
                                    {classes.map((cls) => (
                                        <option key={cls.id} value={cls.id}>
                                            {cls.display_name || cls.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Multiple Sections Selection */}
                            {formData.student_class && (
                                <div className="flex flex-col">
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Sections (Optional - Select multiple or leave empty for ALL)
                                    </label>
                                    {formLoading ? (
                                        <span className="text-xs text-gray-400 p-2">Loading sections...</span>
                                    ) : formSections.length > 0 ? (
                                        <div className="flex flex-wrap gap-2 border border-gray-300 rounded-xl p-3 max-h-32 overflow-y-auto">
                                            {formSections.map((sec) => {
                                                const checked = formData.sections.includes(sec.id);
                                                return (
                                                    <label
                                                        key={sec.id}
                                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                                            checked
                                                                ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const newSecs = e.target.checked
                                                                    ? [...formData.sections, sec.id]
                                                                    : formData.sections.filter((id) => id !== sec.id);
                                                                setFormData({ ...formData, sections: newSecs });
                                                            }}
                                                            className="rounded accent-[var(--primary)] cursor-pointer"
                                                        />
                                                        <span>{sec.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">No sections registered for this class.</span>
                                    )}
                                </div>
                            )}

                            {/* Multiple Groups Selection */}
                            {formData.student_class && (
                                <div className="flex flex-col">
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Groups (Optional - Select multiple or leave empty for ALL)
                                    </label>
                                    {formLoading ? (
                                        <span className="text-xs text-gray-400 p-2">Loading groups...</span>
                                    ) : formGroups.length > 0 ? (
                                        <div className="flex flex-wrap gap-2 border border-gray-300 rounded-xl p-3 max-h-32 overflow-y-auto">
                                            {formGroups.map((grp) => {
                                                const checked = formData.groups.includes(grp.id);
                                                return (
                                                    <label
                                                        key={grp.id}
                                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                                            checked
                                                                ? 'bg-purple-50 border-purple-200 text-purple-700 font-medium'
                                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const newGrps = e.target.checked
                                                                    ? [...formData.groups, grp.id]
                                                                    : formData.groups.filter((id) => id !== grp.id);
                                                                setFormData({ ...formData, groups: newGrps });
                                                            }}
                                                            className="rounded accent-[var(--primary)] cursor-pointer"
                                                        />
                                                        <span>{grp.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">No groups registered for this class.</span>
                                    )}
                                </div>
                            )}

                            {/* Modal Buttons */}
                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="px-5 py-2 text-sm text-white bg-[var(--primary)] hover:bg-[var(--quinary)] rounded-xl transition-colors font-medium shadow-md disabled:opacity-50 cursor-pointer"
                                >
                                    {actionLoading ? 'Saving...' : editingSubject ? 'Update Subject' : 'Create Subject'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Subjects;