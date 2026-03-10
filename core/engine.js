const state = {
  currentStep: 0,
  answers: {}
};

let currentConfig = null;

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

function renderTextInput(step, stepNumber, totalSteps) {
  const currentValue = state.answers[step.id] || "";

  return `
    <div class="qt-shell">
      ${renderProgress(stepNumber, totalSteps)}
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
        <button class="qt-nav qt-nav-next" id="qt-next" ${currentValue.trim() ? "" : "disabled"}>Continue</button>
      </div>
    </div>
  `;
}

function renderMultiSelect(step, stepNumber, totalSteps) {
  const selectedValues = state.answers[step.id] || [];

  let optionsHtml = "";
  for (const option of step.options) {
    const selectedClass = selectedValues.includes(option.value) ? "is-selected" : "";
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

      <div class="qt-options qt-options-single-column">
        ${optionsHtml}
      </div>

      <div class="qt-actions">
        <button class="qt-nav qt-nav-back" id="qt-back">Back</button>
        <button class="qt-nav qt-nav-next" id="qt-next">Continue</button>
      </div>
    </div>
  `;
}

function renderStep(step, stepNumber, totalSteps) {
  if (step.type === "single-select") {
    return renderSingleSelect(step, stepNumber, totalSteps);
  }

  if (step.type === "text-input") {
    return renderTextInput(step, stepNumber, totalSteps);
  }

  if (step.type === "multi-select") {
    return renderMultiSelect(step, stepNumber, totalSteps);
  }

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

function attachSingleSelectEvents(step) {
  const buttons = document.querySelectorAll(".qt-option");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-value");
      state.answers[step.id] = value;

      buttons.forEach(function (btn) {
        btn.classList.remove("is-selected");
      });

      button.classList.add("is-selected");

      if (nextButton) {
        nextButton.disabled = false;
      }
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
    input.addEventListener("input", function () {
      state.answers[step.id] = input.value;
      if (nextButton) {
        nextButton.disabled = !input.value.trim();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", goToNextStep);
  }

  if (backButton) {
    backButton.addEventListener("click", goToPreviousStep);
  }
}

function attachMultiSelectEvents(step) {
  const buttons = document.querySelectorAll(".qt-option");
  const nextButton = document.getElementById("qt-next");
  const backButton = document.getElementById("qt-back");

  if (!Array.isArray(state.answers[step.id])) {
    state.answers[step.id] = [];
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      const value = button.getAttribute("data-value");
      let selectedValues = state.answers[step.id] || [];

      if (value === "none") {
        selectedValues = ["none"];
        buttons.forEach(function (btn) {
          btn.classList.remove("is-selected");
        });
        button.classList.add("is-selected");
      } else {
        selectedValues = selectedValues.filter(item => item !== "none");

        if (selectedValues.includes(value)) {
          selectedValues = selectedValues.filter(item => item !== value);
          button.classList.remove("is-selected");
        } else {
          selectedValues.push(value);
          button.classList.add("is-selected");
        }

        buttons.forEach(function (btn) {
          if (btn.getAttribute("data-value") === "none") {
            btn.classList.remove("is-selected");
          }
        });
      }

      state.answers[step.id] = selectedValues;
    });
  });

  if (nextButton) {
    nextButton.addEventListener("click", goToNextStep);
  }

  if (backButton) {
    backButton.addEventListener("click", goToPreviousStep);
  }
}

function attachStepEvents(step) {
  if (step.type === "single-select") {
    attachSingleSelectEvents(step);
  }

  if (step.type === "text-input") {
    attachTextInputEvents(step);
  }

  if (step.type === "multi-select") {
    attachMultiSelectEvents(step);
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

  console.log("Current answers:", state.answers);
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
