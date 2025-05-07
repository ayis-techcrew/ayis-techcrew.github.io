require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Client with enhanced configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY, // Always use service key for backend
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Secure File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempPath = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

// Enhanced Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.cookies?.sb_access_token;
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        solutions: [
          'Include Authorization header: Bearer <token>',
          'Or provide valid session cookie'
        ]
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) throw error;
    if (!user) throw new Error('User not found');

    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err.message);
    res.status(401).json({
      error: 'Authentication failed',
      details: err.message,
      code: 'AUTH_ERROR'
    });
  }
};

// Student Registration Endpoint (Enhanced)
app.post('/register-student', async (req, res) => {
  const { admission_no, registration_no, name, email, phone, grade, section, password } = req.body;

  // Comprehensive Validation
  if (!name || !email || !phone || !grade || !section || !password) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['name', 'email', 'phone', 'grade', 'section', 'password']
    });
  }

  if (!admission_no && !registration_no) {
    return res.status(400).json({
      error: 'Either admission_no or registration_no is required'
    });
  }

  try {
    // Step 1: Create Auth User
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          user_type: 'student'
        },
        emailRedirectTo: `${process.env.FRONTEND_URL}/verify-email`
      }
    });

    if (authError) throw authError;

    // Step 2: Create Student Profile
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .insert([{
        admission_no: admission_no || null,
        registration_no: registration_no || null,
        name,
        email,
        phone,
        grade,
        section,
        user_id: authData.user.id,
        status: 'pending' // Initial status
      }])
      .select()
      .single();

    if (studentError) throw studentError;

    // Step 3: Send Welcome Email (example)
    await supabase.functions.invoke('send-welcome-email', {
      body: { email, name }
    });

    res.status(201).json({
      message: 'Registration successful! Please check your email for verification.',
      data: studentData
    });

  } catch (error) {
    console.error('Registration error:', error);

    // Specific error handling
    let statusCode = 500;
    let errorMessage = 'Registration failed';
    let errorDetails = error.message;

    if (error.message.includes('already registered')) {
      statusCode = 409;
      errorMessage = 'User already exists';
    } else if (error.code === '23505') {
      statusCode = 409;
      errorMessage = 'Duplicate admission/registration number';
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: errorDetails,
      code: error.code
    });
  }
});

// Enhanced Profile Update Endpoint
app.put('/students/:id', authenticate, upload.single('profile_pic'), async (req, res) => {
  const studentId = req.params.id;
  const updates = req.body;
  const file = req.file;

  try {
    // Verify ownership
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('user_id, profile_url')
      .eq('id', studentId)
      .single();

    if (fetchError) throw fetchError;
    if (student.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }

    // Handle file upload if present
    if (file) {
      // Delete old profile picture if exists
      if (student.profile_url) {
        const oldFilePath = student.profile_url.split('/public/')[1];
        await supabase.storage
          .from('student-profiles')
          .remove([oldFilePath]);
      }

      // Upload new file
      const fileExt = path.extname(file.originalname);
      const fileName = `profile-${studentId}-${Date.now()}${fileExt}`;
      const filePath = `students/${studentId}/${fileName}`;

      const fileBuffer = fs.readFileSync(file.path);
      const { error: uploadError } = await supabase.storage
        .from('student-profiles')
        .upload(filePath, fileBuffer, {
          contentType: file.mimetype,
          upsert: true,
          cacheControl: '3600'
        });

      fs.unlinkSync(file.path); // Cleanup temp file

      if (uploadError) throw uploadError;
      updates.profile_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/student-profiles/${filePath}`;
    }

    // Update record
    const { data, error: updateError } = await supabase
      .from('students')
      .update(updates)
      .eq('id', studentId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({
      message: 'Profile updated successfully',
      data
    });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      details: error.message,
      code: error.code
    });
  }
});

// Error Handling Middleware (Enhanced)
app.use((err, req, res, next) => {
  console.error('Server error:', {
    error: err.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: 'connected' // You could add actual DB ping here
  });
});

// Start Server with enhanced configuration
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Supabase connected to ${process.env.SUPABASE_URL}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
