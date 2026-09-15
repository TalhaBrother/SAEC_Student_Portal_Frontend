import React, { useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import api from '../api/axios';
import useInstituteStore from '../store/instituteStore';
import useAuthStore from '../store/authStore';
import { DEFAULT_THEME, THEME_GROUPS, applyTheme, loadTheme, saveTheme, resetTheme } from '../utils/theme';

// One swatch row: native color picker + a synced, editable hex field.
// A local `draft` mirrors the text input so the user can type freely;
// it only commits upward (and live-previews) once it's a valid 6-digit
// hex color, and snaps back to the last valid value on blur otherwise.
const ColorField = ({ label, value, onChange }) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleTextChange = (e) => {
    const next = e.target.value;
    setDraft(next);
    if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChange(next);
  };

  return (
    <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} color picker`}
        className="w-9 h-9 rounded-lg border border-neutral-300 cursor-pointer shrink-0 bg-transparent p-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-quinary truncate">{label}</p>
        <input
          type="text"
          value={draft}
          onChange={handleTextChange}
          onBlur={() => setDraft(value)}
          spellCheck={false}
          className="w-full bg-transparent text-[11px] text-neutral-500 font-mono outline-none"
        />
      </div>
    </div>
  );
};

// Turns "accent-teal-dark" into "Accent Teal Dark" for display labels.
const prettifyKey = (key) =>
  key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const emptyForm = {
  institute_name: '',
  short_name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  motto: '',
  report_card_title: '',
};

const Settings = () => {
  const { settings, setSettings } = useInstituteStore();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Existing image URLs (from server) vs newly picked files (not uploaded yet)
  const [logoUrl, setLogoUrl] = useState(null);
  const [watermarkUrl, setWatermarkUrl] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [watermarkFile, setWatermarkFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [watermarkPreview, setWatermarkPreview] = useState(null);

  const logoInputRef = useRef(null);
  const watermarkInputRef = useRef(null);

  // Theme customizer state — separate from the institute-info form above.
  // Note: App.jsx/main.jsx already calls initTheme() once at boot so the
  // saved theme (if any) is applied before this page ever mounts. This
  // just mirrors that same saved/default theme into local state so the
  // color pickers below start in sync with what's already on screen.
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [themeSaving, setThemeSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
    setTheme(loadTheme());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (watermarkPreview) URL.revokeObjectURL(watermarkPreview);
    };
  }, [logoPreview, watermarkPreview]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/institute/settings/', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = res.data;

      setForm({
        institute_name: data.institute_name || '',
        short_name: data.short_name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        motto: data.motto || '',
        report_card_title: data.report_card_title || '',
      });
      setLogoUrl(data.logo || null);
      setWatermarkUrl(data.watermark || null);
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch institute settings:', error);
      Swal.fire({
        icon: 'error',
        title: 'Failed to Load Settings',
        text: error.response?.data?.detail || 'Could not fetch institute settings.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleWatermarkChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkFile(file);
    if (watermarkPreview) URL.revokeObjectURL(watermarkPreview);
    setWatermarkPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.institute_name.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Institute Name Required',
        text: 'Please enter the institute name before saving.',
      });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('institute_name', form.institute_name);
      formData.append('short_name', form.short_name);
      formData.append('address', form.address);
      formData.append('phone', form.phone);
      formData.append('email', form.email);
      formData.append('website', form.website);
      formData.append('motto', form.motto);
      formData.append('report_card_title', form.report_card_title);

      // Only attach image fields if the user picked a new file — avoids
      // accidentally clearing an existing logo/watermark on save.
      if (logoFile) formData.append('logo', logoFile);
      if (watermarkFile) formData.append('watermark', watermarkFile);

      const res = await api.patch('/institute/settings/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setSettings(res.data);
      setLogoUrl(res.data.logo || null);
      setWatermarkUrl(res.data.watermark || null);
      setLogoFile(null);
      setWatermarkFile(null);
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (watermarkPreview) URL.revokeObjectURL(watermarkPreview);
      setLogoPreview(null);
      setWatermarkPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
      if (watermarkInputRef.current) watermarkInputRef.current.value = '';

      Swal.fire({
        icon: 'success',
        title: 'Settings Saved',
        text: 'Institute settings have been updated successfully.',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save institute settings:', error);
      const data = error.response?.data;
      let message = 'Could not save institute settings.';
      if (data && typeof data === 'object') {
        const firstKey = Object.keys(data)[0];
        if (firstKey) {
          const val = Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey];
          message = `${firstKey}: ${val}`;
        }
      }
      Swal.fire({
        icon: 'error',
        title: 'Save Failed',
        text: message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Live-preview a single swatch change immediately (so the whole app
  // re-themes as the user picks), and keep it in local state so "Save
  // Theme" knows the full picture. Nothing is persisted until Save.
  const handleColorChange = (key, value) => {
    setTheme((prev) => {
      const next = { ...prev, [key]: value };
      applyTheme({ [key]: value });
      return next;
    });
  };

  // Persist the currently-previewed theme so it survives a reload.
  const handleSaveTheme = async () => {
    setThemeSaving(true);
    try {
      saveTheme(theme);
      await Swal.fire({
        icon: 'success',
        title: 'Theme Saved',
        text: 'Your custom colors have been saved and will persist across reloads.',
        timer: 2000,
        showConfirmButton: false,
      });
    } finally {
      setThemeSaving(false);
    }
  };

  // Wipe the saved theme and restore the shipped defaults everywhere.
  const handleResetTheme = async () => {
    const confirmResult = await Swal.fire({
      title: 'Reset theme to default?',
      text: 'This clears your saved custom colors and restores the original palette.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Reset',
      cancelButtonText: 'Cancel',
      confirmButtonColor: 'var(--danger)',
      cancelButtonColor: 'var(--neutral-400)',
      background: 'var(--secondary)',
      color: 'var(--quinary)',
    });
    if (!confirmResult.isConfirmed) return;

    const defaults = resetTheme();
    setTheme(defaults);
    Swal.fire({
      icon: 'success',
      title: 'Theme Reset',
      text: 'Restored the default color palette.',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm text-neutral-500 font-medium">Loading institute settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 sm:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-3">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Admin Configuration
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-quinary mb-1">
          Institute Settings
        </h1>
        <p className="text-neutral-500 text-sm leading-relaxed">
          These details are used across the portal — login page, dashboards, and generated PDFs
          (report cards, timetables, etc.).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Branding */}
        <section className="bg-surface border border-neutral-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600 mb-5">
            Branding
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Logo */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block mb-2">
                Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
                  {logoPreview || logoUrl ? (
                    <img
                      src={logoPreview || logoUrl}
                      alt="Logo preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-neutral-400 text-center px-1">No logo</span>
                  )}
                </div>
                <div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="block text-xs text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">PNG or JPG recommended.</p>
                </div>
              </div>
            </div>

            {/* Watermark */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block mb-2">
                Watermark
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
                  {watermarkPreview || watermarkUrl ? (
                    <img
                      src={watermarkPreview || watermarkUrl}
                      alt="Watermark preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-neutral-400 text-center px-1">No watermark</span>
                  )}
                </div>
                <div>
                  <input
                    ref={watermarkInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleWatermarkChange}
                    className="block text-xs text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">Used on PDF backgrounds.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Basic Information */}
        <section className="bg-surface border border-neutral-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600 mb-5">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Institute Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="institute_name"
                value={form.institute_name}
                onChange={handleChange}
                required
                placeholder="SAEC Coaching Center"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Short Name
              </label>
              <input
                type="text"
                name="short_name"
                value={form.short_name}
                onChange={handleChange}
                placeholder="SAEC"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Phone
              </label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+92 300 0000000"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="info@saec.edu.pk"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Website
              </label>
              <input
                type="url"
                name="website"
                value={form.website}
                onChange={handleChange}
                placeholder="https://saec.edu.pk"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Address
              </label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                placeholder="Street, City, Country"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 resize-none"
              />
            </div>
          </div>
        </section>

        {/* Documents / Text */}
        <section className="bg-surface border border-neutral-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600 mb-5">
            Text &amp; Documents
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Motto
              </label>
              <input
                type="text"
                name="motto"
                value={form.motto}
                onChange={handleChange}
                placeholder="Excellence in Education"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Report Card Title
              </label>
              <input
                type="text"
                name="report_card_title"
                value={form.report_card_title}
                onChange={handleChange}
                placeholder="STUDENT REPORT CARD"
                className="w-full bg-surface text-quinary border border-neutral-200 rounded-xl px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
            </div>
          </div>
        </section>

        {/* Theme Customizer — independent of the institute-info form above.
            Every swatch previews live across the whole app instantly;
            "Save Theme" is what makes it stick after a reload. */}
        <section className="bg-surface border border-neutral-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Theme Customizer
            </h2>
            <button
              type="button"
              onClick={handleResetTheme}
              className="text-xs font-semibold text-danger hover:underline cursor-pointer"
            >
              Reset to Default
            </button>
          </div>
          <p className="text-xs text-neutral-500 mb-5">
            Personalize the portal's color palette. Changes preview instantly across every page —
            click "Save Theme" below to keep them after a reload.
          </p>

          <div className="space-y-6">
            {THEME_GROUPS.map((group) => (
              <div key={group.label}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2.5">
                  {group.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.keys.map((key) => (
                    <ColorField
                      key={key}
                      label={prettifyKey(key)}
                      value={theme[key]}
                      onChange={(value) => handleColorChange(key, value)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={themeSaving}
              className="px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-primary hover:opacity-95 disabled:opacity-50 shadow-md hover:shadow-lg active:scale-[0.99] transition-all duration-200"
            >
              {themeSaving ? 'Saving...' : 'Save Theme'}
            </button>
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={fetchSettings}
            disabled={saving}
            className="px-5 py-3 rounded-xl text-sm font-semibold text-neutral-600 border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-primary hover:opacity-95 disabled:opacity-50 shadow-md hover:shadow-lg active:scale-[0.99] transition-all duration-200"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;