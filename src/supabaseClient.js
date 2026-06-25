// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Resolve environment variables using either standard React (process.env) or Vite (import.meta.env)
const getEnvVar = (reactKey, viteKey, fallback) => {
  if (typeof process !== 'undefined' && process.env && process.env[reactKey]) {
    return process.env[reactKey];
  }
  if (import.meta.env && import.meta.env[viteKey]) {
    return import.meta.env[viteKey];
  }
  return fallback;
};

const rawSupabaseUrl = getEnvVar('REACT_APP_SUPABASE_URL', 'VITE_SUPABASE_URL', 'https://your-placeholder-supabase-url.supabase.co');
const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '') : '';
const supabaseAnonKey = getEnvVar('REACT_APP_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'your-placeholder-anon-key');

// Determine if we should use Mock Mode (useful for local development/preview before keys are set up)
const isPlaceholder = (val) => !val || val.includes('placeholder') || val.includes('your-');
export const isMockMode = isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey);

let supabaseInstance = null;

if (!isMockMode) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    console.error('Failed to initialize Supabase client. Falling back to mock client.', error);
    supabaseInstance = createMockClient();
  }
} else {
  console.warn('Initializing application in MOCK MODE because Supabase keys are placeholders. All state will be stored in localStorage.');
  supabaseInstance = createMockClient();
}

export const supabase = supabaseInstance;

