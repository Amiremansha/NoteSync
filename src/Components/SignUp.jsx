import "./SignUp.css";
import "./Mobile_Opt/SignUpMobile.css";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../supabaseClient";
import logo from "../assets/logo.svg";
import loging2 from "../assets/login2.png";

const GMAIL_SUFFIX = "@gmail.com";
const INVALID_EMAIL_MESSAGE = "Invalid email format";

const PASSWORD_RULES = [
  {
    key: "length",
    label: "At least 8 characters",
    test: (value) => value.length >= 8,
  },
  {
    key: "uppercase",
    label: "At least one uppercase letter (A-Z)",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    key: "lowercase",
    label: "At least one lowercase letter (a-z)",
    test: (value) => /[a-z]/.test(value),
  },
  {
    key: "number",
    label: "At least one number (0-9)",
    test: (value) => /[0-9]/.test(value),
  },
  {
    key: "special",
    label: "At least one special character (!@#$...)",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

const evaluatePasswordRules = (value) =>
  PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(value),
  }));

const getPasswordStrengthLabel = (value, passedRuleCount) => {
  if (!value) return "";
  if (passedRuleCount <= 2) return "Low";
  if (passedRuleCount <= 4) return "Medium";
  return "High";
};

const normalizeGmailEmail = (value) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  const atIndex = trimmedValue.indexOf("@");
  if (atIndex === -1) {
    return `${trimmedValue}${GMAIL_SUFFIX}`;
  }

  const localPart = trimmedValue.slice(0, atIndex).trim();
  if (!localPart) return trimmedValue;

  return `${localPart}${GMAIL_SUFFIX}`;
};

const isGmailAddress = (value) =>
  /^[^\s@]+@gmail\.com$/i.test(value.trim());

export default function SignUp() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const ruleStates = evaluatePasswordRules(password);
  const passedRules = ruleStates.filter((rule) => rule.passed).length;
  const passwordStrengthLabel = getPasswordStrengthLabel(password, passedRules);
  const passwordStrengthClass = passwordStrengthLabel
    ? `password-border-${passwordStrengthLabel.toLowerCase()}`
    : "";
  const passwordStrengthToneClass = passwordStrengthLabel
    ? `strength-tone-${passwordStrengthLabel.toLowerCase()}`
    : "";
  const isConfirmMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;
  const hasConfirmInput = password.length > 0 || confirmPassword.length > 0;
  const confirmPasswordClass = hasConfirmInput
    ? isConfirmMatch
      ? "confirm-match"
      : "confirm-mismatch"
    : "";

  const handleEmailKeyDown = (e) => {
    if (e.key !== "Enter") return;

    const normalizedEmail = normalizeGmailEmail(email);
    if (normalizedEmail !== email) {
      e.preventDefault();
      setEmail(normalizedEmail);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const normalizedEmail = normalizeGmailEmail(email);

    if (!isGmailAddress(normalizedEmail)) {
      setErrorMsg(INVALID_EMAIL_MESSAGE);
      return;
    }

    if (normalizedEmail !== email) {
      setEmail(normalizedEmail);
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match ❌");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          display_name: username,
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      alert("Account created successfully 🔥");
      navigate("/");
    }
  };

  return (
    <div className="auth-container">
      <aside className="auth-left" aria-hidden="true">
       <img src={logo} alt="NoteSync logo" className="left-logo" />
       <span className="Notesync">NoteSync</span>

       <img src={loging2} alt="Illustration" className="left-illustration" /> 
       <span className="left-tagline">Your notes,sync everywhere</span>

     </aside>

      <main className="auth-right">
        <form className="form-box" onSubmit={handleSignup}>
          <h2 className="title">Create Account</h2>

          <input
            className="input"
            placeholder="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <input
            className="input"
            placeholder="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleEmailKeyDown}
            required
          />

          <div className="password-field">
            <div className="password-input-wrap">
              <input
                className={`input password-input ${passwordStrengthClass}`}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {password && (
                <div className="password-help">
                  <button
                    type="button"
                    className="password-rules-btn"
                    aria-label="Show password rules"
                    title="Password rules"
                  >
                    ?
                  </button>
                  <div className="password-tooltip" role="tooltip">
                    <p
                      className={`password-tooltip-strength ${passwordStrengthToneClass}`}
                    >
                      {`Strength: ${passwordStrengthLabel}`}
                    </p>
                    <ul className="password-rules-list">
                      {ruleStates.map((rule) => (
                        <li
                          key={rule.key}
                          className={`password-rule-item ${
                            rule.passed ? "pass" : "fail"
                          }`}
                        >
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <input
            className={`input ${confirmPasswordClass}`}
            placeholder="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {errorMsg && <p className="auth-error">{errorMsg}</p>}

          <button className="primary-btn" disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>

          <p className="signup-line">
            Already have an account? <Link to="/">Log In</Link>
          </p>

        </form>
      </main>
    </div>
  );
}
