const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const SUPABASE_URL = 'https://mdfgthpblsgrmvesgzwt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZmd0aHBibHNncm12ZXNnend0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NDIyOTYsImV4cCI6MjA2MjIxODI5Nn0.a5nlKgTfO5LZcceKRRrx8dOskVKQd3WPJP43gJOTsdw';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === File Upload Setup ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempPath = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);
    cb(null, tempPath);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-profile.jpg')
});
const upload = multer({ storage });

// === Student Registration ===
app.post('/register-student', async (req, res) => {
  const student = req.body;

  try {
    const { data, error } = await supabase
      .from('students')
      .insert([student]);

    if (error) throw error;

    res.status(200).send('Student registered successfully.');
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).send('Failed to register student.');
  }
});

// === Upload Profile Picture + Update Student ===
app.post('/update-student', upload.single('profilePic'), async (req, res) => {
  const { admission_no, newPassword, name, grade, section } = req.body;

  try {
    let profileUrl = null;

    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const filePath = `${grade}/${section}/${name}/profile.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('student-profiles')
        .upload(filePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      fs.unlinkSync(req.file.path); // delete temp file

      if (uploadError) throw uploadError;

      profileUrl = `${SUPABASE_URL}/storage/v1/object/public/student-profiles/${filePath}`;
    }

    const updates = {};
    if (newPassword) updates.password = newPassword;
    if (profileUrl) updates.profile_url = profileUrl;

    const { error: updateError, data } = await supabase
      .from('students')
      .update(updates)
      .eq('admission_no', admission_no)
      .select();

    if (updateError) throw updateError;
    if (data.length === 0) return res.status(404).send('Student not found.');

    res.status(200).json(data[0]);
  } catch (err) {
    console.error('❌ Update error:', err.message);
    res.status(500).send('Failed to update student.');
  }
});

// === Serve homepage ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login', 'login-intro-vid', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
