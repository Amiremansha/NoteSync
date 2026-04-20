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

const EyeOpenIcon = ({ className = "password-eye-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 9.75C10.755 9.75 9.75 10.755 9.75 12C9.75 13.245 10.755 14.25 12 14.25C13.245 14.25 14.25 13.245 14.25 12C14.25 10.755 13.245 9.75 12 9.75ZM8.25 12C8.25 9.92657 9.92657 8.25 12 8.25C14.0734 8.25 15.75 9.92657 15.75 12C15.75 14.0734 14.0734 15.75 12 15.75C9.92657 15.75 8.25 14.0734 8.25 12Z"
      fill="currentColor"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.28282 9.27342C4.69299 5.94267 8.19618 3.96997 12.0001 3.96997C15.8042 3.96997 19.3075 5.94286 21.7177 9.27392C22.2793 10.0479 22.5351 11.0421 22.5351 11.995C22.5351 12.948 22.2792 13.9424 21.7174 14.7165C19.3072 18.0473 15.804 20.02 12.0001 20.02C8.19599 20.02 4.69264 18.0471 2.28246 14.716C1.7209 13.942 1.46509 12.9478 1.46509 11.995C1.46509 11.0419 1.721 10.0475 2.28282 9.27342ZM12.0001 5.46997C8.74418 5.46997 5.66753 7.15436 3.49771 10.1532L3.497 10.1542C3.15906 10.6197 2.96509 11.2866 2.96509 11.995C2.96509 12.7033 3.15906 13.3703 3.497 13.8357L3.49771 13.8367C5.66753 16.8356 8.74418 18.52 12.0001 18.52C15.256 18.52 18.3326 16.8356 20.5025 13.8367L20.5032 13.8357C20.8411 13.3703 21.0351 12.7033 21.0351 11.995C21.0351 11.2866 20.8411 10.6197 20.5032 10.1542L20.5025 10.1532C18.3326 7.15436 15.256 5.46997 12.0001 5.46997Z"
      fill="currentColor"
    />
  </svg>
);

const EyeClosedIcon = ({ className = "password-eye-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M15.6487 5.39489C14.4859 4.95254 13.2582 4.72021 12 4.72021C8.46997 4.72021 5.17997 6.54885 2.88997 9.71381C1.98997 10.9534 1.98997 13.037 2.88997 14.2766C3.34474 14.9051 3.83895 15.481 4.36664 16.0002"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.3248 7.69653C19.9692 8.28964 20.5676 8.96425 21.11 9.71381C22.01 10.9534 22.01 13.037 21.11 14.2766C18.82 17.4416 15.53 19.2702 12 19.2702C10.6143 19.2702 9.26561 18.9884 7.99988 18.4547"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 12C15 13.6592 13.6592 15 12 15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.0996 9.85541C13.5589 9.32599 12.8181 9 12 9C10.3408 9 9 10.3408 9 12C9 12.7293 9.25906 13.3971 9.69035 13.9166"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 21.0002L22 2.7002"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export default function SignUp() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
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
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <div className="password-actions">
                <button
                  type="button"
                  className="password-visibility-btn"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                >
                  {isPasswordVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>

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
          </div>

          <div className="password-input-wrap">
            <input
              className={`input password-input confirm-password-input ${confirmPasswordClass}`}
              placeholder="Confirm Password"
              type={isConfirmPasswordVisible ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div className="password-actions password-actions-single">
              <button
                type="button"
                className="password-visibility-btn"
                onClick={() => setIsConfirmPasswordVisible((prev) => !prev)}
                aria-label={isConfirmPasswordVisible ? "Hide password" : "Show password"}
                aria-pressed={isConfirmPasswordVisible}
              >
                {isConfirmPasswordVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
          </div>

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
