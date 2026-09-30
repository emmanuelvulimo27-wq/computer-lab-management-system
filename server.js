const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const nodemailer = require('nodemailer'); // Optional: npm install nodemailer

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== MONGODB CONNECTION ==========
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://emmanuelvulimo27_db_user:Lab1234567@cluster0.jbvtpfa.mongodb.net/complab?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected - Lab System is now PERMANENT!');
    ensureAdmin();
  })
  .catch(err => console.log('MongoDB Error:', err));

// ========== MODELS ==========
const userSchema = new mongoose.Schema({
  regNumber: { type: String, unique: true },
  name: String,
  email: String,
  password: String,
  role: String,
  status: String,
  failedAttempts: { type: Number, default: 0 }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const labSchema = new mongoose.Schema({
  labID: { type: Number, unique: true },
  labName: String,
  capacity: Number
}, { timestamps: true });
const Lab = mongoose.model('Lab', labSchema);

const equipmentSchema = new mongoose.Schema({
  equipmentID: { type: Number, unique: true },
  labID: String,
  name: String,
  serialNo: String,
  status: String,
  technicianReg: String,
  conditionSummary: String
}, { timestamps: true });
const Equipment = mongoose.model('Equipment', equipmentSchema);

const bookingSchema = new mongoose.Schema({
  bookingID: { type: Number, unique: true },
  regNumber: String,
  email: String,
  labID: String,
  purpose: String,
  bookingDate: String,
  finishTime: String,
  status: { type: String, default: 'Pending' }
}, { timestamps: true });
const Booking = mongoose.model('Booking', bookingSchema);

// ========== EMAIL TRANSPORTER CONFIG (Optional Mock/Nodemailer) ==========
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'labsystem@support.com',
    pass: process.env.EMAIL_PASS || 'mockpassword'
  }
});

async function sendEmailNotification(toEmail, subject, textMessage) {
  if (!toEmail) return;
  try {
    // If real credentials aren't set, this will safely log instead of crashing
    console.log(`[Email Notification] To: ${toEmail} | Subject: ${subject} | Message: ${textMessage}`);
  } catch (err) {
    console.error('Email dispatch error:', err);
  }
}

// ========== ENSURE ADMIN ==========
async function ensureAdmin() {
  const adminExists = await User.findOne({ regNumber: 'COM/ADMIN/00' });
  if (!adminExists) {
    await User.create({
      regNumber: 'COM/ADMIN/00',
      name: 'System Administrator',
      email: 'admin@lab.com',
      password: 'admin123',
      role: 'Administrator',
      status: 'Approved',
      failedAttempts: 0
    });
    console.log('Default admin created: COM/ADMIN/00 / admin123');
  }
}

// ================= AUTH =================
app.post('/api/register', async (req, res) => {
  const { regNumber, name, email, password, role, passkey } = req.body;
  if (!regNumber || !name || !password || !role) {
    return res.status(400).json({ error: 'All required fields must be filled.' });
  }
  if ((role === 'Administrator' || role === 'Technician') && passkey !== 'Emmahlove@1') {
    return res.status(403).json({ error: 'Invalid staff private passkey.' });
  }
  const existingUser = await User.findOne({ regNumber });
  if (existingUser) {
    return res.status(400).json({ error: 'Registration number or username already exists.' });
  }
  const initialStatus = role === 'Student' ? 'Pending' : 'Approved';
  await User.create({ regNumber, name, email, password, role, status: initialStatus, failedAttempts: 0 });
  const msg = initialStatus === 'Pending' ? 'Registration submitted successfully! Pending administrator approval.' : 'Staff account registered successfully!';
  res.json({ message: msg });
});

app.post('/api/login', async (req, res) => {
  await ensureAdmin();
  const { regNumber, password } = req.body;
  const user = await User.findOne({ regNumber });
  if (!user) return res.status(400).json({ error: 'Account not found. Please register first.' });
  if (user.failedAttempts >= 3) {
    return res.status(403).json({ error: 'Account locked due to 3 failed attempts. Please contact Admin.' });
  }
  if (user.password !== password) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    await user.save();
    return res.status(400).json({ error: 'Incorrect password.' });
  }
  if (user.status !== 'Approved') {
    return res.status(403).json({ error: 'Your account is pending administrator approval.' });
  }
  user.failedAttempts = 0;
  await user.save();
  res.json({ message: 'Login successful!', user: { regNumber: user.regNumber, name: user.name, role: user.role, email: user.email } });
});

// ================= ADMIN & USER MANAGEMENT =================
app.get('/api/users/count', async (req, res) => {
  const usersList = await User.find();
  let stats = { total: usersList.length, students: 0, technicians: 0, admins: 0 };
  usersList.forEach(r => {
    if (r.role === 'Student') stats.students++;
    if (r.role === 'Technician') stats.technicians++;
    if (r.role === 'Administrator') stats.admins++;
  });
  res.json(stats);
});

app.get('/api/users', async (req, res) => {
  const usersList = await User.find();
  res.json(usersList);
});

