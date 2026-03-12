const state = {
  currentStep: 0,
  answers: {}
};

let currentConfig = null;
let googleMapsReady = false;

/* =========================
   Tracking
========================= */

const TRACKING_URL = "https://script.google.com/macros/s/AKfycbx0gJwbPQLu288N_HXIa4u1qVQM2LS1bxNL5hBZJiH2FwCfVApN6S7dYAdiGOSB3tHl/exec";
const CUSTOMER_ID = "benchcreative-removals";
const PAGE_ID = "removals";

function getSessionId() {
  let session = localStorage.getItem("estimatorSession");

  if (!session) {
    session = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("estimatorSession", session);
  }

  return session;
}

function trackStep(stepName) {
  fetch(TRACKING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      customer: CUSTOMER_ID,
      session: getSessionId(),
      step: stepName,
      page: PAGE_ID
    })
  }).catch((error) => {
    console.error("Tracking failed:", error);
  });
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

function formatExtras(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "None selected";
  }

  const map = {
    full_packing: "Packing",
    fragile_packing: "Fragile packing",
    dismantling: "Furniture disassembly",
    none: "No extras"
  };

  return values.map((value) => map[value] || value).join(", ");
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
        <path d="M12.8 7H14"></path>
        <path d="M10 10h1.2"></path>
        <path d="M12.8 10H14"></path>
        <path d="M10 13h1.2"></path>
        <path d="M12.8 13H14"></path>
        <path d="M11 20.5v-3h2v3"></path>
      </svg>
    `;
  }

  if (value === "3_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 10.8L12 4.8l8 6"></path>
        <path d="M6.5 9.8V19h11V9.8"></path>
        <path d="M9.2 12.2h2.2v2.2H9.2z"></path>
        <path d="M12.6 12.2h2.2v2.2h-2.2z"></path>
        <path d="M10.5 19v-4.5h3V19"></path>
      </svg>
    `;
  }

  if (value === "4_bed") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3.5 11L12 5l8.5 6"></path>
        <path d="M6 10.2V19h12v-8.8"></path>
        <path d="M8.8 12.2h2.1v2.1H8.8z"></path>
        <path d="M13.1 12.2h2.1v2.1h-2.1z"></path>
        <path d="M10.5 19v-4.6h3V19"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.8 11L12 4l9.2 7"></path>
      <path d="M5.5 9.8V20h13V9.8"></path>
      <path d="M8.4 11.8h2.2V14H8.4z"></path>
      <path d="M13.4 11.8h2.2V14h-2.2z"></path>
      <path d="M10.5 20v-5.2h3V20"></path>
      <path d="M18.5 10h2.2v10h-2.2"></path>
    </svg>
  `;
}

function getPropertySubtitle(value) {
  const map = {
    studio_1_bed: "Small flat or bedsit",
    "2_bed": "Flat or small house",
    "3_bed": "House move",
    "4_bed": "Larger home",
    "5_plus": "Large family home"
  };
  return map[value] || "Property move";
}

function renderSingleSelect(step) {
  const selectedValue = state.answers[step.id] || "";

  let optionsHtml = "";
  for (const option of step.options) {
    const selectedClass = selectedValue === option.value ? "is-selected" : "";
    optionsHtml += `
      <button class="qt-property-card ${selectedClass}" data-value="${option.value}" type="button">
        <div class="qt-property-card-left">
          <div class="qt-property-icon ${selectedValue === option.value ? "is-selected" : ""}">
            ${renderPropertyIcon(option.value)}
          </div>
          <div class="qt-property-copy">
            <div class="qt-property-title">${option.label}</div>
            <div class="qt-property-desc">${getPropertySubtitle(option.value)}</div>
          </div>
        </div>
        <div class="qt-radio ${selectedValue === option.value ? "is-selected" : ""}"></div>
      </button>
    `;
  }

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      ${renderStepLabel()}
      <h1 class="qt-page-title">${step.title}</h1>
      <p class="qt-page-subtitle">${step.subtitle}</p>

      <div class="qt-property-list">
        ${optionsHtml}
      </div>

      <div class="qt-footer-actions">
        <button class="qt-btn qt-btn-secondary" id="qt-back" ${state.currentStep === 0 ? "disabled" : ""}>Back</button>
        <button class="qt-btn qt-btn-primary" id="qt-next" ${selectedValue ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderAddresses() {
  const fromValue = getAddressLabel("moving_from");
  const toValue = getAddressLabel("moving_to");

  return `
    <div class="qt-shell">
      ${renderTopChrome()}
      <h1 class="qt-page-title">Where are you moving?</h1>
      <p class="qt-page-subtitle">Enter your collection and delivery postcodes</p>

      <div class="qt-address-card">
        <div class="qt-address-row">
          <div class="qt-address-icon is-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11z"></path>
              <circle cx="12" cy="10" r="2.5"></circle>
            </svg>
          </div>
          <div class="qt-address-content">
            <div class="qt-address-label">Collecting from</div>
            <input
              class="qt-line-input"
              id="qt-moving-from"
              type="text"
              placeholder="Postcode or address"
              value="${fromValue}"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="qt-address-divider"></div>

        <div class="qt-address-row">
          <div class="qt-address-icon is-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11z"></path>
              <circle cx="12" cy="10" r="2.5"></circle>
            </svg>
          </div>
          <div class="qt-address-content">
            <div class="qt-address-label">Delivering to</div>
            <input
              class="qt-line-input"
              id="qt-moving-to"
              type="text"
              placeholder="Postcode or address"
              value="${toValue}"
              autocomplete="off"
            />
          </div>
        </div>
      </div>

      <div class="qt-footer-actions">
        <button class="qt-btn qt-btn-secondary" id="qt-back">Back</button>
        <button class="qt-btn qt-btn-primary" id="qt-next" ${(fromValue.trim() && toValue.trim()) ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderSliderRow(label, helper, inputId, value, min, max) {
  return `
    <div class="qt-slider-row">
      <div class="qt-slider-top">
        <span class="qt-slider-label">${label}</span>
        <span class="qt-slider-value">${value}</span>
      </div>
      <div class="qt-slider-helper">${helper || ""}</div>
      <input
        class="qt-slider"
        id="${inputId}"
        type="range"
        min="${min}"
        max="${max}"
        step="1"
        value="${value}"
      />
    </div>
  `;
}

function renderMoveDetails(step) {
  const selectedExtras = state.answers.extras || [];
  const accessValue = state.answers.access_type || "";
  const selectedType = state.answers.move_date_type || "";
  const exactDate = state.answers.exact_move_date || "";
  const approxMonth = state.answers.approx_move_month || "";
  const largeItems = Number(state.answers.large_items ?? step.sliders[0].default ?? 0);

  let extrasHtml = "";
  for (const option of step.extrasOptions) {
    const selectedClass = selectedExtras.includes(option.value) ? "is-selected" : "";
    extrasHtml += `
      <button class="qt-service-chip ${selectedClass}" data-extra-value="${option.value}" type="button">
        ${option.label}
      </button>
    `;
  }

  let accessOptionsHtml = `<option value="">${step.accessPlaceholder || "Select access"}</option>`;
  for (const option of step.accessOptions) {
    const selectedAttr = accessValue === option.value ? "selected" : "";
    accessOptionsHtml += `<option value="${option.value}" ${selectedAttr}>${option.label}</option>`;
  }

  return `
    <div class="qt-shell">
      ${renderTopChrome()}

      <div class="qt-section-card">
        <div class="qt-kicker">When are you moving?</div>
        <div class="qt-toggle-group">
          <button class="qt-toggle ${selectedType === "exact" ? "is-selected" : ""}" data-date-type="exact" type="button">Exact date</button>
          <button class="qt-toggle ${selectedType === "approx" ? "is-selected" : ""}" data-date-type="approx" type="button">Estimated month</button>
          <button class="qt-toggle ${selectedType === "not_sure" ? "is-selected" : ""}" data-date-type="not_sure" type="button">ASAP</button>
        </div>

        <div class="qt-date-fields">
          ${
            selectedType === "exact"
              ? `<input class="qt-select-input" id="qt-exact-date" type="date" value="${exactDate}" />`
              : ""
          }
          ${
            selectedType === "approx"
              ? `<input class="qt-select-input" id="qt-approx-month" type="month" value="${approxMonth}" />`
              : ""
          }
        </div>
      </div>

      <div class="qt-section-card">
        <div class="qt-kicker">${step.accessLabel || "Access / parking details"}</div>
        <select class="qt-select-input" id="qt-access-select">
          ${accessOptionsHtml}
        </select>
      </div>

      <div class="qt-services-block">
        <div class="qt-kicker">Additional services</div>
        <div class="qt-section-helper">${step.extrasHelper || ""}</div>
        <div class="qt-services-grid">
          ${extrasHtml}
        </div>
      </div>

      <div class="qt-refine-card">
        <div class="qt-kicker">Refine your estimate (optional)</div>
        <div class="qt-section-helper">${step.refineHelper || ""}</div>
        ${renderSliderRow(
          step.sliders[0].label,
          step.sliders[0].helper,
          "qt-large-items",
          largeItems,
          0,
          20
        )}
      </div>

      <div class="qt-footer-actions">
        <button class="qt-btn qt-btn-secondary" id="qt-back">Back</button>
        <button class="qt-btn qt-btn-primary" id="qt-next" ${isMoveDetailsValid() ? "" : "disabled"}>Calculate estimate</button>
      </div>
    </div>
  `;
}

function renderEstimate() {
  const estimate = calculateEstimate();
  const fromValue = getAddressLabel("moving_from");
  const toValue = getAddressLabel("moving_to");
  const propertyValue = state.answers.property_size;
  const extras = state.answers.extras || [];
  const distanceText = getDistanceMilesText();

  return `
    <div class="qt-shell">
      ${renderTopChrome()}

      <div class="qt-estimate-hero">
        <div class="qt-kicker qt-kicker-centered">Estimated cost</div>
        <div class="qt-estimate-number qt-estimate-number-single">£${estimate.min.toLocaleString()} – £${estimate.max.toLocaleString()}</div>
        <div class="qt-estimate-caption">Final price confirmed after survey</div>
      </div>

      <div class="qt-summary-card">
        <div class="qt-summary-line">
          <span>Property</span>
          <strong>${formatPropertySize(propertyValue)}</strong>
        </div>
        <div class="qt-summary-line">
          <span>From</span>
          <strong>${fromValue || "—"}</strong>
        </div>
        <div class="qt-summary-line">
          <span>To</span>
          <strong>${toValue || "—"}</strong>
        </div>
        <div class="qt-summary-line">
          <span>Distance</span>
          <strong>${distanceText || "—"}</strong>
        </div>
        <div class="qt-summary-line">
          <span>Extras</span>
          <strong>${extras.length ? `${extras.length} service${extras.length > 1 ? "s" : ""}` : "None"}</strong>
        </div>
      </div>

      <div class="qt-estimate-next">
        <div class="qt-estimate-next-copy">Ready for a confirmed quote?</div>
      </div>

      <div class="qt-footer-actions">
        <button class="qt-btn qt-btn-secondary" id="qt-back">Back</button>
        <button class="qt-btn qt-btn-primary" id="qt-next">Get my detailed quote</button>
      </div>
    </div>
  `;
}

function renderContact() {
  const fullName = state.answers.contact_name || "";
  const phone = state.answers.contact_phone || "";
  const email = state.answers.contact_email || "";
  const notes = state.answers.contact_notes || "";

  return `
    <div class="qt-shell">
      ${renderTopChrome()}

      <h1 class="qt-page-title">Almost there</h1>
      <p class="qt-page-subtitle">We'll send your detailed quote within minutes</p>

      <div class="qt-contact-card">
        <div class="qt-contact-field">
          <div class="qt-contact-label">Full name</div>
          <input class="qt-contact-input" id="qt-contact-name" type="text" placeholder="John Smith" value="${fullName}" />
        </div>

        <div class="qt-contact-field">
          <div class="qt-contact-label">Email</div>
          <input class="qt-contact-input" id="qt-contact-email" type="email" placeholder="john@example.com" value="${email}" />
        </div>

        <div class="qt-contact-field">
          <div class="qt-contact-label">Phone</div>
          <input class="qt-contact-input" id="qt-contact-phone" type="tel" placeholder="07700 900000" value="${phone}" />
        </div>

        <div class="qt-contact-field">
          <div class="qt-contact-label">Notes (optional)</div>
          <textarea class="qt-contact-input qt-contact-textarea" id="qt-contact-notes" placeholder="Anything we should know?">${notes}</textarea>
        </div>
      </div>

      <div class="qt-footer-actions">
        <button class="qt-btn qt-btn-secondary" id="qt-back">Back</button>
        <button class="qt-btn qt-btn-primary" id="qt-next" ${isContactValid() ? "" : "disabled"}>Send request</button>
      </div>
    </div>
  `;
}

function renderThankYou() {
  return `
    <div class="qt-shell">
      ${renderSegmentProgress()}

      <div class="qt-success-wrap">
        <div class="qt-success-icon">✓</div>
        <h1 class="qt-success-title">You're all set</h1>
        <p class="qt-success-subtitle">
          We've received your request. One of our moving consultants will review your move and be in touch within 24 hours to arrange a video or in-person survey where needed.
        </p>

        <div class="qt-next-steps-card">
          <div class="qt-kicker qt-kicker-centered">What happens next</div>

          <div class="qt-next-step">
            <span class="qt-next-step-number">1</span>
            <span>We review your move details</span>
          </div>

          <div class="qt-next-step">
            <span class="qt-next-step-number">2</span>
            <span>We arrange a video or in-person survey if needed</span>
          </div>

          <div class="qt-next-step">
            <span class="qt-next-step-number">3</span>
            <span>Receive your final, fixed-price quote</span>
          </div>
        </div>

        <button class="qt-restart-link" id="qt-restart" type="button">Start a new estimate →</button>
      </div>
    </div>
  `;
}

function renderStep(step) {
  if (step.type === "single-select") return renderSingleSelect(step);
  if (step.type === "addresses") return renderAddresses();
  if (step.type === "move-details") return renderMoveDetails(step);
  if (step.type === "estimate") return renderEstimate();
  if (step.type === "contact") return renderContact();
  if (step.type === "thank-you") return renderThankYou();

  return `
    <div class="qt-shell">
      <h2>Error</h2>
      <p>Unsupported step type: ${step.type}</p>
    </div>
  `;
}

function goToNextStep() {
  if (!currentConfig) return;
  if (state.currentStep < currentConfig.steps.length - 1) {
    state.currentStep += 1;
    renderCurrentStep();
  }
}

function goToPreviousStep() {
  if (state.currentStep > 0) {
    state.currentStep -= 1;
    renderCurrentStep();
  }
}

function restartTool() {
  state.currentStep = 0;
  state.answers = {};
  localStorage.removeItem("estimatorSession");
  renderCurrentStep();
}

function isContactValid() {
  const name = (state.answers.contact_name || "").trim();
  const phone = (state.answers.contact_phone || "").trim();
  const email = (state.answers.contact_email || "").trim();
  return !!(name && phone && email);
}

function isMoveDetailsValid() {
  const accessValid = !!state.answers.access_type;
  const type = state.answers.move_date_type;

  let dateValid = false;
  if (type === "exact") dateValid = !!state.answers.exact_move_date;
  if (type === "approx") dateValid = !!state.answers.approx_move_month;
  if (type === "not_sure") dateValid = true;

  return accessValid && dateValid;
}

function initAddressAutocomplete(inputId, answerKey, nextButton) {
  const input = document.getElementById(inputId);
  if (!input || !googleMapsReady || !window.google || !google.maps || !google.maps.places) {
    return;
  }

  const autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["formatted_address", "geometry", "place_id", "address_components"],
    componentRestrictions: { country: ["gb"] }
  });

  autocomplete.addListener("place_changed", async () => {
    const place = autocomplete.getPlace();

    state.answers[answerKey] = {
      label: place.formatted_address || input.value,
      placeId: place.place_id || "",
      lat: place.geometry?.location?.lat?.() || null,
      lng: place.geometry?.location?.lng?.() || null
    };

    const fromFilled = !!state.answers.moving_from?.label;
    const toFilled = !!state.answers.moving_to?.label;

    if (nextButton) {
      nextButton.disabled = !(fromFilled && toFilled);
    }

    if (fromFilled && toFilled) {
      await tryAutoAssignDistanceBand();
    }
  });
}

function attachAutocompleteIfNeeded() {
  if (!currentConfig) return;
  const step = currentConfig.steps[state.currentStep];
  if (!step || step.type !== "addresses") return;

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
      renderCurrentStep();
    });
  });

  if (accessSelect) {
    accessSelect.addEventListener("change", function () {
      state.answers.access_type = accessSelect.value;
      if (nextButton) nextButton.disabled = !isMoveDetailsValid();
    });
  }

  dateButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-date-type");
      state.answers.move_date_type = value;

      if (value !== "exact") state.answers.exact_move_date = "";
      if (value !== "approx") state.answers.approx_move_month = "";

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

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
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

  if (nextButton) nextButton.addEventListener("click", function () {
    trackStep("contact_submit");
    goToNextStep();
  });

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

  // Track visible step
  if (step.id === "property_size") trackStep("property_size");
  if (step.id === "addresses") trackStep("addresses");
  if (step.id === "move_details") trackStep("move_details");
  if (step.id === "estimate") trackStep("result");
  if (step.id === "contact") trackStep("contact");
  if (step.id === "thank_you") trackStep("thank_you");

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
