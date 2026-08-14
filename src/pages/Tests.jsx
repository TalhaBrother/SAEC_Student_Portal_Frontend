import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Tests = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Data States
    const [tests, setTests] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [groups, setGroups] = useState([]);

    // Search & Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState('');
    const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState('');

    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTest, setEditingTest] = useState(null);

    // How the test is being assigned: a single class, a hand-picked list of
    // classes, or every class. This drives which class picker UI is shown.
    const [assignMode, setAssignMode] = useState('single'); // 'single' | 'multiple' | 'all'

    const [formData, setFormData] = useState({
        name: '',
        student_class: '', // used when assignMode === 'single'
        classes: [],        // used when assignMode === 'multiple'
        sections: [],
        groups: [],
        date: '',
        description: ''
    });

    // Sub-loading states for forms (class-dependent sections/groups)
    const [formSections, setFormSections] = useState([]);
    const [formGroups, setFormGroups] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    // UI & Loading States
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Toast Notification helper
    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
    };

    // 1. Fetch Classes for filter dropdown & form selector
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

    // 3. Fetch Tests with Search & Backend Filters
    const fetchTests = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchTerm.trim()) params.append('search', searchTerm.trim());
            if (selectedClassFilter) params.append('class_id', selectedClassFilter);
            if (selectedSectionFilter) params.append('section_id', selectedSectionFilter);
            if (selectedGroupFilter) params.append('group_id', selectedGroupFilter);

            const res = await api.get(`/tests/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setTests(res.data || []);
        } catch (err) {
            console.error('Error fetching tests:', err);
            showMessage('error', 'Failed to fetch tests list.');
        } finally {
            setLoading(false);
        }
    }, [token, searchTerm, selectedClassFilter, selectedSectionFilter, selectedGroupFilter]);

    useEffect(() => {
        if (token) {
            const debounceTimer = setTimeout(() => {
                fetchTests();
            }, 300);
            return () => clearTimeout(debounceTimer);
        }
    }, [fetchTests, token]);

    // 4. Handle single-class selection inside Modal (Fetches applicable sections and groups for selected class)
    const handleFormClassChange = async (classId) => {
        setFormData((prev) => ({
            ...prev,
            student_class: classId,
            sections: [],
            groups: []
        }));

        // Sections/groups are class-specific, so they are not applicable
        // until a single class is actually chosen.
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

    // Toggle a class in/out of the "Multiple Classes" selection.
    const handleToggleMultiClass = (classId) => {
        setFormData((prev) => {
            const id = Number(classId);
            const alreadySelected = prev.classes.includes(id);
            return {
                ...prev,
                classes: alreadySelected
                    ? prev.classes.filter((c) => c !== id)
                    : [...prev.classes, id]
            };
        });
    };

    // Switch between Single / Multiple / All assignment modes, resetting
    // whichever fields don't apply to the newly selected mode.
    const handleAssignModeChange = (mode) => {
        setAssignMode(mode);
        setFormData((prev) => ({
            ...prev,
            student_class: '',
            classes: [],
            sections: [],
            groups: []
        }));
        setFormSections([]);
        setFormGroups([]);
    };

    // Modal Handlers
    const handleOpenModal = async (testItem = null) => {
        if (testItem) {
            setEditingTest(testItem);

            const assignedClassDetails = testItem.classes_detail || [];
            const assignedClassIds = assignedClassDetails.length > 0
                ? assignedClassDetails.map((cls) => Number(cls.id))
                : (testItem.classes || []).map((id) => Number(id));

            // If every currently available class is assigned, treat it as
            // "All Classes". Otherwise more than one class means "Multiple
            // Classes", and exactly one means "Single Class".
            const hasAllClasses = classes.length > 0 &&
                assignedClassIds.length === classes.length &&
                classes.every((cls) => assignedClassIds.includes(Number(cls.id)));

            const mode = hasAllClasses
                ? 'all'
                : (assignedClassIds.length > 1 ? 'multiple' : 'single');

            setAssignMode(mode);

            const extractedSections = testItem.sections
                || (testItem.sections_detail ? testItem.sections_detail.map((s) => s.id) : []);
            const extractedGroups = testItem.groups
                || (testItem.groups_detail ? testItem.groups_detail.map((g) => g.id) : []);

            // Sections/groups are only meaningful when the test is tied to
            // exactly one class.
            const applicableSections = mode === 'single' ? extractedSections : [];
            const applicableGroups = mode === 'single' ? extractedGroups : [];

            const singleClassId = mode === 'single' && assignedClassIds.length > 0
                ? assignedClassIds[0]
                : '';

            setFormData({
                name: testItem.name || '',
                student_class: singleClassId,
                classes: mode === 'multiple' ? assignedClassIds : [],
                sections: applicableSections,
                groups: applicableGroups,
                date: testItem.date || '',
                description: testItem.description || ''
            });

            if (mode === 'single' && singleClassId) {
                await handleFormClassChange(singleClassId);

                // handleFormClassChange resets sections/groups, so restore
                // the saved selections after the dependent options load.
                setFormData({
                    name: testItem.name || '',
                    student_class: singleClassId,
                    classes: [],
                    sections: applicableSections,
                    groups: applicableGroups,
                    date: testItem.date || '',
                    description: testItem.description || ''
                });
            } else {
                setFormSections([]);
                setFormGroups([]);
            }
        } else {
            setEditingTest(null);
            setAssignMode('single');
            setFormData({
                name: '',
                student_class: '',
                classes: [],
                sections: [],
                groups: [],
                date: '',
                description: ''
            });
            setFormSections([]);
            setFormGroups([]);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTest(null);
        setAssignMode('single');
        setFormData({ name: '', student_class: '', classes: [], sections: [], groups: [], date: '', description: '' });
        setFormSections([]);
        setFormGroups([]);
    };

    // Create & Update (POST / PUT)
    const handleSave = async (e) => {
        e.preventDefault();

        if (assignMode === 'single' && !formData.student_class) {
            showMessage('error', 'Please select a class.');
            return;
        }

        if (assignMode === 'multiple' && formData.classes.length === 0) {
            showMessage('error', 'Please select at least one class.');
            return;
        }

        setActionLoading(true);

        // Django expects a ManyToMany array for classes.
        // - Single: exactly one class.
        // - Multiple: whichever classes were checked.
        // - All: every class ID currently available.
        let selectedClassIds;
        if (assignMode === 'all') {
            selectedClassIds = classes.map((cls) => Number(cls.id));
        } else if (assignMode === 'multiple') {
            selectedClassIds = formData.classes.map((id) => Number(id));
        } else {
            selectedClassIds = [Number(formData.student_class)];
        }

        // Sections/groups are class-specific, so they only apply when the
        // test is tied to exactly one class.
        const payload = {
            name: formData.name,
            classes: selectedClassIds,
            sections: assignMode === 'single' ? formData.sections : [],
            groups: assignMode === 'single' ? formData.groups : [],
            date: formData.date,
            description: formData.description
        };

        try {
            if (editingTest) {
                await api.put(`/tests/${editingTest.id}/`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Test updated successfully!');
            } else {
                await api.post('/tests/', payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Test scheduled successfully!');
            }
            handleCloseModal();
            fetchTests();
        } catch (err) {
            console.error('Error saving test:', err);
            const errorData = err.response?.data;
            if (errorData && typeof errorData === 'object') {
                const firstKey = Object.keys(errorData)[0];
                const msg = Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey];
                showMessage('error', `${firstKey.toUpperCase()}: ${msg}`);
            } else {
                showMessage('error', 'Failed to save test. Please check your inputs.');
            }
        } finally {
            setActionLoading(false);
        }
    };

    // Delete (DELETE)
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this test?')) return;

        setActionLoading(true);
        try {
            await api.delete(`/tests/${id}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            showMessage('success', 'Test deleted successfully!');
            fetchTests();
        } catch (err) {
            console.error('Error deleting test:', err);
            showMessage('error', 'Failed to delete test.');
        } finally {
            setActionLoading(false);
        }
    };

    // Reset Filters
    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedClassFilter('');
        setSelectedSectionFilter('');
        setSelectedGroupFilter('');
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Tests Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Schedule, search, filter, and manage student tests.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-3 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer self-start md:self-auto"
                >
                    + Schedule New Test
                </button>
            </div>

            {/* Status Message Notification */}
            {message.text && (
                <div
                    className={`p-3 rounded-xl text-sm mb-6 border transition-all ${message.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Search Input */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Search Test
                        </label>
                        <input
                            type="text"
                            placeholder="Search by name or description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)]"
                        />
                    </div>

                    {/* Class Filter (Backend-powered via class_id) */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Filter by Class
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
                        Reset Filters
                    </button>
                </div>
            </div>

            {/* Tests Data Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="p-4">#</th>
                                <th className="p-4">Test Name</th>
                                <th className="p-4">Class</th>
                                <th className="p-4">Sections</th>
                                <th className="p-4">Groups</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="p-6 text-center text-gray-400">
                                        Loading tests...
                                    </td>
                                </tr>
                            ) : tests.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-6 text-center text-gray-400">
                                        No tests found matching the criteria.
                                    </td>
                                </tr>
                            ) : (
                                tests.map((t, idx) => {
                                    // Backend already computes the right label here:
                                    // "All Classes" when every class is assigned,
                                    // "No Classes" when none are, the class names
                                    // when there are a few, or "X, Y, Z + N more"
                                    // when there are many.
                                    const assignedClasses = t.classes_display || 'N/A';

                                    return (
                                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-gray-400 font-medium">{idx + 1}</td>
                                            <td className="p-4 font-semibold text-[var(--quinary)]">{t.name}</td>
                                            <td className="p-4 font-medium text-gray-700">{assignedClasses}</td>
                                            {/* Sections Column */}
                                            <td className="p-3 whitespace-nowrap">
                                                {t.sections_detail && t.sections_detail.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.sections_detail.map((sec) => (
                                                            <span key={sec.id} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                                                {sec.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">All Sections</span>
                                                )}
                                            </td>

                                            {/* Groups Column */}
                                            <td className="p-3 whitespace-nowrap">
                                                {t.groups_detail && t.groups_detail.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.groups_detail.map((grp) => (
                                                            <span key={grp.id} className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md border border-purple-100 font-medium">
                                                                {grp.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">All Groups</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-gray-600 font-medium">{t.date}</td>
                                            <td className="p-4 text-gray-500 max-w-xs truncate">
                                                {t.description ? (
                                                    t.description
                                                ) : (
                                                    <span className="text-gray-300 italic">No description</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right space-x-2">
                                                <button
                                                    onClick={() => handleOpenModal(t)}
                                                    className="px-3 py-1.5 text-xs font-medium text-[var(--primary)] bg-gray-100 hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors cursor-pointer"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(t.id)}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Schedule / Edit Test */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-[var(--quinary)]">
                                {editingTest ? 'Edit Test' : 'Schedule New Test'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-gray-400 hover:text-gray-600 text-sm font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Test Name Input */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Test Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Midterm Examination"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)]"
                                />
                            </div>

                            {/* Class Assignment Mode: Single / Multiple / All */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Assign to Class *
                                </label>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    {[
                                        { key: 'single', label: 'Single Class' },
                                        { key: 'multiple', label: 'Multiple Classes' },
                                        { key: 'all', label: 'All Classes' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => handleAssignModeChange(opt.key)}
                                            className={`text-xs font-medium py-2 px-2 rounded-xl border transition-colors cursor-pointer ${assignMode === opt.key
                                                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Single Class: plain dropdown */}
                                {assignMode === 'single' && (
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
                                )}

                                {/* Multiple Classes: checkbox grid */}
                                {assignMode === 'multiple' && (
                                    classes.length > 0 ? (
                                        <div className="flex flex-wrap gap-2 border border-gray-300 rounded-xl p-3 max-h-32 overflow-y-auto">
                                            {classes.map((cls) => {
                                                const checked = formData.classes.includes(Number(cls.id));
                                                return (
                                                    <label
                                                        key={cls.id}
                                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${checked
                                                                ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleToggleMultiClass(cls.id)}
                                                            className="rounded accent-[var(--primary)] cursor-pointer"
                                                        />
                                                        <span>{cls.display_name || cls.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">No classes registered yet.</span>
                                    )
                                )}

                                {/* All Classes: informational note, nothing to pick */}
                                {assignMode === 'all' && (
                                    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
                                        This test will be assigned to every class ({classes.length} total). Sections and
                                        groups aren't available in this mode since they're specific to each class.
                                    </p>
                                )}

                                {assignMode === 'multiple' && (
                                    <p className="text-xs text-gray-400 mt-1 italic">
                                        Sections and groups aren't available when assigning to multiple classes.
                                    </p>
                                )}
                            </div>

                            {/* Multiple Sections Selection */}
                            {assignMode === 'single' && formData.student_class && (
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
                                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${checked
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
                            {assignMode === 'single' && formData.student_class && (
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
                                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${checked
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

                            {/* Date Picker */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Test Date *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                                />
                            </div>

                            {/* Optional Description Textarea */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Description <span className="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <textarea
                                    rows="3"
                                    placeholder="Add optional notes, syllabus coverage, or remarks..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] resize-none"
                                />
                            </div>

                            {/* Actions */}
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
                                    {actionLoading ? 'Saving...' : editingTest ? 'Update Test' : 'Schedule Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tests;