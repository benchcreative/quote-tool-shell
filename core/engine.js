const state = {
  currentStep: 0,
  answers: {}
};

let currentConfig = null;
let googleMapsReady = false;

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

function getProgressPercent() {
  if (!currentConfig) return 0;
  const totalSteps = currentConfig.steps.length;
  const currentStepNumber = state.currentStep + 1;
  return Math.round((currentStepNumber / totalSteps) * 100);
}

function renderProgress(stepNumber, totalSteps) {
  const progressPercent = getProgressPercent();

  return `
    <div class="qt-progress-wrap">
      <div class="qt-progress-top">
        <span class="qt-progress-step">Step ${stepNumber} of ${totalSteps}</span>
        <span class="qt-progress-percent">${progressPercent}%</span>
      </div>
      <div class="qt-progress-bar">
        <div class="qt-progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    </div>
  `;
}

function formatPropertySize(value) {
  const map = {
    studio: "Studio",
    "1_bed": "1 Bedroom",
    "2_bed": "2 Bedroom",
    "3_bed": "3 Bedroom",
    "4_bed": "4 Bedroom",
    "5_plus": "5+ Bedroom"
  };
  return map[value] || value || "Not provided";
}

function formatDistanceBand(value) {
  const bands = currentConfig?.pricing?.distanceBands || {};
  return bands[value]?.label || "Not provided";
}

function formatExtras(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "None selected";
  }

  const map = {
    full_packing: "Full packing service",
    fragile_packing: "Fragile item packing",
    dismantling: "Furniture dismantling",
    none: "No additional services"
  };

  return values.map((value) => map[value] || value).join(", ");
}

function formatAccess(value) {
  const map = {
    easy_access: "Easy access / driveway",
    one_flight: "One flight of stairs",
    multiple_flights: "Multiple flights / no lift",
    restricted_parking: "Restricted parking / difficult access"
  };
  return map[value] || "Not provided";
}

function formatMoveDateSummary() {
  const type = state.answers.move_date_type;
  const exactDate = state.answers.exact_move_date;
  const approxMonth = state.answers.approx_move_month;

  if (type === "exact") return exactDate || "Exact date not provided";
  if (type === "approx") return approxMonth || "Approximate date not provided";
  if (type === "not_sure") return "Not sure yet";

  return "Not provided";
}

function getAddressLabel(answerKey) {
  const value = state.answers[answerKey];
  if (!value) return "Not provided";
  if (typeof value === "string") return value;
  return value.label || "Not provided";
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

  const min = Math.round(total * (1 - rangePercent / 100));
  const max = Math.round(total * (1 + rangePercent / 100));

  return { base: total, min, max };
}

