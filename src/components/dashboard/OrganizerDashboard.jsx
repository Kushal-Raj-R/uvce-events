// src/components/dashboard/OrganizerDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase, isMockMode } from '../../supabaseClient';
import { 
  DashboardIcon, 
  SignOutIcon, 
  SearchIcon, 
  BellIcon, 
  SettingsIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  DragIcon,
  Calendar
} from '../ui/Icons';
import RegistrantsListModal from './RegistrantsListModal';
import UpdateTimelineModal from './UpdateTimelineModal';

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function OrganizerDashboard({ user, onSignOut, onSwitchRole, canSwitchRole }) {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('portal_active_tab');
    const validTabs = ['dashboard', 'materials', 'profile'];
    return (savedTab && validTabs.includes(savedTab)) ? savedTab : 'dashboard';
  });

  const handleTabSwitch = (newTabName) => {
    setActiveTab(newTabName);
    localStorage.setItem('portal_active_tab', newTabName);
  };

  const handleProfileSave = async () => {
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

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: profile.full_name }
    });

    if (authError) {
      console.error('Failed to sync auth details:', authError);
      alert('Failed to sync authentication profile details: ' + authError.message);
      return;
    }

    alert('Profile updated successfully!');
  };

  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEventGraph, setShowEventGraph] = useState(false);

  // Process existing events list into monthly aggregates dynamically
  const monthlyGraphData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const chartMap = months.map(m => ({ name: m, "Total Events": 0 }));
    
    events?.forEach(event => {
      if (event.created_at) {
        const date = new Date(event.created_at);
        const monthIdx = date.getMonth(); // 0-11
        chartMap[monthIdx]["Total Events"] += 1;
      }
    });
    
    return chartMap;
  }, [events]);

  // Form State for Event Creation
  const [eventTitle, setEventTitle] = useState('');
  const [locationType, setLocationType] = useState('In-Person');
  const [participationType, setParticipationType] = useState('Solo');
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(3);
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [clubCategory, setClubCategory] = useState('IEEE');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [customFields, setCustomFields] = useState([]);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [eventScope, setEventScope] = useState('ALL');
  const [interruptedUpload, setInterruptedUpload] = useState(false);

  // Form State for Adding a Custom Field
  const [showFieldBuilder, setShowFieldBuilder] = useState(false);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldOptions, setFieldOptions] = useState('');
  const [fieldMaxLimit, setFieldMaxLimit] = useState(2);
  const [mcqSelectType, setMcqSelectType] = useState('single');

  // Modal State
  const [selectedEventForModal, setSelectedEventForModal] = useState(null);
  const [selectedEventForTimeline, setSelectedEventForTimeline] = useState(null);

  // Materials Settings State
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [customTextNotice, setCustomTextNotice] = useState('');
  const [allowSubmissions, setAllowSubmissions] = useState(true);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Profile State
  const [profile, setProfile] = useState({ full_name: '', branch: '', phone: '', club_name: '' });

  const loadDraftIntoForm = (draft) => {
    setEditingDraftId(draft.id);
    setEventTitle(draft.title || '');
    setLocationType(draft.location_type || 'In-Person');
    setParticipationType(draft.participation_type || 'Solo');
    setDescription(draft.description || '');
    setBannerUrl(draft.banner_path || '');
    setClubCategory(draft.club_category || 'IEEE');
    setRegistrationDeadline(formatDateForInput(draft.registration_deadline));
    setEventStartDate(formatDateForInput(draft.event_start_date));
    setDurationDays(draft.duration_days || 1);
    setCustomFields(draft.custom_fields || []);
    setMinTeamSize(draft.min_team_size || 1);
    setMaxTeamSize(draft.max_team_size || 3);
    setDocuments(draft.documents || []);
  };

  const addDocumentSlot = () => {
    setDocuments(prev => [...prev, { id: Date.now(), url: '', description: '', uploading: false }]);
  };

  const updateDocumentDescription = (id, text) => {
    setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, description: text } : doc));
  };

  const removeDocumentSlot = (id) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleNestedFileUpload = async (e, id) => {
    sessionStorage.removeItem('pendingOrganizerUpload');
    setInterruptedUpload(false);
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      alert("Please upload a PDF or an Image file only.");
      return;
    }

    try {
      setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, uploading: true } : doc));

      const fileExt = file.name.split('.').pop();
      const fileName = `${id}-${Date.now()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('event-materials')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('event-materials')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, url: publicUrl, uploading: false } : doc));
    } catch (err) {
      console.error("Document upload error:", err);
      alert(`Upload failed: ${err.message}`);
      setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, uploading: false } : doc));
    }
  };

  useEffect(() => {
    fetchOrganizerData();
    fetchProfile();

    // Check for interrupted organizer upload
    const pendingOrgUpload = sessionStorage.getItem('pendingOrganizerUpload');
    if (pendingOrgUpload) {
      try {
        const pending = JSON.parse(pendingOrgUpload);
        const timeDiff = Date.now() - pending.timestamp;
        if (timeDiff < 120000) { // within 2 minutes
          setInterruptedUpload(true);
        }
      } catch (e) {
        console.error("Error parsing pending organizer upload:", e);
      }
      sessionStorage.removeItem('pendingOrganizerUpload');
    }
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
      options: (fieldType === 'select' || fieldType === 'mcq') ? fieldOptions.split(',').map(o => o.trim()).filter(Boolean) : [],
      select_type: fieldType === 'mcq' ? mcqSelectType : null,
      ...(fieldType === 'file' ? { max_size: fieldMaxLimit || 2 } : {})
    };

    setCustomFields([...customFields, newField]);
    setFieldLabel('');
    setFieldOptions('');
    setFieldMaxLimit(2);
    setMcqSelectType('single');
    setShowFieldBuilder(false);
  };

  const handleRemoveField = (fieldId) => {
    setCustomFields(customFields.filter(f => f.id !== fieldId));
  };

  const handleAddMcqOption = (fieldId) => {
    setCustomFields(customFields.map(field => {
      if (field.id === fieldId) {
        return {
          ...field,
          options: [...(field.options || []), '']
        };
      }
      return field;
    }));
  };

  const handleUpdateMcqOption = (fieldId, optIdx, value) => {
    setCustomFields(customFields.map(field => {
      if (field.id === fieldId) {
        const newOptions = [...(field.options || [])];
        newOptions[optIdx] = value;
        return {
          ...field,
          options: newOptions
        };
      }
      return field;
    }));
  };

  const handleRemoveMcqOption = (fieldId, optIdx) => {
    setCustomFields(customFields.map(field => {
      if (field.id === fieldId) {
        return {
          ...field,
          options: (field.options || []).filter((_, idx) => idx !== optIdx)
        };
      }
      return field;
    }));
  };

  const organizerEvents = events;
  const fetchOrganizerEvents = fetchOrganizerData;

  const handleSaveMaterialsSettings = async (eventId, file, noticeText, allowSubmissionsVal) => {
    if (!eventId) {
      alert("Please select an event first.");
      return;
    }

    try {
      // Find the current event configuration fallback url safely
      const currentEvent = organizerEvents.find(e => String(e.id) === String(eventId));
      let updatedUrl = currentEvent?.attachment_url || null;

      // 1. Only run upload processes if a new file object is actively targeted
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${eventId}-${Date.now()}.${fileExt}`;
        const filePath = `statements/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('event-attachment')
          .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('event-attachment')
          .getPublicUrl(filePath);

        updatedUrl = urlData.publicUrl;
      }

      console.log("Updating database row for event ID:", eventId, { updatedUrl, noticeText, allowSubmissionsVal });

      // 2. Perform table update mutation mapping parameters securely
      const { error: updateError } = await supabase
        .from('events')
        .update({ 
          attachment_url: updatedUrl,
          custom_notice_text: noticeText || '',
          allow_submissions: allowSubmissionsVal
        })
        .eq('id', eventId);

      if (updateError) throw updateError;

      alert("Event materials settings successfully saved and deployed!");
      setSelectedUploadFile(null);
      
      if (typeof fetchOrganizerEvents === 'function') {
        await fetchOrganizerEvents();
      }
    } catch (err) {
      console.error("Detailed Mutation Error Logging Context:", err);
      alert(`Failed to save: ${err.message || 'Check database permissions'}`);
    }
  };

  const handleBannerUpload = async (e) => {
    sessionStorage.removeItem('pendingOrganizerUpload');
    setInterruptedUpload(false);
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name ? file.name.split('.').pop() : 'png';
    const filePath = `banners/${crypto.randomUUID()}.${fileExt}`;

    try {
      if (isMockMode) {
        // Simulate storage upload in mock mode
        await new Promise(resolve => setTimeout(resolve, 800));
        const publicUrl = `https://mock-storage.supabase.co/banners/${filePath}`;
        setBannerUrl(publicUrl);
      } else {
        // Upload to Supabase Storage in live mode
        const { error: uploadError } = await supabase.storage
          .from('registration_files')
          .upload(filePath, file);

        if (uploadError) {
          alert('Failed to upload banner: ' + uploadError.message);
          return;
        }

        const { data: urlData } = supabase.storage
          .from('registration_files')
          .getPublicUrl(filePath);

        setBannerUrl(urlData.publicUrl);
      }
      alert('Banner image uploaded successfully!');
    } catch (err) {
      console.error(err);
      alert('Banner upload failed: ' + err.message);
    }
  };

  // Launch Event
  const handleCreateEvent = async (e, forceDraft = false) => {
    e.preventDefault();
    if (!eventTitle || !eventStartDate) {
      alert('Event Title and Event Start Date are required.');
      return;
    }

    const eventPayload = {
      title: eventTitle,
      description,
      location_type: locationType,
      participation_type: participationType,
      club_category: clubCategory || profile.club_name || 'IEEE',
      banner_path: bannerUrl || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
      registration_deadline: registrationDeadline ? new Date(registrationDeadline).toISOString() : null,
      event_start_date: eventStartDate ? new Date(eventStartDate).toISOString() : null,
      duration_days: parseInt(durationDays) || 1,
      min_team_size: participationType === 'Team' ? (parseInt(minTeamSize) || 1) : 1,
      max_team_size: participationType === 'Team' ? (parseInt(maxTeamSize) || 3) : 1,
      custom_fields: customFields || [],
      documents: documents || [],
      organizer_id: user.id,
      status: forceDraft ? 'DRAFT' : 'OPEN',
      event_scope: eventScope
    };

    let result;
    if (editingDraftId) {
      result = await supabase
        .from('events')
        .update(eventPayload)
        .eq('id', editingDraftId);
    } else {
      result = await supabase
        .from('events')
        .insert(eventPayload);
    }

    const { error } = result;

    if (error) {
      alert('Failed to save event: ' + error.message);
    } else {
      alert(
        editingDraftId
          ? (forceDraft ? 'Draft updated successfully!' : 'Draft event launched successfully!')
          : (forceDraft ? 'Draft saved successfully!' : 'Event registration launched successfully!')
      );
      // Reset form
      setEditingDraftId(null);
      setEventTitle('');
      setLocationType('In-Person');
      setParticipationType('Solo');
      setMinTeamSize(1);
      setMaxTeamSize(3);
      setDescription('');
      setBannerUrl('');
      setCustomFields([]);
      setDocuments([]);
      setClubCategory(profile.club_name || 'IEEE');
      setRegistrationDeadline('');
      setEventStartDate('');
      setDurationDays(1);
      setEventScope('ALL');
      // Refresh list
      fetchOrganizerData();
    }
  };

  // Delete event and cascade clear associated files in Supabase storage via Edge Function
  const handleDeleteEvent = async (event) => {
    if (isDeleting) return;

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this event? This will permanently delete the event, all student registrations, and all uploaded PDFs/Banners from both organizers and students."
    );
    if (!confirmDelete) return;

    try {
      setIsDeleting(true);
      if (isMockMode) {
        // Simulate cascade deletion in mock mode
        await new Promise(resolve => setTimeout(resolve, 800));
        const { error: dbDeleteError } = await supabase
          .from('events')
          .delete()
          .eq('id', event.id);

        if (dbDeleteError) throw dbDeleteError;
        alert("✓ Event deleted successfully (Mock mode)!");
        fetchOrganizerData();
        return;
      }

      console.log("🚀 Invoking cascade delete Edge Function for Event ID:", event.id);
      
      const { data, error } = await supabase.functions.invoke('delete-event-cascade', {
        body: { event_id: event.id }
      });

      if (error) {
        throw new Error(error.message || 'Failed to invoke edge function');
      }

      if (data?.success) {
        let successMessage = "✓ Event and all associated organizer/student assets successfully deleted!";
        if (data.failedPurges) {
          successMessage += "\n\n⚠️ Note: Some files could not be removed from storage (they may have already been missing or deleted):";
          Object.keys(data.failedPurges).forEach(bucket => {
            successMessage += `\n- Bucket [${bucket}]: ${data.failedPurges[bucket].length} file(s)`;
          });
        }
        alert(successMessage);
        fetchOrganizerData();
      } else {
        throw new Error(data?.error || 'Edge function returned failure status');
      }

    } catch (err) {
      alert(`Cascade deletion failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row w-full overflow-x-hidden font-sans">
      {/* Left Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col justify-between p-6 shrink-0">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-black text-primary-500 tracking-tight flex items-center gap-2">
              UVCEvents
            </h2>
            <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase block mt-1">
              Academic Portal
            </span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => handleTabSwitch('dashboard')}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all w-full text-left ${
                activeTab === 'dashboard'
                  ? 'bg-primary-50 text-primary-500 font-semibold'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <DashboardIcon className="w-5 h-5 flex-shrink-0" />
              <span>Event Management</span>
            </button>
            <button
              onClick={() => handleTabSwitch('materials')}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all w-full text-left ${
                activeTab === 'materials'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth="2" 
                stroke="currentColor" 
                className="w-5 h-5 flex-shrink-0"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <span>Event Materials</span>
            </button>
            <button
              onClick={() => handleTabSwitch('profile')}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all w-full text-left ${
                activeTab === 'profile'
                  ? 'bg-primary-50 text-primary-500 font-semibold'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800'
              }`}
            >
              <SettingsIcon className="w-5 h-5 flex-shrink-0" />
              <span>Profile Settings</span>
            </button>
          </nav>
        </div>

        <div className="space-y-4 pt-6 border-t border-slate-100">
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
        {/* Option 1: Event Management / Dashboard */}
        <button 
          onClick={() => handleTabSwitch('dashboard')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'dashboard' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
          <span className="text-[10px]">Home</span>
        </button>

        {/* Option 2: Event Materials */}
        <button 
          onClick={() => handleTabSwitch('materials')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'materials' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="text-[10px]">Materials</span>
        </button>

        {/* Option 3: Profile Settings */}
        <button 
          onClick={() => handleTabSwitch('profile')}
          className={`flex flex-col items-center gap-1 p-2 transition-all ${
            activeTab === 'profile' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.767c-.306.235-.45.631-.388 1.01.003.022.005.044.005.066v.04c0 .022-.002.044-.005.066-.063.379.082.775.388 1.01l1.003.767a1.125 1.125 0 0 1 .26 1.43l-1.296 2.247a1.125 1.125 0 0 1-1.37.49l-1.216-.456c-.356-.133-.751-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.767c.306-.235.45-.63.388-1.01a3.47 3.47 0 0 1-.005-.132v-.04c0-.022.002-.044.005-.066.063-.379-.083-.776-.388-1.01l-1.004-.767a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.49l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span className="text-[10px]">Settings</span>
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-grow flex flex-col min-w-0 pb-24 md:pb-6 transition-all duration-200">
        {/* Header Bar */}
        <header className="h-auto py-4 sm:py-0 sm:h-20 bg-white border-b border-slate-200 px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-black text-primary-500 tracking-widest uppercase md:hidden">
              UVCEvents
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight">
              {activeTab === 'profile' ? 'Organizer Profile' : activeTab === 'materials' ? 'Event Materials' : 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
            {activeTab === 'dashboard' && (
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
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-full">0 New</span>
                    </div>
                    <div className="py-4 text-center text-xs text-slate-400 italic">No new notifications</div>
                  </div>
                </>
              )}
            </div>

            {/* THE STEP-DOWN SWITCHER: Force displays everywhere, styled larger on touch inputs */}
            {canSwitchRole && (
              <button
                type="button"
                onClick={onSwitchRole}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200/60 active:scale-95"
              >
                🎓 <span className="hidden sm:inline">Switch to Student</span><span className="inline sm:hidden">Switch</span>
              </button>
            )}

            {/* ================= USER PROFILE DROPDOWN (YELLOW ICON ACTION) ================= */}
            <div className="relative flex items-center gap-2 pl-4 border-l border-slate-200">
              <button 
                onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}
                className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 font-bold text-sm flex items-center justify-center hover:bg-primary-200/60 transition-all shadow-sm cursor-pointer"
              >
                {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </button>
              <div className="text-left leading-none max-w-[120px] hidden md:block">
                <span className="font-semibold text-xs text-slate-800 block truncate">{profile.full_name || 'Organizer'}</span>
                <span className="text-[9px] text-gray-400 block mt-0.5 truncate">{profile.branch || 'Organizer Dept'}</span>
              </div>

              {showProfileMenu && (
                <>
                  {/* Click-away backdrop to close profile menu */}
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowProfileMenu(false)} />
                  
                  {/* Profile Action Menu Content */}
                  <div className="absolute right-0 top-full mt-2 z-50 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 transform origin-top-right animate-fadeIn">
                    <button 
                      onClick={() => { handleTabSwitch('profile'); setShowProfileMenu(false); }}
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
                  <div className="w-full flex flex-col md:flex-row gap-6 items-start">
                    
                    {/* LEFT COLUMN: Create Event (7 cols) */}
                    <div className="w-full md:w-3/5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm order-2 md:order-1 space-y-6">
                      <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <h3 className="font-bold text-slate-800 text-sm">
                          {editingDraftId ? 'Edit Event Draft' : 'Create Event'}
                        </h3>
                      </div>

                      {interruptedUpload && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                          <div className="flex items-center gap-2">
                            <span>⚠️</span>
                            <span>Your file upload may have been interrupted. Please re-select your file and try again.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInterruptedUpload(false)}
                            className="text-amber-600 hover:text-amber-800 font-bold underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {editingDraftId && (
                        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                          <div>
                            <span className="font-bold">Editing Draft:</span> Resuming event "<strong>{eventTitle}</strong>"
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDraftId(null);
                              setEventTitle('');
                              setLocationType('In-Person');
                              setDescription('');
                              setBannerUrl('');
                              setCustomFields([]);
                              setClubCategory(profile.club_name || 'IEEE');
                              setRegistrationDeadline('');
                              setEventStartDate('');
                              setDurationDays(1);
                            }}
                            className="text-blue-500 hover:text-blue-700 font-bold underline"
                          >
                            Clear Form
                          </button>
                        </div>
                      )}

                      <div className="space-y-5">
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

                        {/* FORM INPUTS CONFIGURATION ROW MATRIX */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end w-full mt-4">
                          
                          {/* FIELD 1: REGISTRATION DEADLINE */}
                          <div className="flex flex-col gap-1.5 w-full">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Registration Deadline
                            </label>
                            <input
                              type="datetime-local"
                              name="registration_deadline"
                              required
                              value={registrationDeadline}
                              onChange={(e) => setRegistrationDeadline(e.target.value)}
                              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                            />
                          </div>

                          {/* FIELD 2: LOCATION TYPE */}
                          <div className="flex flex-col gap-1.5 w-full">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Location Type
                            </label>
                            <select
                              value={locationType}
                              onChange={(e) => setLocationType(e.target.value)}
                              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm appearance-none cursor-pointer"
                            >
                              <option value="In-Person">In-Person</option>
                              <option value="Virtual">Virtual</option>
                              <option value="Hybrid">Hybrid</option>
                            </select>
                          </div>

                          {/* FIELD 3: PARTICIPATION TYPE */}
                          <div className="flex flex-col gap-1.5 w-full">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Participation Type
                            </label>
                            <select
                              name="participation_type"
                              value={participationType}
                              onChange={(e) => setParticipationType(e.target.value)}
                              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm appearance-none cursor-pointer"
                            >
                              <option value="Solo">Solo (Individual)</option>
                              <option value="Team">Team Event</option>
                            </select>
                          </div>

                        </div>

                        {/* EVENT VISIBILITY SCOPE INPUT */}
                        <div className="flex flex-col gap-1.5 w-full mt-4">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event Visibility Scope</label>
                          <select 
                            value={eventScope}
                            onChange={(e) => setEventScope(e.target.value)}
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm cursor-pointer"
                          >
                            <option value="ALL">🌍 Open to All Colleges</option>
                            <option value="UVCE">🏛️ UVCE Campus Internal Only</option>
                          </select>
                        </div>

                        {participationType === 'Team' && (
                          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-slate-500 uppercase">Min Team Size</label>
                              <input 
                                type="number" min="1" max="10"
                                value={minTeamSize}
                                onChange={(e) => setMinTeamSize(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-slate-500 uppercase">Max Team Size</label>
                              <input 
                                type="number" min="1" max="10"
                                value={maxTeamSize}
                                onChange={(e) => setMaxTeamSize(parseInt(e.target.value) || 3)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                              />
                            </div>
                          </div>
                        )}

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

                         {/* Add Banner */}
                         <div className="mb-4">
                           <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                             Add Banner
                           </label>
                           <input 
                             type="file" 
                             accept="image/*"
                             name="banner_image"
                             onClick={() => sessionStorage.setItem('pendingOrganizerUpload', JSON.stringify({ field: 'banner', timestamp: Date.now() }))}
                             onChange={handleBannerUpload}
                             className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                           />
                           {bannerUrl && (
                             <div className="mt-2 h-20 rounded-xl overflow-hidden border border-slate-200 relative group max-w-xs">
                               <img src={bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                               <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                 <span className="text-[10px] text-white font-bold">Uploaded</span>
                               </div>
                             </div>
                           )}
                         </div>

                        {/* OPTIONAL MULTI-DOCUMENT ATTACHMENT SECTION */}
                        <div className="mt-6 p-5 bg-white border border-slate-200 rounded-2xl flex flex-col gap-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Documents Section</h4>
                              <p className="text-xs text-slate-500">Optional: Upload informational files or materials for this event. You can add multiple attachments.</p>
                            </div>
                            <button
                              type="button"
                              onClick={addDocumentSlot}
                              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1"
                            >
                              <span>+</span> Add Document
                            </button>
                          </div>

                          {documents && documents.length > 0 ? (
                            <div className="flex flex-col gap-3">
                              {documents.map((doc) => (
                                <div key={doc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-4 relative">
                                  {/* If the document has a URL and looks like an image, render a small organizer thumbnail preview */}
                                  {doc.url && (doc.url.match(/\.(jpeg|jpg|gif|png|webp)/i) || !doc.url.endsWith('.pdf')) && (
                                    <div className="w-16 h-16 rounded-lg border bg-white overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm">
                                      <img src={doc.url} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                  )}

                                  <div className="flex-1 w-full flex flex-col gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="Document description (e.g., Event Poster, Syllabus, Rulebook)"
                                      value={doc.description}
                                      onChange={(e) => updateDocumentDescription(doc.id, e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:border-blue-500"
                                    />
                                    
                                    <div className="flex items-center gap-2">
                                      <label className="cursor-pointer text-[11px] font-medium text-blue-600 bg-blue-50/50 hover:bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 transition-all">
                                        {doc.url ? '🔄 Change File/Image' : '📤 Choose PDF or Image File'}
                                        <input
                                          type="file"
                                          accept=".pdf, image/*"
                                          className="hidden"
                                          onClick={() => sessionStorage.setItem('pendingOrganizerUpload', JSON.stringify({ field: `document_${doc.id}`, timestamp: Date.now() }))}
                                          onChange={(e) => handleNestedFileUpload(e, doc.id)}
                                        />
                                      </label>
                                      {doc.url && (
                                        <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-0.5">
                                          ✓ Asset attached
                                        </span>
                                      )}
                                      {doc.uploading && (
                                        <span className="text-[11px] text-slate-400 animate-pulse">Uploading...</span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => removeDocumentSlot(doc.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Remove field"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400 italic">
                              No additional documents attached. Click "Add Document" to append files.
                            </div>
                          )}
                        </div>

                        {/* Hosting Club and Event Timeline Grid */}
                        <div className="space-y-4">
                           {/* Hosting Club / Category */}
                           <div className="flex flex-col gap-2 w-full">
                             <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                               Hosting Club / Category
                             </label>
                             <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium text-sm select-none cursor-not-allowed flex items-center shadow-inner">
                               <span>{clubCategory || 'Loading hosting club allocation...'}</span>
                             </div>
                             {/* A hidden state element to ensure the data is strictly package-submitted */}
                             <input type="hidden" name="hosting_club" value={clubCategory || ''} />
                           </div>

                          {/* Event Timeline Configuration */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100/80">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Event Timeline Configuration</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Event Start Date</label>
                                <input 
                                  type="datetime-local" 
                                  required
                                  value={eventStartDate}
                                  onChange={(e) => setEventStartDate(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Duration (Days)</label>
                                <input 
                                  type="number" 
                                  min="1" 
                                  required
                                  value={durationDays}
                                  onChange={(e) => setDurationDays(Number(e.target.value))}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                />
                              </div>
                            </div>
                          </div>
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
                                    <option value="mcq">Multiple Choice (MCQ)</option>
                                    <option value="file">File Upload (PDF/Image)</option>
                                  </select>
                                </div>
                              </div>

                              {fieldType === 'file' && (
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Max Limit for this file (MB)</label>
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    max="50"
                                    value={fieldMaxLimit}
                                    onChange={(e) => setFieldMaxLimit(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                    required
                                  />
                                </div>
                              )}

                              {(fieldType === 'select' || fieldType === 'mcq') && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                      {fieldType === 'mcq' ? 'MCQ Options (comma-separated)' : 'Select Options (comma-separated)'}
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. S, M, L, XL"
                                      value={fieldOptions}
                                      onChange={(e) => setFieldOptions(e.target.value)}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                    />
                                  </div>

                                  {fieldType === 'mcq' && (
                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selection Rules</label>
                                      <div className="flex gap-4">
                                        {/* Single Choice Selection Node */}
                                        <label className={`flex-1 p-3 border rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
                                          mcqSelectType === 'single' ? 'bg-blue-50/50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-600'
                                        }`}>
                                          <input
                                            type="radio"
                                            name="mcq_rule"
                                            checked={mcqSelectType === 'single'}
                                            onChange={() => setMcqSelectType('single')}
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                          />
                                          <div className="flex flex-col text-left">
                                            <span className="text-xs">Single Answer</span>
                                            <span className="text-[9px] text-slate-400 font-normal">Students pick one option via radio buttons</span>
                                          </div>
                                        </label>

                                        {/* Multiple Choice Selection Node */}
                                        <label className={`flex-1 p-3 border rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
                                          mcqSelectType === 'multiple' ? 'bg-blue-50/50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-600'
                                        }`}>
                                          <input
                                            type="radio"
                                            name="mcq_rule"
                                            checked={mcqSelectType === 'multiple'}
                                            onChange={() => setMcqSelectType('multiple')}
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                          />
                                          <div className="flex flex-col text-left">
                                            <span className="text-xs">Multiple Answers</span>
                                            <span className="text-[9px] text-slate-400 font-normal">Students pick multiple items via checkboxes</span>
                                          </div>
                                        </label>
                                      </div>
                                    </div>
                                  )}
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
                                <div key={field.id} className="bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl group space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <DragIcon className="w-4 h-4 text-slate-300" />
                                      <div>
                                        <span className="text-xs font-semibold text-slate-700">{field.label}</span>
                                        <span className="ml-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-200 text-slate-500 tracking-wider">
                                          {field.type}
                                        </span>
                                        {field.type === 'file' && (
                                          <span className="ml-2 text-[9px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                                            Max {field.max_size || 2}MB
                                          </span>
                                        )}
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

                                  {field.type === 'mcq' && (
                                    <div className="mt-3 pl-4 border-l-2 border-blue-500 space-y-3">
                                      {/* Single vs Multi Selection Checkbox Toggle */}
                                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                                        <input 
                                          type="checkbox"
                                          checked={field.allow_multiple || false}
                                          onChange={(e) => setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, allow_multiple: e.target.checked } : f))}
                                          className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        Allow students to select multiple options (Checkboxes)
                                      </label>

                                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">MCQ Options</label>
                                      
                                      {/* Loop and render existing options */}
                                      {(field.options || []).map((option, optIdx) => (
                                        <div key={optIdx} className="flex gap-2 items-center">
                                          <input 
                                            type="text" 
                                            value={option}
                                            placeholder={`Option ${optIdx + 1}`}
                                            onChange={(e) => handleUpdateMcqOption(field.id, optIdx, e.target.value)}
                                            className="flex-1 px-3 py-1 border border-slate-200 rounded-md text-xs"
                                          />
                                          <button 
                                            type="button"
                                            onClick={() => handleRemoveMcqOption(field.id, optIdx)}
                                            className="text-red-500 text-xs font-semibold hover:underline"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      ))}

                                      {/* Add Option Trigger Link Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleAddMcqOption(field.id)}
                                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 mt-1"
                                      >
                                        ➕ Add Option Line
                                      </button>
                                    </div>
                                  )}
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
                            {editingDraftId ? 'Update Draft' : 'Save as Draft'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleCreateEvent(e, false)}
                            className="flex-[2] bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition-all text-xs"
                          >
                            {editingDraftId ? 'Publish Event' : 'Launch Event Registration'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Statistics and Managed Table (5 cols) */}
                    <div className="w-full md:w-2/5 flex flex-col gap-6 order-1 md:order-2">
                      {/* STATS BLOCK */}
                      <div className="grid grid-cols-2 gap-4">
                        <div 
                          onClick={() => setShowEventGraph(!showEventGraph)}
                          className={`p-6 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between h-32 ${
                            showEventGraph 
                              ? 'bg-blue-50/60 border-blue-200 shadow-sm' 
                              : 'bg-white border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
                          }`}
                        >
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                            Total Active
                          </span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <h1 className="text-4xl font-extrabold text-slate-800">
                              {totalActiveEvents}
                            </h1>
                          </div>
                        </div>

                        <div className="p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between h-32">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Total Registrations
                          </span>
                          <h2 className="text-3xl font-black text-slate-800">
                            {totalRegistrations.toLocaleString()}
                          </h2>
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
                                      {event.event_start_date ? new Date(event.event_start_date).toLocaleDateString() : 'TBD'}
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
                                      {event.status === 'DRAFT' ? (
                                        <button
                                          onClick={() => loadDraftIntoForm(event)}
                                          title="Resume Draft"
                                          className="p-1 hover:bg-primary-50 text-primary-600 rounded flex items-center gap-1"
                                        >
                                          <EditIcon className="w-3.5 h-3.5 text-primary-500" />
                                          <span className="text-[9px] font-bold">Resume</span>
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => setSelectedEventForTimeline(event)}
                                            title="Update Event Timeline"
                                            className="p-1 hover:bg-slate-100 rounded text-slate-500"
                                          >
                                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                          </button>
                                          <button
                                            onClick={() => toggleEventStatus(event)}
                                            title={event.status === 'OPEN' ? 'Close registration' : 'Open registration'}
                                            className="p-1 hover:bg-slate-100 rounded text-slate-500"
                                          >
                                            <EditIcon className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => handleDeleteEvent(event)}
                                        disabled={isDeleting}
                                        title={isDeleting ? "Deleting..." : "Delete Event"}
                                        className={`p-1 rounded transition-all ${
                                          isDeleting 
                                            ? "opacity-50 cursor-not-allowed text-slate-300" 
                                            : "hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                                        }`}
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

                      {showEventGraph && (
                        /* DYNAMIC MONTHLY GRAPH WINDOW OVERLAY */
                        <div className="p-5 bg-white border border-slate-200/60 rounded-3xl shadow-sm flex flex-col gap-4 animate-fade-in">
                          <div className="flex flex-col">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Events Distribution</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Total metrics plotted across calendar months</p>
                          </div>
                          
                          <div className="w-full h-48 mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyGraphData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                <Bar dataKey="Total Events" fill="#2563eb" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                    </div>

                  </div>
                </div>
              )}

              {/* TAB 2: PROFILE SETTINGS */}
              {activeTab === 'profile' && (
                <div className="max-w-2xl bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm animate-fade-in mx-auto">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Modify Organizer Details</h3>
                  
                  <div className="space-y-6">
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
                        type="button"
                        onClick={handleProfileSave}
                        className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all text-xs"
                      >
                        Save Profile Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'materials' && (
                <div className="w-full max-w-4xl mx-auto bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
                  {/* Form Header */}
                  <div className="p-6 border-b border-slate-50">
                    <h2 className="text-xl font-bold text-slate-800">Event Materials Settings</h2>
                    <p className="text-sm text-slate-400 mt-1">Configure and manage resource documents, problem statements, and prompt texts for active events.</p>
                  </div>

                  {/* Form Body Split Panel */}
                  <div className="p-6 space-y-6">
                    
                    {/* 1. Target Event Selection Dropdown - Fixed Layout Alignment */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center pb-6 border-b border-slate-100">
                      <div className="md:col-span-1 pr-2">
                        <label className="block text-sm font-semibold text-slate-700">Select Event</label>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          Choose the specific active event you want to configure materials, notices, or problem statements for.
                        </p>
                      </div>
                      
                      <div className="md:col-span-2 w-full flex justify-end md:justify-start">
                        <select 
                          value={selectedEventId || ''} 
                          onChange={(e) => {
                            setSelectedEventId(e.target.value);
                            const selected = organizerEvents.find(ev => ev.id === e.target.value);
                            setCustomTextNotice(selected?.custom_notice_text || '');
                            setAllowSubmissions(selected?.allow_submissions !== false);
                          }}
                          className="w-full max-w-md px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer shadow-sm"
                        >
                          <option value="">-- Choose an active event --</option>
                          {organizerEvents.map(event => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {selectedEventId ? (
                      <>
                        {/* 2. File Attachment Settings Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start pb-6 border-b border-slate-100">
                          <div className="md:col-span-1 pr-2">
                            <label className="block text-sm font-semibold text-slate-700">Problem Statement / PDF</label>
                            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Upload guidelines, rulebooks, or prompt criteria sheets.</p>
                          </div>
                          <div className="md:col-span-2 space-y-3">
                            <div className="flex items-center gap-3">
                              <input 
                                type="file" 
                                accept=".pdf" 
                                id="settings-pdf-upload" 
                                className="hidden" 
                                onChange={(e) => setSelectedUploadFile(e.target.files[0])}
                              />
                              <label 
                                htmlFor="settings-pdf-upload"
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition border border-slate-200 shadow-sm"
                              >
                                Choose Document File
                              </label>
                              <span className="text-xs text-slate-500 truncate max-w-xs font-mono">
                                {selectedUploadFile ? selectedUploadFile.name : (organizerEvents.find(e => e.id === selectedEventId)?.attachment_url ? '📄 Document Attached' : 'No file chosen')}
                              </span>
                            </div>
                            {organizerEvents.find(e => e.id === selectedEventId)?.attachment_url && (
                              <a 
                                href={organizerEvents.find(e => e.id === selectedEventId)?.attachment_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center text-xs font-semibold text-blue-600 hover:underline gap-1"
                              >
                                👁️ View currently uploaded PDF statement
                              </a>
                            )}
                          </div>
                        </div>

                        {/* 3. Text Announcement Notice Settings Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                          <div className="md:col-span-1 pr-2">
                            <label className="block text-sm font-semibold text-slate-700">Message to Registered Students</label>
                            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Add inline instructions, hints, or venue announcements that students will see on their dashboard portal.</p>
                          </div>
                          <div className="md:col-span-2">
                            <textarea 
                              rows="4"
                              value={customTextNotice || ''}
                              onChange={(e) => setCustomTextNotice(e.target.value)}
                              placeholder="Type instructions or details here (e.g., 'Bring your laptops and chargers. Report to Labs 3 on Day 1...')"
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                            />
                          </div>
                        </div>

                        {/* 4. Submissions Allowance Toggle Switch Row */}
                        <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-800">Enable Student Submissions</h4>
                            <p className="text-xs text-slate-500">Allow registered students to upload their solution PDFs for this event.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={allowSubmissions} 
                              onChange={(e) => setAllowSubmissions(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* Form Action Footer Bar */}
                        <div className="p-4 bg-slate-50 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3 mt-6">
                          <button 
                            type="button" 
                            onClick={() => {
                              setSelectedEventId(null);
                              setSelectedUploadFile(null);
                              setCustomTextNotice('');
                              setAllowSubmissions(true);
                            }}
                            className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs rounded-xl shadow-sm transition"
                          >
                            Cancel
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleSaveMaterialsSettings(selectedEventId, selectedUploadFile, customTextNotice, allowSubmissions)}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow active:scale-95 transition-all"
                          >
                            Save Configuration
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-slate-400 border border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                        <p className="text-sm font-medium">Please select an active event from the menu drop list options above to edit configuration details.</p>
                      </div>
                    )}
                  </div>
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

      {/* UPDATE TIMELINE MODAL */}
      {selectedEventForTimeline && (
        <UpdateTimelineModal
          event={selectedEventForTimeline}
          onClose={() => setSelectedEventForTimeline(null)}
          onSuccess={() => {
            setSelectedEventForTimeline(null);
            fetchOrganizerData(); // Refresh list and counts
          }}
        />
      )}
    </div>
  );
}
