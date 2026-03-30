const state = {
  currentStep: 0,
  answers: {}
};

let currentConfig = null;
let googleMapsReady = false;

/* =========================
   Tracking
========================= */

const TRACKING_URL = "https://script.google.com/macros/s/AKfycbwnkMTJGHoXqkuIIi3diKhq35Fkviz5p1RDuu-mWLbkh4Sl6FoR3IFbRMAiFexi0oEj/exec";
const CUSTOMER_ID = "benchcreative-removals";
const PAGE_ID = "removals";

function getRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || "";
}

const SOURCE_REF = getRefFromUrl();

function getSessionId() {
  let session = sessionStorage.getItem("estimatorSession");

  if (!session) {
    session = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem("estimatorSession", session);
  }

  return session;
}

function trackStep(stepName, value = "") {
  const params = new URLSearchParams({
    customer: CUSTOMER_ID,
    session: getSessionId(),
    step: stepName,
    page: PAGE_ID,
    value: value,
    ref: SOURCE_REF
  });

  const img = new Image();
  img.src = `${TRACKING_URL}?${params.toString()}`;
}

/* =========================
   Google Maps init
========================= */

window.initGoogleMapsAPI = function () {
  googleMapsReady = true;
  attachAutocompleteIfNeeded();
};

async function loadConfig(configPath) {
  const response = await fetch(configPath);
  if (!response.ok) {
    throw new Error("Could not load config file");
  }
  return await response.json();
}

function getVisibleStepCount() {
  if (!currentConfig) return 0;
  return currentConfig.steps.filter((step) => step.type !== "thank-you").length;
}

function getDisplayStepNumber() {
  if (!currentConfig) return 1;

  const visibleSteps = currentConfig.steps.filter((step) => step.type !== "thank-you");
  const currentStep = currentConfig.steps[state.currentStep];

  if (currentStep.type === "thank-you") {
    return visibleSteps.length;
  }

  return visibleSteps.findIndex((step) => step.id === currentStep.id) + 1;
}

function renderHeader() {
  return `
    <div class="qt-brand">
      <div class="qt-brand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1.5" y="8" width="11" height="8" rx="1.5"></rect>
          <path d="M12.5 10h4l2.5 2.5V16h-6.5z"></path>
          <circle cx="7" cy="18" r="1.8"></circle>
          <circle cx="17.5" cy="18" r="1.8"></circle>
        </svg>
      </div>
      <div class="qt-brand-copy">
        <div class="qt-brand-title">MoveEstimate</div>
        <div class="qt-brand-subtitle">Get your instant quote</div>
      </div>
    </div>
  `;
}

function renderSegmentProgress() {
  const currentStep = currentConfig.steps[state.currentStep];
  const visibleSteps = currentConfig.steps.filter((step) => step.type !== "thank-you");
  const activeIndex =
    currentStep.type === "thank-you"
      ? visibleSteps.length - 1
      : visibleSteps.findIndex((step) => step.id === currentStep.id);

  let segments = "";
  visibleSteps.forEach((_, index) => {
    const classes = [
      "qt-progress-segment",
      index < activeIndex ? "is-complete" : "",
      index === activeIndex ? "is-active" : ""
    ]
      .filter(Boolean)
      .join(" ");

    segments += `<div class="${classes}"></div>`;
  });

  return `<div class="qt-progress-segments">${segments}</div>`;
}

function renderTopChrome() {
  return `
    ${renderHeader()}
    ${renderSegmentProgress()}
  `;
}

function formatPropertySize(value) {
  const map = {
    studio_1_bed: "Studio / 1 Bedroom",
    "2_bed": "2 Bedroom",
    "3_bed": "3 Bedroom",
    "4_bed": "4 Bedroom",
    "5_plus": "5+ Bedroom"
  };
  return map[value] || value || "Not provided";
}

function getAddressLabel(answerKey) {
  const value = state.answers[answerKey];
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.label || "";
}

function getDistanceMilesText() {
  if (typeof state.answers.distance_miles !== "number") return "";
  return `${Math.round(state.answers.distance_miles)} miles`;
}

function getDistanceBandFromMiles(miles) {
  if (miles == null) return null;
  if (miles <= 10) return "band_0_10";
  if (miles <= 25) return "band_10_25";
  if (miles <= 50) return "band_25_50";
  if (miles <= 100) return "band_50_100";
  if (miles <= 150) return "band_100_150";
  return "band_150_plus";
}