// --- MOCK CLIENT IMPLEMENTATION ---
function createMockClient() {
  // Initialize Mock Data in LocalStorage if not present
  const initMockDB = () => {
    if (!localStorage.getItem('mock_profiles')) {
      const defaultProfiles = [
        {
          id: 'organizer-uuid-1111',
          full_name: 'Dr. Ramesh Kumar',
          roll_number: '',
          branch: 'Computer Science',
          semester: '',
          phone: '+91 98765 43210',
          role: 'organizer',
          updated_at: new Date().toISOString(),
          email: 'organizer@university.edu',
          club_name: 'IEEE'
        },
        {
          id: 'student-uuid-2222',
          full_name: 'Aditya Sharma',
          roll_number: '1UV22CS001',
          branch: 'Computer Science',
          semester: '6th Semester',
          phone: '+91 87654 32109',
          role: 'student',
          updated_at: new Date().toISOString(),
          email: 'student@university.edu'
        }
      ];
      localStorage.setItem('mock_profiles', JSON.stringify(defaultProfiles));
    } else {
      // Migrate existing mock profiles to have emails and club names for testing convenience
      try {
        const currentProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
        let modified = false;
        const updated = currentProfiles.map(p => {
          if (p.id === 'organizer-uuid-1111') {
            if (!p.email) {
              p.email = 'organizer@university.edu';
              modified = true;
            }
            if (!p.club_name) {
              p.club_name = 'IEEE';
              modified = true;
            }
          }
          if (p.id === 'student-uuid-2222' && !p.email) {
            p.email = 'student@university.edu';
            modified = true;
          }
          return p;
        });
        if (modified) {
          localStorage.setItem('mock_profiles', JSON.stringify(updated));
        }
      } catch (e) {
        console.error('Failed to run mock profiles migration:', e);
      }
    }

    if (!localStorage.getItem('mock_events')) {
      const defaultEvents = [
        {
          id: 'event-uuid-1',
          title: 'Data Science Summit',
          description: 'A comprehensive symposium detailing advanced techniques in machine learning, neural networks, and big data visualization. Join industry experts for hands-on labs.',
          date: new Date(Date.now() + 86400000 * 5).toISOString(), // 5 days from now
          location_type: 'Hybrid',
          banner_url: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'OPEN',
          custom_fields: [
            { id: 'tshirt_size', label: 'T-Shirt Size', type: 'select', options: ['S', 'M', 'L', 'XL'] },
            { id: 'dietary', label: 'Dietary Requirements', type: 'text' }
          ],
          created_at: new Date().toISOString(),
          club_category: 'IEEE'
        },
        {
          id: 'event-uuid-2',
          title: 'AI Ethics Workshop',
          description: 'Discuss the societal, legal, and engineering implications of artificial intelligence. Topics include algorithmic bias, alignment, and open-source models.',
          date: new Date(Date.now() + 86400000 * 15).toISOString(), // 15 days from now
          location_type: 'Virtual',
          banner_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'OPEN',
          custom_fields: [
            { id: 'github_handle', label: 'GitHub Username', type: 'text' }
          ],
          created_at: new Date().toISOString(),
          club_category: 'GDG'
        },
        {
          id: 'event-uuid-3',
          title: 'Micro-Credentials Lab',
          description: 'Earn hands-on micro-credentials in Cloud Engineering and Serverless architectures. Requires pre-requisite knowledge of JavaScript and basic terminal commands.',
          date: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
          location_type: 'In-Person',
          banner_url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'CLOSED',
          custom_fields: [],
          created_at: new Date().toISOString(),
          club_category: 'IEEE'
        },
        {
          id: 'event-uuid-4',
          title: 'Blockchain in Ed',
          description: 'Exploring decentralization in higher education record systems. Prototype smart contract templates for verifiable student credentials.',
          date: new Date(Date.now() + 86400000 * 30).toISOString(),
          location_type: 'In-Person',
          banner_url: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'DRAFT',
          custom_fields: [],
          created_at: new Date().toISOString(),
          club_category: 'GDG'
        }
      ];
      localStorage.setItem('mock_events', JSON.stringify(defaultEvents));
    } else {
      // Migrate existing mock events to have club_category for testing convenience
      try {
        const currentEvents = JSON.parse(localStorage.getItem('mock_events') || '[]');
        let modified = false;
        const updated = currentEvents.map(e => {
          if (!e.club_category) {
            e.club_category = e.id === 'event-uuid-2' || e.id === 'event-uuid-4' ? 'GDG' : 'IEEE';
            modified = true;
          }
          return e;
        });
        if (modified) {
          localStorage.setItem('mock_events', JSON.stringify(updated));
        }
      } catch (e) {
        console.error('Failed to run mock events migration:', e);
      }
    }

    if (!localStorage.getItem('mock_registrations')) {
      const defaultRegistrations = [
        {
          id: 'reg-uuid-1',
          event_id: 'event-uuid-1',
          student_id: 'student-uuid-2222',
          custom_answers: { tshirt_size: 'L', dietary: 'Vegetarian' },
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('mock_registrations', JSON.stringify(defaultRegistrations));
    }
  };

  initMockDB();

  // Helper functions to read/write storage
  const getDB = (key) => JSON.parse(localStorage.getItem(key) || '[]');
  const setDB = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  // Current session tracker
  let currentSession = null;
  const storedUser = localStorage.getItem('mock_session_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    currentSession = { user, session: { access_token: 'mock-token', user } };
  }

  // Auth State Change Listeners
  const authListeners = new Set();

  const notifyAuthChange = (event, session) => {
    authListeners.forEach(cb => cb(event, session));
  };

  return {
    auth: {
      signUp: async ({ email, password: _password, options }) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const profiles = getDB('mock_profiles');
        
        // Find if user already exists
        const existing = profiles.find(p => p.email === email);
        if (existing) {
          return { data: { user: null }, error: { message: 'User already exists' } };
        }

        const userId = 'user-uuid-' + Math.random().toString(36).substr(2, 9);
        const metadata = options?.data || {};

        const newProfile = {
          id: userId,
          full_name: metadata.full_name || email.split('@')[0],
          roll_number: metadata.roll_number || '',
          branch: metadata.branch || '',
          semester: metadata.semester || '',
          phone: metadata.phone || '',
          role: metadata.role || 'student',
          updated_at: new Date().toISOString(),
          email // save email on mock profile for auth simulation
        };

        profiles.push(newProfile);
        setDB('mock_profiles', profiles);

        const userObj = {
          id: userId,
          email,
          user_metadata: metadata,
          role: metadata.role
        };

        const session = {
          access_token: 'mock-token-' + userId,
          user: userObj
        };

        currentSession = { user: userObj, session };
        localStorage.setItem('mock_session_user', JSON.stringify(userObj));
        notifyAuthChange('SIGNED_IN', session);

        return { data: { user: userObj, session }, error: null };
      },

      signInWithPassword: async ({ email, password: _password }) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const profiles = getDB('mock_profiles');
        
        // Simulating search - if user has profile, login. Otherwise create user on the fly or fail
        // To make it easy, we look up by full_name or email (mock_profiles contains simulated students/organizers)
        let profile = profiles.find(p => p.email === email);
        
        if (!profile) {
          // Check for our seed profiles
          if (email === 'student@university.edu') {
            profile = profiles.find(p => p.id === 'student-uuid-2222');
            profile.email = email;
          } else if (email === 'organizer@university.edu') {
            profile = profiles.find(p => p.id === 'organizer-uuid-1111');
            profile.email = email;
          } else {
            // Create on the fly to prevent friction
            const userId = 'user-uuid-' + Math.random().toString(36).substr(2, 9);
            profile = {
              id: userId,
              full_name: email.split('@')[0],
              roll_number: '1UV22CS' + Math.floor(100 + Math.random() * 900),
              branch: 'Information Science',
              semester: '4th Semester',
              phone: '+91 99000 99000',
              role: email.includes('organizer') ? 'organizer' : 'student',
              updated_at: new Date().toISOString(),
              email
            };
            profiles.push(profile);
            setDB('mock_profiles', profiles);
          }
        }

        const userObj = {
          id: profile.id,
          email,
          user_metadata: {
            full_name: profile.full_name,
            roll_number: profile.roll_number,
            branch: profile.branch,
            semester: profile.semester,
            phone: profile.phone,
            role: profile.role
          },
          role: profile.role
        };

        const session = {
          access_token: 'mock-token-' + profile.id,
          user: userObj
        };

        currentSession = { user: userObj, session };
        localStorage.setItem('mock_session_user', JSON.stringify(userObj));
        notifyAuthChange('SIGNED_IN', session);

        return { data: { user: userObj, session }, error: null };
      },

      signOut: async () => {
        currentSession = null;
        localStorage.removeItem('mock_session_user');
        notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      },

      getSession: async () => {
        return { data: { session: currentSession ? currentSession.session : null }, error: null };
      },

      updateUser: async ({ data }) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!currentSession) {
          return { data: { user: null }, error: { message: 'No active session' } };
        }

        const userObj = currentSession.user;
        const updatedMetadata = { ...userObj.user_metadata, ...data };
        const updatedUser = { ...userObj, user_metadata: updatedMetadata };
        
        currentSession.user = updatedUser;
        currentSession.session.user = updatedUser;
        localStorage.setItem('mock_session_user', JSON.stringify(updatedUser));

        // Update the mock profile entry in local storage for matching data consistency
        const profiles = getDB('mock_profiles');
        const updatedProfiles = profiles.map(p => {
          if (p.id === userObj.id) {
            return { ...p, full_name: data.full_name || p.full_name };
          }
          return p;
        });
        setDB('mock_profiles', updatedProfiles);

        notifyAuthChange('USER_UPDATED', currentSession.session);
        return { data: { user: updatedUser }, error: null };
      },

      onAuthStateChange: (callback) => {
        authListeners.add(callback);
        // Invoke immediately with current state
        callback(currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', currentSession ? currentSession.session : null);
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(callback)
            }
          }
        };
      }
    },

    from: (table) => {
      let filterCol = null;
      let filterVal = null;
      let sortCol = null;
      let sortAsc = true;
      let operation = 'select'; // 'select' | 'insert' | 'update' | 'delete'
      let updatePayload = null;

      const queryBuilder = {
        select: (_fields) => {
          operation = 'select';
          return queryBuilder;
        },
        eq: (col, val) => {
          filterCol = col;
          filterVal = val;
          return queryBuilder;
        },
        order: (col, { ascending = true } = {}) => {
          sortCol = col;
          sortAsc = ascending;
          return queryBuilder;
        },
        single: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          let filtered = getDB(`mock_${table}`);
          if (filterCol && filterVal !== null) {
            filtered = filtered.filter(item => item[filterCol] === filterVal);
          }
          if (filtered.length === 0) {
            return { data: null, error: { message: 'Not found' } };
          }
          return { data: filtered[0], error: null };
        },
        insert: async (rows) => {
          await new Promise(resolve => setTimeout(resolve, 200));
          const rowsArray = Array.isArray(rows) ? rows : [rows];
          const newRows = rowsArray.map(r => ({
            id: r.id || 'mock-id-' + Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            ...r
          }));

          const currentDB = getDB(`mock_${table}`);
          setDB(`mock_${table}`, [...currentDB, ...newRows]);
          return { data: newRows, error: null };
        },
        update: (updates) => {
          operation = 'update';
          updatePayload = updates;
          return queryBuilder;
        },
        delete: () => {
          operation = 'delete';
          return queryBuilder;
        },
        // Mimic returning data directly on async execution (resolving the chain)
        then: async (resolve) => {
          await new Promise(r => setTimeout(r, 100));
          let currentDB = getDB(`mock_${table}`);
          
          if (operation === 'select') {
            let result = [...currentDB];
            if (filterCol && filterVal !== null) {
              result = result.filter(item => item[filterCol] === filterVal);
            }
            if (table === 'registrations') {
              const profiles = getDB('mock_profiles');
              result = result.map(reg => {
                const profileObj = profiles.find(p => p.id === reg.student_id) || {};
                return {
                  ...reg,
                  student: profileObj,
                  profiles: profileObj
                };
              });
            }
            if (sortCol) {
              result.sort((a, b) => {
                const valA = a[sortCol];
                const valB = b[sortCol];
                if (valA < valB) return sortAsc ? -1 : 1;
                if (valA > valB) return sortAsc ? 1 : -1;
                return 0;
              });
            }
            resolve({ data: result, error: null });
          } 
          else if (operation === 'update') {
            let updatedRows = [];
            currentDB = currentDB.map(row => {
              let match = true;
              if (filterCol && row[filterCol] !== filterVal) {
                match = false;
              }
              if (match) {
                const updated = { ...row, ...updatePayload, updated_at: new Date().toISOString() };
                updatedRows.push(updated);
                return updated;
              }
              return row;
            });
            setDB(`mock_${table}`, currentDB);
            resolve({ data: updatedRows, error: null });
          } 
          else if (operation === 'delete') {
            let remaining = currentDB;
            if (filterCol) {
              remaining = currentDB.filter(row => row[filterCol] !== filterVal);
            }
            setDB(`mock_${table}`, remaining);
            resolve({ data: null, error: null });
          }
        }
      };

      return queryBuilder;
    }
  };
}
