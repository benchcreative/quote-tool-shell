// Quote Tool Core Engine

const state = {
  currentStep: 0,
  answers: {}
};

let currentConfig = null;

async function loadConfig(configPath) {
  try {
    const response = await fetch(configPath);
    const config = await response.json();
    return config;
  } catch (error) {
    console.error("Error loading config:", error);
  }
}

function renderSingleSelect(step, stepNumber, totalSteps) {
  const selectedValue = state.answers[step.id] || "";

  const optionsHtml = step.options.map(option => {
    const selectedClass = selectedValue === option.value ? "is-selected" : "";
    return `
      <button class="qt-option ${selectedClass}" data-value="${option.value}">
        ${option.label}
      </button>
    `;
  }).join("");

  return `
    <div class="qt-shell">
      <p class="qt-kicker">Step ${stepNumber} of ${totalSteps}</p>
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <div class="qt-options">
        ${optionsHtml}
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back" ${state.currentStep === 0 ? "disabled" : ""}>Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${!selectedValue ? "disabled" : ""}>Continue</button>
      </div>
    </div>
  `;
}

function renderTextInput(step, stepNumber, totalSteps) {
  const currentValue = state.answers[step.id] || "";

  return `
    <div class="qt-shell">
      <p class="qt-kicker">Step ${stepNumber} of ${totalSteps}</p>
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>

      <input
        class="qt-input"
        id="qt-text-input"
        type="text"
        placeholder="${step.placeholder || ""}"
        value="${currentValue}"
      />

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next" ${!currentValue.trim() ? "disabled" : ""}>Continue</button>
      </div>
    </div>
  `;
}

function renderStep(step, stepNumber, totalSteps) {
  switch (step.type) {
    case "single-select":
      return renderSingleSelect(step, stepNumber, totalSteps);
    case "text-input":
      return renderTextInput(step, stepNumber, totalSteps);
    default:
      return `<p>Unsupported step type: ${step.type}</p>`;
  }
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

function attachSingleSelectEvents(step) {
  const buttons = document.querySelectorAll(".qt-option");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.value;
      state.answers[step.id] = value;

      buttons.forEach(btn => btn.classList.remove("is-selected"));
      button.classList.add("is-selected");

      if (nextButton) {
        nextButton.disabled = false;
      }

      console.log("Answers:", state.answers);
    });
  });

  if (nextButton) {
    nextButton.addEventListener("click", goToNextStep);
  }

  if (backButton) {
    backButton.addEventListener("click", goToPreviousStep);
  }
}

function attachTextInputEvents(step) {
  const input = document.getElementById("qt-text-input");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  if (input) {
    input.addEventListener("input", () => {
      state.answers[step.id] = input.value;

      if (nextButton) {
        nextButton.disabled = !input.value.trim();
      }

      console.log("Answers:", state.answers);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", goToNextStep);
  }

  if (backButton) {
    backButton.addEventListener("click", goToPreviousStep);
  }
}

function attachStepEvents(step) {
  switch (step.type) {
    case "single-select":
      attachSingleSelectEvents(step);
      break;
    case "text-input":
      attachTextInputEvents(step);
      break;
  }
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

async function initQuote