function getLargeItemsCount() {
  return Number(state.answers.large_items || 0);
}

async function calculateRouteDistanceMiles() {
  const from = state.answers.moving_from;
  const to = state.answers.moving_to;

  if (!from || !to || !from.label || !to.label) return null;
  if (!window.google || !google.maps) return null;

  const { Route } = await google.maps.importLibrary("routes");

  const request = {
    origin: from.label,
    destination: to.label,
    travelMode: "DRIVING",
    fields: ["distanceMeters"]
  };

  const { routes } = await Route.computeRoutes(request);
  const distanceMeters = routes?.[0]?.distanceMeters;

  if (!distanceMeters) return null;
  return distanceMeters / 1609.344;
}

async function tryAutoAssignDistanceBand() {
  if (!state.answers.moving_from?.label || !state.answers.moving_to?.label) return;

  try {
    const miles = await calculateRouteDistanceMiles();
    if (miles != null) {
      state.answers.distance_miles = miles;
      state.answers.distance_band = getDistanceBandFromMiles(miles);
    }
  } catch (error) {
    console.error("Route calculation failed:", error);
  }
}

function calculateEstimate() {
  const pricing = currentConfig.pricing || {};
  const basePrices = pricing.basePrices || {};
  const distanceBands = pricing.distanceBands || {};
  const extrasPricing = pricing.extras || {};
  const accessPricing = pricing.access || {};
  const volumeAdjustments = pricing.volumeAdjustments || {};
  const rangePercent = pricing.rangePercent || 12;

  const propertySize = state.answers.property_size;
  const distanceBand = state.answers.distance_band;
  const selectedExtras = state.answers.extras || [];
  const accessValue = state.answers.access_type;

  let total = basePrices[propertySize] || 0;
  total += distanceBands[distanceBand]?.price || 0;
  total += accessPricing[accessValue] || 0;

  if (Array.isArray(selectedExtras)) {
    selectedExtras.forEach((extra) => {
      total += extrasPricing[extra] || 0;
    });
  }

  total += getLargeItemsCount() * (volumeAdjustments.largeItemUnit || 0);

  const min = Math.round(total * (1 - rangePercent / 100));
  const max = Math.round(total * (1 + rangePercent / 100));

  return { base: total, min, max };
}

function renderStepLabel() {
  return `<div class="qt-step-label">Step ${getDisplayStepNumber()} of ${getVisibleStepCount()}</div>`;
}

