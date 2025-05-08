const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const cors = require('cors');

// Initialize Supabase client
const supabaseUrl = 'https://mdfgthpblsgrmvesgzwt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZmd0aHBibHNncm12ZXNnend0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NDIyOTYsImV4cCI6MjA2MjIxODI5Nn0.a5nlKgTfO5LZcceKRRrx8dOskVKQd3WPJP43gJOTsdw';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Express app
const app = express();
const port = 3000;

// Middleware to parse form data and handle CORS
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Email Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ayistechcrew@gmail.com',
    pass: 'qgny whhr euzk wfoo', // Replace with actual password or environment variable
  }
});

// Ensure the necessary directories exist
const dirPath = path.join(__dirname, 'login', 'student-teacher');
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// Serve static files (e.g., HTML, CSS, JS)
app.use(express.static('public'));

// Teacher OTP Request (Generate OTP and send email)
app.post('/teacher/otp-request', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Generate OTP
    const otp = crypto.randomInt(100000, 999999); // Generate a 6-digit OTP

    // Save OTP and email mapping temporarily (You may want to use a database in a real application)
    // Store OTP in memory with a timeout for expiration
    const otpExpiration = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes
    fs.writeFileSync(path.join(dirPath, `${email}-otp.json`), JSON.stringify({ otp, expiration: otpExpiration }));

    // Send OTP email to teacher
    const mailOptions = {
      from: '"AYIS Tech Crew" <ayistechcrew@gmail.com>',
      to: email,
      subject: 'Your OTP for Login Verification',
      html: `<p>Dear Teacher,</p>
             <p>Your OTP is: <strong style="color:#ff9900;">${otp}</strong></p>
             <p>This OTP is valid for 10 minutes.</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to send OTP email' });
      }
      res.status(200).json({ message: 'OTP sent successfully to your email' });
    });

  } catch (error) {
    console.error('Error generating OTP:', error);
    res.status(500).json({ error: 'Error processing OTP request' });
  }
});

// Teacher OTP Validation (Check if OTP is correct and valid)
app.post('/teacher/otp-validate', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Check if OTP exists for the given email
    const otpData = JSON.parse(fs.readFileSync(path.join(dirPath, `${email}-otp.json`), 'utf8'));

    if (!otpData) {
      return res.status(400).json({ error: 'No OTP generated for this email' });
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiration) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Validate the OTP
    if (otp !== otpData.otp.toString()) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // If OTP is valid, login the teacher (you can also redirect them to a dashboard or issue a token)
    res.status(200).json({ message: 'OTP validated successfully. Teacher logged in.' });

  } catch (error) {
    console.error('Error validating OTP:', error);
    res.status(500).json({ error: 'Error processing OTP validation' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
