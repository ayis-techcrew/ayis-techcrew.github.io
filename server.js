const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(
  'https://mdfgthpblsgrmvesgzwt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZmd0aHBibHNncm12ZXNnend0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjY0MjI5NiwiZXhwIjoyMDYyMjE4Mjk2fQ.QsADRcID3NN6VleEP16AVO2nQ7pTCE0peHuQWYW9g3o'
);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/')));

// ====================
// LOCAL (LEGACY) FILE STORAGE SETUP
// ====================
const legacyUpload = multer({ dest: 'uploads/' });
const studentDataPath = '/login/student-teacher/student-login-detail.json';
const teacherDataPath = '/login/student-teacher/teacher-login-detail.json';

// Ensure local JSON files exist
if (!fs.existsSync(studentDataPath)) fs.writeFileSync(studentDataPath, '[]');
if (!fs.existsSync(teacherDataPath)) fs.writeFileSync(teacherDataPath, '[]');

// ====================
// LEGACY STUDENT REGISTRATION
// ====================
app.post('/legacy/register-student', legacyUpload.single('profilePicture'), (req, res) => {
  const { admissionNumber, registrationNumber, name, grade, section, email, phone, password } = req.body;
  const imagePath = req.file.path;

  const students = JSON.parse(fs.readFileSync(studentDataPath));
  students.push({ admissionNumber, registrationNumber, name, grade, section, email, phone, password, profilePicture: imagePath });
  fs.writeFileSync(studentDataPath, JSON.stringify(students, null, 2));

  res.status(200).json({ message: 'Student registered successfully (legacy).' });
});

// ====================
// LEGACY TEACHER OTP LOGIN
// ====================
let generatedOtps = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ayistechcrew@gmail.com', // replace with your email
    pass: 'qgny whhr euzk wfoo'     // use app password from Gmail
  }
});

app.post('/send-otp', (req, res) => {
  const { email } = req.body;
  const teacherData = JSON.parse(fs.readFileSync(teacherDataPath));
  const teacher = teacherData.find(t => t.email === email);
  if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  generatedOtps[email] = { otp, createdAt: Date.now() };

  const mailOptions = {
    from: '"AYIS Tech Crew" <ayistechcrew@gmail.com>',
    to: email,
    subject: 'Your OTP for Login Verification',
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <p>Dear ${teacher.name},</p>
        <p>Your OTP is: <strong style="font-size: 18px; color:#ff9900;">${otp}</strong></p>
        <p>This OTP is valid for <strong>10 minutes</strong>.</p>
        <br>
        <p>Best regards,</p>
        <p>AYIS Tech Crew</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) return res.status(500).json({ message: 'Failed to send OTP.' });
    res.status(200).json({ message: 'OTP sent successfully.' });
  });
});

app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  const otpData = generatedOtps[email];
  if (!otpData) return res.status(400).json({ message: 'OTP not generated.' });

  const otpAge = Date.now() - otpData.createdAt;
  if (otpAge > 10 * 60 * 1000) {
    delete generatedOtps[email]; // Expired OTP
    return res.status(400).json({ message: 'OTP expired.' });
  }

  if (otpData.otp === otp) {
    delete generatedOtps[email]; // OTP is valid, delete it
    res.status(200).json({ message: 'OTP verified.' });
  } else {
    res.status(400).json({ message: 'Invalid OTP.' });
  }
});

// ====================
// SUPABASE STUDENT REGISTRATION
// ====================
app.post('/supabase/register-student', async (req, res) => {
  const { admissionNumber, registrationNumber, name, grade, section, email, phone, password } = req.body;

  const { data, error } = await supabase.from('students').insert([{ admissionNumber, registrationNumber, name, grade, section, email, phone, password }]);

  if (error) return res.status(500).json({ message: 'Failed to register student.', error });
  res.status(200).json({ message: 'Student registered via Supabase.' });
});

// ====================
// SUPABASE STUDENT LOGIN
// ====================
app.post('/supabase/login-student', async (req, res) => {
  const { registrationNumber, password } = req.body;
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('registrationNumber', registrationNumber)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ message: 'Invalid credentials.' });
  res.status(200).json(data);
});

// ====================
// SUPABASE GET STUDENT BY ID
// ====================
app.get('/supabase/students/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ message: 'Student not found.' });
  res.status(200).json(data);
});

// ====================
// SUPABASE UPDATE STUDENT (PASSWORD/PROFILE PIC)
// ====================
app.put('/supabase/students/:id', legacyUpload.single('profilePicture'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  let profilePictureUrl;
  if (req.file) {
    const fileExt = path.extname(req.file.originalname);
    const filePath = `student-profiles/${id}${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('student-profile-pictures')
      .upload(filePath, fs.readFileSync(req.file.path), {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) return res.status(500).json({ message: 'Profile upload failed.', error: uploadError });

    const { data: publicUrlData } = supabase.storage
      .from('student-profile-pictures')
      .getPublicUrl(filePath);

    profilePictureUrl = publicUrlData.publicUrl;
  }

  const updateFields = {};
  if (password) updateFields.password = password;
  if (profilePictureUrl) updateFields.profilePictureUrl = profilePictureUrl;

  const { error: updateError } = await supabase
    .from('students')
    .update(updateFields)
    .eq('id', id);

  if (updateError) return res.status(500).json({ message: 'Update failed.', error: updateError });

  res.status(200).json({ message: 'Student updated via Supabase.', profilePictureUrl });
});

// ====================
// START SERVER
// ====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