function renderPropertyIcon(value) {
  if (value === "studio_1_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 11.2L12 5.5l7 5.7"></path>
        <path d="M7 10.6V19h10v-8.4"></path>
        <path d="M10.2 19v-4.6h3.6V19"></path>
      </svg>
    `;
  }

  if (value === "2_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="7" y="3.5" width="10" height="17" rx="1.8"></rect>
        <path d="M10 7h1.2"></path>
        <path d="M10 10h1.2"></path>
        <path d="M10 13h1.2"></path>
        <path d="M5 8.5H7"></path>
        <path d="M5 12H7"></path>
        <path d="M5 15.5H7"></path>
      </svg>
    `;
  }

  if (value === "3_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5L12 4l9 6.5"></path>
        <path d="M5 9.5V20h14V9.5"></path>
        <path d="M9.5 20v-5h5v5"></path>
      </svg>
    `;
  }

  if (value === "4_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 11L12 4l10 7"></path>
        <path d="M4 10V20h16V10"></path>
        <path d="M9 20v-6h6v6"></path>
        <path d="M9 11h1.2"></path>
        <path d="M13.8 11H15"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 11.5L12 3.5l11 8"></path>
      <path d="M3 10V21h18V10"></path>
      <path d="M9 21v-7h6v7"></path>
      <path d="M9 10.5h1.2"></path>
      <path d="M13.8 10.5H15"></path>
      <path d="M9 14h1.2"></path>
      <path d="M13.8 14H15"></path>
    </svg>
  `;
}

function renderSingleSelect(step) {
  const options = step.options || [];
  const selected = state.answers[step.id];

  const cards = options.map((opt) => {
    const isSelected = selected === opt.value;
    return `
      <button
        class="qt-property-card${isSelected ? " is-selected" : ""}"
        data-value="${opt.value}"
        type="button"
      >
        <div class="qt-property-icon">
          ${renderPropertyIcon(opt.value)}
        </div>
        <div class="qt-property-label">${opt.label}</div>
      </button>
    `;
  }).join("");

  const hasSelection = !!selected;

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <div class="qt-body">
        ${renderStepLabel()}
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
        <div class="qt-property-grid">${cards}</div>
      </div>
      <div class="qt-footer">
        <button id="qt-back" class="qt-btn qt-btn--ghost" type="button" ${state.currentStep === 0 ? "disabled" : ""}>Back</button>
        <button id="qt-next" class="qt-btn qt-btn--primary" type="button" ${!hasSelection ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function renderAddresses(step) {
  const fromValue = getAddressLabel("moving_from");
  const toValue = getAddressLabel("moving_to");
  const isValid = fromValue.trim() && toValue.trim();

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <div class="qt-body">
        ${renderStepLabel()}
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
        <div class="qt-address-fields">
          <div class="qt-field">
            <label class="qt-label" for="qt-moving-from">Moving from</label>
            <input class="qt-input" id="qt-moving-from" type="text" placeholder="Town or postcode" value="${fromValue}" autocomplete="off" />
          </div>
          <div class="qt-field">
            <label class="qt-label" for="qt-moving-to">Moving to</label>
            <input class="qt-input" id="qt-moving-to" type="text" placeholder="Town or postcode" value="${toValue}" autocomplete="off" />
          </div>
        </div>
      </div>
      <div class="qt-footer">
        <button id="qt-back" class="qt-btn qt-btn--ghost" type="button">Back</button>
        <button id="qt-next" class="qt-btn qt-btn--primary" type="button" ${!isValid ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function isMoveDetailsValid() {
  const dateType = state.answers.move_date_type;
  const accessType = state.answers.access_type;

  if (!dateType || !accessType) return false;
  if (dateType === "exact" && !state.answers.exact_move_date) return false;
  if (dateType === "approx" && !state.answers.approx_move_month) return false;

  return true;
}

function renderMoveDetails(step) {
  const extras = step.extras || [];
  const sliders = step.sliders || [];
  const accessOptions = step.accessOptions || [];
  const dateOptions = step.dateOptions || [];

  const selectedExtras = state.answers.extras || [];
  const selectedAccess = state.answers.access_type || "";
  const selectedDateType = state.answers.move_date_type || "";
  const largeItems = state.answers.large_items ?? (sliders[0]?.default ?? 0);

  const extraButtons = extras.map((extra) => {
    const isSelected = selectedExtras.includes(extra.value);
    return `
      <button class="qt-extra-btn${isSelected ? " is-selected" : ""}" data-extra-value="${extra.value}" type="button">
        ${extra.label}
      </button>
    `;
  }).join("");

  const accessOptionsHtml = accessOptions.map((opt) =>
    `<option value="${opt.value}" ${selectedAccess === opt.value ? "selected" : ""}>${opt.label}</option>`
  ).join("");

  const dateButtons = dateOptions.map((opt) => {
    const isSelected = selectedDateType === opt.value;
    return `
      <button class="qt-date-btn${isSelected ? " is-selected" : ""}" data-date-type="${opt.value}" type="button">
        ${opt.label}
      </button>
    `;
  }).join("");

  const exactDateInput = selectedDateType === "exact"
    ? `<input class="qt-input qt-date-input" id="qt-exact-date" type="date" value="${state.answers.exact_move_date || ""}" />`
    : "";

  const approxMonthInput = selectedDateType === "approx"
    ? `<input class="qt-input qt-date-input" id="qt-approx-month" type="month" value="${state.answers.approx_move_month || ""}" />`
    : "";

  const sliderHtml = sliders.length > 0 ? `
    <div class="qt-field">
      <label class="qt-label">${sliders[0].label}</label>
      <div class="qt-slider-row">
        <input class="qt-slider" id="qt-large-items" type="range"
          min="${sliders[0].min}" max="${sliders[0].max}" step="${sliders[0].step}"
          value="${largeItems}" />
        <span class="qt-slider-value">${largeItems}</span>
      </div>
    </div>
  ` : "";

  const isValid = isMoveDetailsValid();

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <div class="qt-body">
        ${renderStepLabel()}
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
        <div class="qt-field">
          <label class="qt-label">Any extras?</label>
          <div class="qt-extras-grid">${extraButtons}</div>
        </div>
        <div class="qt-field">
          <label class="qt-label">Access type</label>
          <select class="qt-select" id="qt-access-select">
            <option value="">Select access type</option>
            ${accessOptionsHtml}
          </select>
        </div>
        <div class="qt-field">
          <label class="qt-label">Move date</label>
          <div class="qt-date-buttons">${dateButtons}</div>
          ${exactDateInput}
          ${approxMonthInput}
        </div>
        ${sliderHtml}
      </div>
      <div class="qt-footer">
        <button id="qt-back" class="qt-btn qt-btn--ghost" type="button">Back</button>
        <button id="qt-next" class="qt-btn qt-btn--primary" type="button" ${!isValid ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function renderEstimate(step) {
  const { min, max } = calculateEstimate();
  const distanceText = getDistanceMilesText();

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <div class="qt-body">
        ${renderStepLabel()}
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
        <div class="qt-estimate-card">
          <div class="qt-estimate-label">Estimated price range</div>
          <div class="qt-estimate-range">£${min.toLocaleString()} – £${max.toLocaleString()}</div>
          ${distanceText ? `<div class="qt-estimate-distance">${distanceText}</div>` : ""}
          <div class="qt-estimate-note">Price range only · Final quote confirmed after survey</div>
        </div>
      </div>
      <div class="qt-footer">
        <button id="qt-back" class="qt-btn qt-btn--ghost" type="button">Back</button>
        <button id="qt-next" class="qt-btn qt-btn--primary" type="button">Get my detailed quote</button>
      </div>
    </div>
  `;
}

function isContactValid() {
  const name = state.answers.contact_name || "";
  const phone = state.answers.contact_phone || "";
  const email = state.answers.contact_email || "";
  return name.trim() && phone.trim() && email.trim();
}

function renderContact(step) {
  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <div class="qt-body">
        ${renderStepLabel()}
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
        <div class="qt-contact-fields">
          <div class="qt-field">
            <label class="qt-label" for="qt-contact-name">Your name</label>
            <input class="qt-input" id="qt-contact-name" type="text" placeholder="Full name" value="${state.answers.contact_name || ""}" />
          </div>
          <div class="qt-field">
            <label class="qt-label" for="qt-contact-phone">Phone number</label>
            <input class="qt-input" id="qt-contact-phone" type="tel" placeholder="07700 000000" value="${state.answers.contact_phone || ""}" />
          </div>
          <div class="qt-field">
            <label class="qt-label" for="qt-contact-email">Email address</label>
            <input class="qt-input" id="qt-contact-email" type="email" placeholder="you@example.com" value="${state.answers.contact_email || ""}" />
          </div>
          <div class="qt-field">
            <label class="qt-label" for="qt-contact-notes">Anything else we should know? <span class="qt-optional">(optional)</span></label>
            <textarea class="qt-input qt-textarea" id="qt-contact-notes" placeholder="e.g. fragile items, parking notes...">${state.answers.contact_notes || ""}</textarea>
          </div>
        </div>
      </div>
      <div class="qt-footer">
        <button id="qt-back" class="qt-btn qt-btn--ghost" type="button">Back</button>
        <button id="qt-next" class="qt-btn qt-btn--primary" type="button" ${!isContactValid() ? "disabled" : ""}>Submit enquiry</button>
      </div>
    </div>
  `;
}

function renderThankYou(step) {
  return `
    <div class="qt-shell">
      ${renderHeader()}
      <div class="qt-body qt-body--centered">
        <div class="qt-thankyou-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 12.5l3 3 5-5.5"></path>
          </svg>
        </div>
        <div class="qt-heading">${step.title}</div>
        ${step.subtitle ? `<div class="qt-subheading">${step.subtitle}</div>` : ""}
      </div>
      <div class="qt-footer">
        <button id="qt-restart" class="qt-btn qt-btn--ghost" type="button">Start again</button>
      </div>
    </div>
  `;
}

function renderStep(step) {
  if (step.type === "single-select") return renderSingleSelect(step);
  if (step.type === "addresses") return renderAddresses(step);
  if (step.type === "move-details") return renderMoveDetails(step);
  if (step.type === "estimate") return renderEstimate(step);
  if (step.type === "contact") return renderContact(step);
  if (step.type === "thank-you") return renderThankYou(step);
  return `<div class="qt-shell"><p>Unknown step type: ${step.type}</p></div>`;
}

async function goToNextStep() {
  if (state.currentStep < currentConfig.steps.length - 1) {
    if (currentConfig.steps[state.currentStep].type === "addresses") {
      await tryAutoAssignDistanceBand();
    }
    state.currentStep++;
    renderCurrentStep();
  }
}

function goToPreviousStep() {
  if (state.currentStep > 0) {
    state.currentStep--;
    renderCurrentStep();
  }
}

function restartTool() {
  state.currentStep = 0;
  state.answers = {};
  renderCurrentStep();
}

function initAddressAutocomplete(inputId, answerKey, nextButton) {
  const input = document.getElementById(inputId);
  if (!input || !window.google || !google.maps || !google.maps.places) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "gb" },
    fields: ["formatted_address"]
  });

  autocomplete.addListener("place_changed", function () {
    const place = autocomplete.getPlace();
    const label = place.formatted_address || input.value;
    state.answers[answerKey] = { label };

    if (nextButton) {
      const other = answerKey === "moving_from"
        ? getAddressLabel("moving_to")
        : getAddressLabel("moving_from");
      nextButton.disabled = !(label && other);
    }
  });
}

function attachAutocompleteIfNeeded() {
  const fromInput = document.getElementById("qt-moving-from");
  const toInput = document.getElementById("qt-moving-to");
  const nextButton = document.getElementById("qt-next");

  if (fromInput) initAddressAutocomplete("qt-moving-from", "moving_from", nextButton);
  if (toInput) initAddressAutocomplete("qt-moving-to", "moving_to", nextButton);
}

function attachSingleSelectEvents(step) {
  const buttons = document.querySelectorAll(".qt-property-card");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  buttons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-value");
      state.answers[step.id] = value;
      trackStep("property_size_selected", value);
      renderCurrentStep();
    });
  });

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
  if (backButton && !backButton.disabled) backButton.addEventListener("click", goToPreviousStep);
}

