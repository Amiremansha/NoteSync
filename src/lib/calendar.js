const pad = (value) => String(value).padStart(2, "0");

const DEFAULT_TIME = "12:00";

export const reminderDateToIso = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  const localDate = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(localDate.getTime())) return "";
  return localDate.toISOString();
};

export const reminderDateTimeToIso = (dateValue, timeValue) => {
  if (!dateValue) return "";

  const [hours = "12", minutes = "00"] = (timeValue || DEFAULT_TIME).split(":");
  const hh = pad(hours);
  const mm = pad(minutes);

  const parsed = new Date(`${dateValue}T${hh}:${mm}:00`);

  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
};

export const isoToReminderDate = (isoValue) => {
  if (!isoValue) {
    return "";
  }

  const parsedDate = new Date(isoValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return [
    parsedDate.getFullYear(),
    pad(parsedDate.getMonth() + 1),
    pad(parsedDate.getDate()),
  ].join("-");
};

export const isoToReminderTime = (isoValue) => {
  if (!isoValue) {
    return DEFAULT_TIME;
  }

  const parsedDate = new Date(isoValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return DEFAULT_TIME;
  }

  return `${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
};

export const isPastReminder = (value) => {
  if (!value) return false;

  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  const now = new Date();
  // Align to minute precision because the UI captures minutes only
  now.setSeconds(0, 0);

  return parsed.getTime() < now.getTime();
};

export const getCurrentReminderDateTime = () => {
  const now = new Date();
  // Align to the nearest minute so comparisons against "now" stay consistent
  now.setSeconds(0, 0);

  const isoValue = now.toISOString();
  const dateValue = isoToReminderDate(isoValue);
  const timeValue = isoToReminderTime(isoValue);

  return {
    isoValue,
    dateValue,
    timeValue,
    datetimeLocalValue: dateValue && timeValue ? `${dateValue}T${timeValue}` : "",
  };
};

export const formatReminderLabel = (isoValue) => {
  if (!isoValue) {
    return "";
  }

  const parsedDate = new Date(isoValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const buildGoogleCalendarUrl = ({ title = "", content = "", reminderAt = "" }) => {
  const dateValue = isoToReminderDate(reminderAt);

  if (!dateValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const startDate = `${year}${pad(month)}${pad(day)}`;
  const endDateObject = new Date(Date.UTC(year, month - 1, day + 1));
  const endDate = [
    endDateObject.getUTCFullYear(),
    pad(endDateObject.getUTCMonth() + 1),
    pad(endDateObject.getUTCDate()),
  ].join("");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title.trim() || "NoteSync reminder",
    details: content.trim() || "Created from NoteSync",
    dates: `${startDate}/${endDate}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
