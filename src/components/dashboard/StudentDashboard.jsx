// src/components/dashboard/StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  GraduationCap, 
  Calendar, 
  DashboardIcon, 
  SearchIcon, 
  BellIcon, 
  SignOutIcon,
  CheckIcon,
  UserIcon
} from '../ui/Icons';
import RegistrationModal from './RegistrationModal';


export default function StudentDashboard({ user, onSignOut, onSwitchRole, canSwitchRole }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'upcoming' | 'registrations' | 'friends' | 'profile'
  const [events, setEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocationType, setSelectedLocationType] = useState('All');
  const [clubSearchQuery, setClubSearchQuery] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const triggerDashboardRefresh = () => setRefreshCount(prev => prev + 1);
  
  const formatEventTime = (event) => {
    if (!event) return '';
    const timeVal = event.event_time || event.time || event.start_time;
    if (timeVal) return timeVal;
    if (event.event_start_date) {
      const d = new Date(event.event_start_date);
      if (d.getHours() !== 0 || d.getMinutes() !== 0) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    return '';
  };
  
  // Registration Modal State
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [expandedRegId, setExpandedRegId] = useState(null);
  const [uploadingRegId, setUploadingRegId] = useState(null);

  // Connections and Friends State
  const [connectedFriends, setConnectedFriends] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteNotifications, setInviteNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Profile Edit State
  const [profile, setProfile] = useState({
    full_name: '',
    roll_number: '',
    branch: '',
    semester: '',
    phone: '',
    friend_code: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Initial Data Fetching
  useEffect(() => {
    fetchDashboardData();
    fetchProfile();
    fetchIncomingFriendInvites();
    fetchConnectedFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshCount]);

  // Window Focus / Visibility Sync with block_global_refresh protection
  useEffect(() => {
    const handleMobileWindowFocus = () => {
      const isRegistrationFormActive = localStorage.getItem('block_global_refresh') === 'true';
      if (isRegistrationFormActive) {
        console.log("🔒 Registration modal is active. Global auto-refresh completely frozen.");
        return;
      }
      console.log("🔄 Tab focused normally. Running background sync...");
      fetchDashboardData();
      fetchIncomingFriendInvites();
      fetchConnectedFriends();
    };

    window.addEventListener('focus', handleMobileWindowFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleMobileWindowFocus();
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleMobileWindowFocus);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchMyRegistrations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // 1. Keep registrations query flat to bypass schema relationship cache issues
      const { data: regs, error: regError } = await supabase
        .from('registrations')
        .select('id, event_id, team_name, is_captain, custom_answers, solution_url, created_at')
        .eq('student_id', user.id);

      if (regError) throw regError;
      if (!regs || regs.length === 0) {
        setMyRegistrations([]);
        return [];
      }

      // 2. Fetch the corresponding event records separately (including new materials columns)
      const eventIds = regs.map(r => r.event_id).filter(Boolean);
      
      if (eventIds.length > 0) {
        const { data: eventMaterials, error: matError } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds);

        if (!matError && eventMaterials) {
          // 3. Merge the materials smoothly into your existing registration state objects
          const mergedData = regs.map(reg => {
            const match = eventMaterials.find(e => String(e.id) === String(reg.event_id));
            return {
              ...reg,
              team_name: reg.team_name || reg.custom_answers?._team_name || null,
              attachment_url: match?.attachment_url || null,
              custom_notice_text: match?.custom_notice_text || null,
              events: match || null
            };
          });

          setMyRegistrations(mergedData);
          return mergedData;
        }
      }

      const simpleMerged = regs.map(reg => ({
        ...reg,
        team_name: reg.team_name || reg.custom_answers?._team_name || null,
        events: null
      }));
      setMyRegistrations(simpleMerged);
      return simpleMerged;
    } catch (err) {
      console.error("Safe data-merge operation failed:", err.message);
      return [];
    }
  };

  const handleSolutionUpload = async (e, registrationId) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file only.");
      return;
    }

    try {
      setUploadingRegId(registrationId);

      const fileExt = file.name.split('.').pop();
      const fileName = `${registrationId}-${Date.now()}.${fileExt}`;
      const filePath = `submissions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('solutions')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('solutions')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update the registrations row solution_url
      const { error: updateError } = await supabase
        .from('registrations')
        .update({ solution_url: publicUrl })
        .eq('id', registrationId);

      if (updateError) throw updateError;

      alert("Solution PDF uploaded successfully!");
      await fetchMyRegistrations();
    } catch (err) {
      console.error("Solution upload error:", err);
      alert(`Upload failed: ${err.message || 'Check connection details'}`);
    } finally {
      setUploadingRegId(null);
    }
  };

  async function fetchDashboardData() {
    setLoading(true);
    // Fetch all active/open events
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'OPEN')
      .order('event_start_date', { ascending: true });

    let loadedEvents = [];
    if (!eventsError && eventsData) {
      loadedEvents = eventsData;
    }

    // Fetch student's registrations
    const loadedRegistrations = await fetchMyRegistrations();

    // Load registered closed events so they render properly in My Registrations
    const regEventIds = loadedRegistrations.map(r => r.event_id);
    const openEventIds = loadedEvents.map(e => e.id);
    const missingEventIds = regEventIds.filter(id => !openEventIds.includes(id));

    if (missingEventIds.length > 0) {
      const { data: missingEventsData } = await supabase
        .from('events')
        .select('*')
        .in('id', missingEventIds);
      if (missingEventsData) {
        loadedEvents = [...loadedEvents, ...missingEventsData];
      }
    }

    setEvents(loadedEvents);
    fetchIncomingFriendInvites();
    fetchConnectedFriends();

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
        phone: data.phone || '',
        friend_code: data.friend_code || ''
      });
    }
  }

  const fetchIncomingFriendInvites = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('connections')
      .select(`
        id,
        sender_id,
        profiles:sender_id (
          full_name,
          branch,
          roll_number,
          friend_code
        )
      `)
      .eq('receiver_id', user.id)
      .eq('status', 'PENDING');

    if (error) {
      console.error("Notification Fetch Error:", error.message);
    } else {
      setInviteNotifications(data || []);
      
      // Keep pendingInvites in sync for sidebar indicator badge
      const mappedPending = (data || []).map(invite => ({
        id: invite.id,
        sender: invite.profiles,
        created_at: invite.created_at || new Date().toISOString()
      }));
      setPendingInvites(mappedPending);
    }
  };

  const fetchConnectedFriends = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('connections')
      .select(`
        id,
        sender_id,
        receiver_id,
        sender_profile:profiles!sender_id(id, full_name, email, branch, semester),
        receiver_profile:profiles!receiver_id(id, full_name, email, branch, semester)
      `)
      .eq('status', 'ACCEPTED')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (error) {
      console.error("Error syncing squad metadata strings:", error.message);
      return;
    }

    const mappedFriends = (data || []).map(conn => {
      const connSenderId = (typeof conn.sender_id === 'object' && conn.sender_id !== null) ? conn.sender_id.id : conn.sender_id;
      return connSenderId === user.id ? conn.receiver_profile : conn.sender_profile;
    }).filter(Boolean);

    setConnectedFriends(mappedFriends);
  };

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

  const handleCopyCode = () => {
    if (profile?.friend_code) {
      navigator.clipboard.writeText(profile.friend_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteSuccess('');
    setInviteError('');

    const code = friendCodeInput.trim();
    if (!code) return;

    if (code.toLowerCase() === profile.friend_code?.toLowerCase()) {
      setInviteError("You cannot send a connection request to yourself.");
      return;
    }

    try {
      // 1. Find profile by friend code
      const { data: targetProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('friend_code', code)
        .single();

      if (profileErr || !targetProfile) {
        setInviteError("No student profile found with this connection code.");
        return;
      }

      // 2. Fetch all existing connections for current user to check for duplicates
      const { data: existingConns } = await supabase
        .from('connections')
        .select('*');

      const duplicate = existingConns?.find(conn => {
        const sId = conn['profiles!sender_id']?.id || conn.sender_id;
        const rId = conn['profiles!receiver_id']?.id || conn.receiver_id;
        return (
          (sId === user.id && rId === targetProfile.id) ||
          (sId === targetProfile.id && rId === user.id)
        );
      });

      if (duplicate) {
        setInviteError(
          duplicate.status === 'ACCEPTED' 
            ? `You are already connected with ${targetProfile.full_name}.`
            : 'A pending connection request already exists between you.'
        );
        return;
      }

      // 3. Create the connection
      const { error: insertErr } = await supabase
        .from('connections')
        .insert({
          sender_id: user.id,
          receiver_id: targetProfile.id,
          status: 'PENDING'
        });

      if (insertErr) {
        setInviteError(insertErr.message || "Failed to send connection request.");
        return;
      }

      setInviteSuccess(`Connection request sent successfully to ${targetProfile.full_name}!`);
      setFriendCodeInput('');
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      setInviteError("An error occurred while sending the invitation.");
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      const { error } = await supabase
        .from('connections')
        .update({ status: 'ACCEPTED' })
        .eq('id', inviteId);

      if (error) {
        console.error('Failed to accept connection:', error);
        return;
      }

      // Refresh dashboard data
      fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', inviteId);

      if (error) {
        console.error('Failed to decline connection:', error);
        return;
      }

      // Refresh dashboard data
      fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };



  const activeRegistrationsCount = myRegistrations.filter(reg => {
    const eventObj = reg.events || events.find(e => e.id === reg.event_id);
    if (!eventObj) return false;
    
    const startDate = new Date(eventObj.event_start_date);
    const durationDays = parseInt(eventObj.duration_days) || 1;
    
    // Compute exact end time boundary
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    // Only count if the event is happening right now or in the future
    return endDate > now;
  }).length;

  // Filter events based on search query, location type, and club category
  const filteredEvents = events.filter(e => {
    if (e.status !== 'OPEN') return false;
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLocation = selectedLocationType === 'All' || e.location_type === selectedLocationType;
    const matchesClub = !clubSearchQuery.trim() || e.club_category?.toLowerCase().trim().includes(clubSearchQuery.toLowerCase().trim());
    return matchesSearch && matchesLocation && matchesClub;
  });

  console.log("Active User Registrations Stream:", myRegistrations);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row w-full overflow-x-hidden font-sans">
      {/* Left Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col justify-between p-6 shrink-0">
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <DashboardIcon className="w-5 h-5 flex-shrink-0" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'upcoming'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <Calendar className="w-5 h-5 flex-shrink-0" />
              <span>Upcoming Events</span>
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all relative whitespace-nowrap ${
                activeTab === 'registrations'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <CheckIcon className="w-5 h-5 flex-shrink-0" />
              <span>My Registrations</span>
              {activeRegistrationsCount > 0 && (
                <span className="absolute right-4 bg-primary-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {activeRegistrationsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all relative whitespace-nowrap ${
                activeTab === 'friends'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <UserIcon className="w-5 h-5 flex-shrink-0" />
              <span>My Friends & Connections</span>
              {pendingInvites.length > 0 && (
                <span className="absolute right-4 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                  {pendingInvites.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'bg-primary-50 text-primary-500'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <GraduationCap className="w-5 h-5 flex-shrink-0" />
              <span>Profile Settings</span>
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

      {/* MOBILE BOTTOM NAVIGATION BAR - Only visible on mobile screens (md:hidden) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-2 py-2 shadow-lg flex justify-around items-center z-50 md:hidden pb-safe">
        {/* Option 1: Dashboard */}
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'dashboard' ? 'text-primary-500 font-semibold' : 'text-slate-500'
          }`}
        >
          <DashboardIcon className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        {/* Option 2: Upcoming Events */}
        <button 
          onClick={() => setActiveTab('upcoming')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'upcoming' ? 'text-primary-500 font-semibold' : 'text-slate-500'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-[10px]">Events</span>
        </button>

        {/* Option 3: My Registrations */}
        <button 
          onClick={() => setActiveTab('registrations')}
          className={`flex flex-col items-center gap-1 p-2 transition-all relative ${
            activeTab === 'registrations' ? 'text-primary-500 font-semibold' : 'text-slate-500'
          }`}
        >
          <CheckIcon className="w-5 h-5" />
          <span className="text-[10px]">My Reg</span>
          {activeRegistrationsCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
              {activeRegistrationsCount}
            </span>
          )}
        </button>

        {/* Option 4: Friends */}
        <button 
          onClick={() => setActiveTab('friends')}
          className={`flex flex-col items-center gap-1 p-2 transition-all relative ${
            activeTab === 'friends' ? 'text-primary-500 font-semibold' : 'text-slate-500'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px]">Friends</span>
          {pendingInvites.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full font-bold animate-pulse">
              {pendingInvites.length}
            </span>
          )}
        </button>

        {/* Option 5: Profile Settings */}
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'profile' ? 'text-primary-500 font-semibold' : 'text-slate-500'
          }`}
        >
          <GraduationCap className="w-5 h-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-grow flex flex-col min-w-0 pb-24 md:pb-6 transition-all duration-200">
        {/* Header Bar */}
        <header className="h-auto py-4 sm:py-0 sm:h-20 bg-white border-b border-slate-200 px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight capitalize">
              {activeTab === 'upcoming' 
                ? 'All Workshops & Seminars' 
                : activeTab === 'registrations' 
                ? 'My Registrations' 
                : activeTab === 'friends'
                ? 'My Friends & Connections'
                : activeTab === 'profile' 
                ? 'Profile Details' 
                : 'Student Hub'}
            </h1>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
            {/* Search Bar - only shown on events views */}
            {(activeTab === 'dashboard' || activeTab === 'upcoming') && (
              <div className="relative w-full sm:w-64">
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

            {/* ================= NOTIFICATION CONTROLLER ================= */}
            <div className="relative">
              <button 
                onClick={() => { setShowNotifications(!showNotifications); setShowProfileMenu(false); }}
                className="text-gray-400 hover:text-gray-600 transition-colors relative p-1.5 rounded-full hover:bg-slate-100/50"
              >
                <BellIcon className="w-5 h-5" />
                {inviteNotifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                    {inviteNotifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  {/* Click-away backdrop to close notifications */}
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowNotifications(false)} />
                  
                  {/* FIXED VIEWPORT MATRIX: Uses 'fixed' on mobile (sm:hidden) to ignore parent container clipping rules, 
                    and falls back to clean contextual 'sm:absolute' layout blocks on desktop.
                  */}
                  <div className="fixed top-16 left-4 right-4 sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:right-0 z-50 max-w-sm sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 transform origin-top animate-fadeIn text-left">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notifications</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-full">
                        {inviteNotifications.length} New
                      </span>
                    </div>
                    {inviteNotifications.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 italic">No new notifications</div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {inviteNotifications.map((invite) => (
                          <div key={invite.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-blue-100 text-blue-600 font-bold rounded-full flex items-center justify-center text-xs shrink-0">
                                {invite.profiles?.full_name ? invite.profiles.full_name.charAt(0).toUpperCase() : '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700 leading-normal">
                                  <strong className="font-bold text-slate-900">{invite.profiles?.full_name || 'Someone'}</strong> sent you a connection request.
                                </p>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                  Code: <span className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-100">{invite.profiles?.friend_code || '------'}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pl-11">
                              <button
                                onClick={() => handleDeclineInvite(invite.id)}
                                className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                Decline
                              </button>
                              <button
                                onClick={() => handleAcceptInvite(invite.id)}
                                className="px-3 py-1 text-[10px] font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-sm"
                              >
                                Accept
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ================= USER PROFILE DROPDOWN (YELLOW ICON ACTION) ================= */}
            <div className="relative flex items-center gap-2 pl-4 border-l border-slate-200">
              <button 
                onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}
                className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 font-bold text-sm flex items-center justify-center hover:bg-primary-200/60 transition-all shadow-sm cursor-pointer"
              >
                {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </button>
              <div className="text-left leading-none max-w-[120px] hidden md:block">
                <span className="font-semibold text-xs text-slate-800 block truncate">{profile.full_name || 'Student'}</span>
                <span className="text-[10px] text-gray-400 truncate">{profile.roll_number || 'No Roll #'}</span>
              </div>

              {showProfileMenu && (
                <>
                  {/* Click-away backdrop to close profile menu */}
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowProfileMenu(false)} />
                  
                  {/* Profile Action Menu Content */}
                  <div className="absolute right-0 top-full mt-2 z-50 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 transform origin-top-right animate-fadeIn">
                    <button 
                      onClick={() => { setActiveTab('profile'); setShowProfileMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors flex items-center gap-2"
                    >
                      ⚙️ Profile Settings
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button 
                      onClick={() => { onSignOut(); setShowProfileMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                </>
              )}
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
                        <span className="text-2xl font-bold text-slate-800">{activeRegistrationsCount}</span>
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
                  <div className="mt-8">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-slate-800">Featured Events</h3>
                      <button 
                        onClick={() => setActiveTab('upcoming')} 
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        View All
                      </button>
                    </div>

                    {filteredEvents.length === 0 ? (
                      <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
                        <span className="text-gray-400 text-sm">No events found matching search query.</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredEvents.slice(0, 3).map((event) => {
                          const isUserRegistered = Array.isArray(myRegistrations) && myRegistrations.some(reg => {
                            const registeredId = reg.event_id || reg.events?.id;
                            if (!registeredId || !event?.id) return false;

                            // Convert to lower-case trimmed strings to prevent raw text vs UUID comparison mismatches
                            return String(registeredId).trim().toLowerCase() === String(event.id).trim().toLowerCase();
                          });
                          return (
                            <EventCard
                              key={event.id}
                              event={event}
                              isRegistered={isUserRegistered}
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
                        const isUserRegistered = Array.isArray(myRegistrations) && myRegistrations.some(reg => {
                          const registeredId = reg.event_id || reg.events?.id;
                          if (!registeredId || !event?.id) return false;

                          // Convert to lower-case trimmed strings to prevent raw text vs UUID comparison mismatches
                          return String(registeredId).trim().toLowerCase() === String(event.id).trim().toLowerCase();
                        });
                        return (
                          <EventCard
                            key={event.id}
                            event={event}
                            isRegistered={isUserRegistered}
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
                    <div className="text-center py-8 text-slate-400 italic">
                      You haven't registered for any events yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myRegistrations.map((reg) => {
                        const eventDetails = reg.events;
                        if (!eventDetails) return null;

                        // Track expanding nodes inside state
                        const isExpanded = expandedRegId === reg.id;

                        return (
                          <div 
                            key={reg.id} 
                            className="border border-slate-100 rounded-2xl bg-white shadow-sm overflow-hidden mb-3 transition-all"
                          >
                            {/* Clickable Header Strip */}
                            <div 
                              onClick={() => setExpandedRegId(isExpanded ? null : reg.id)}
                              className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50/50 transition-colors"
                            >
                              <div>
                                <h4 className="font-bold text-slate-800 text-base">{eventDetails.title}</h4>
                                <p className="text-xs text-slate-400 mt-1">
                                  Date: {new Date(eventDetails.event_start_date).toLocaleDateString()}
                                  {formatEventTime(eventDetails) && ` at ${formatEventTime(eventDetails)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs px-2.5 py-1 font-semibold rounded-full ${
                                  reg.team_name ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                                }`}>
                                  {reg.team_name ? `Team: ${reg.team_name}` : 'Solo Entry'}
                                </span>
                                <span className="text-slate-400 text-xs font-medium">{isExpanded ? '▲ Hide' : '▼ View Materials'}</span>
                              </div>
                            </div>

                            {/* Expandable Materials Drawer Content */}
                            {isExpanded && (
                              <div className="px-5 pb-5 pt-2 border-t border-slate-50 bg-slate-50/30 space-y-4 animate-fade-in">
                                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shared Event Content</h5>
                                
                                {/* Conditional Layout Checker Block */}
                                {(!eventDetails.custom_notice_text && !eventDetails.attachment_url) ? (
                                  <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100 text-amber-800 text-sm flex items-center gap-2">
                                    <span>⚠️</span>
                                    <p className="font-medium">The organizer has still not updated the material content details for this event. Please check back later.</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {/* Notice Text Block */}
                                    {eventDetails.custom_notice_text && (
                                      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Organizer Announcement:</p>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{eventDetails.custom_notice_text}</p>
                                      </div>
                                    )}

                                    {/* Resource Download Link Button */}
                                    {eventDetails.attachment_url && (
                                      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                          📄 Official Problem Statement / Guidelines
                                        </span>
                                        <a 
                                          href={eventDetails.attachment_url} 
                                          target="_blank" 
                                          rel="noreferrer"
                                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
                                        >
                                          Download PDF
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* File Submission Section */}
                                {eventDetails?.allow_submissions && (eventDetails?.custom_notice_text || eventDetails?.attachment_url) ? (
                                   <div className="border border-dashed border-slate-200 bg-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                     <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-full flex items-center justify-center font-bold text-lg shadow-sm">
                                         📤
                                       </div>
                                       <div>
                                         <h4 className="font-bold text-slate-800 text-sm">
                                           {reg.solution_url ? 'Solution Submitted' : 'Submit your Problem Solution'}
                                         </h4>
                                         {reg.solution_url ? (
                                           <a 
                                             href={reg.solution_url} 
                                             target="_blank" 
                                             rel="noreferrer"
                                             className="text-xs font-semibold text-blue-600 hover:underline inline-block mt-0.5"
                                           >
                                             View Uploaded PDF solution
                                          </a>
                                        ) : (
                                          <p className="text-xs text-slate-400 mt-0.5">Upload your finalized solution PDF guidelines.</p>
                                        )}
                                      </div>
                                    </div>

                                    <div>
                                      <input 
                                        type="file" 
                                        accept=".pdf"
                                        id={`solution-${reg.id}`}
                                        className="hidden"
                                        disabled={uploadingRegId === reg.id}
                                        onChange={(e) => handleSolutionUpload(e, reg.id)}
                                      />
                                      <label 
                                        htmlFor={`solution-${reg.id}`}
                                        className={`px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer shadow-sm transition inline-block text-center ${
                                          uploadingRegId === reg.id
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                            : reg.solution_url
                                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                      >
                                        {uploadingRegId === reg.id ? 'Uploading...' : reg.solution_url ? 'Change File' : 'Choose File'}
                                      </label>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border border-dashed border-slate-200 bg-amber-50/20 rounded-2xl p-5 flex items-center gap-3 text-amber-700 text-xs">
                                    <span className="text-lg">🔒</span>
                                    <p className="font-medium">Submissions are currently closed. They will open once the organizer uploads the problem guidelines and activates the submission link.</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* My Friends & Connections Widget */}
              {activeTab === 'friends' && (
                <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6 animate-fade-in">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-base font-bold text-slate-800">My Friends & Connections</h3>
                      <p className="text-xs text-slate-400 mt-1">Form squad networks to easily register together for team events.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left panel: Share & Add Code */}
                      <div className="space-y-6">
                        {/* Share Code */}
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Your Shareable Connection Code</span>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="font-mono bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-base font-bold tracking-widest border border-blue-100 shadow-inner">
                              {profile?.friend_code || '------'}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyCode}
                              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                            >
                              {copiedCode ? (
                                <>
                                  <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-emerald-600">Copied!</span>
                                </>
                              ) : (
                                <span>Copy Code</span>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2">Share this code with other students so they can invite you to their squad.</p>
                        </div>

                        {/* Add Friend Code */}
                        <form onSubmit={handleSendInvite} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Connect with a Student</span>
                          
                          {inviteSuccess && (
                            <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-medium">
                              {inviteSuccess}
                            </div>
                          )}
                          {inviteError && (
                            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-medium">
                              {inviteError}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Enter 8-digit friend code..."
                              value={friendCodeInput}
                              onChange={(e) => setFriendCodeInput(e.target.value)}
                              maxLength={8}
                              className="flex-grow px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-mono tracking-wider"
                            />
                            <button
                              type="submit"
                              className="bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 shrink-0"
                            >
                              Send Invite
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Right panel: My Squad */}
                      <div className="space-y-4">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">My Squad ({connectedFriends.length})</span>
                        {connectedFriends.length === 0 ? (
                          <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0012 20.08a11.386 11.386 0 00-3-1.1v-.109m6 1.2a11.386 11.386 0 00-3-1.1m3 1.1v-.091a11.386 11.386 0 00-3-1.1v-.002M9 19.128v-.003c0-1.113.285-2.16.786-3.07M9 19.128v.109a11.386 11.386 0 01-3-1.1v-.109m0-5.714a6 6 0 011.636-3.97m0 0A5.992 5.992 0 0112 3a5.99 5.99 0 014.364 1.864m-8.728 0A5.99 5.99 0 005.066 9m13.868-4.136A5.99 5.99 0 0118.934 9" />
                            </svg>
                            <span className="text-xs font-medium">No squad members yet.</span>
                            <span className="text-[10px] text-slate-400">Add friends using their codes to assemble your team.</span>
                          </div>
                        ) : (
                          <div className="max-h-64 overflow-y-auto space-y-2.5 pr-2">
                            {connectedFriends.map((friend) => (
                              <div key={friend.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl transition hover:bg-slate-100/50">
                                <div className="flex items-center gap-3">
                                  {/* Dynamic Name Monogram Avatar */}
                                  <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm shadow-sm uppercase">
                                    {friend.full_name?.charAt(0)}
                                  </div>
                                  
                                  {/* Student Details Stack Container */}
                                  <div className="space-y-0.5">
                                    <p className="text-sm font-bold text-slate-800 leading-tight">{friend.full_name}</p>
                                    <p className="text-xs text-slate-500 font-medium">{friend.email || 'No email linked'}</p>
                                    
                                    {/* Render Branch & Semester Sub-Labels */}
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                      {friend.branch || 'General'} • {friend.semester || 'N/A Sem'}
                                    </p>
                                  </div>
                                </div>
                                
                                <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full border border-emerald-100">
                                  CONNECTED
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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
            // Explicit post-close fetch timeout hook to ensure backend states have settled
            setTimeout(() => {
              triggerDashboardRefresh();
            }, 300);
          }}
          onRefresh={() => {
            console.log("Refreshing dashboard arrays...");
            fetchMyRegistrations();
            setTimeout(() => { fetchMyRegistrations(); }, 350);
          }}
        />
      )}
    </div>
  );
}

function EventCard({ event, isRegistered, onRegister }) {
  const isUserRegistered = isRegistered;
  const handleOpenRegisterModal = () => onRegister();

  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300/80 transition-all duration-300 group">
      {/* Banner */}
      <div className="h-44 bg-slate-100 relative overflow-hidden">
        <img
          src={event.banner_path || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=400&q=80'}
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
            {event.event_start_date ? new Date(event.event_start_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
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
        <div className="flex justify-between items-center mt-4 w-full">
          <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Direct Register</span>
          {isUserRegistered ? (
            <button 
              disabled 
              className="px-4 py-2 bg-emerald-100 text-emerald-700 font-bold text-sm rounded-xl border border-emerald-200 cursor-not-allowed shadow-sm"
            >
              ✓ Registered
            </button>
          ) : (
            <button 
              onClick={() => handleOpenRegisterModal(event)} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all active:scale-95"
            >
              Register Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