function attachAddressesEvents() {
  const fromInput = document.getElementById("qt-moving-from");
  const toInput = document.getElementById("qt-moving-to");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  function updateState() {
    const fromValue = fromInput ? fromInput.value : "";
    const toValue = toInput ? toInput.value : "";

    if (typeof state.answers.moving_from !== "object") {
      state.answers.moving_from = fromValue;
    }
    if (typeof state.answers.moving_to !== "object") {
      state.answers.moving_to = toValue;
    }

    if (nextButton) {
      nextButton.disabled = !(fromValue.trim() && toValue.trim());
    }
  }

  if (fromInput) fromInput.addEventListener("input", updateState);
  if (toInput) toInput.addEventListener("input", updateState);

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
  if (backButton) backButton.addEventListener("click", goToPreviousStep);

  attachAutocompleteIfNeeded();
}

function attachMoveDetailsEvents() {
  const extraButtons = document.querySelectorAll("[data-extra-value]");
  const accessSelect = document.getElementById("qt-access-select");
  const dateButtons = document.querySelectorAll("[data-date-type]");
  const largeItemsInput = document.getElementById("qt-large-items");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  if (!Array.isArray(state.answers.extras)) {
    state.answers.extras = [];
  }

  extraButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-extra-value");
      let selectedValues = state.answers.extras || [];

      if (value === "none") {
        selectedValues = ["none"];
      } else {
        selectedValues = selectedValues.filter((item) => item !== "none");
        if (selectedValues.includes(value)) {
          selectedValues = selectedValues.filter((item) => item !== value);
        } else {
          selectedValues.push(value);
        }
      }

      state.answers.extras = selectedValues;
      trackStep("extras_updated", selectedValues.join(","));
      renderCurrentStep();
    });
  });

  if (accessSelect) {
    accessSelect.addEventListener("change", function () {
      state.answers.access_type = accessSelect.value;
      trackStep("access_selected", accessSelect.value);
      if (nextButton) nextButton.disabled = !isMoveDetailsValid();
    });
  }

  dateButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-date-type");
      state.answers.move_date_type = value;

      if (value !== "exact") state.answers.exact_move_date = "";
      if (value !== "approx") state.answers.approx_move_month = "";

      trackStep("date_type_selected", value);
      renderCurrentStep();
    });
  });

  const exactDateInput = document.getElementById("qt-exact-date");
  if (exactDateInput) {
    exactDateInput.addEventListener("input", function () {
      state.answers.exact_move_date = exactDateInput.value;
      if (nextButton) nextButton.disabled = !isMoveDetailsValid();
    });
  }

  const approxMonthInput = document.getElementById("qt-approx-month");
  if (approxMonthInput) {
    approxMonthInput.addEventListener("input", function () {
      state.answers.approx_move_month = approxMonthInput.value;
      if (nextButton) nextButton.disabled = !isMoveDetailsValid();
    });
  }

  if (largeItemsInput) {
    largeItemsInput.addEventListener("input", function () {
      state.answers.large_items = Number(largeItemsInput.value);
      const valueEl = largeItemsInput.closest(".qt-slider-row")?.querySelector(".qt-slider-value");
      if (valueEl) valueEl.textContent = largeItemsInput.value;
    });
  }

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
  if (backButton) backButton.addEventListener("click", goToPreviousStep);
}

