require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const redis = require("redis");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));

// 1. Connect to Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

// 2. User model for MongoDB Database
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// 3. Email Transporter for Gmail / SMTP
function createEmailTransporter() {
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // false for 587 STARTTLS
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

const transporter = createEmailTransporter();

// Helper function to send OTP email
async function sendOtpEmail(toEmail, firstName, otpCode) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[SMTP Note] No SMTP credentials provided. OTP for ${toEmail} stored in Redis.`);
    return { success: false, error: "SMTP credentials not configured in .env" };
  }

  try {
    const mailOptions = {
      from: `Verification App <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Your Email Verification OTP Code",
      text: `Hello ${firstName},\n\nYour 6-digit OTP verification code is: ${otpCode}\n\nPlease enter this code to complete your registration.\n\nThank you!`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0284c7;">Email Verification OTP</h2>
          <p>Hello <strong>${firstName}</strong>,</p>
          <p>Your verification OTP code for your account registration is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0284c7; padding: 12px 0; text-align: center; background: #f0f9ff; border-radius: 6px;">
            ${otpCode}
          </div>
          <p style="color: #64748b; font-size: 0.9em; margin-top: 15px;">Your pending details remain in Redis cache until email verification is complete.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Success] Sent OTP ${otpCode} to ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true, info };
  } catch (err) {
    console.error(`[SMTP Error] Failed to send email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Health check endpoint
app.get("/api/health", async (req, res) => {
  res.json({
    status: "ok",
    message: "Backend is running",
    mongodb: mongoose.connection.readyState === 1,
    redis: redisClient.isReady
  });
});

// 4. Register API
// Workflow Step 1 & 2: User details (firstName, lastName, email, phoneNumber, address, password, otp) are stored in REDIS until verification.
app.post("/api/register", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, address, password } = req.body;

    if (
      typeof firstName !== "string" || !firstName.trim() ||
      typeof lastName !== "string" || !lastName.trim() ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof phoneNumber !== "string" || !phoneNumber.trim() ||
      typeof address !== "string" || !address.trim() ||
      typeof password !== "string" || password.length < 6
    ) {
      return res.status(400).json({
        message: "Please fill all required fields (First Name, Last Name, Valid Email, Phone Number, Address, Password >= 6 chars)."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists in MongoDB database
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email address already exists in Database."
      });
    }

    // Generate 6-digit OTP code
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash password before saving to Redis
    const hashedPassword = await bcrypt.hash(password, 12);

    const pendingData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
      password: hashedPassword,
      rawPassword: password,
      otp: otp
    };

    // Store user details in Redis until email is verified (3-minute expiration)
    const redisKey = `pending-otp:${normalizedEmail}`;
    await redisClient.set(redisKey, JSON.stringify(pendingData), { EX: 180 });

    console.log(`[REDIS] Stored pending registration details & OTP in Redis for ${normalizedEmail} (Waiting for verification)`);

    // Send OTP email
    const emailRes = await sendOtpEmail(normalizedEmail, pendingData.firstName, otp);

    return res.status(201).json({
      message: emailRes.success
        ? `Registration details stored in Redis! An OTP code has been sent to ${normalizedEmail}.`
        : `Registration details stored in Redis! ${emailRes.error ? "(SMTP Warning: " + emailRes.error + ")" : ""}`,
      email: normalizedEmail,
      emailSent: emailRes.success,
      emailError: emailRes.error || null
    });
  } catch (error) {
    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Registration failed. " + error.message
    });
  }
});

// 5. Resend OTP API
// Updates OTP in Redis and sends a new OTP email
app.post("/api/resend-otp", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, address, password } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "Email address is required to resend OTP."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const redisKey = `pending-otp:${normalizedEmail}`;

    const pendingRaw = await redisClient.get(redisKey);
    let pendingData;

    if (pendingRaw) {
      pendingData = JSON.parse(pendingRaw);
    } else if (firstName && lastName && password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      pendingData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phoneNumber: (phoneNumber || "").trim(),
        address: (address || "").trim(),
        password: hashedPassword,
        rawPassword: password
      };
    } else {
      return res.status(400).json({
        message: "Invalid User"
      });
    }

    // Generate NEW 6-digit OTP code
    const newOtp = crypto.randomInt(100000, 999999).toString();
    pendingData.otp = newOtp;

    // Update pending details & new OTP in Redis (reset 3-minute expiration)
    await redisClient.set(redisKey, JSON.stringify(pendingData), { EX: 180 });

    console.log(`[REDIS] Updated OTP ${newOtp} in Redis for ${normalizedEmail}`);

    const emailRes = await sendOtpEmail(normalizedEmail, pendingData.firstName, newOtp);

    return res.json({
      message: emailRes.success
        ? `A new 6-digit OTP code has been sent to ${normalizedEmail}.`
        : `New OTP generated in Redis! ${emailRes.error ? "(SMTP Warning: " + emailRes.error + ")" : ""}`,
      email: normalizedEmail,
      emailSent: emailRes.success
    });
  } catch (error) {
    console.error("Resend OTP error:", error.message);
    return res.status(500).json({
      message: "Failed to resend OTP. " + error.message
    });
  }
});

// 6. Verify OTP API
// Workflow Step 3: User verifies OTP. Details are retrieved from Redis, stored permanently in MongoDB, and purged from Redis.
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp || typeof email !== "string" || typeof otp !== "string") {
      return res.status(400).json({
        message: "Email address and 6-digit OTP code are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const redisKey = `pending-otp:${normalizedEmail}`;

    // Get pending registration details from Redis
    const pendingRaw = await redisClient.get(redisKey);

    if (!pendingRaw) {
      return res.status(400).json({
        message: "Invalid User"
      });
    }

    const pendingData = JSON.parse(pendingRaw);

    // Validate submitted OTP against OTP stored in Redis
    if (String(pendingData.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        message: "Invalid OTP code. Please check your email and enter the correct 6-digit code."
      });
    }

    // OTP VERIFIED! Transfer user details from Redis into MongoDB Database
    const user = new User({
      firstName: pendingData.firstName,
      lastName: pendingData.lastName,
      email: pendingData.email,
      phoneNumber: pendingData.phoneNumber,
      address: pendingData.address,
      password: pendingData.password,
      verified: true
    });

    await user.save();

    // REMOVE temporary pending record from Redis after MongoDB save
    await redisClient.del(redisKey);

    console.log(`[MONGODB] User ${normalizedEmail} (${pendingData.firstName} ${pendingData.lastName}) verified via OTP and stored in MongoDB database.`);

    return res.json({
      message: "Email verified successfully! User details (First Name, Last Name, Email, Phone Number, Address) stored in MongoDB database. You can now log in.",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address
      }
    });
  } catch (error) {
    console.error("OTP Verification error:", error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "This email address is already verified in MongoDB. Please log in."
      });
    }

    return res.status(500).json({
      message: "OTP verification failed. " + error.message
    });
  }
});

// 7. Login API (Verified MongoDB Users Only)
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (!user.verified) {
      return res.status(403).json({
        message: "Access Denied: Please verify your OTP before logging in."
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_key_12345";
    const accessToken = jwt.sign(
      { userId: user._id.toString() },
      jwtSecret,
      { expiresIn: "1h" }
    );

    return res.json({
      message: `Welcome back, ${user.firstName}!`,
      token: accessToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        verified: user.verified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Login failed. Please try again."
    });
  }
});

// 8. Profile API
app.get("/api/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized. Token missing." });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_key_12345";
    const decoded = jwt.verify(token, jwtSecret);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found in MongoDB." });
    }

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        verified: user.verified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session token." });
  }
});

// Start server
async function startServer() {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/emailapp";
  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB Database");

  console.log("Connecting to Redis...");
  await redisClient.connect();
  console.log("Connected to Redis Cache");

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
