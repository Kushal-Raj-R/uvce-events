// src/components/dashboard/StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  GraduationCap, 
  Calendar, 
  DashboardIcon, 
  SearchIcon, 
  BellIcon, 
  SettingsIcon, 
  SignOutIcon,
  CheckIcon
} from '../ui/Icons';
import RegistrationModal from './RegistrationModal';

export default function StudentDashboard({ user, onSignOut, onSwitchRole, canSwitchRole }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'upcoming' | 'registrations' | 'profile'
  const [events, setEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocationType, setSelectedLocationType] = useState('All');
  const [clubSearchQuery, setClubSearchQuery] = useState('');
  
  // Registration Modal State
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Profile Edit State
  const [profile, setProfile] = useState({
    full_name: '',
    roll_number: '',
    branch: '',
    semester: '',
    phone: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Initial Data Fetching
  useEffect(() => {
    fetchDashboardData();
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchDashboardData() {
    setLoading(true);
    // Fetch all active/open events
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (!eventsError && eventsData) {
      // Filter out drafts for students
      setEvents(eventsData.filter(e => e.status !== 'DRAFT'));
    }

    // Fetch student's registrations
    const { data: regData, error: regError } = await supabase
      .from('registrations')
      .select('*')
      .eq('student_id', user.id);

    if (!regError && regData) {
      setMyRegistrations(regData);
    }
    setLoading(false);
  }

  async function fetchProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile({
        full_name: data.full_name || '',
        roll_number: data.roll_number || '',
        branch: data.branch || '',
        semester: data.semester || '',
        phone: data.phone || ''
      });
    }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileSuccessMsg('');
    setProfileErrorMsg('');

    // 1. Update public.profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        roll_number: profile.roll_number,
        branch: profile.branch,
        semester: profile.semester,
        phone: profile.phone
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Failed to sync profile with database:', profileError);
      setProfileErrorMsg(profileError.message || 'Failed to update database record.');
      setProfileLoading(false);
      return;
    }

    // 2. Sync full name to Supabase Auth metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: profile.full_name }
    });

    if (authError) {
      console.error('Failed to sync full name with Supabase Auth:', authError);
      setProfileErrorMsg(authError.message || 'Failed to sync authentication profile details.');
      setProfileLoading(false);
      return;
    }

    // 3. Success Feedback
    setProfileSuccessMsg('Profile updated successfully!');
    // Update local session user metadata
    user.user_metadata = { ...user.user_metadata, ...profile };

    // Auto-dismiss success alert after exactly 3000ms (3 seconds)
    setTimeout(() => {
      setProfileSuccessMsg('');
    }, 3000);

    setProfileLoading(false);
  };


  // Helper: check if registered for event
  const getRegistrationForEvent = (eventId) => {
    return myRegistrations.find(r => r.event_id === eventId);
  };

  // Filter events based on search query, location type, and club category
  const filteredEvents = events.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLocation = selectedLocationType === 'All' || e.location_type === selectedLocationType;
    const matchesClub = !clubSearchQuery.trim() || e.club_category?.toLowerCase().trim().includes(clubSearchQuery.toLowerCase().trim());
    return matchesSearch && matchesLocation && matchesClub;
  });

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Left Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-6 shrink-0">
        <div className="space-y-8">
          {/* Sidebar Brand Logo */}
          <div>
            <h2 className="text-xl font-black text-primary-500 tracking-tight flex items-center gap-2">
              UVCEevents
            </h2>
            <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase block mt-1">
              Academic Portal
            </span>
          </div>

          {/* Navigation Links */}
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
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Upcoming Events
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all relative ${
                activeTab === 'registrations'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <CheckIcon className="w-5 h-5" />
              My Registrations
              {myRegistrations.length > 0 && (
                <span className="absolute right-4 bg-primary-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {myRegistrations.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <GraduationCap className="w-5 h-5" />
              Profile Settings
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="space-y-4 pt-6 border-t border-slate-100">
          {/* Switch Role shortcut */}
          {canSwitchRole && (
            <button
              onClick={onSwitchRole}
              className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
            >
              Switch to Organizer
            </button>
          )}
          
          {/* Sign Out */}
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
            <h1 className="text-xl font-bold text-slate-800 capitalize">
              {activeTab === 'upcoming' ? 'All Workshops & Seminars' : activeTab === 'registrations' ? 'My Registrations' : activeTab === 'profile' ? 'Profile Details' : 'Student Hub'}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Search Bar - only shown on events views */}
            {(activeTab === 'dashboard' || activeTab === 'upcoming') && (
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

            {/* Notification bell */}
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <BellIcon className="w-5 h-5" />
            </button>

            {/* Settings */}
            <button onClick={() => setActiveTab('profile')} className="text-gray-400 hover:text-gray-600 transition-colors">
              <SettingsIcon className="w-5 h-5" />
            </button>

            {/* Avatar Pill */}
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
              <div className="w-9 h-9 bg-primary-100 text-primary-600 font-bold rounded-full flex items-center justify-center text-sm shadow-inner">
                {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </div>
              <div className="text-left leading-none max-w-[120px] hidden md:block">
                <span className="font-semibold text-xs text-slate-800 block truncate">{profile.full_name || 'Student'}</span>
                <span className="text-[10px] text-gray-400 truncate">{profile.roll_number || 'No Roll #'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content Area */}
        <div className="p-8 overflow-y-auto flex-grow max-h-[calc(100vh-80px)]">
          
          {/* LOADING STATE */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <svg className="animate-spin h-8 w-8 text-primary-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-gray-400 font-semibold">Loading data...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: STUDENT MAIN DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-8 animate-fade-in">
                  {/* Hero welcome banner */}
                  <div className="bg-gradient-to-r from-primary-500 to-indigo-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-primary-500/10">
                    <div className="relative z-10 max-w-xl">
                      <h2 className="text-2xl font-black mb-2">Welcome to your Academic Portal!</h2>
                      <p className="text-white/80 text-sm leading-relaxed mb-4">
                        Discover, register, and track academic seminars, hands-on workshops, and student networking opportunities.
                      </p>
                      <button
                        onClick={() => setActiveTab('upcoming')}
                        className="bg-white text-primary-600 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        Explore Upcoming Events
                      </button>
                    </div>
                    {/* Decorative abstract elements */}
                    <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/10 skew-x-12 origin-top-right pointer-events-none"></div>
                  </div>

                  {/* Summary Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-primary-50 text-primary-500 rounded-xl">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Available Workshops</span>
                        <span className="text-2xl font-bold text-slate-800">{events.length}</span>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-emerald-50 text-emerald-500 rounded-xl">
                        <CheckIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Registered Events</span>
                        <span className="text-2xl font-bold text-slate-800">{myRegistrations.length}</span>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-amber-50 text-amber-500 rounded-xl">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Student Rank / Sem</span>
                        <span className="text-sm font-bold text-slate-800">{profile.semester || '6th Sem'} CS</span>
                      </div>
                    </div>
                  </div>

                  {/* Highlighted Events */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Featured Events</h3>
                      <button 
                        onClick={() => setActiveTab('upcoming')} 
                        className="text-primary-500 text-xs font-bold hover:underline"
                      >
                        View All
                      </button>
                    </div>

                    {/* Search Events by Club Name */}
                    <div className="mb-6 max-w-md">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Search Events by Club Name
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search by club name..."
                          value={clubSearchQuery}
                          onChange={(e) => setClubSearchQuery(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-all"
                        />
                      </div>
                    </div>

                    {filteredEvents.length === 0 ? (
                      <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
                        <span className="text-gray-400 text-sm">No events found matching search query.</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredEvents.slice(0, 3).map((event) => {
                          const isReg = getRegistrationForEvent(event.id);
                          return (
                            <EventCard
                              key={event.id}
                              event={event}
                              isRegistered={!!isReg}
                              onRegister={() => setSelectedEvent(event)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: UPCOMING EVENTS GRID */}
              {activeTab === 'upcoming' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Filter Toolbar */}
                  <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-sm">
                    <div className="flex flex-wrap gap-4 items-center">
                      {/* Location Filter */}
                      <div className="flex gap-2">
                        {['All', 'In-Person', 'Virtual', 'Hybrid'].map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedLocationType(type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              selectedLocationType === type
                                ? 'bg-primary-500 text-white'
                                : 'border border-slate-200 text-gray-500 hover:bg-slate-50'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="hidden sm:block w-[1px] h-6 bg-slate-200"></div>

                      {/* Search Events by Club Name */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search by club (e.g. IEEE, CSI...)"
                          value={clubSearchQuery}
                          onChange={(e) => setClubSearchQuery(e.target.value)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs shadow-sm transition-all"
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-semibold">
                      Found {filteredEvents.length} open events
                    </span>
                  </div>

                  {/* Grid */}
                  {filteredEvents.length === 0 ? (
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-16 text-center shadow-sm">
                      <h4 className="font-semibold text-slate-700 text-sm">No events found</h4>
                      <p className="text-xs text-gray-400 mt-1">Try resetting your filters or typing another keywords.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredEvents.map((event) => {
                        const isReg = getRegistrationForEvent(event.id);
                        return (
                          <EventCard
                            key={event.id}
                            event={event}
                            isRegistered={!!isReg}
                            onRegister={() => setSelectedEvent(event)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: STUDENT MY REGISTRATIONS */}
              {activeTab === 'registrations' && (
                <div className="space-y-6 animate-fade-in">
                  {myRegistrations.length === 0 ? (
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-16 text-center shadow-sm max-w-md mx-auto">
                      <div className="w-12 h-12 bg-primary-50 text-primary-500 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-slate-700 text-sm">No Registrations Yet</h4>
                      <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                        Explore upcoming events and reserve your spot to track them here.
                      </p>
                      <button
                        onClick={() => setActiveTab('upcoming')}
                        className="bg-primary-500 text-white text-xs font-bold px-4 py-2 rounded-xl mt-4 hover:bg-primary-600 transition-colors"
                      >
                        Find Workshops
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 text-sm">Active Credentials</h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {myRegistrations.map((reg) => {
                          const eventObj = events.find(e => e.id === reg.event_id) || {};
                          if (!eventObj.title) return null; // Event deleted or draft

                          return (
                            <div key={reg.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors">
                              {/* Event Meta */}
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                                  <img
                                    src={eventObj.banner_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=400&q=80'}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-bold text-slate-800 text-sm truncate">{eventObj.title}</h4>
                                  <div className="flex items-center gap-3 text-[10px] text-gray-400 font-semibold mt-1">
                                    <span>{new Date(eventObj.date).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider">{eventObj.location_type}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Custom Answers Summary */}
                              {Object.keys(reg.custom_answers || {}).length > 0 && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 max-w-sm flex-1 text-xs">
                                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Your Answers</span>
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                    {Object.entries(reg.custom_answers).map(([key, val]) => {
                                      const fieldDef = eventObj.custom_fields?.find(f => f.id === key) || { label: key };
                                      return (
                                        <div key={key}>
                                          <span className="text-gray-400 font-medium block text-[9px]">{fieldDef.label}:</span>
                                          <span className="font-semibold text-slate-700 truncate block">{val}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* RSVP Status - Registration is final */}
                              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                                RSVP Confirmed
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PROFILE SETTINGS */}
              {activeTab === 'profile' && (
                <div className="max-w-2xl bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm animate-fade-in mx-auto">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Modify Academic Details</h3>

                  {profileSuccessMsg && (
                    <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-sm font-medium">
                      {profileSuccessMsg}
                    </div>
                  )}
                  {profileErrorMsg && (
                    <div className="mb-6 p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-sm font-medium">
                      {profileErrorMsg}
                    </div>
                  )}

                  <form onSubmit={handleProfileSave} className="space-y-6">
                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Full Name</label>
                      <input
                        type="text"
                        required
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {/* Roll Number */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Roll Number</label>
                        <input
                          type="text"
                          required
                          value={profile.roll_number}
                          onChange={(e) => setProfile({ ...profile, roll_number: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                        />
                      </div>

                      {/* Branch */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Branch</label>
                        <input
                          type="text"
                          required
                          value={profile.branch}
                          onChange={(e) => setProfile({ ...profile, branch: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                        />
                      </div>

                      {/* Semester */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Semester</label>
                        <select
                          required
                          value={profile.semester}
                          onChange={(e) => setProfile({ ...profile, semester: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                        >
                          <option value="1st Semester">1st Sem</option>
                          <option value="2nd Semester">2nd Sem</option>
                          <option value="3rd Semester">3rd Sem</option>
                          <option value="4th Semester">4th Sem</option>
                          <option value="5th Semester">5th Sem</option>
                          <option value="6th Semester">6th Sem</option>
                          <option value="7th Semester">7th Sem</option>
                          <option value="8th Semester">8th Sem</option>
                        </select>
                      </div>
                    </div>

                    {/* Phone */}
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

                    {/* Submit */}
                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                      <button
                        type="submit"
                        disabled={profileLoading}
                        className="bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all text-xs"
                      >
                        {profileLoading ? 'Saving Changes...' : 'Save Profile Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* REGISTRATION FORM MODAL */}
      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          user={user}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => {
            setSelectedEvent(null);
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
}

// --- SUB-COMPONENT: EVENT CARD ---
function EventCard({ event, isRegistered, onRegister }) {
  const isPast = new Date(event.date) < new Date();
  
  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300/80 transition-all duration-300 group">
      {/* Banner */}
      <div className="h-44 bg-slate-100 relative overflow-hidden">
        <img
          src={event.banner_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=400&q=80'}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Status / Location badge */}
        <div className="absolute top-4 left-4 flex gap-2 items-center">
          <span className="bg-white/95 backdrop-blur-sm text-slate-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
            {event.location_type}
          </span>
          {event.club_category && (
            <span className="bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              {event.club_category}
            </span>
          )}
          {event.status === 'CLOSED' && (
            <span className="bg-rose-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              CLOSED
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="p-6 flex-grow flex flex-col justify-between">
        <div className="space-y-2.5">
          {/* Date */}
          <div className="text-[10px] font-bold text-primary-500 uppercase tracking-wider">
            {new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          {/* Title */}
          <h4 className="font-bold text-slate-800 text-base leading-snug line-clamp-1">
            {event.title}
          </h4>
          {/* Description */}
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
            {event.description || 'No description provided.'}
          </p>
        </div>

        {/* Action Button */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {event.custom_fields?.length > 0 ? `${event.custom_fields.length} Extra Fields` : 'Direct Register'}
          </span>

          {isRegistered ? (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Registered
            </span>
          ) : isPast ? (
            <span className="text-gray-400 text-xs font-semibold py-1.5">
              Event Ended
            </span>
          ) : event.status === 'CLOSED' ? (
            <span className="text-rose-500 text-xs font-semibold py-1.5">
              Closed
            </span>
          ) : (
            <button
              onClick={onRegister}
              className="bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold py-1.5 px-4 rounded-xl shadow-sm shadow-primary-500/10 transition-colors"
            >
              Register Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