function attachEstimateEvents() {
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  if (nextButton) {
    nextButton.addEventListener("click", function () {
      trackStep("result_cta_clicked", "get_my_detailed_quote");
      goToNextStep();
    });
  }

  if (backButton) backButton.addEventListener("click", goToPreviousStep);
}

function attachContactEvents() {
  const nameInput = document.getElementById("qt-contact-name");
  const phoneInput = document.getElementById("qt-contact-phone");
  const emailInput = document.getElementById("qt-contact-email");
  const notesInput = document.getElementById("qt-contact-notes");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  function updateContactState() {
    state.answers.contact_name = nameInput ? nameInput.value : "";
    state.answers.contact_phone = phoneInput ? phoneInput.value : "";
    state.answers.contact_email = emailInput ? emailInput.value : "";
    state.answers.contact_notes = notesInput ? notesInput.value : "";

    if (nextButton) {
      nextButton.disabled = !isContactValid();
    }
  }

  if (nameInput) nameInput.addEventListener("input", updateContactState);
  if (phoneInput) phoneInput.addEventListener("input", updateContactState);
  if (emailInput) emailInput.addEventListener("input", updateContactState);
  if (notesInput) notesInput.addEventListener("input", updateContactState);

  if (nextButton) {
    nextButton.addEventListener("click", function () {
      trackStep("contact_submit");
      goToNextStep();
    });
  }

  if (backButton) backButton.addEventListener("click", goToPreviousStep);
}

