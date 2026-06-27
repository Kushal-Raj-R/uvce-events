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
          club_name: 'IEEE',
          friend_code: 'organi12'
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
          email: 'student@university.edu',
          friend_code: 'adity123'
        },
        {
          id: 'student-uuid-3333',
          full_name: 'Rahul Verma',
          roll_number: '1UV22CS002',
          branch: 'Computer Science',
          semester: '6th Semester',
          phone: '+91 99999 88888',
          role: 'student',
          updated_at: new Date().toISOString(),
          email: 'rahul@university.edu',
          friend_code: 'rahul456'
        }
      ];
      localStorage.setItem('mock_profiles', JSON.stringify(defaultProfiles));
    } else {
      // Migrate existing mock profiles to have emails and club names for testing convenience
      try {
        const currentProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
        let modified = false;
        currentProfiles.forEach(p => {
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
          if (p.id === 'student-uuid-2222') {
            if (!p.email) {
              p.email = 'student@university.edu';
              modified = true;
            }
            if (!p.friend_code) {
              p.friend_code = 'adity123';
              modified = true;
            }
          }
          if (p.id === 'student-uuid-3333') {
            if (!p.friend_code) {
              p.friend_code = 'rahul456';
              modified = true;
            }
          }
          if (!p.friend_code) {
            p.friend_code = Math.random().toString(36).substr(2, 8);
            modified = true;
          }
        });
        let hasRahul = currentProfiles.some(p => p.id === 'student-uuid-3333');
        if (!hasRahul) {
          currentProfiles.push({
            id: 'student-uuid-3333',
            full_name: 'Rahul Verma',
            roll_number: '1UV22CS002',
            branch: 'Computer Science',
            semester: '6th Semester',
            phone: '+91 99999 88888',
            role: 'student',
            updated_at: new Date().toISOString(),
            email: 'rahul@university.edu',
            friend_code: 'rahul456'
          });
          modified = true;
        }
        if (modified) {
          localStorage.setItem('mock_profiles', JSON.stringify(currentProfiles));
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
          location_type: 'Hybrid',
          participation_type: 'Solo',
          min_team_size: 1,
          max_team_size: 1,
          banner_path: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'OPEN',
          custom_fields: [
            { id: 'tshirt_size', label: 'T-Shirt Size', type: 'select', options: ['S', 'M', 'L', 'XL'] },
            { id: 'dietary', label: 'Dietary Requirements', type: 'text' }
          ],
          created_at: new Date().toISOString(),
          club_category: 'IEEE',
          registration_deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
          event_start_date: new Date(Date.now() + 86400000 * 5).toISOString(),
          duration_days: 2
        },
        {
          id: 'event-uuid-2',
          title: 'AI Ethics Workshop',
          description: 'Discuss the societal, legal, and engineering implications of artificial intelligence. Topics include algorithmic bias, alignment, and open-source models.',
          location_type: 'Virtual',
          participation_type: 'Solo',
          min_team_size: 1,
          max_team_size: 1,
          banner_path: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'OPEN',
          custom_fields: [
            { id: 'github_handle', label: 'GitHub Username', type: 'text' }
          ],
          created_at: new Date().toISOString(),
          club_category: 'GDG',
          registration_deadline: new Date(Date.now() + 86400000 * 10).toISOString(),
          event_start_date: new Date(Date.now() + 86400000 * 15).toISOString(),
          duration_days: 1
        },
        {
          id: 'event-uuid-3',
          title: 'Micro-Credentials Lab',
          description: 'Earn hands-on micro-credentials in Cloud Engineering and Serverless architectures. Requires pre-requisite knowledge of JavaScript and basic terminal commands.',
          location_type: 'In-Person',
          participation_type: 'Solo',
          min_team_size: 1,
          max_team_size: 1,
          banner_path: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'CLOSED',
          custom_fields: [],
          created_at: new Date().toISOString(),
          club_category: 'IEEE',
          registration_deadline: new Date(Date.now() - 86400000 * 5).toISOString(),
          event_start_date: new Date(Date.now() - 86400000 * 2).toISOString(),
          duration_days: 1
        },
        {
          id: 'event-uuid-4',
          title: 'Blockchain in Ed',
          description: 'Exploring decentralization in higher education record systems. Prototype smart contract templates for verifiable student credentials.',
          location_type: 'In-Person',
          participation_type: 'Solo',
          min_team_size: 1,
          max_team_size: 1,
          banner_path: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=800&q=80',
          organizer_id: 'organizer-uuid-1111',
          status: 'DRAFT',
          custom_fields: [],
          created_at: new Date().toISOString(),
          club_category: 'GDG',
          registration_deadline: new Date(Date.now() + 86400000 * 25).toISOString(),
          event_start_date: new Date(Date.now() + 86400000 * 30).toISOString(),
          duration_days: 3
        }
      ];
      localStorage.setItem('mock_events', JSON.stringify(defaultEvents));
    } else {
      // Migrate existing mock events to have club_category and timeline fields for testing convenience
      try {
        const currentEvents = JSON.parse(localStorage.getItem('mock_events') || '[]');
        let modified = false;
        const updated = currentEvents.map(e => {
          if (!e.club_category) {
            e.club_category = e.id === 'event-uuid-2' || e.id === 'event-uuid-4' ? 'GDG' : 'IEEE';
            modified = true;
          }
          if (e.max_file_size_mb !== undefined) {
            delete e.max_file_size_mb;
            modified = true;
          }
          if (e.banner_url !== undefined) {
            e.banner_path = e.banner_url;
            delete e.banner_url;
            modified = true;
          }
          if (e.registration_deadline === undefined || e.registration_deadline.indexOf('T') === -1) {
            const eventDate = new Date(e.date || Date.now());
            const deadlineDate = new Date(eventDate.getTime() - 86400000 * 5);
            e.registration_deadline = deadlineDate.toISOString();
            modified = true;
          }
          if (e.event_start_date === undefined || e.event_start_date.indexOf('T') === -1) {
            e.event_start_date = new Date(e.date || Date.now()).toISOString();
            modified = true;
          }
          if (e.duration_days === undefined) {
            e.duration_days = 1;
            modified = true;
          }
          if (e.participation_type === undefined) {
            e.participation_type = 'Solo';
            modified = true;
          }
          if (e.min_team_size === undefined) {
            e.min_team_size = e.participation_type === 'Team' ? 1 : 1;
            modified = true;
          }
          if (e.max_team_size === undefined) {
            e.max_team_size = e.participation_type === 'Team' ? 3 : 1;
            modified = true;
          }
          if (e.date !== undefined) {
            delete e.date;
            modified = true;
          }
          if (e.attachment_url === undefined) {
            e.attachment_url = null;
            modified = true;
          }
          if (e.custom_notice_text === undefined) {
            e.custom_notice_text = null;
            modified = true;
          }
          if (e.event_time === undefined) {
            e.event_time = null;
            modified = true;
          }
          if (e.allow_submissions === undefined) {
            e.allow_submissions = true;
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
          solution_url: null,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('mock_registrations', JSON.stringify(defaultRegistrations));
    } else {
      try {
        const regs = JSON.parse(localStorage.getItem('mock_registrations'));
        let modified = false;
        const updated = regs.map(r => {
          if (r.solution_url === undefined) {
            r.solution_url = null;
            modified = true;
          }
          return r;
        });
        if (modified) {
          localStorage.setItem('mock_registrations', JSON.stringify(updated));
        }
      } catch (e) {
        console.error('Failed to run mock registrations migration:', e);
      }
    }

    if (!localStorage.getItem('mock_connections')) {
      const defaultConnections = [
        {
          id: 'conn-uuid-1',
          sender_id: 'student-uuid-2222',
          receiver_id: 'student-uuid-3333',
          status: 'ACCEPTED',
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('mock_connections', JSON.stringify(defaultConnections));
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
          email, // save email on mock profile for auth simulation
          friend_code: Math.random().toString(36).substr(2, 8)
        };

        profiles.push(newProfile);
        setDB('mock_profiles', profiles);

        const userObj = {
          id: userId,
          email,
          user_metadata: {
            ...metadata,
            friend_code: newProfile.friend_code
          },
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
              email,
              friend_code: Math.random().toString(36).substr(2, 8)
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
            role: profile.role,
            friend_code: profile.friend_code
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

    storage: {
      from: (_bucket) => ({
        upload: async (filePath, file) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          const mockUrl = URL.createObjectURL(file);
          if (!window.mockStorage) {
            window.mockStorage = {};
          }
          window.mockStorage[filePath] = mockUrl;
          return { data: { path: filePath }, error: null };
        },
        getPublicUrl: (filePath) => {
          const publicUrl = window.mockStorage?.[filePath] || `https://example.com/mock-attachments/${filePath}`;
          return { data: { publicUrl } };
        }
      })
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
        or: (expr) => {
          queryBuilder._orExpression = expr;
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
            if (queryBuilder._orExpression) {
              const currentUserId = currentSession?.user?.id;
              result = result.filter(item => item.sender_id === currentUserId || item.receiver_id === currentUserId);
            }
            if (table === 'registrations') {
              const profiles = getDB('mock_profiles');
              const events = getDB('mock_events');
              result = result.map(reg => {
                const profileObj = profiles.find(p => p.id === reg.student_id) || {};
                const eventObj = events.find(e => e.id === reg.event_id) || {};
                return {
                  ...reg,
                  student: profileObj,
                  profiles: profileObj,
                  events: eventObj
                };
              });
            }
            if (table === 'connections') {
              const profiles = getDB('mock_profiles');
              const currentUserId = currentSession?.user?.id;
              result = result.map(conn => {
                const isSenderMe = conn.sender_id === currentUserId;
                const senderProfile = profiles.find(p => p.id === conn.sender_id) || { id: conn.sender_id };
                const receiverProfile = profiles.find(p => p.id === conn.receiver_id) || { id: conn.receiver_id };
                
                return {
                  ...conn,
                  sender_id: isSenderMe ? conn.sender_id : senderProfile,
                  receiver_id: isSenderMe ? receiverProfile : conn.receiver_id,
                  'profiles!sender_id': senderProfile,
                  'profiles!receiver_id': receiverProfile,
                  'profiles:sender_id': senderProfile,
                  'profiles': senderProfile,
                  'sender_profile': senderProfile,
                  'receiver_profile': receiverProfile
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
