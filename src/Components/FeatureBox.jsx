import "./FeatureBox.css";
import "./Mobile_Opt/FeatureBoxMobile.css";
import archiveIcon from "../assets/archive.svg";

const TAGS = [
  { name: "Red", tone: "red" },
  { name: "Orange", tone: "orange" },
  { name: "Yellow", tone: "yellow" },
  { name: "Green", tone: "green" },
  { name: "Blue", tone: "blue" },
  { name: "Purple", tone: "purple" },
  { name: "Gray", tone: "gray" },
];

export default function FeatureBox({
  activeFilter = "all",
  activeTag = "",
  onSelectFilter = () => {},
  onSelectTag = () => {},
}) {
  return (
    <nav className="feature-box" aria-label="Quick actions">
      <button
        className={`feature-item${activeFilter === "all" && !activeTag ? " is-active" : ""}`}
        type="button"
        onClick={() => onSelectFilter("all")}
      >
        <svg
          className="feature-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        <span className="feature-label">All Notes</span>
      </button>

      <button
        className={`feature-item${activeFilter === "reminders" ? " is-active" : ""}`}
        type="button"
        onClick={() => onSelectFilter("reminders")}
      >
        <svg
          className="feature-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.59 14.86V10.09A8.6 8.6 0 0 0 12 1.5 8.6 8.6 0 0 0 3.41 10.09v4.77L1.5 16.77v1.91h21V16.77Z" />
          <path d="M14.69 18.68a2.55 2.55 0 0 1 .17 1 2.86 2.86 0 0 1-5.72 0 2.55 2.55 0 0 1 .17-1" />
        </svg>
        <span className="feature-label">Reminders</span>
      </button>

      <button
        className={`feature-item${activeFilter === "archived" ? " is-active" : ""}`}
        type="button"
        onClick={() => onSelectFilter("archived")}
      >
        <img
          src={archiveIcon}
          alt=""
          className="feature-icon feature-icon-asset"
          aria-hidden="true"
        />
        <span className="feature-label">Archive</span>
      </button>

      <div className="tag-container">
        <div className="feature-item tag-title">
          <svg className="feature-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
          </svg>
          <span className="feature-label">Tags</span>
        </div>

        <div className="tag-divider" />

        <div className="tag-list" role="list" aria-label="Tag colors">
          {TAGS.map((tag) => (
            <button
              key={tag.tone}
              className={`tag-item${activeTag === tag.tone ? " is-active" : ""}`}
              type="button"
              onClick={() => onSelectTag(tag.tone)}
            >
              <svg
                className={`tag-svg tag-tone-${tag.tone}`}
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="6" />
              </svg>
              <span className="tag-text">{tag.name}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
