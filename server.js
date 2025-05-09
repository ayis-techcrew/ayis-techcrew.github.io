const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve all files from root, including images
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard'))); // serve dashboard content correctly

// === Email Setup ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ayistechcrew@gmail.com',
    pass: 'qgny whhr euzk wfoo'
  }
});

// === OTP Memory Store ===
let otpStore = {}; // { email: { otp, timestamp } }

// === Send OTP ===
app.post('/send-otp', (req, res) => {
  const { email } = req.body;
  const teacherPath = path.join(__dirname, 'login/student-teacher/teacher-login-detail.json');

  if (!fs.existsSync(teacherPath)) {
    return res.status(500).send('Teacher data not found.');
  }

  const teacherData = JSON.parse(fs.readFileSync(teacherPath));
  const teacher = teacherData.find(t => t.email === email);
  const now = Date.now();

  if (!teacher) return res.status(404).send('Teacher not found');

  if (otpStore[email] && now - otpStore[email].timestamp < 30 * 1000) {
    return res.status(429).send('Wait 30 seconds to resend OTP.');
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore[email] = { otp, timestamp: now };

  const mailOptions = {
    from: '"AYIS Tech Crew" <ayistechcrew@gmail.com>',
    to: email,
    subject: 'Your OTP for Login Verification',
    html: `<p>Dear ${teacher.name},</p>
           <p>Your OTP is: <strong style="color:#ff9900;">${otp}</strong></p>
           <p>This OTP is valid for 10 minutes.</p>`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('Error sending OTP:', err);
      return res.status(500).send('Failed to send OTP.');
    }
    console.log(`✅ OTP sent to ${email}: ${otp}`);
    res.status(200).send('OTP sent successfully.');
  });
});

// === Verify OTP ===
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const stored = otpStore[email];
  const now = Date.now();

  if (!stored) return res.status(400).send('OTP not requested.');
  if (now - stored.timestamp > 10 * 60 * 1000) {
    delete otpStore[email];
    return res.status(400).send('OTP expired.');
  }
  if (stored.otp !== otp) return res.status(400).send('Invalid OTP.');

  delete otpStore[email];
  res.status(200).send('OTP verified.');
});

// === File Upload for Student Profile ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { name, grade, section } = req.body;
    const dir = path.join(__dirname, 'Student details', grade, section, name);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'profile.jpg')
});
const upload = multer({ storage });

// === Student Registration ===
app.post('/register-student', (req, res) => {
  const student = req.body;
  const filePath = path.join(__dirname, 'login/student-teacher/student-login-detail.json');

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Unable to read student data.');
    let students = [];
    try {
      students = JSON.parse(data);
    } catch {
      return res.status(500).send('Invalid student data JSON.');
    }

    students.push(student);
    fs.writeFile(filePath, JSON.stringify(students, null, 2), err => {
      if (err) return res.status(500).send('Unable to save student.');
      res.status(200).send('Student registered successfully.');
    });
  });
});

// === Update Student Profile ===
app.post('/update-student', upload.single('profilePic'), (req, res) => {
  const { admission_no, newPassword, name, grade, section } = req.body;
  const filePath = path.join(__dirname, 'login/student-teacher/student-login-detail.json');

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Unable to read student file.');
    let students;
    try {
      students = JSON.parse(data);
    } catch {
      return res.status(500).send('Invalid JSON.');
    }

    const index = students.findIndex(s => s.admission_no === admission_no);
    if (index === -1) return res.status(404).send('Student not found.');

    if (newPassword) students[index].password = newPassword;

    if (req.file) {
      const imgPath = path.join('Student details', grade, section, name, 'profile.jpg');
      students[index].profilePic = '/' + imgPath.replace(/\\/g, '/');
    }

    fs.writeFile(filePath, JSON.stringify(students, null, 2), err => {
      if (err) return res.status(500).send('Failed to update student.');
      res.status(200).json(students[index]);
    });
  });
});

// === Serve Student Homepage (Intro Page) ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login', 'login-intro-vid', 'index.html'));
});

// === Serve 7th Books Page ===
app.get('/7th-books', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'student', 'grade-7', 'books', 'g-7-book.html'));
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
