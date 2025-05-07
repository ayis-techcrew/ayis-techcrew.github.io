const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Supabase Client
const SUPABASE_URL = 'https://mdfgthpblsgrmvesgzwt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-anon-or-service-role-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempPath = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);
    cb(null, tempPath);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// JWT Verification Middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header missing' });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) throw error;
    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Student Registration Endpoint
app.post('/register-student', authenticate, async (req, res) => {
  const studentData = req.body;
  
  // Validation
  if (!studentData.admission_no?.match(/^[A-Z]{2,3}\d{4,6}$/)) {
    return res.status(400).json({ 
      error: 'Invalid admission number format (e.g., ABC12345)',
      field: 'admission_no'
    });
  }

  try {
    // Check for duplicate admission number
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact' })
      .eq('admission_no', studentData.admission_no);

    if (count > 0) {
      return res.status(409).json({
        error: 'Admission number already exists',
        field: 'admission_no'
      });
    }

    // Create student record
    const { data, error } = await supabase
      .from('students')
      .insert([{
        ...studentData,
        user_id: req.user.id, // Link to authenticated user
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Registration error:', err);
    
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'Database constraint violation',
        details: err.details
      });
    }

    res.status(500).json({ 
      error: 'Registration failed',
      details: err.message 
    });
  }
});

// Update Student Endpoint
app.post('/update-student', authenticate, upload.single('profilePic'), async (req, res) => {
  const { admission_no, ...updates } = req.body;

  try {
    // Verify student exists and belongs to user
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('user_id')
      .eq('admission_no', admission_no)
      .single();

    if (fetchError) throw fetchError;
    if (student.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this record' });
    }

    // Handle file upload if present
    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const fileName = `profile-${Date.now()}${fileExt}`;
      const filePath = `students/${admission_no}/${fileName}`;

      const fileBuffer = fs.readFileSync(req.file.path);
      const { error: uploadError } = await supabase.storage
        .from('student-profiles')
        .upload(filePath, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      fs.unlinkSync(req.file.path); // Cleanup temp file

      if (uploadError) throw uploadError;
      updates.profile_url = `${SUPABASE_URL}/storage/v1/object/public/student-profiles/${filePath}`;
    }

    // Update record
    const { data, error: updateError } = await supabase
      .from('students')
      .update(updates)
      .eq('admission_no', admission_no)
      .select();

    if (updateError) throw updateError;
    res.status(200).json(data[0]);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ 
      error: 'Update failed',
      details: err.message 
    });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Supabase connected to ${SUPABASE_URL}`);
});