function attachThankYouEvents() {
  const restartButton = document.getElementById("qt-restart");
  if (restartButton) {
    restartButton.addEventListener("click", restartTool);
  }
}

function attachStepEvents(step) {
  if (step.type === "single-select") attachSingleSelectEvents(step);
  if (step.type === "addresses") attachAddressesEvents();
  if (step.type === "move-details") attachMoveDetailsEvents();
  if (step.type === "estimate") attachEstimateEvents();
  if (step.type === "contact") attachContactEvents();
  if (step.type === "thank-you") attachThankYouEvents();
}

function renderCurrentStep() {
  const app = document.getElementById("quote-tool");
  if (!app || !currentConfig) return;

  const step = currentConfig.steps[state.currentStep];
  app.innerHTML = renderStep(step);

  if (step.id === "property_size") trackStep("step_view_property_size");
  if (step.id === "addresses") trackStep("step_view_addresses");
  if (step.id === "move_details") trackStep("step_view_move_details");
  if (step.id === "estimate") trackStep("step_view_result");
  if (step.id === "contact") trackStep("step_view_contact");
  if (step.id === "thank_you") trackStep("step_view_thank_you");

  attachStepEvents(step);
}

async function initQuoteTool() {
  const app = document.getElementById("quote-tool");

  try {
    currentConfig = await loadConfig("configs/removals.json");

    if (!currentConfig || !currentConfig.steps || !currentConfig.steps.length) {
      throw new Error("Config is missing steps");
    }

    if (typeof state.answers.large_items === "undefined") {
      const moveDetailsStep = currentConfig.steps.find((step) => step.id === "move_details");
      state.answers.large_items = moveDetailsStep?.sliders?.[0]?.default ?? 0;
    }

    trackStep("tool_start");
    renderCurrentStep();
  } catch (error) {
    console.error(error);
    if (app) {
      app.innerHTML = `
        <div class="qt-shell">
          <h2>Error</h2>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initQuoteTool);
