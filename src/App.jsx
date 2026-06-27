// src/App.jsx
import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // 1. Get the initial session quietly without forcing a route path shift
    setLoading(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);
        await resolveUserRole(session.user);
      } else {
        setSession(null);
        setUser(null);
        setRole(null);
        setDbRole(null);
      }
      setLoading(false);
    });

    // 2. Safely capture state mutations without triggering a cold boot reload
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log(`🔑 Auth Event Fired: ${event}`);
      
      // Check if the update is just a profile change/token update
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        console.log("🛡️ Profile modification or token refresh detected. Blocking page refresh.");
        setSession(currentSession);
        if (currentSession?.user) {
          setUser(currentSession.user);
        }
        // STOP HERE: Do not navigate, do not refresh, do not alter routing location states!
        return; 
      }

      // Only handle strict sign-in or sign-out mutations
      setLoading(true);
      if (event === 'SIGNED_IN' && currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        await resolveUserRole(currentSession.user, event);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setRole(null);
        setDbRole(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
      setRole(resolvedRole);
    }
  }

  const handleAuthSuccess = (authUser, authRole) => {
    setUser(authUser);
    setRole(authRole);
    setDbRole(authRole);
    setSession({ user: authUser });
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
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
