const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
const port = 3000;

// Initialize Supabase
const supabaseUrl = 'https://mdfgthpblsgrmvesgzwt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZmd0aHBibHNncm12ZXNnend0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NDIyOTYsImV4cCI6MjA2MjIxODI5Nn0.a5nlKgTfO5LZcceKRRrx8dOskVKQd3WPJP43gJOTsdw';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Ensure the necessary directories exist
const dirPath = path.join(__dirname, 'login', 'student-teacher');
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// Serve static files (e.g., HTML, CSS, JS)
app.use(express.static('public'));

// Student registration endpoint
app.post('/register', async (req, res) => {
  const { admission_no, registration_no, name, email, phone, grade, section, password } = req.body;

  // Check for required fields
  if (!admission_no || !registration_no || !name || !email || !phone || !grade || !section || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Step 1: Create Auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          grade,
          section,
          user_type: 'student'
        },
        emailRedirectTo: `${req.protocol}://${req.get('host')}/student-login.html`
      }
    });

    if (authError) throw authError;

    // Step 2: Insert student details into Supabase table
    const { error: profileError } = await supabase.from('students').insert([{
      admission_no,
      registration_no,
      name,
      email,
      phone,
      grade,
      section,
      user_id: authData.user.id
    }]);

    if (profileError) throw profileError;

    // Success: Respond with a success message
    res.status(200).json({ message: 'Registration successful! Please check your email for verification.' });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: error.message || 'Registration failed. Please try again.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
