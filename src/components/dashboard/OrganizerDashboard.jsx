// src/components/dashboard/OrganizerDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  DashboardIcon, 
  SignOutIcon, 
  SearchIcon, 
  BellIcon, 
  SettingsIcon,
  PlusIcon,
  LinkIcon,
  SparklesIcon,
  TrashIcon,
  EditIcon,
  DragIcon
} from '../ui/Icons';
import RegistrantsListModal from './RegistrantsListModal';
const CLUB_OPTIONS = ["IEEE", "GDG"];

export default function OrganizerDashboard({ user, onSignOut, onSwitchRole, canSwitchRole }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'profile'
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Event Creation
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [locationType, setLocationType] = useState('In-Person');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [clubCategory, setClubCategory] = useState('IEEE');
  const [customFields, setCustomFields] = useState([]);

  // Form State for Adding a Custom Field
  const [showFieldBuilder, setShowFieldBuilder] = useState(false);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldOptions, setFieldOptions] = useState('');

  // Modal State
  const [selectedEventForModal, setSelectedEventForModal] = useState(null);

  // Profile State
  const [profile, setProfile] = useState({ full_name: '', branch: '', phone: '', club_name: '' });

  useEffect(() => {
    fetchOrganizerData();
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfile(data);
      if (data.club_name) {
        setClubCategory(data.club_name);
      }
    }
  }

  async function fetchOrganizerData() {
    setLoading(true);
    
    // Fetch events created by this organizer
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });

    if (!eventsError && eventsData) {
      setEvents(eventsData);
      
      // Fetch all registrations for these events
      const eventIds = eventsData.map(e => e.id);
      if (eventIds.length > 0) {
        // If there are events, fetch registrations
        const { data: regData, error: regError } = await supabase
          .from('registrations')
          .select('*'); // We can fetch all and filter in memory for reliability in mock
        
        if (!regError && regData) {
          const filteredRegs = regData.filter(r => eventIds.includes(r.event_id));
          setRegistrations(filteredRegs);
        }
      } else {
        setRegistrations([]);
      }
    }
    setLoading(false);
  }

  // Custom Field Manager
  const handleAddField = (e) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return;

    const newField = {
      id: 'field_' + Math.random().toString(36).substr(2, 9),
      label: fieldLabel,
      type: fieldType,
      options: fieldType === 'select' ? fieldOptions.split(',').map(o => o.trim()).filter(Boolean) : []
    };

    setCustomFields([...customFields, newField]);
    setFieldLabel('');
    setFieldOptions('');
    setShowFieldBuilder(false);
  };

  const handleRemoveField = (fieldId) => {
    setCustomFields(customFields.filter(f => f.id !== fieldId));
  };

  // Launch Event
  const handleCreateEvent = async (e, forceDraft = false) => {
    e.preventDefault();
    if (!eventTitle || !eventDate) {
      alert('Event Title and Date are required.');
      return;
    }

    const newEvent = {
      title: eventTitle,
      date: new Date(eventDate).toISOString(),
      location_type: locationType,
      description,
      banner_url: bannerUrl || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
      organizer_id: user.id,
      custom_fields: customFields,
      status: forceDraft ? 'DRAFT' : 'OPEN',
      club_category: clubCategory || profile.club_name || 'IEEE'
    };

    const { error } = await supabase.from('events').insert(newEvent);

    if (error) {
      alert('Failed to launch event: ' + error.message);
    } else {
      alert(forceDraft ? 'Draft saved successfully!' : 'Event registration launched successfully!');
      // Reset form
      setEventTitle('');
      setEventDate('');
      setLocationType('In-Person');
      setDescription('');
      setBannerUrl('');
      setCustomFields([]);
      setClubCategory(profile.club_name || 'IEEE');
      // Refresh list
      fetchOrganizerData();
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event? This will delete all registrations as well.')) return;

    const { error } = await supabase.from('events').delete().eq('id', eventId);

    if (error) {
      alert('Failed to delete event: ' + error.message);
    } else {
      fetchOrganizerData();
    }
  };

  // Toggle status (OPEN/CLOSED)
  const toggleEventStatus = async (eventObj) => {
    const nextStatus = eventObj.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    const { error } = await supabase
      .from('events')
      .update({ status: nextStatus })
      .eq('id', eventObj.id);

    if (error) {
      alert('Failed to update event: ' + error.message);
    } else {
      fetchOrganizerData();
    }
  };

  // Statistics calculation
  const totalActiveEvents = events.filter(e => e.status === 'OPEN').length;
  const totalRegistrations = registrations.length;
  
  // Get registration count for a specific event
  const getRegCount = (eventId) => {
    return registrations.filter(r => r.event_id === eventId).length;
  };

  // Filter managed events table
  const filteredEvents = events.filter(e => {
    return e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Left Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-6 shrink-0">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-black text-primary-500 tracking-tight flex items-center gap-2">
              UVCEevents
            </h2>
            <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase block mt-1">
              Academic Portal
            </span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <DashboardIcon className="w-5 h-5" />
              Event Management
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <SettingsIcon className="w-5 h-5" />
              Profile Settings
            </button>
          </nav>
        </div>

        {/* Switch Role shortcut */}
        <div className="space-y-4 pt-6 border-t border-slate-100">
          {canSwitchRole && (
            <button
              onClick={onSwitchRole}
              className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
            >
              Switch to Student
            </button>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50/50 transition-all"
          >
            <SignOutIcon className="w-5 h-5 text-rose-500" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-grow flex flex-col min-w-0">
        {/* Header Bar */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {activeTab === 'profile' ? 'Organizer Profile' : 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {activeTab === 'dashboard' && (
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50/50"
                />
                <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            )}

            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <BellIcon className="w-5 h-5" />
            </button>

            <button onClick={() => setActiveTab('profile')} className="text-gray-400 hover:text-gray-600 transition-colors">
              <SettingsIcon className="w-5 h-5" />
            </button>

            {/* Avatar Pill */}
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
              <div className="w-9 h-9 bg-primary-100 text-primary-600 font-bold rounded-full flex items-center justify-center text-sm shadow-inner">
                {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </div>
              <div className="text-left leading-none max-w-[120px] hidden md:block">
                <span className="font-semibold text-xs text-slate-800 block truncate">{profile.full_name || 'Organizer'}</span>
                <span className="text-[9px] text-gray-400 block mt-0.5 truncate">{profile.branch || 'Organizer Dept'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 overflow-y-auto flex-grow max-h-[calc(100vh-80px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <svg className="animate-spin h-8 w-8 text-primary-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-gray-400 font-semibold">Syncing dashboards...</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <div className="space-y-8 animate-fade-in">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">Event Management</h2>
                    <p className="text-sm text-gray-500 mt-1">Organize, track, and scale your academic seminars and workshops.</p>
                  </div>

                  {/* 2-Column Split */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* LEFT COLUMN: Create Event (7 cols) */}
                    <div className="lg:col-span-7 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
                      <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <h3 className="font-bold text-slate-800 text-sm">Create Event</h3>
                      </div>

                      <form className="space-y-5" onSubmit={(e) => handleCreateEvent(e, false)}>
                        {/* Event Title */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Event Title</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Advanced Quantum Computing Seminar"
                            value={eventTitle}
                            onChange={(e) => setEventTitle(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                          />
                        </div>

                        {/* Date and Location Type */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Date</label>
                            <input
                              type="datetime-local"
                              required
                              value={eventDate}
                              onChange={(e) => setEventDate(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Location Type</label>
                            <select
                              value={locationType}
                              onChange={(e) => setLocationType(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                            >
                              <option value="In-Person">In-Person</option>
                              <option value="Virtual">Virtual</option>
                              <option value="Hybrid">Hybrid</option>
                            </select>
                          </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Description</label>
                          <textarea
                            rows={3}
                            placeholder="Briefly describe the purpose and agenda..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs resize-none"
                          />
                        </div>

                        {/* Banner Image URL */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Banner Image URL</label>
                          <div className="relative">
                            <input
                              type="url"
                              placeholder="https://images.unsplash.com/..."
                              value={bannerUrl}
                              onChange={(e) => setBannerUrl(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                            />
                            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          </div>
                        </div>

                        {/* Hosting Club / Category */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Hosting Club / Category</label>
                          <select
                            value={clubCategory}
                            onChange={(e) => setClubCategory(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                            required
                          >
                            {CLUB_OPTIONS.map((club) => (
                              <option key={club} value={club}>{club}</option>
                            ))}
                          </select>
                        </div>

                        {/* Custom Registration Fields Builder */}
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Custom Registration Fields</h4>
                            <button
                              type="button"
                              onClick={() => setShowFieldBuilder(!showFieldBuilder)}
                              className="text-primary-500 hover:text-primary-600 text-xs font-bold flex items-center gap-1"
                            >
                              <PlusIcon className="w-4 h-4" /> Add Field
                            </button>
                          </div>

                          {/* Inline Builder Form */}
                          {showFieldBuilder && (
                            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-4 animate-fade-in text-xs">
                              <h5 className="font-bold text-slate-800">New Field Details</h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Field Label / Question</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. T-Shirt Size"
                                    value={fieldLabel}
                                    onChange={(e) => setFieldLabel(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Field Input Type</label>
                                  <select
                                    value={fieldType}
                                    onChange={(e) => setFieldType(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                  >
                                    <option value="text">Short Text</option>
                                    <option value="text_area">Text Area (Paragraph)</option>
                                    <option value="select">Dropdown Select</option>
                                    <option value="file">File Upload (PDF/Image)</option>
                                  </select>
                                </div>
                              </div>

                              {fieldType === 'select' && (
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Options (comma-separated)</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. S, M, L, XL"
                                    value={fieldOptions}
                                    onChange={(e) => setFieldOptions(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                  />
                                </div>
                              )}

                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setShowFieldBuilder(false)}
                                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-500"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAddField}
                                  className="px-3 py-1.5 bg-primary-500 text-white rounded-lg text-[11px] font-bold"
                                >
                                  Insert Field
                                </button>
                              </div>
                            </div>
                          )}

                          {/* List of Fields Added */}
                          <div className="space-y-2">
                            {customFields.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic">No custom questions added yet. By default, registrations capture student name, email, branch, roll number, and phone.</p>
                            ) : (
                              customFields.map((field) => (
                                <div key={field.id} className="bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl flex items-center justify-between group">
                                  <div className="flex items-center gap-3">
                                    <DragIcon className="w-4 h-4 text-slate-300" />
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700">{field.label}</span>
                                      <span className="ml-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-200 text-slate-500 tracking-wider">
                                        {field.type}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveField(field.id)}
                                    className="text-gray-400 hover:text-rose-500 transition-colors"
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Submit Button & Save Draft */}
                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={(e) => handleCreateEvent(e, true)}
                            className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl text-xs transition-colors"
                          >
                            Save as Draft
                          </button>
                          <button
                            type="submit"
                            className="flex-[2] bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition-all text-xs"
                          >
                            Launch Event Registration
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* RIGHT COLUMN: Statistics and Managed Table (5 cols) */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* STATS BLOCK */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between h-32">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Active</span>
                          <span className="text-3xl font-black text-slate-800">{totalActiveEvents}</span>
                          <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5 mt-2">
                            <span>▲</span> +2 this month
                          </span>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between h-32">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Registrations</span>
                          <span className="text-3xl font-black text-slate-800">
                            {totalRegistrations.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold mt-2">
                            84% average capacity
                          </span>
                        </div>
                      </div>

                      {/* MANAGED EVENTS CARD */}
                      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Managed Events</h4>
                          {events.length > 0 && (
                            <button
                              onClick={() => {
                                // Export all events summary
                                alert('Generating CSV summary for all managed events...');
                              }}
                              className="text-[10px] font-semibold text-primary-500 hover:underline"
                            >
                              Export Overview
                            </button>
                          )}
                        </div>

                        {filteredEvents.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-xs">
                            No events created yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 text-xs text-slate-700 max-h-[300px] overflow-y-auto pr-1">
                            {filteredEvents.map((event) => {
                              const regCount = getRegCount(event.id);
                              return (
                                <div 
                                  key={event.id} 
                                  onClick={() => setSelectedEventForModal(event)}
                                  className="py-3 px-3 -mx-3 flex justify-between items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-xl transition-all"
                                >
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-800 block truncate">
                                      {event.title}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      {new Date(event.date).toLocaleDateString()}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-4 shrink-0">
                                    <span className="font-bold text-slate-700">{regCount} rsvps</span>
                                    
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                      event.status === 'OPEN' 
                                        ? 'bg-emerald-50 text-emerald-600' 
                                        : event.status === 'CLOSED'
                                        ? 'bg-slate-100 text-slate-500'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}>
                                      {event.status}
                                    </span>

                                    {/* Action dropdown/toggles */}
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => toggleEventStatus(event)}
                                        title={event.status === 'OPEN' ? 'Close registration' : 'Open registration'}
                                        className="p-1 hover:bg-slate-100 rounded text-slate-500"
                                      >
                                        <EditIcon className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEvent(event.id)}
                                        title="Delete Event"
                                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded"
                                      >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* OPTIMIZATION TIP CARD */}
                      <div className="bg-primary-50/50 border border-primary-100 rounded-3xl p-5 flex items-start gap-3">
                        <SparklesIcon className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="font-bold text-primary-900 text-xs">Optimization Tip</h5>
                          <p className="text-[11px] text-primary-700/80 leading-relaxed mt-1">
                            Events with custom registration fields see a 15% higher completion rate when limited to 3 questions.
                          </p>
                        </div>
                      </div>

                    </div>

                  </div>
                </div>
              )}

              {/* TAB 2: PROFILE SETTINGS */}
              {activeTab === 'profile' && (
                <div className="max-w-2xl bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm animate-fade-in mx-auto">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Modify Organizer Details</h3>
                  
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    
                    // 1. Update public.profiles table
                    const { error: profileError } = await supabase
                      .from('profiles')
                      .update({
                        full_name: profile.full_name,
                        branch: profile.branch,
                        phone: profile.phone,
                        club_name: profile.club_name
                      })
                      .eq('id', user.id);

                    if (profileError) {
                      console.error('Failed to update organizer profile:', profileError);
                      alert('Failed to update database record: ' + profileError.message);
                      return;
                    }

                    if (profile.club_name) {
                      setClubCategory(profile.club_name);
                    }

                    // 2. Sync full name to Supabase Auth metadata
                    const { error: authError } = await supabase.auth.updateUser({
                      data: { full_name: profile.full_name }
                    });

                    if (authError) {
                      console.error('Failed to sync auth details:', authError);
                      alert('Failed to sync authentication profile details: ' + authError.message);
                      return;
                    }

                    alert('Profile updated successfully!');
                  }} className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Organizer Full Name</label>
                      <input
                        type="text"
                        required
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Department / Club Name</label>
                      <input
                        type="text"
                        required
                        value={profile.branch}
                        onChange={(e) => setProfile({ ...profile, branch: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Hosting Club Name</label>
                      <input
                        type="text"
                        required
                        value={profile.club_name || ''}
                        onChange={(e) => setProfile({ ...profile, club_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                        placeholder="e.g. IEEE, GDG"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Phone Number</label>
                      <input
                        type="tel"
                        required
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                      <button
                        type="submit"
                        className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all text-xs"
                      >
                        Save Profile Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* REGISTRANTS DETAIL LIST MODAL */}
      {selectedEventForModal && (
        <RegistrantsListModal
          event={selectedEventForModal}
          onClose={() => {
            setSelectedEventForModal(null);
            fetchOrganizerData(); // Refresh registrant counts
          }}
        />
      )}
    </div>
  );
}
