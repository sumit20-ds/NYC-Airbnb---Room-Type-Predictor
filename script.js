// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------
// Point this at wherever `uvicorn main:app` is running.
const API_BASE_URL = "https://nyc-airbnb-room-type-predictor-1ksi.onrender.com";

// The API only returns a probability array, not labelled classes.
// scikit-learn classifiers expose `.classes_` in sorted order, and for
// the NYC Airbnb dataset this model is built on, that sorts to the
// three room types below. If your model's classes_ order differs,
// reorder this array to match.
const ROOM_TYPE_LABELS = ["Entire home/apt", "Private room", "Shared room"];

const ROOM_TYPE_COLORS = {
  "Entire home/apt": "var(--class-entire)",
  "Private room": "var(--class-private)",
  "Shared room": "var(--class-shared)",
};

const SAMPLE_LISTING = {
  latitude: 40.7128,
  longitude: -74.006,
  price: 145,
  minimum_nights: 3,
  number_of_reviews: 42,
  reviews_per_month: 1.8,
  calculated_host_listings_count: 2,
  availability_365: 210,
  neighbourhood_group: "Manhattan",
  neighbourhood: "Chelsea",
};

// ----------------------------------------------------------------
// Elements
// ----------------------------------------------------------------
const form = document.getElementById("predictForm");
const predictBtn = document.getElementById("predictBtn");
const formError = document.getElementById("formError");
const fillSampleBtn = document.getElementById("fillSample");

const availabilityInput = document.getElementById("availability_365");
const availabilityValue = document.getElementById("availabilityValue");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const resultEmpty = document.getElementById("resultEmpty");
const resultCard = document.getElementById("resultCard");
const resultType = document.getElementById("resultType");
const resultConfidence = document.getElementById("resultConfidence");
const barsContainer = document.getElementById("bars");
const rawOutput = document.getElementById("rawOutput");

// ----------------------------------------------------------------
// Small UI wiring
// ----------------------------------------------------------------
availabilityInput.addEventListener("input", () => {
  availabilityValue.textContent = `${availabilityInput.value} days`;
});

fillSampleBtn.addEventListener("click", () => {
  Object.entries(SAMPLE_LISTING).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
  availabilityValue.textContent = `${SAMPLE_LISTING.availability_365} days`;
  formError.textContent = "";
});

// ----------------------------------------------------------------
// API status check
// ----------------------------------------------------------------
async function checkApiStatus() {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { method: "GET" });
    if (res.ok) {
      statusDot.className = "dot online";
      statusText.textContent = "Model online";
    } else {
      throw new Error("Non-200 response");
    }
  } catch (err) {
    statusDot.className = "dot offline";
    statusText.textContent = "Model unreachable";
  }
}
checkApiStatus();

// ----------------------------------------------------------------
// Form submit -> predict
// ----------------------------------------------------------------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  if (!form.reportValidity()) return;

  const formData = new FormData(form);

  const payload = {
    latitude: parseFloat(formData.get("latitude")),
    longitude: parseFloat(formData.get("longitude")),
    price: parseFloat(formData.get("price")),
    minimum_nights: parseInt(formData.get("minimum_nights"), 10),
    number_of_reviews: parseInt(formData.get("number_of_reviews"), 10),
    reviews_per_month: parseFloat(formData.get("reviews_per_month")),
    calculated_host_listings_count: parseInt(
      formData.get("calculated_host_listings_count"),
      10
    ),
    availability_365: parseInt(formData.get("availability_365"), 10),
    neighbourhood_group: formData.get("neighbourhood_group"),
    neighbourhood: formData.get("neighbourhood").trim(),
  };

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.detail
        ? formatApiError(body.detail)
        : `Request failed (${res.status})`;
      throw new Error(message);
    }

    const data = await res.json();
    renderResult(data);
    statusDot.className = "dot online";
    statusText.textContent = "Model online";
  } catch (err) {
    formError.textContent = err.message || "Something went wrong reaching the model.";
    if (err.message && err.message.includes("fetch")) {
      statusDot.className = "dot offline";
      statusText.textContent = "Model unreachable";
    }
  } finally {
    setLoading(false);
  }
});

function formatApiError(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`)
      .join(" · ");
  }
  return String(detail);
}

function setLoading(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtn.classList.toggle("loading", isLoading);
}

// ----------------------------------------------------------------
// Render result
// ----------------------------------------------------------------
function renderResult(data) {
  const predicted = data.Predicted_room_type ?? data.predicted_room_type ?? "Unknown";
  const probabilities = data.Probability ?? data.probability ?? [];

  resultEmpty.hidden = true;
  resultCard.hidden = false;
  // restart the reveal animation
  resultCard.style.animation = "none";
  // eslint-disable-next-line no-unused-expressions
  resultCard.offsetHeight;
  resultCard.style.animation = "";

  resultType.textContent = predicted;

  const topProb = Math.max(...probabilities, 0);
  resultConfidence.textContent = probabilities.length
    ? `${Math.round(topProb * 100)}% confidence`
    : "Confidence unavailable";

  barsContainer.innerHTML = "";
  probabilities.forEach((prob, i) => {
    const label = ROOM_TYPE_LABELS[i] ?? `Class ${i}`;
    const color = ROOM_TYPE_COLORS[label] ?? "var(--accent)";
    const pct = Math.round(prob * 100);

    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">
        <span>${label}</span>
        <span class="pct">${pct}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="background:${color}"></div>
      </div>
    `;
    barsContainer.appendChild(row);

    // animate after insertion
    requestAnimationFrame(() => {
      const fill = row.querySelector(".bar-fill");
      requestAnimationFrame(() => {
        fill.style.width = `${pct}%`;
      });
    });
  });

  rawOutput.textContent = JSON.stringify(data, null, 2);
}
