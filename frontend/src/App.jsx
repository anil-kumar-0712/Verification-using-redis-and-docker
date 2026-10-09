import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000/api";

function App() {
  const [activeTab, setActiveTab] = useState("register");

  // Registration Form State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState(null);

  // OTP Verification State
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyOtp, setVerifyOtp] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendResult, setResendResult] = useState(null);

  // Countdown timer state for resend cooldown (60s)
  const [timeLeft, setTimeLeft] = useState(0);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginResult, setLoginResult] = useState(null);

  // User & Auth State
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem("token") || "");

  useEffect(() => {
    if (authToken) {
      fetchUserProfile(authToken);
    }
  }, []);

  // Timer ticker for resend button cooldown
  useEffect(() => {
    if (timeLeft <= 0) return;
    const intervalId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [timeLeft]);

  const fetchUserProfile = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setActiveTab("dashboard");
      } else {
        localStorage.removeItem("token");
        setAuthToken("");
        setUser(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);

    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: regEmail,
          phoneNumber,
          address,
          password: regPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        setVerifyEmail(data.email || regEmail);
        setTimeLeft(180);
        // Instant redirect to Tab 2 (OTP Verification)
        setActiveTab("verify");
      } else {
        setRegError(data.message || "Registration failed");
      }
    } catch (err) {
      setRegError("Network error. Is backend server running?");
    } finally {
      setRegLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const targetEmail = verifyEmail || regEmail;
    if (!targetEmail) {
      setResendResult({ success: false, message: "Please enter your email address to resend OTP." });
      return;
    }

    setResendLoading(true);
    setResendResult(null);

    try {
      const res = await fetch(`${API_BASE}/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: targetEmail.trim(),
          phoneNumber,
          address,
          password: regPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        setResendResult({ success: true, message: data.message });
        setTimeLeft(180);
        setVerifyOtp("");
      } else {
        setResendResult({ success: false, message: data.message || "Failed to resend OTP." });
      }
    } catch (err) {
      setResendResult({ success: false, message: "Network error while resending OTP." });
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!verifyEmail || !verifyOtp) {
      setVerifyError("Please enter your email address and 6-digit OTP code.");
      return;
    }

    setVerifyLoading(true);
    setVerifyError(null);

    try {
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail.trim(), otp: verifyOtp.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        setLoginEmail(verifyEmail);
        setLoginPassword(regPassword);
        // Instant redirect to Tab 3 (Login)
        setActiveTab("login");
      } else {
        setVerifyError(data.message || "OTP verification failed");
      }
    } catch (err) {
      setVerifyError("Network error during OTP verification.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginResult(null);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        setAuthToken(data.token);
        setUser(data.user);
        setLoginResult({ success: true, message: data.message });
        setActiveTab("dashboard");
      } else {
        setLoginResult({
          success: false,
          status: res.status,
          message: data.message || "Login failed"
        });
      }
    } catch (err) {
      setLoginResult({ success: false, message: "Network error during login." });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthToken("");
    setUser(null);
    setLoginResult(null);
    setActiveTab("login");
  };

  return (
    <div className="app-container">
      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === "register" ? "active" : ""}`}
          onClick={() => setActiveTab("register")}
        >
          1. Registration
        </button>
        <button
          className={`tab-btn ${activeTab === "verify" ? "active" : ""}`}
          onClick={() => setActiveTab("verify")}
        >
          2. OTP Verification
        </button>
        <button
          className={`tab-btn ${activeTab === "login" ? "active" : ""}`}
          onClick={() => setActiveTab("login")}
        >
          3. Login
        </button>
        {user && (
          <button
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            4. Profile ({user.firstName})
          </button>
        )}
      </nav>

      <main className="main-content">
        {/* TAB 1: REGISTRATION */}
        {activeTab === "register" && (
          <div className="card">
            <h2>Enter Details</h2>

            <form onSubmit={handleRegister} className="form-grid">
              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. +1 555-0199"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  placeholder="e.g. 123 Main Street"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn primary-btn" disabled={regLoading}>
                {regLoading ? "Registering..." : "Register"}
              </button>
            </form>

            {regError && (
              <div className="alert alert-danger">
                <p><strong>Error:</strong> {regError}</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: OTP VERIFICATION */}
        {activeTab === "verify" && (
          <div className="card">
            <h2>Enter OTP Code</h2>

            <form onSubmit={handleVerifyOtp} className="form-grid">
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="Your registered email"
                  value={verifyEmail}
                  onChange={(e) => setVerifyEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>6-Digit OTP Code</label>
                <input
                  type="text"
                  maxLength="6"
                  placeholder="Enter 6-digit OTP from email"
                  value={verifyOtp}
                  onChange={(e) => setVerifyOtp(e.target.value)}
                  className="otp-input"
                  required
                />
              </div>

              <div className="btn-action-group">
                <button
                  type="submit"
                  className="btn primary-btn"
                  style={{ flex: 2 }}
                  disabled={verifyLoading}
                >
                  {verifyLoading ? "Verifying OTP..." : "Verify OTP"}
                </button>

                <button
                  type="button"
                  className={`btn ${timeLeft === 0 ? "primary-btn highlight-btn" : "secondary-btn"}`}
                  style={{ flex: 1 }}
                  onClick={handleResendOtp}
                  disabled={resendLoading || timeLeft > 0}
                >
                  {resendLoading
                    ? "Sending..."
                    : timeLeft > 0
                    ? `Resend in ${timeLeft}s`
                    : "Resend OTP 🔄"}
                </button>
              </div>
            </form>

            {resendResult && (
              <div className={`alert ${resendResult.success ? "alert-success" : "alert-danger"}`} style={{ marginTop: "16px" }}>
                <p><strong>{resendResult.success ? "New OTP Sent!" : "Resend Error:"}</strong> {resendResult.message}</p>
              </div>
            )}

            {verifyError && (
              <div className="alert alert-danger" style={{ marginTop: "16px" }}>
                <p>{verifyError}</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LOGIN */}
        {activeTab === "login" && (
          <div className="card">
            <h2>Login</h2>

            <form onSubmit={handleLogin} className="form-grid">
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="Registered email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn primary-btn" disabled={loginLoading}>
                {loginLoading ? "Authenticating..." : "Log In"}
              </button>
            </form>

            {loginResult && (
              <div className={`alert ${loginResult.success ? "alert-success" : "alert-danger"}`}>
                <p><strong>{loginResult.success ? "Login Successful!" : loginResult.status === 403 ? "🔒 Unverified Account:" : "Login Error:"}</strong> {loginResult.message}</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DASHBOARD / PROFILE */}
        {activeTab === "dashboard" && user && (
          <div className="card dashboard-card">
            <div className="dashboard-header">
              <h2>User Profile</h2>
              <span className="verified-pill">Verified ✓</span>
            </div>

            <div className="profile-details">
              <div className="detail-item">
                <span className="label">First Name:</span>
                <span className="value">{user.firstName}</span>
              </div>
              <div className="detail-item">
                <span className="label">Last Name:</span>
                <span className="value">{user.lastName}</span>
              </div>
              <div className="detail-item">
                <span className="label">Email Address:</span>
                <span className="value">{user.email}</span>
              </div>
              <div className="detail-item">
                <span className="label">Phone Number:</span>
                <span className="value">{user.phoneNumber}</span>
              </div>
              <div className="detail-item">
                <span className="label">Address:</span>
                <span className="value">{user.address}</span>
              </div>
            </div>

            <div className="actions">
              <button onClick={handleLogout} className="btn danger-btn">
                Log Out
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