function renderSingleSelect(step, stepNumber, totalSteps) {
  const selectedValue = state.answers[step.id] || "";

  let optionsHtml = "";
  for (const option of step.options) {
    const selectedClass = selectedValue === option.value ? "is-selected" : "";
    optionsHtml += `
      <button class="qt-option ${selectedClass}" data-value="${option.value}">
        ${option.label}
      </button>
    `;
  }

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <div class="qt-options">
        ${optionsHtml}
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back" ${state.currentStep === 0 ? "disabled" : ""}>Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${selectedValue ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderAddresses(step, stepNumber, totalSteps) {
  const fromValue = getAddressLabel("moving_from") === "Not provided" ? "" : getAddressLabel("moving_from");
  const toValue = getAddressLabel("moving_to") === "Not provided" ? "" : getAddressLabel("moving_to");
  const distanceHelper = state.answers.distance_band
    ? `<p class="qt-helper">Estimated distance: ${formatDistanceBand(state.answers.distance_band)}${getDistanceMilesText() ? ` (${getDistanceMilesText()})` : ""}</p>`
    : "";

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>
      ${distanceHelper}

      <div class="qt-form-grid">
        <input
          class="qt-input"
          id="qt-moving-from"
          type="text"
          placeholder="Moving from"
          value="${fromValue}"
          autocomplete="off"
        />
        <input
          class="qt-input"
          id="qt-moving-to"
          type="text"
          placeholder="Moving to"
          value="${toValue}"
          autocomplete="off"
        />
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${(fromValue.trim() && toValue.trim()) ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderMoveDetails(step, stepNumber, totalSteps) {
  const selectedExtras = state.answers.extras || [];
  const accessValue = state.answers.access_type || "";
  const selectedType = state.answers.move_date_type || "";
  const exactDate = state.answers.exact_move_date || "";
  const approxMonth = state.answers.approx_move_month || "";

  let extrasHtml = "";
  for (const option of step.extrasOptions) {
    const selectedClass = selectedExtras.includes(option.value) ? "is-selected" : "";
    extrasHtml += `
      <button class="qt-option ${selectedClass}" data-extra-value="${option.value}">
        ${option.label}
      </button>
    `;
  }

  let accessHtml = "";
  for (const option of step.accessOptions) {
    const selectedClass = accessValue === option.value ? "is-selected" : "";
    accessHtml += `
      <button class="qt-option ${selectedClass}" data-access-value="${option.value}">
        ${option.label}
      </button>
    `;
  }

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <div class="qt-section-block">
        <h3 class="qt-section-title">Additional services</h3>
        <div class="qt-options qt-options-single-column">
          ${extrasHtml}
        </div>
      </div>

      <div class="qt-section-block">
        <h3 class="qt-section-title">Access</h3>
        <div class="qt-options qt-options-single-column">
          ${accessHtml}
        </div>
      </div>

      <div class="qt-section-block">
        <h3 class="qt-section-title">Move date</h3>
        <div class="qt-options qt-options-single-column">
          <button class="qt-option ${selectedType === "exact" ? "is-selected" : ""}" data-date-type="exact">
            I know the exact date
          </button>
          <button class="qt-option ${selectedType === "approx" ? "is-selected" : ""}" data-date-type="approx">
            I know the approximate month
          </button>
          <button class="qt-option ${selectedType === "not_sure" ? "is-selected" : ""}" data-date-type="not_sure">
            I’m not sure yet
          </button>
        </div>

        <div class="qt-date-fields">
          ${
            selectedType === "exact"
              ? `<input class="qt-input" id="qt-exact-date" type="date" value="${exactDate}" />`
              : ""
          }
          ${
            selectedType === "approx"
              ? `<input class="qt-input" id="qt-approx-month" type="month" value="${approxMonth}" />`
              : ""
          }
        </div>
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${isMoveDetailsValid() ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderEstimate(step, stepNumber, totalSteps) {
  const estimate = calculateEstimate();
  const milesText = getDistanceMilesText();

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <div class="qt-estimate-range">£${estimate.min} — £${estimate.max}</div>
      <p class="qt-estimate-note">This is a guide price based on the details provided so far.</p>

      <div class="qt-summary">
        <h3 class="qt-summary-title">Move summary</h3>
        <div class="qt-summary-row">
          <span>Property size</span>
          <strong>${formatPropertySize(state.answers.property_size)}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Moving from</span>
          <strong>${getAddressLabel("moving_from")}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Moving to</span>
          <strong>${getAddressLabel("moving_to")}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Distance</span>
          <strong>${formatDistanceBand(state.answers.distance_band)}${milesText ? ` (${milesText})` : ""}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Extras</span>
          <strong>${formatExtras(state.answers.extras)}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Access</span>
          <strong>${formatAccess(state.answers.access_type)}</strong>
        </div>
        <div class="qt-summary-row">
          <span>Move date</span>
          <strong>${formatMoveDateSummary()}</strong>
        </div>
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next">Continue</button>
      </div>
    </div>
  `;
}

function renderContact(step, stepNumber, totalSteps) {
  const fullName = state.answers.contact_name || "";
  const phone = state.answers.contact_phone || "";
  const email = state.answers.contact_email || "";

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <div class="qt-form-grid">
        <input class="qt-input" id="qt-contact-name" type="text" placeholder="Full name" value="${fullName}" />
        <input class="qt-input" id="qt-contact-phone" type="tel" placeholder="Phone number" value="${phone}" />
        <input class="qt-input" id="qt-contact-email" type="email" placeholder="Email address" value="${email}" />
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${isContactValid() ? "" : "disabled"}>Submit</button>
      </div>
    </div>
  `;
}

function renderThankYou(step) {
  return `
    <div class="qt-shell qt-thankyou">
      <div class="qt-thankyou-icon">✓</div>
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>
    </div>
  `;
}

function renderStep(step, stepNumber, totalSteps) {
  if (step.type === "single-select") return renderSingleSelect(step, stepNumber, totalSteps);
  if (step.type === "addresses") return renderAddresses(step, stepNumber, totalSteps);
  if (step.type === "move-details") return renderMoveDetails(step, stepNumber, totalSteps);
  if (step.type === "estimate") return renderEstimate(step, stepNumber, totalSteps);
  if (step.type === "contact") return renderContact(step, stepNumber, totalSteps);
  if (step.type === "thank-you") return renderThankYou(step);

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
      renderCurrentStep();
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
  const buttons = document.querySelectorAll(".qt-option");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  buttons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-value");
      state.answers[step.id] = value;

      buttons.forEach((btn) => btn.classList.remove("is-selected"));
      button.classList.add("is-selected");

      if (nextButton) nextButton.disabled = false;
    });
  });

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
  if (backButton) backButton.addEventListener("click", goToPreviousStep);
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
  const accessButtons = document.querySelectorAll("[data-access-value]");
  const dateButtons = document.querySelectorAll("[data-date-type]");
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
        extraButtons.forEach((btn) => btn.classList.remove("is-selected"));
        button.classList.add("is-selected");
      } else {
        selectedValues = selectedValues.filter((item) => item !== "none");

        if (selectedValues.includes(value)) {
          selectedValues = selectedValues.filter((item) => item !== value);
          button.classList.remove("is-selected");
        } else {
          selectedValues.push(value);
          button.classList.add("is-selected");
        }

        extraButtons.forEach((btn) => {
          if (btn.getAttribute("data-extra-value") === "none") {
            btn.classList.remove("is-selected");
          }
        });
      }

      state.answers.extras = selectedValues;
    });
  });

  accessButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-access-value");
      state.answers.access_type = value;

      accessButtons.forEach((btn) => btn.classList.remove("is-selected"));
      button.classList.add("is-selected");

      if (nextButton) nextButton.disabled = !isMoveDetailsValid();
    });
  });

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
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  function updateContactState() {
    state.answers.contact_name = nameInput ? nameInput.value : "";
    state.answers.contact_phone = phoneInput ? phoneInput.value : "";
    state.answers.contact_email = emailInput ? emailInput.value : "";

    if (nextButton) {
      nextButton.disabled = !isContactValid();
    }
  }

  if (nameInput) nameInput.addEventListener("input", updateContactState);
  if (phoneInput) phoneInput.addEventListener("input", updateContactState);
  if (emailInput) emailInput.addEventListener("input", updateContactState);

  if (nextButton) nextButton.addEventListener("click", goToNextStep);
  if (backButton) backButton.addEventListener("click", goToPreviousStep);
}

function attachStepEvents(step) {
  if (step.type === "single-select") attachSingleSelectEvents(step);
  if (step.type === "addresses") attachAddressesEvents();
  if (step.type === "move-details") attachMoveDetailsEvents();
  if (step.type === "estimate") attachEstimateEvents();
  if (step.type === "contact") attachContactEvents();
}

function renderCurrentStep() {
  const app = document.getElementById("quote-tool");
  if (!app || !currentConfig) return;

  const step = currentConfig.steps[state.currentStep];
  const stepNumber = state.currentStep + 1;
  const totalSteps = currentConfig.steps.length;

  app.innerHTML = renderStep(step, stepNumber, totalSteps);
  attachStepEvents(step);
}

async function initQuoteTool() {
  const app = document.getElementById("quote-tool");

  try {
    currentConfig = await loadConfig("configs/removals.json");
    if (!currentConfig || !currentConfig.steps || !currentConfig.steps.length) {
      throw new Error("Config is missing steps");
    }
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
