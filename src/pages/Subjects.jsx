import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Pulls a human-readable message out of whatever shape DRF sends back
// (string, list, or nested object of lists).
const isEmptyValue = (val) => {
    if (val === null || val === undefined || val === '') return true;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val).length === 0;
    return false;
};

const extractApiError = (errorData) => {
    if (isEmptyValue(errorData)) return '';
    if (typeof errorData === 'string') return errorData;

    if (Array.isArray(errorData)) {
        return errorData
            .map((item) => extractApiError(item))
            .filter((msg) => msg)
            .join(' ');
    }

    if (typeof errorData === 'object') {
        const parts = Object.keys(errorData)
            .map((key) => {
                const msg = extractApiError(errorData[key]);
                if (!msg) return '';
                const label = key === 'non_field_errors' || key === 'detail' ? '' : `${key}: `;
                return `${label}${msg}`;
            })
            .filter((msg) => msg);
        return parts.join(' | ');
    }

    return String(errorData);
};

const formatApiError = (errorData) =>
    extractApiError(errorData) || 'Something went wrong. Please try again.';

// Groups the flat list of Subject rows (each tied to exactly one class)
// into logical "subject groups" by name, since one subject can now span
// multiple classes as several backend rows sharing the same name.
const groupSubjects = (subjects) => {
    const map = new Map();

    subjects.forEach((sub) => {
        const key = (sub.name || '').trim().toLowerCase();
        if (!map.has(key)) {
            map.set(key, {
                key,
                name: sub.name,
                classes: [],
            });
        }
        map.get(key).classes.push({
            subjectId: sub.id,
            student_class: sub.student_class,
            class_name: sub.class_name,
            sections: sub.sections || [],
            groups: sub.groups || [],
            section_details: sub.section_details || [],
            group_details: sub.group_details || [],
        });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

// Mirrors the backend's classes_display style summary for the collapsed row.
const summarizeClasses = (groupClasses, totalClassCount) => {
    const count = groupClasses.length;

    if (totalClassCount > 0 && count === totalClassCount) {
        return 'All Classes';
    }

    if (count <= 3) {
        return groupClasses.map((c) => c.class_name).join(', ');
    }

    const shown = groupClasses.slice(0, 3).map((c) => c.class_name).join(', ');
    return `${shown} + ${count - 3} more`;
};

const MODE_SINGLE = 'single';
const MODE_MULTIPLE = 'multiple';
const MODE_ALL = 'all';

const emptyFormData = {
    name: '',
    mode: MODE_SINGLE,
    selectedClassIds: [],
    perClass: {}, // { [classId]: { sections: [ids], groups: [ids] } }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

    // Grouped-table expand state
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null); // { key, name, subjectIds: [] } | null
    const [formData, setFormData] = useState(emptyFormData);

    // Per-class sections/groups option cache used inside the modal
    // { [classId]: { sections: [], groups: [], loading: bool, loaded: bool } }
    const [classOptions, setClassOptions] = useState({});
    const [expandedFormClasses, setExpandedFormClasses] = useState(new Set());

    // General UI States
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Toast helper
    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4500);
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

    // Group the flat subject rows into logical subject groups (one entry
    // per unique subject name, holding every class it's assigned to).
    const groupedSubjects = useMemo(() => groupSubjects(subjects), [subjects]);

    const toggleGroupExpand = (key) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Tracks classIds that are already loaded or currently being fetched,
    // so opening/closing a class panel repeatedly never double-fetches.
    const classFetchTracker = React.useRef(new Set());

    // Fetches (and caches) the sections/groups available for a given class,
    // used inside the create/edit modal so every selected class can carry
    // its own independent section/group selection.
    const ensureClassOptions = useCallback(async (classId) => {
        if (!classId || classFetchTracker.current.has(String(classId))) return;
        classFetchTracker.current.add(String(classId));

        setClassOptions((prev) => ({
            ...prev,
            [classId]: { sections: [], groups: [], loading: true, loaded: false },
        }));

        try {
            const [secRes, grpRes] = await Promise.all([
                api.get(`/sections/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] })),
                api.get(`/groups/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] }))
            ]);

            setClassOptions((prev) => ({
                ...prev,
                [classId]: {
                    sections: secRes.data || [],
                    groups: grpRes.data || [],
                    loading: false,
                    loaded: true,
                },
            }));
        } catch (err) {
            console.error('Error loading class options:', err);
            setClassOptions((prev) => ({
                ...prev,
                [classId]: { sections: [], groups: [], loading: false, loaded: true },
            }));
        }
    }, [token]);

    const getPerClass = (classId) =>
        formData.perClass[classId] || { sections: [], groups: [] };

    const setPerClass = (classId, patch) => {
        setFormData((prev) => ({
            ...prev,
            perClass: {
                ...prev.perClass,
                [classId]: { ...getPerClass(classId), ...patch },
            },
        }));
    };

    const toggleFormClassExpand = (classId) => {
        setExpandedFormClasses((prev) => {
            const next = new Set(prev);
            if (next.has(classId)) {
                next.delete(classId);
            } else {
                next.add(classId);
                ensureClassOptions(classId);
            }
            return next;
        });
    };

    // -----------------------------------------------------------------
    // Assignment mode switching
    // -----------------------------------------------------------------

    const handleModeChange = (mode) => {
        if (mode === MODE_ALL) {
            const allIds = classes.map((c) => c.id);
            setFormData((prev) => ({
                ...prev,
                mode,
                selectedClassIds: allIds,
                perClass: {},
            }));
        } else {
            setFormData((prev) => ({
                ...prev,
                mode,
                selectedClassIds: [],
                perClass: {},
            }));
        }
        setExpandedFormClasses(new Set());
    };

    // Single-mode class dropdown
    const handleSingleClassSelect = (classId) => {
        setFormData((prev) => ({
            ...prev,
            selectedClassIds: classId ? [classId] : [],
        }));
        if (classId) {
            ensureClassOptions(classId);
            setExpandedFormClasses(new Set([classId]));
        }
    };

    // Multiple-mode class checkbox toggle
    const toggleMultipleClass = (classId) => {
        setFormData((prev) => {
            const isSelected = prev.selectedClassIds.includes(classId);
            const selectedClassIds = isSelected
                ? prev.selectedClassIds.filter((id) => id !== classId)
                : [...prev.selectedClassIds, classId];

            const perClass = { ...prev.perClass };
            if (isSelected) delete perClass[classId];

            return { ...prev, selectedClassIds, perClass };
        });
    };

    // -----------------------------------------------------------------
    // Open / close modal
    // -----------------------------------------------------------------

    const handleOpenCreateModal = () => {
        setEditingGroup(null);
        setFormData(emptyFormData);
        setExpandedFormClasses(new Set());
        setIsModalOpen(true);
    };

    const handleOpenEditModal = async (group) => {
        const classIds = group.classes.map((c) => c.student_class);
        const mode = classIds.length > 1 ? MODE_MULTIPLE : MODE_SINGLE;

        const perClass = {};
        group.classes.forEach((c) => {
            perClass[c.student_class] = {
                sections: c.sections,
                groups: c.groups,
            };
        });

        setEditingGroup({
            key: group.key,
            name: group.name,
            subjectIds: group.classes.map((c) => c.subjectId),
        });

        setFormData({
            name: group.name,
            mode,
            selectedClassIds: classIds,
            perClass,
        });

        // Pre-load section/group options for every class already in the group
        // (ensureClassOptions is a no-op for classes already cached)
        await Promise.all(classIds.map((id) => ensureClassOptions(id)));
        setExpandedFormClasses(new Set(classIds));

        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingGroup(null);
        setFormData(emptyFormData);
        setExpandedFormClasses(new Set());
    };

    // -----------------------------------------------------------------
    // Save (create or update, single/multiple/all all funnel through here)
    // -----------------------------------------------------------------

    const handleSave = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            showMessage('error', 'Subject name is required.');
            return;
        }

        if (formData.selectedClassIds.length === 0) {
            showMessage('error', 'Select at least one class to assign this subject to.');
            return;
        }

        const classesPayload = formData.selectedClassIds.map((id) => ({
            student_class: Number(id),
            sections: getPerClass(id).sections || [],
            groups: getPerClass(id).groups || [],
        }));

        setActionLoading(true);
        try {
            if (editingGroup) {
                await api.post(
                    '/subjects/bulk-update/',
                    {
                        group_ids: editingGroup.subjectIds,
                        name: formData.name.trim(),
                        classes: classesPayload,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                showMessage('success', 'Subject updated successfully!');
            } else {
                await api.post(
                    '/subjects/bulk-create/',
                    {
                        name: formData.name.trim(),
                        classes: classesPayload,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                showMessage('success', 'Subject created successfully!');
            }
            handleCloseModal();
            fetchSubjects();
        } catch (err) {
            console.error('Error saving subject:', err);
            showMessage('error', formatApiError(err.response?.data));
        } finally {
            setActionLoading(false);
        }
    };

    // -----------------------------------------------------------------
    // Delete (whole group, or a single class out of a group)
    // -----------------------------------------------------------------

    const handleDeleteGroup = async (group) => {
        const label = group.classes.length > 1
            ? `Delete "${group.name}" from all ${group.classes.length} classes?`
            : `Are you sure you want to delete "${group.name}"?`;

        if (!window.confirm(label)) return;

        setActionLoading(true);
        try {
            await Promise.all(
                group.classes.map((c) =>
                    api.delete(`/subjects/${c.subjectId}/`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            showMessage('success', 'Subject deleted successfully!');
            fetchSubjects();
        } catch (err) {
            console.error('Error deleting subject group:', err);
            showMessage('error', 'Failed to delete subject.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveClassFromGroup = async (group, classEntry) => {
        const label = group.classes.length === 1
            ? `Are you sure you want to delete "${group.name}"?`
            : `Remove "${group.name}" from ${classEntry.class_name}?`;

        if (!window.confirm(label)) return;

        setActionLoading(true);
        try {
            await api.delete(`/subjects/${classEntry.subjectId}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            showMessage('success', 'Removed successfully!');
            fetchSubjects();
        } catch (err) {
            console.error('Error removing class from subject:', err);
            showMessage('error', 'Failed to remove.');
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

    // -----------------------------------------------------------------
    // Small render helpers for the modal
    // -----------------------------------------------------------------

    const renderClassOptionsPanel = (classId) => {
        const opts = classOptions[classId];
        const per = getPerClass(classId);

        if (!opts || opts.loading) {
            return <span className="text-xs text-gray-400 p-2 block">Loading sections & groups...</span>;
        }

        return (
            <div className="space-y-3 pt-2">
                {/* Sections */}
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">
                        Sections (optional — leave empty for ALL)
                    </label>
                    {opts.sections.length > 0 ? (
                        <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2 max-h-28 overflow-y-auto bg-white">
                            {opts.sections.map((sec) => {
                                const checked = per.sections.includes(sec.id);
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
                                                    ? [...per.sections, sec.id]
                                                    : per.sections.filter((id) => id !== sec.id);
                                                setPerClass(classId, { sections: newSecs });
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

                {/* Groups */}
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">
                        Groups (optional — leave empty for ALL)
                    </label>
                    {opts.groups.length > 0 ? (
                        <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2 max-h-28 overflow-y-auto bg-white">
                            {opts.groups.map((grp) => {
                                const checked = per.groups.includes(grp.id);
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
                                                    ? [...per.groups, grp.id]
                                                    : per.groups.filter((id) => id !== grp.id);
                                                setPerClass(classId, { groups: newGrps });
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
            </div>
        );
    };

    const renderClassChecklistRow = (cls, { checkable }) => {
        const classId = cls.id;
        const isSelected = formData.selectedClassIds.includes(classId);
        const isExpanded = expandedFormClasses.has(classId);

        if (!isSelected && checkable === false) return null;

        return (
            <div
                key={classId}
                className={`border rounded-xl overflow-hidden transition-colors ${
                    isSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
                }`}
            >
                <div className="flex items-center justify-between p-2.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                        {checkable ? (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleMultipleClass(classId)}
                                className="rounded accent-[var(--primary)] cursor-pointer"
                            />
                        ) : (
                            <span className="w-3.5 h-3.5 rounded-full bg-[var(--primary)] inline-block" />
                        )}
                        <span className={isSelected ? 'font-medium text-[var(--quinary)]' : 'text-gray-600'}>
                            {cls.display_name || cls.name}
                        </span>
                    </label>

                    {isSelected && (
                        <button
                            type="button"
                            onClick={() => toggleFormClassExpand(classId)}
                            className="text-xs text-[var(--primary)] font-medium px-2 py-1 rounded-lg hover:bg-blue-100 cursor-pointer"
                        >
                            {isExpanded ? 'Hide sections/groups ▲' : 'Sections / Groups ▾'}
                        </button>
                    )}
                </div>

                {isSelected && isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100 bg-white/60">
                        {renderClassOptionsPanel(classId)}
                    </div>
                )}
            </div>
        );
    };

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Subjects</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage, filter, search, and assign subjects across classes.</p>
                </div>
                <button
                    onClick={handleOpenCreateModal}
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
                            placeholder="Search subjects..."
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
                            <option value="Matric">Matric</option>
                            <option value="Cambridge">Cambridge</option>
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

            {/* Subjects Table (grouped by subject name across classes) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="p-4 w-10"></th>
                                <th className="p-4">Subject Name</th>
                                <th className="p-4">Assigned Classes</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="p-6 text-center text-gray-400">
                                        Loading subjects...
                                    </td>
                                </tr>
                            ) : groupedSubjects.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="p-6 text-center text-gray-400">
                                        No subjects found matching the criteria.
                                    </td>
                                </tr>
                            ) : (
                                groupedSubjects.map((group) => {
                                    const isExpanded = expandedGroups.has(group.key);
                                    return (
                                        <React.Fragment key={group.key}>
                                            <tr className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleGroupExpand(group.key)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-[var(--primary)] cursor-pointer"
                                                        title="Show classes"
                                                    >
                                                        {isExpanded ? '▾' : '▸'}
                                                    </button>
                                                </td>
                                                <td className="p-4 font-semibold text-[var(--quinary)]">
                                                    {group.name}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-md border border-gray-200 font-medium">
                                                            {group.classes.length} {group.classes.length === 1 ? 'class' : 'classes'}
                                                        </span>
                                                        <span className="text-gray-500 text-xs">
                                                            {summarizeClasses(group.classes, classes.length)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right space-x-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(group)}
                                                        className="px-3 py-1.5 text-xs font-medium text-[var(--primary)] bg-gray-100 hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteGroup(group)}
                                                        disabled={actionLoading}
                                                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                                    >
                                                        Delete All
                                                    </button>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan="4" className="p-0 bg-gray-50/70">
                                                        <div className="p-4 pl-14 space-y-2">
                                                            {group.classes.map((cls) => (
                                                                <div
                                                                    key={cls.subjectId}
                                                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl p-3"
                                                                >
                                                                    <div className="flex-1">
                                                                        <div className="text-sm font-medium text-[var(--quinary)] mb-1.5">
                                                                            {cls.class_name}
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-3">
                                                                            <div className="flex flex-wrap gap-1 items-center">
                                                                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-1">
                                                                                    Sections:
                                                                                </span>
                                                                                {cls.section_details.length > 0 ? (
                                                                                    cls.section_details.map((s) => (
                                                                                        <span key={s.id} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                                                                            {s.name}
                                                                                        </span>
                                                                                    ))
                                                                                ) : (
                                                                                    <span className="text-gray-400 text-xs italic">All Sections</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1 items-center">
                                                                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-1">
                                                                                    Groups:
                                                                                </span>
                                                                                {cls.group_details.length > 0 ? (
                                                                                    cls.group_details.map((g) => (
                                                                                        <span key={g.id} className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md border border-purple-100 font-medium">
                                                                                            {g.name}
                                                                                        </span>
                                                                                    ))
                                                                                ) : (
                                                                                    <span className="text-gray-400 text-xs italic">All Groups</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleRemoveClassFromGroup(group, cls)}
                                                                        disabled={actionLoading}
                                                                        className="self-start sm:self-center px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                                                        title="Remove from this class"
                                                                    >
                                                                        ✕ Remove
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal for Create / Edit Subject */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-[var(--quinary)]">
                                {editingGroup ? 'Edit Subject' : 'Add New Subject'}
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

                            {/* Assignment Mode */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Assign To
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: MODE_SINGLE, label: 'Single Class' },
                                        { value: MODE_MULTIPLE, label: 'Multiple Classes' },
                                        { value: MODE_ALL, label: 'All Classes' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => handleModeChange(opt.value)}
                                            className={`text-xs font-medium py-2.5 rounded-xl border transition-colors cursor-pointer ${
                                                formData.mode === opt.value
                                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Single Class Mode */}
                            {formData.mode === MODE_SINGLE && (
                                <div className="space-y-3">
                                    <div className="flex flex-col">
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                            Select Class
                                        </label>
                                        <select
                                            required
                                            value={formData.selectedClassIds[0] || ''}
                                            onChange={(e) => handleSingleClassSelect(e.target.value)}
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

                                    {formData.selectedClassIds[0] && (
                                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/60">
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                Sections & Groups for this class
                                            </span>
                                            {renderClassOptionsPanel(formData.selectedClassIds[0])}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Multiple Classes Mode */}
                            {formData.mode === MODE_MULTIPLE && (
                                <div className="flex flex-col">
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Select Classes (check the ones to assign)
                                    </label>
                                    <div className="space-y-2 max-h-72 overflow-y-auto p-1">
                                        {classes.length > 0 ? (
                                            classes.map((cls) => renderClassChecklistRow(cls, { checkable: true }))
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">No classes available.</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* All Classes Mode */}
                            {formData.mode === MODE_ALL && (
                                <div className="flex flex-col">
                                    <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2">
                                        This subject will be assigned to <strong>all {classes.length} classes</strong>.
                                        You can still optionally restrict individual classes to specific sections or groups below.
                                    </div>
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Classes ({classes.length})
                                    </label>
                                    <div className="space-y-2 max-h-72 overflow-y-auto p-1">
                                        {classes.length > 0 ? (
                                            classes.map((cls) => renderClassChecklistRow(cls, { checkable: false }))
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">No classes available.</span>
                                        )}
                                    </div>
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
                                    {actionLoading ? 'Saving...' : editingGroup ? 'Update Subject' : 'Create Subject'}
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