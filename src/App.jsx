// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase, isMockMode } from './supabaseClient';
import AuthScreen from './components/auth/AuthScreen';
import StudentDashboard from './components/dashboard/StudentDashboard';
import OrganizerDashboard from './components/dashboard/OrganizerDashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'student' | 'organizer'
  const [dbRole, setDbRole] = useState(null); // actual database role: 'student' | 'organizer'
  const [loading, setLoading] = useState(true);

  const activeUserIdRef = useRef(null);

  useEffect(() => {
    // 0. Recover crashed mobile registration session
    const recoverCrashedMobileSession = () => {
      const cachedAnswersKey = Object.keys(localStorage).find(key => key.startsWith('reg_answers_'));
      if (cachedAnswersKey) {
        const eventId = cachedAnswersKey.split('_')[2];
        console.log(`⚠️ Mobile Recovery Detected: Restoring crashed registration form for Event ${eventId}`);
        
        // Force the app to stay on the student portal view
        localStorage.setItem('active_portal_role', 'student');
        
        // Force the dashboard to stay on the active registration page tab (upcoming/events)
        localStorage.setItem('portal_active_tab', 'upcoming');
      }
    };
    recoverCrashedMobileSession();

    // 1. Check current session on mount
    async function checkSession() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user);
        activeUserIdRef.current = data.session.user.id;
        await resolveUserRole(data.session.user);
      } else {
        setSession(null);
        setUser(null);
        activeUserIdRef.current = null;
        setRole(null);
        setDbRole(null);
      }
      setLoading(false);
    }

    checkSession();

    // 2. Setup auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('🔑 Auth event:', event, '| ref:', activeUserIdRef.current, '| session user:', newSession?.user?.id);
      
      // Check if the update is just a profile change/token update
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        console.log("🛡️ Profile modification or token refresh detected. Blocking page refresh.");
        setSession(newSession);
        if (newSession) {
          setUser(newSession.user);
          activeUserIdRef.current = newSession.user.id;
        }
        return; 
      }

      // Safeguard against refocus/same-session triggers that unmount the UI:
      // If we already have a logged-in user and the session hasn't changed to logged-out or another user,
      // update the session/user details silently without setting loading = true.
      if (newSession && newSession.user && activeUserIdRef.current === newSession.user.id) {
        console.log("🛡️ Re-focus/Same user session verification. Blocking loader layout flash.");
        setSession(newSession);
        setUser(newSession.user);
        activeUserIdRef.current = newSession.user.id;
        return;
      }

      console.log('⚠️ setLoading(true) triggered — this will unmount the app tree');
      setLoading(true);
      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        activeUserIdRef.current = newSession.user.id;
        await resolveUserRole(newSession.user, event);
      } else {
        setSession(null);
        setUser(null);
        activeUserIdRef.current = null;
        setRole(null);
        setDbRole(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch the role of the user from public.profiles
  async function resolveUserRole(authUser, event) {
    if (!authUser) return;

    // Fetch profile role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .single();

    let resolvedRole = 'student';
    if (!error && profile?.role) {
      resolvedRole = profile.role;
    } else {
      // Fallback to user metadata role
      resolvedRole = authUser.user_metadata?.role || 'student';
    }
    setDbRole(resolvedRole);
    
    // Only update view role on initialization or explicit SIGNED_IN event
    if (!event || event === 'SIGNED_IN') {
      const savedRolePreference = localStorage.getItem('active_portal_role');
      if (savedRolePreference && (savedRolePreference === resolvedRole || resolvedRole === 'organizer')) {
        setRole(savedRolePreference);
      } else {
        setRole(resolvedRole);
        localStorage.setItem('active_portal_role', resolvedRole);
      }
    }
  }

  const handleAuthSuccess = (authUser, authRole) => {
    setUser(authUser);
    activeUserIdRef.current = authUser ? authUser.id : null;
    setRole(authRole);
    setDbRole(authRole);
    setSession({ user: authUser });
    localStorage.setItem('active_portal_role', authRole);
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    localStorage.removeItem('active_portal_role');
    localStorage.removeItem('portal_active_tab');
    setSession(null);
    setUser(null);
    activeUserIdRef.current = null;
    setRole(null);
    setLoading(false);
  };

  // Toggle roles for prototype/evaluation convenience
  const handleSwitchRole = async () => {
    const nextRole = role === 'student' ? 'organizer' : 'student';
    
    // In Mock Mode, we can also update the profile in localStorage for state consistency
    if (isMockMode && user) {
      const mockProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
      const updated = mockProfiles.map(p => {
        if (p.id === user.id) {
          return { ...p, role: nextRole };
        }
        return p;
      });
      localStorage.setItem('mock_profiles', JSON.stringify(updated));
      user.user_metadata.role = nextRole;
    }

    setRole(nextRole);
    localStorage.setItem('active_portal_role', nextRole);
    // Clear tab cache history when shifting roles to prevent view overlaps
    localStorage.removeItem('portal_active_tab');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-semibold text-gray-500">Loading Academic Portal...</span>
        </div>
      </div>
    );
  }

  // 1. No Session -> Show Auth Screen
  if (!session || !user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // 2. Active Session -> Show Dashboard depending on Role
  if (role === 'organizer') {
    return (
      <OrganizerDashboard
        user={user}
        onSignOut={handleSignOut}
        onSwitchRole={handleSwitchRole}
        canSwitchRole={dbRole === 'organizer'}
      />
    );
  }

  // Default: student dashboard
  return (
    <StudentDashboard
      user={user}
      onSignOut={handleSignOut}
      onSwitchRole={handleSwitchRole}
      canSwitchRole={dbRole === 'organizer'}
    />
  );
}
