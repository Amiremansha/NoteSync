import "./Login.css";
import "./Mobile_Opt/LoginMobile.css";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import logo from "../assets/logo.svg";
import loging2 from "../assets/login2.png";

const GMAIL_SUFFIX = "@gmail.com";
const INVALID_EMAIL_MESSAGE = "Invalid email format";
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getOAuthRedirectUrl() {
  const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();

  if (configuredAppUrl) {
    return new URL("/", configuredAppUrl).toString();
  }

  return new URL("/", window.location.origin).toString();
}

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

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session && isMounted) {
        navigate("/home");
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate("/home");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleEmailKeyDown = (e) => {
    if (e.key !== "Enter") return;

    const normalizedEmail = normalizeGmailEmail(email);
    if (normalizedEmail !== email) {
      e.preventDefault();
      setEmail(normalizedEmail);
    }
  };

  const handleLogin = async (e) => {
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

    setPasswordLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setPasswordLoading(false);
      return;
    }

    navigate("/home");
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg("");

    if (isMobileBrowser() && LOCALHOST_HOSTS.has(window.location.hostname)) {
      setErrorMsg(
        "Open this app on your phone using your laptop's Wi-Fi IP, not localhost. Example: http://192.168.x.x:3000"
      );
      setGoogleLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getOAuthRedirectUrl(),
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setGoogleLoading(false);
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
        <form
          className="form-box"
          onSubmit={handleLogin}
          aria-labelledby="loginTitle"
        >
          <h2 id="loginTitle" className="title">
            Welcome Back
          </h2>

          <input
            className="input"
            placeholder="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleEmailKeyDown}
            required
          />

          <div className="password-row">
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Link className="forgot" to="#">
              Forgot Password?
            </Link>
          </div>

          {errorMsg && <p className="auth-error">{errorMsg}</p>}

          <button
            className="primary-btn"
            disabled={passwordLoading || googleLoading}
          >
            {passwordLoading ? "Logging in..." : "Log In"}
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleGoogleLogin}
            disabled={passwordLoading || googleLoading}
          >
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          <p className="signup-line">
            Don't have an account? <Link to="/signup">Sign Up</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