app.post('/api/users/reset-password', async (req, res) => {
  const { regNumber, newPassword } = req.body;
  if (!regNumber || !newPassword) {
    return res.status(400).json({ error: 'RegNumber and newPassword required' });
  }
  const user = await User.findOne({ regNumber });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.password = newPassword;
  user.failedAttempts = 0;
  await user.save();
  res.json({ message: `Password for ${regNumber} reset successfully!` });
});

app.delete('/api/users/:regNumber', async (req, res) => {
  const reg = req.params.regNumber;
  if (reg === 'COM/ADMIN/00') return res.status(403).json({ error: 'Cannot delete main admin' });
  await User.deleteOne({ regNumber: reg });
  res.json({ message: 'User deleted' });
});

// ================= LABS (WITH REAL-TIME SEAT CALCULATION) =================
app.get('/api/labs', async (req, res) => {
  const labs = await Lab.find();
  const bookings = await Booking.find({ status: 'Approved' });
  
  // Calculate active seat usage per lab
  const enrichedLabs = labs.map(l => {
    const activeCount = bookings.filter(b => String(b.labID) === String(l.labID)).length;
    const capacityNum = Number(l.capacity) || 0;
    const availablePCs = Math.max(0, capacityNum - activeCount);
    return {
      ...l.toObject(),
      availablePCs,
      activeBookingsCount: activeCount
    };
  });
  res.json(enrichedLabs);
});

app.post('/api/labs', async (req, res) => {
  const { labName, capacity } = req.body;
  if (!labName || !capacity) return res.status(400).json({ error: 'Lab name and capacity are required.' });
  const newLab = await Lab.create({ labID: Date.now(), labName, capacity: Number(capacity) });
  res.json({ message: 'Lab uploaded successfully!', labID: newLab.labID });
});

app.delete('/api/labs/:labID', async (req, res) => {
  const labID = Number(req.params.labID);
  await Lab.deleteOne({ labID });
  res.json({ message: 'Lab removed successfully!' });
});

// ================= EQUIPMENT =================
app.get('/api/equipment', async (req, res) => { res.json(await Equipment.find()); });

app.post('/api/equipment/upload', async (req, res) => {
  const { labID, name, serialNo, status, technicianReg, conditionSummary } = req.body;
  await Equipment.create({ equipmentID: Date.now(), labID, name, serialNo, status, technicianReg, conditionSummary });
  res.json({ message: 'Faulty equipment record uploaded successfully!' });
});

app.post('/api/equipment/resolve', async (req, res) => {
  const equipmentID = Number(req.body.equipmentID);
  const eq = await Equipment.findOne({ equipmentID });
  if (!eq) return res.status(404).json({ error: 'Equipment record not found.' });
  eq.status = 'Operational';
  await eq.save();
  res.json({ message: 'Equipment marked as fixed/operational!' });
});

app.delete('/api/equipment/:equipmentID', async (req, res) => {
  const equipmentID = Number(req.params.equipmentID);
  await Equipment.deleteOne({ equipmentID });
  res.json({ message: 'Equipment maintenance report deleted.' });
});

// ================= BOOKINGS =================
app.get('/api/bookings', async (req, res) => {
  const { regNumber } = req.query;
  let bookings = await Booking.find();
  let labs = await Lab.find();
  let enriched = bookings.map(b => {
    const lab = labs.find(l => String(l.labID) === String(b.labID));
    return { ...b.toObject(), labName: lab ? lab.labName : 'Unknown Lab' };
  });
  if (regNumber) enriched = enriched.filter(b => b.regNumber === regNumber);
  res.json(enriched);
});

app.get('/api/bookings/all', async (req, res) => {
  let bookings = await Booking.find();
  let labs = await Lab.find();
  let enriched = bookings.map(b => {
    const lab = labs.find(l => String(l.labID) === String(b.labID));
    return { ...b.toObject(), labName: lab ? lab.labName : 'Unknown Lab' };
  });
  res.json(enriched);
});

app.post('/api/bookings', async (req, res) => {
  const { regNumber, email, labID, purpose, bookingDate, finishTime } = req.body;
  if (!regNumber) return res.status(400).json({ error: 'User registration number is missing. Please log in again.' });
  if (!labID) return res.status(400).json({ error: 'Lab ID is required.' });
  if (!purpose) return res.status(400).json({ error: 'Session purpose is required.' });
  if (!bookingDate || !finishTime) return res.status(400).json({ error: 'Start and finish times are required.' });

  await Booking.create({ bookingID: Date.now(), regNumber, email, labID, purpose, bookingDate, finishTime, status: 'Pending' });
  res.json({ message: 'Lab booking submitted successfully!' });
});

app.post('/api/bookings/approve', async (req, res) => {
  const bookingID = Number(req.body.bookingID);
  const booking = await Booking.findOne({ bookingID });
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  booking.status = 'Approved';
  await booking.save();

  // Send Email Notification
  if (booking.email) {
    sendEmailNotification(booking.email, 'Lab Booking Approved', `Your booking for purpose "${booking.purpose}" has been approved.`);
  }

  res.json({ message: 'Lab booking approved successfully!' });
});

app.delete('/api/bookings/:bookingID', async (req, res) => {
  const bookingID = Number(req.params.bookingID);
  await Booking.deleteOne({ bookingID });
  res.json({ message: 'Booking cancelled successfully.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}
module.exports = app;